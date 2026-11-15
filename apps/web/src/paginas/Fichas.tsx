import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  List,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconEye, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calcularPhPadrao,
  esquemaFichaTecnica,
  formatarDataHora,
  ROTULO_SITUACAO_FICHA,
  ROTULO_UNIDADE,
  TIPOS_MATERIAL,
  usaMolde,
  type ResultadoCompatibilidade,
  type SituacaoFicha,
  type TipoMaquina,
  type TipoProduto,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista, type Registro } from '../componentes/PaginaCadastro';
import { ListaParametrosLivres, type ItemParametro } from '../componentes/ListaParametrosLivres';
import {
  AlertaErroApi,
  errosApiPorCampo,
  errosZod,
  fmtNumero,
  notificarErro,
  notificarSucesso,
  numeroOuNulo,
} from '../componentes/utilitarios';

interface Componente {
  materialId: string;
  consumoGPorPeca: number | null;
  percentual: number | null;
  material?: { codigo: string; descricao: string };
}

interface Ficha {
  id: string;
  produtoId: string;
  moldeId: string | null;
  maquinaId: string;
  versao: number;
  situacao: SituacaoFicha;
  cicloS: number | null;
  cavidades: number;
  phPadrao: number;
  phCalculado: boolean;
  pesoPadraoG: number | null;
  toleranciaPesoPct: number | null;
  parametrosProcesso: ItemParametro[];
  observacao: string | null;
  parecerReprovacao: string | null;
  vigenteDesde: string | null;
  obsoletaEm: string | null;
  criadoEm: string;
  produto: { codigo: string; descricao: string; unidade: Unidade };
  molde: { codigo: string; descricao: string; numeroCavidades: number } | null;
  maquina: { codigo: string; descricao: string; tipo: TipoMaquina };
  criadoPor: { nome: string };
  aprovador: { nome: string } | null;
  composicao: Componente[];
}

const COR_SITUACAO: Record<SituacaoFicha, string> = {
  RASCUNHO: 'yellow',
  VIGENTE: 'green',
  OBSOLETA: 'gray',
};

export function BadgeSituacao({ situacao }: { situacao: SituacaoFicha }) {
  return <Badge color={COR_SITUACAO[situacao]}>{ROTULO_SITUACAO_FICHA[situacao]}</Badge>;
}

type ValoresFicha = {
  produtoId: string | null;
  maquinaId: string | null;
  moldeId: string | null;
  cicloS: number | string;
  cavidades: number | string;
  phPadrao: number | string;
  pesoPadraoG: number | string;
  toleranciaPesoPct: number | string;
  parametrosProcesso: ItemParametro[];
  composicao: { materialId: string | null; consumoGPorPeca: number | string; percentual: number | string }[];
  observacao: string;
};

function paraEnvio(v: ValoresFicha, maquinaTipo?: TipoMaquina) {
  const comMolde = maquinaTipo ? usaMolde(maquinaTipo) : true;
  return {
    produtoId: v.produtoId,
    maquinaId: v.maquinaId,
    moldeId: comMolde ? v.moldeId : null,
    cicloS: comMolde ? numeroOuNulo(v.cicloS) : null,
    cavidades: comMolde ? numeroOuNulo(v.cavidades) : 1,
    phPadrao: numeroOuNulo(v.phPadrao),
    pesoPadraoG: numeroOuNulo(v.pesoPadraoG),
    toleranciaPesoPct: numeroOuNulo(v.toleranciaPesoPct),
    parametrosProcesso: v.parametrosProcesso.map((p) => ({ ...p, unidade: p.unidade || null })),
    composicao: v.composicao.map((c) => ({
      materialId: c.materialId,
      consumoGPorPeca: numeroOuNulo(c.consumoGPorPeca),
      percentual: numeroOuNulo(c.percentual),
    })),
    observacao: v.observacao || null,
  };
}

function FormularioFicha({ ficha, aoFechar }: { ficha: Ficha | null; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos');
  const { data: maquinas = [] } = useLista('maquinas');
  const { data: moldes = [] } = useLista('moldes');
  const form = useForm<ValoresFicha>({
    mode: 'controlled',
    initialValues: ficha
      ? {
          produtoId: ficha.produtoId,
          maquinaId: ficha.maquinaId,
          moldeId: ficha.moldeId,
          cicloS: ficha.cicloS ?? '',
          cavidades: ficha.cavidades,
          phPadrao: ficha.phCalculado ? '' : ficha.phPadrao,
          pesoPadraoG: ficha.pesoPadraoG ?? '',
          toleranciaPesoPct: ficha.toleranciaPesoPct ?? '',
          parametrosProcesso: ficha.parametrosProcesso ?? [],
          composicao: ficha.composicao.map((c) => ({
            materialId: c.materialId,
            consumoGPorPeca: c.consumoGPorPeca ?? '',
            percentual: c.percentual ?? '',
          })),
          observacao: ficha.observacao ?? '',
        }
      : {
          produtoId: null,
          maquinaId: null,
          moldeId: null,
          cicloS: '',
          cavidades: 1,
          phPadrao: '',
          pesoPadraoG: '',
          toleranciaPesoPct: '',
          parametrosProcesso: [],
          composicao: [],
          observacao: '',
        },
    validate: (v) =>
      errosZod(
        esquemaFichaTecnica,
        paraEnvio(v, maquinas.find((m) => m.id === v.maquinaId)?.tipo as TipoMaquina),
      ),
  });
  const v = form.getValues();
  const maquina = maquinas.find((m) => m.id === v.maquinaId);
  const tipoMaquina = maquina?.tipo as TipoMaquina | undefined;
  const comMolde = tipoMaquina ? usaMolde(tipoMaquina) : true;

  // Compatibilidade do molde escolhido com a máquina escolhida (aviso imediato; a API valida de novo).
  const compat = useQuery({
    queryKey: ['moldes', v.moldeId, 'compatibilidade'],
    queryFn: () =>
      api.get<(ResultadoCompatibilidade & { maquina: { id: string } })[]>(
        `/moldes/${v.moldeId}/compatibilidade`,
      ),
    enabled: !!v.moldeId && comMolde,
  });
  const compatMaquina = compat.data?.find((c) => c.maquina.id === v.maquinaId);

  const phSugerido = useMemo(() => {
    const ciclo = numeroOuNulo(v.cicloS);
    const cav = numeroOuNulo(v.cavidades);
    if (!ciclo || !cav || !Number.isInteger(cav)) return null;
    try {
      return calcularPhPadrao(ciclo, cav);
    } catch {
      return null;
    }
  }, [v.cicloS, v.cavidades]);

  const salvar = useMutation({
    mutationFn: (corpo: ReturnType<typeof paraEnvio>) =>
      ficha ? api.put(`/fichas-tecnicas/${ficha.id}`, corpo) : api.post('/fichas-tecnicas', corpo),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['fichas-tecnicas'] });
      notificarSucesso(
        ficha
          ? 'Rascunho salvo.'
          : 'Ficha criada em rascunho. Ela passa a valer após a aprovação do superusuário.',
      );
      aoFechar();
    },
    onError: (e) => form.setErrors(errosApiPorCampo(e)),
  });

  const materiais = produtos.filter(
    (p) => TIPOS_MATERIAL.includes(p.tipo as TipoProduto) && p.id !== v.produtoId,
  );
  const fixo = !!ficha;

  return (
    <form onSubmit={form.onSubmit((valores) => salvar.mutate(paraEnvio(valores, tipoMaquina)))}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select
            label="Produto"
            withAsterisk
            searchable
            disabled={fixo}
            data={produtos
              .filter((p) => p.ativo || p.id === v.produtoId)
              .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
            {...form.getInputProps('produtoId')}
          />
          <Select
            label="Máquina"
            withAsterisk
            searchable
            disabled={fixo}
            data={maquinas
              .filter((m) => m.ativa || m.id === v.maquinaId)
              .map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descricao}` }))}
            {...form.getInputProps('maquinaId')}
          />
          {comMolde && (
            <Select
              label="Molde"
              withAsterisk
              searchable
              disabled={fixo}
              data={moldes
                .filter((m) => m.ativo || m.id === v.moldeId)
                .map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descricao}` }))}
              {...form.getInputProps('moldeId')}
            />
          )}
        </SimpleGrid>
        {compatMaquina && !compatMaquina.compativel && (
          <Alert color="red" title="Molde incompatível com a máquina">
            <List size="sm">
              {compatMaquina.falhas.map((f) => (
                <List.Item key={f.criterio}>{f.mensagem}</List.Item>
              ))}
            </List>
          </Alert>
        )}
        {compatMaquina?.compativel && (
          <Alert color="green" variant="light">
            Molde compatível com a máquina{compatMaquina.exigeGiro ? ' (montado girado 90°)' : ''}.
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {comMolde && (
            <>
              <NumberInput
                label="Ciclo"
                rightSection={
                  <Text size="xs" c="dimmed">
                    s
                  </Text>
                }
                decimalSeparator=","
                hideControls
                {...form.getInputProps('cicloS')}
              />
              <NumberInput
                label="Cavidades do produto"
                withAsterisk
                allowDecimal={false}
                hideControls
                description={
                  v.moldeId
                    ? `Molde com ${moldes.find((m) => m.id === v.moldeId)?.numeroCavidades ?? '?'} cavidades`
                    : undefined
                }
                {...form.getInputProps('cavidades')}
              />
            </>
          )}
          <NumberInput
            label={comMolde ? 'PH padrão (peças/h)' : 'PH padrão (kg/h)'}
            withAsterisk={!comMolde}
            decimalSeparator=","
            hideControls
            placeholder={comMolde && phSugerido ? `Calculado: ${fmtNumero(phSugerido)}` : undefined}
            description={comMolde ? 'Deixe vazio para calcular: 3600 ÷ ciclo × cavidades.' : undefined}
            {...form.getInputProps('phPadrao')}
          />
          {comMolde && (
            <>
              <NumberInput
                label="Peso padrão da peça"
                rightSection={
                  <Text size="xs" c="dimmed">
                    g
                  </Text>
                }
                decimalSeparator=","
                hideControls
                {...form.getInputProps('pesoPadraoG')}
              />
              <NumberInput
                label="Tolerância de peso"
                rightSection={
                  <Text size="xs" c="dimmed">
                    %
                  </Text>
                }
                decimalSeparator=","
                hideControls
                {...form.getInputProps('toleranciaPesoPct')}
              />
            </>
          )}
        </SimpleGrid>
        <Divider label="Composição" labelPosition="left" />
        {v.composicao.map((c, i) => (
          <Group key={i} align="flex-start" wrap="nowrap">
            <Select
              aria-label="Material"
              placeholder="Material"
              searchable
              style={{ flex: 3 }}
              data={materiais.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
              {...form.getInputProps(`composicao.${i}.materialId`)}
            />
            {comMolde && (
              <NumberInput
                aria-label="Consumo por peça (g)"
                placeholder="g por peça"
                decimalSeparator=","
                hideControls
                style={{ flex: 1 }}
                {...form.getInputProps(`composicao.${i}.consumoGPorPeca`)}
              />
            )}
            <NumberInput
              aria-label="Percentual"
              placeholder="%"
              decimalSeparator=","
              hideControls
              style={{ flex: 1 }}
              {...form.getInputProps(`composicao.${i}.percentual`)}
            />
            <ActionIcon
              size="lg"
              color="red"
              variant="subtle"
              aria-label="Remover material"
              onClick={() => form.removeListItem('composicao', i)}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        {form.errors.composicao && (
          <Text size="xs" c="red">
            {form.errors.composicao}
          </Text>
        )}
        <Button
          variant="light"
          size="xs"
          w="fit-content"
          leftSection={<IconPlus size={14} />}
          onClick={() =>
            form.insertListItem('composicao', { materialId: null, consumoGPorPeca: '', percentual: '' })
          }
        >
          Adicionar material
        </Button>
        <ListaParametrosLivres
          rotulo="Parâmetros de processo (temperaturas, pressões, tempos)"
          valor={v.parametrosProcesso}
          aoMudar={(p) => form.setFieldValue('parametrosProcesso', p)}
        />
        <Textarea label="Observação" autosize minRows={2} {...form.getInputProps('observacao')} />
        <AlertaErroApi erro={salvar.error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {ficha ? 'Salvar rascunho' : 'Criar rascunho'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function DetalheFicha({ ficha }: { ficha: Ficha }) {
  const historico = useQuery({
    queryKey: ['fichas-tecnicas', ficha.id, 'historico'],
    queryFn: () => api.get<Ficha[]>(`/fichas-tecnicas/${ficha.id}/historico`),
  });
  const comMolde = usaMolde(ficha.maquina.tipo);
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <Group justify="space-between" wrap="nowrap">
      <Text c="dimmed" size="sm">
        {rotulo}
      </Text>
      <Text size="sm" ta="right">
        {valor}
      </Text>
    </Group>
  );
  return (
    <Stack>
      <Group>
        <BadgeSituacao situacao={ficha.situacao} />
        <Text fw={600}>Versão {ficha.versao}</Text>
      </Group>
      {ficha.parecerReprovacao && (
        <Alert color="orange" title="Reprovada pelo superusuário">
          {ficha.parecerReprovacao}
        </Alert>
      )}
      {linha('Produto', `${ficha.produto.codigo} — ${ficha.produto.descricao}`)}
      {linha('Máquina', `${ficha.maquina.codigo} — ${ficha.maquina.descricao}`)}
      {ficha.molde && linha('Molde', `${ficha.molde.codigo} — ${ficha.molde.descricao}`)}
      {comMolde && linha('Ciclo', ficha.cicloS ? `${fmtNumero(ficha.cicloS)} s` : '—')}
      {comMolde && linha('Cavidades', ficha.cavidades)}
      {linha(
        'PH padrão',
        `${fmtNumero(ficha.phPadrao)} ${comMolde ? 'peças/h' : 'kg/h'}${ficha.phCalculado ? ' (calculado)' : ''}`,
      )}
      {comMolde &&
        linha(
          'Peso padrão',
          ficha.pesoPadraoG
            ? `${fmtNumero(ficha.pesoPadraoG)} g ± ${fmtNumero(ficha.toleranciaPesoPct ?? 0)}%`
            : '—',
        )}
      {linha('Criada por', `${ficha.criadoPor.nome} em ${formatarDataHora(ficha.criadoEm)}`)}
      {ficha.aprovador &&
        linha(
          'Aprovada por',
          `${ficha.aprovador.nome} — vigente desde ${formatarDataHora(ficha.vigenteDesde)}`,
        )}
      {ficha.obsoletaEm && linha('Obsoleta em', formatarDataHora(ficha.obsoletaEm))}
      <Divider label="Composição" labelPosition="left" />
      {ficha.composicao.length === 0 && (
        <Text size="sm" c="dimmed">
          Sem composição.
        </Text>
      )}
      {ficha.composicao.map((c) => (
        <Text size="sm" key={c.materialId}>
          {c.material?.codigo} — {c.material?.descricao}:{' '}
          {c.consumoGPorPeca != null ? `${fmtNumero(c.consumoGPorPeca)} g/peça` : ''}
          {c.consumoGPorPeca != null && c.percentual != null ? ' · ' : ''}
          {c.percentual != null ? `${fmtNumero(c.percentual)}%` : ''}
        </Text>
      ))}
      <Divider label="Parâmetros de processo" labelPosition="left" />
      {ficha.parametrosProcesso.length === 0 && (
        <Text size="sm" c="dimmed">
          Sem parâmetros.
        </Text>
      )}
      {ficha.parametrosProcesso.map((p, i) => (
        <Text size="sm" key={i}>
          {p.nome}: {p.valor} {p.unidade ?? ''}
        </Text>
      ))}
      {ficha.observacao && (
        <>
          <Divider label="Observação" labelPosition="left" />
          <Text size="sm">{ficha.observacao}</Text>
        </>
      )}
      <Divider label="Histórico de versões" labelPosition="left" />
      <Table>
        <Table.Tbody>
          {historico.data?.map((h) => (
            <Table.Tr key={h.id} style={h.id === ficha.id ? { fontWeight: 700 } : undefined}>
              <Table.Td>v{h.versao}</Table.Td>
              <Table.Td>
                <BadgeSituacao situacao={h.situacao} />
              </Table.Td>
              <Table.Td>{fmtNumero(h.phPadrao)}</Table.Td>
              <Table.Td>
                {h.vigenteDesde ? formatarDataHora(h.vigenteDesde) : formatarDataHora(h.criadoEm)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function PaginaFichas() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const podeEscrever = pode('fichas.escrever');
  const podeAprovar = pode('fichas.aprovar');
  const [filtro, setFiltro] = useState<{
    situacao: string | null;
    produtoId: string | null;
    maquinaId: string | null;
  }>({ situacao: null, produtoId: null, maquinaId: null });
  const [editando, setEditando] = useState<Ficha | null | undefined>(undefined);
  const [vendo, setVendo] = useState<Ficha | null>(null);
  const [reprovando, setReprovando] = useState<Ficha | null>(null);
  const [parecer, setParecer] = useState('');
  const { data: produtos = [] } = useLista('produtos');
  const { data: maquinas = [] } = useLista('maquinas');

  const consulta = new URLSearchParams(
    Object.entries(filtro).filter(([, v]) => v) as [string, string][],
  ).toString();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['fichas-tecnicas', consulta],
    queryFn: () => api.get<Ficha[]>(`/fichas-tecnicas${consulta ? `?${consulta}` : ''}`),
  });

  const acao = useMutation({
    mutationFn: ({ caminho, corpo }: { caminho: string; corpo?: unknown }) => api.post<Ficha>(caminho, corpo),
    onSuccess: (f, { caminho }) => {
      cliente.invalidateQueries({ queryKey: ['fichas-tecnicas'] });
      if (caminho.endsWith('nova-versao')) {
        notificarSucesso(`Versão ${f.versao} criada em rascunho.`);
        setEditando(f);
      } else if (caminho.endsWith('aprovar')) notificarSucesso(`Versão ${f.versao} aprovada e vigente.`);
      else notificarSucesso('Ficha devolvida ao PCP.');
      setReprovando(null);
    },
    onError: (e) => notificarErro(e),
  });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Fichas técnicas</Title>
          <Text c="dimmed" size="sm">
            Valem para produto + molde + máquina (extrusão: produto + máquina). Criadas pelo PCP, passam a
            valer após aprovação do superusuário. Ficha vigente não é editada: alterações geram nova versão.
          </Text>
        </div>
        {podeEscrever && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando(null)}>
            Nova ficha
          </Button>
        )}
      </Group>
      <Group>
        <Select
          placeholder="Situação"
          clearable
          data={Object.entries(ROTULO_SITUACAO_FICHA).map(([value, label]) => ({ value, label }))}
          value={filtro.situacao}
          onChange={(v) => setFiltro({ ...filtro, situacao: v })}
          w={180}
        />
        <Select
          placeholder="Produto"
          clearable
          searchable
          data={produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
          value={filtro.produtoId}
          onChange={(v) => setFiltro({ ...filtro, produtoId: v })}
          w={320}
        />
        <Select
          placeholder="Máquina"
          clearable
          data={maquinas.map((m) => ({ value: m.id, label: m.codigo as string }))}
          value={filtro.maquinaId}
          onChange={(v) => setFiltro({ ...filtro, maquinaId: v })}
          w={180}
        />
      </Group>
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped highlightOnHover verticalSpacing="sm" miw={900}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Produto</Table.Th>
              <Table.Th>Máquina</Table.Th>
              <Table.Th>Molde</Table.Th>
              <Table.Th>Versão</Table.Th>
              <Table.Th>Situação</Table.Th>
              <Table.Th>Ciclo</Table.Th>
              <Table.Th>PH padrão</Table.Th>
              <Table.Th w={1} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={8}>Carregando…</Table.Td>
              </Table.Tr>
            )}
            {!isLoading && data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed">Nenhuma ficha.</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {data.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>
                  <Text fw={600}>{f.produto.codigo}</Text>
                  <Text size="xs" c="dimmed">
                    {f.produto.descricao}
                  </Text>
                </Table.Td>
                <Table.Td>{f.maquina.codigo}</Table.Td>
                <Table.Td>{f.molde?.codigo ?? '—'}</Table.Td>
                <Table.Td>v{f.versao}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <BadgeSituacao situacao={f.situacao} />
                    {f.parecerReprovacao && (
                      <Badge color="orange" variant="light">
                        Reprovada
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{f.cicloS ? `${fmtNumero(f.cicloS)} s` : '—'}</Table.Td>
                <Table.Td>
                  {fmtNumero(f.phPadrao)}{' '}
                  {usaMolde(f.maquina.tipo) ? 'pç/h' : `${ROTULO_UNIDADE[f.produto.unidade]}/h`}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Ver detalhes e histórico">
                      <ActionIcon variant="subtle" size="lg" aria-label="Ver" onClick={() => setVendo(f)}>
                        <IconEye size={18} />
                      </ActionIcon>
                    </Tooltip>
                    {podeEscrever && f.situacao === 'RASCUNHO' && (
                      <Tooltip label="Editar rascunho">
                        <ActionIcon
                          variant="subtle"
                          size="lg"
                          aria-label="Editar rascunho"
                          onClick={() => setEditando(f)}
                        >
                          <IconPencil size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {podeEscrever && f.situacao !== 'RASCUNHO' && (
                      <Tooltip label="Alterar (cria nova versão)">
                        <ActionIcon
                          variant="subtle"
                          size="lg"
                          aria-label="Nova versão"
                          onClick={() => acao.mutate({ caminho: `/fichas-tecnicas/${f.id}/nova-versao` })}
                        >
                          <IconCopy size={18} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {podeAprovar && f.situacao === 'RASCUNHO' && (
                      <>
                        <Tooltip label="Aprovar">
                          <ActionIcon
                            color="green"
                            variant="light"
                            size="lg"
                            aria-label="Aprovar"
                            onClick={() => acao.mutate({ caminho: `/fichas-tecnicas/${f.id}/aprovar` })}
                          >
                            <IconCheck size={18} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Reprovar">
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="lg"
                            aria-label="Reprovar"
                            onClick={() => {
                              setParecer('');
                              setReprovando(f);
                            }}
                          >
                            <IconX size={18} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={editando !== undefined}
        onClose={() => setEditando(undefined)}
        size="xl"
        title={
          <Text fw={600}>
            {editando ? `Editar rascunho — versão ${editando.versao}` : 'Nova ficha técnica'}
          </Text>
        }
      >
        {editando !== undefined && (
          <FormularioFicha
            key={editando?.id ?? 'nova'}
            ficha={editando}
            aoFechar={() => setEditando(undefined)}
          />
        )}
      </Modal>
      <Drawer
        opened={!!vendo}
        onClose={() => setVendo(null)}
        position="right"
        size="lg"
        title={<Text fw={700}>Ficha técnica</Text>}
      >
        {vendo && <DetalheFicha key={vendo.id} ficha={vendo} />}
      </Drawer>
      <Modal opened={!!reprovando} onClose={() => setReprovando(null)} title="Reprovar ficha técnica">
        <Stack>
          <Textarea
            label="Parecer"
            withAsterisk
            autosize
            minRows={3}
            value={parecer}
            onChange={(e) => setParecer(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setReprovando(null)}>
              Cancelar
            </Button>
            <Button
              color="red"
              disabled={!parecer.trim()}
              loading={acao.isPending}
              onClick={() =>
                reprovando &&
                acao.mutate({ caminho: `/fichas-tecnicas/${reprovando.id}/reprovar`, corpo: { parecer } })
              }
            >
              Reprovar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export type { Registro };
