import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowsExchange, IconBarcode, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarDataHora,
  ROTULO_ORIGEM_LOTE,
  TIPOS_MATERIAL,
  type OrigemLote,
  type TipoProduto,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { consultarComCache, lotesDoPacote } from '../offline/pacote';
import { EstornoRecebimento } from '../componentes/EstornoRecebimento';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { imprimirComAviso } from '../componentes/notificarImpressao';
import { useLista } from '../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso, numeroOuNulo } from '../componentes/utilitarios';

export interface Lote {
  id: string;
  numero: string;
  origem: OrigemLote;
  fornecedor: string | null;
  notaFiscal: string | null;
  loteFornecedor: string | null;
  quantidadeInicial: number;
  indiceFluidez: number | null;
  criadoEm: string;
  material: { id: string; codigo: string; descricao: string; tipo: TipoProduto };
  saldo: number;
  porLocal: { localId: string; local: string; saldo: number }[];
  etiquetas: { id: string; codigo: string; impressaoPendente: boolean }[];
  mistura: {
    componentes: {
      quantidadeKg: number;
      percentual: number;
      lote: { numero: string; material: { codigo: string } };
    }[];
  } | null;
}

export const useLotes = (comSaldo = false) =>
  useQuery({
    queryKey: ['lotes', comSaldo],
    queryFn: () =>
      consultarComCache(`lotes:${comSaldo}`, () =>
        api.get<Lote[]>(`/materia-prima/lotes${comSaldo ? '?comSaldo=true' : ''}`),
      ).catch(async () => (await lotesDoPacote()) as unknown as Lote[]),
  });

type Resposta = { lote: { numero: string }; etiquetas: { id: string; codigo: string }[] };

function useLocaisMp() {
  const { data = [] } = useLista('locais-estoque', true);
  return data
    .filter((l) => l.tipo === 'MATERIA_PRIMA')
    .map((l) => ({ value: l.id, label: l.nome as string }));
}

function aoGravar(cliente: ReturnType<typeof useQueryClient>, r: Resposta, texto: string) {
  cliente.invalidateQueries({ queryKey: ['lotes'] });
  notificarSucesso(`${texto}: lote ${r.lote.numero}.`);
  void imprimirComAviso(r.etiquetas);
}

function EntradaCompra() {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos', true);
  const locais = useLocaisMp();
  const [v, setV] = useState({
    materialId: null as string | null,
    fornecedor: '',
    notaFiscal: '',
    loteFornecedor: '',
    quantidadeKg: '' as number | string,
    localEstoqueId: null as string | null,
    indiceFluidez: '' as number | string,
  });
  const gravar = useMutation({
    mutationFn: () =>
      api.post<Resposta>('/materia-prima/lotes/compra', {
        ...v,
        quantidadeKg: numeroOuNulo(v.quantidadeKg),
        indiceFluidez: numeroOuNulo(v.indiceFluidez),
        loteFornecedor: v.loteFornecedor || null,
      }),
    onSuccess: (r) => {
      aoGravar(cliente, r, 'Entrada registrada');
      setV({ ...v, fornecedor: '', notaFiscal: '', loteFornecedor: '', quantidadeKg: '', indiceFluidez: '' });
    },
  });
  const materiais = produtos.filter((p) =>
    ['MATERIA_PRIMA', 'ADITIVO', 'RECICLADO'].includes(p.tipo as string),
  );
  return (
    <Card withBorder maw={760}>
      <Stack>
        <Title order={4}>Entrada de lote comprado</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Material"
            withAsterisk
            searchable
            data={materiais.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
            value={v.materialId}
            onChange={(x) => setV({ ...v, materialId: x })}
          />
          <Select
            label="Local"
            withAsterisk
            data={locais}
            value={v.localEstoqueId}
            onChange={(x) => setV({ ...v, localEstoqueId: x })}
          />
          <TextInput
            label="Fornecedor"
            withAsterisk
            value={v.fornecedor}
            onChange={(e) => setV({ ...v, fornecedor: e.currentTarget.value })}
          />
          <TextInput
            label="Nota fiscal"
            withAsterisk
            value={v.notaFiscal}
            onChange={(e) => setV({ ...v, notaFiscal: e.currentTarget.value })}
          />
          <TextInput
            label="Lote do fornecedor"
            value={v.loteFornecedor}
            onChange={(e) => setV({ ...v, loteFornecedor: e.currentTarget.value })}
          />
          <NumberInput
            label="Quantidade"
            withAsterisk
            rightSection={
              <Text size="xs" c="dimmed">
                kg
              </Text>
            }
            decimalSeparator=","
            hideControls
            value={v.quantidadeKg}
            onChange={(x) => setV({ ...v, quantidadeKg: x })}
          />
          <NumberInput
            label="Índice de fluidez"
            decimalSeparator=","
            hideControls
            value={v.indiceFluidez}
            onChange={(x) => setV({ ...v, indiceFluidez: x })}
          />
        </SimpleGrid>
        <AlertaErroApi erro={gravar.error} />
        <Button size="lg" onClick={() => gravar.mutate()} loading={gravar.isPending} w="fit-content">
          Registrar entrada e imprimir etiqueta
        </Button>
      </Stack>
    </Card>
  );
}

function EntradaRetorno() {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos', true);
  const locais = useLocaisMp();
  const [v, setV] = useState({
    origem: 'MOIDO' as 'MOIDO' | 'RECICLADO',
    materialId: null as string | null,
    quantidadeKg: '' as number | string,
    localEstoqueId: null as string | null,
    leituraPerda: '',
  });
  const gravar = useMutation({
    mutationFn: () =>
      api.post<Resposta>('/materia-prima/lotes/retorno', {
        ...v,
        quantidadeKg: numeroOuNulo(v.quantidadeKg),
        leituraPerda: v.leituraPerda || null,
      }),
    onSuccess: (r) => {
      aoGravar(cliente, r, 'Material registrado');
      setV({ ...v, quantidadeKg: '', leituraPerda: '' });
    },
  });
  return (
    <Card withBorder maw={760}>
      <Stack>
        <Title order={4}>Moído ou reciclado que volta da produção</Title>
        <SegmentedControl
          data={[
            { value: 'MOIDO', label: 'Moído' },
            { value: 'RECICLADO', label: 'Reciclado' },
          ]}
          value={v.origem}
          onChange={(x) => setV({ ...v, origem: x as 'MOIDO' })}
          w="fit-content"
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Material"
            withAsterisk
            data={produtos
              .filter((p) => ['MOIDO', 'RECICLADO'].includes(p.tipo as string))
              .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
            value={v.materialId}
            onChange={(x) => setV({ ...v, materialId: x })}
          />
          <Select
            label="Local"
            withAsterisk
            data={locais}
            value={v.localEstoqueId}
            onChange={(x) => setV({ ...v, localEstoqueId: x })}
          />
          <NumberInput
            label="Quantidade"
            withAsterisk
            rightSection={
              <Text size="xs" c="dimmed">
                kg
              </Text>
            }
            decimalSeparator=","
            hideControls
            value={v.quantidadeKg}
            onChange={(x) => setV({ ...v, quantidadeKg: x })}
          />
          <TextInput
            label="Etiqueta da perda de origem (opcional)"
            leftSection={<IconBarcode size={16} />}
            value={v.leituraPerda}
            onChange={(e) => setV({ ...v, leituraPerda: e.currentTarget.value })}
          />
        </SimpleGrid>
        <AlertaErroApi erro={gravar.error} />
        <Button size="lg" onClick={() => gravar.mutate()} loading={gravar.isPending} w="fit-content">
          Registrar e imprimir etiqueta
        </Button>
      </Stack>
    </Card>
  );
}

function NovaMistura() {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos', true);
  const { data: lotes = [] } = useLotes(true);
  const locais = useLocaisMp();
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [localEstoqueId, setLocal] = useState<string | null>(null);
  const [destinos, setDestinos] = useState<string[]>([]);
  const [componentes, setComponentes] = useState<{ chave: string | null; quantidadeKg: number | string }[]>([
    { chave: null, quantidadeKg: '' },
    { chave: null, quantidadeKg: '' },
  ]);
  // Cada opção é lote + local com saldo.
  const opcoes = lotes.flatMap((l) =>
    l.porLocal
      .filter((p) => p.saldo > 0)
      .map((p) => ({
        value: `${l.id}|${p.localId}`,
        label: `${l.material.codigo} · ${l.numero} · ${p.local} (${fmtNumero(p.saldo)} kg)`,
      })),
  );
  const total = componentes.reduce((s, c) => s + (numeroOuNulo(c.quantidadeKg) ?? 0), 0);
  const gravar = useMutation({
    mutationFn: () =>
      api.post<Resposta>('/materia-prima/misturas', {
        materialId,
        localEstoqueId,
        produtosDestino: destinos,
        componentes: componentes.map((c) => ({
          loteId: c.chave?.split('|')[0],
          localEstoqueId: c.chave?.split('|')[1],
          quantidadeKg: numeroOuNulo(c.quantidadeKg),
        })),
      }),
    onSuccess: (r) => {
      aoGravar(cliente, r, 'Mistura preparada');
      setComponentes([
        { chave: null, quantidadeKg: '' },
        { chave: null, quantidadeKg: '' },
      ]);
    },
  });
  return (
    <Card withBorder maw={900}>
      <Stack>
        <Title order={4}>Preparar mistura</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Material da mistura"
            withAsterisk
            data={produtos
              .filter((p) => p.tipo === 'MISTURA')
              .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
            value={materialId}
            onChange={setMaterialId}
            description="Produto do tipo Mistura."
          />
          <Select
            label="Local da mistura"
            withAsterisk
            data={locais}
            value={localEstoqueId}
            onChange={setLocal}
          />
        </SimpleGrid>
        {componentes.map((c, i) => (
          <Group key={i} align="flex-end" wrap="nowrap">
            <Select
              label={`Componente ${i + 1}`}
              searchable
              data={opcoes}
              value={c.chave}
              onChange={(x) => setComponentes(componentes.map((y, j) => (j === i ? { ...y, chave: x } : y)))}
              style={{ flex: 3 }}
            />
            <NumberInput
              label="kg"
              decimalSeparator=","
              hideControls
              value={c.quantidadeKg}
              onChange={(x) =>
                setComponentes(componentes.map((y, j) => (j === i ? { ...y, quantidadeKg: x } : y)))
              }
              style={{ flex: 1 }}
            />
            <Text w={70} size="sm" c="dimmed">
              {total > 0 ? `${fmtNumero(((numeroOuNulo(c.quantidadeKg) ?? 0) / total) * 100)}%` : ''}
            </Text>
            {componentes.length > 2 && (
              <ActionIcon
                color="red"
                variant="subtle"
                size="lg"
                aria-label="Remover componente"
                onClick={() => setComponentes(componentes.filter((_, j) => j !== i))}
              >
                <IconTrash size={18} />
              </ActionIcon>
            )}
          </Group>
        ))}
        <Button
          variant="light"
          size="xs"
          w="fit-content"
          leftSection={<IconPlus size={14} />}
          onClick={() => setComponentes([...componentes, { chave: null, quantidadeKg: '' }])}
        >
          Componente
        </Button>
        <MultiSelect
          label="Produtos a que se destina"
          searchable
          data={produtos
            .filter((p) => ['ACABADO', 'SEMIACABADO'].includes(p.tipo as string))
            .map((p) => ({ value: p.id, label: p.codigo as string }))}
          value={destinos}
          onChange={setDestinos}
        />
        <Text fw={700}>Total: {fmtNumero(total, 3)} kg</Text>
        <AlertaErroApi erro={gravar.error} />
        <Button size="lg" onClick={() => gravar.mutate()} loading={gravar.isPending} w="fit-content">
          Preparar mistura e imprimir etiqueta
        </Button>
      </Stack>
    </Card>
  );
}

function ReceberDaProducao() {
  const cliente = useQueryClient();
  const locais = useLocaisMp();
  const [leitura, setLeitura] = useState('');
  const [localEstoqueId, setLocal] = useState<string | null>(null);
  const pendentes = useQuery({
    queryKey: ['materia-prima', 'pendentes'],
    queryFn: () =>
      api.get<
        {
          id: string;
          codigo: string;
          tipo: string;
          quantidade: number;
          emitidaEm: string;
          produto: { codigo: string };
          lote: { numero: string } | null;
        }[]
      >('/materia-prima/pendentes'),
  });
  const receber = useMutation({
    mutationFn: () => api.post<{ codigo: string }>('/materia-prima/receber', { leitura, localEstoqueId }),
    onSuccess: (e) => {
      notificarSucesso(`Etiqueta ${e.codigo} recebida.`);
      setLeitura('');
      cliente.invalidateQueries({ queryKey: ['lotes'] });
      cliente.invalidateQueries({ queryKey: ['materia-prima'] });
    },
  });
  return (
    <Stack>
      <Card withBorder maw={760}>
        <Stack>
          <Title order={4}>Receber devolução ou volume de extrusão</Title>
          <Select
            label="Local"
            withAsterisk
            size="lg"
            data={locais}
            value={localEstoqueId}
            onChange={setLocal}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (leitura.trim() && localEstoqueId) receber.mutate();
            }}
          >
            <TextInput
              label="Leitura da etiqueta"
              size="xl"
              leftSection={<IconBarcode />}
              autoFocus
              value={leitura}
              onChange={(e) => setLeitura(e.currentTarget.value)}
              description="Leia o código de barras ou digite o código e tecle Enter."
            />
          </form>
          <AlertaErroApi erro={receber.error} />
        </Stack>
      </Card>
      <Title order={5}>Aguardando recebimento</Title>
      <Table striped>
        <Table.Tbody>
          {pendentes.data?.length === 0 && (
            <Table.Tr>
              <Table.Td>
                <Text c="dimmed">Nada pendente.</Text>
              </Table.Td>
            </Table.Tr>
          )}
          {pendentes.data?.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td ff="monospace">{p.codigo}</Table.Td>
              <Table.Td>{p.tipo === 'EXTRUSAO' ? 'Extrusão' : 'Devolução'}</Table.Td>
              <Table.Td>
                {p.produto.codigo} · lote {p.lote?.numero}
              </Table.Td>
              <Table.Td>{fmtNumero(p.quantidade, 3)} kg</Table.Td>
              <Table.Td>{formatarDataHora(p.emitidaEm)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function OrdemExtrusao() {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos', true);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState<number | string>('');
  const criar = useMutation({
    mutationFn: () =>
      api.post<{ numeroInterno: number }>('/ordens/extrusao', {
        produtoId,
        quantidade: numeroOuNulo(quantidade),
      }),
    onSuccess: (o) => {
      cliente.invalidateQueries({ queryKey: ['ordens'] });
      notificarSucesso(
        `Ordem de extrusão nº ${o.numeroInterno} criada. Crie a rodada da extrusora em "Rodadas".`,
      );
      setQuantidade('');
    },
  });
  return (
    <Card withBorder maw={600}>
      <Stack>
        <Title order={4}>Nova ordem de extrusão</Title>
        <Text size="sm" c="dimmed">
          Gera saldo de material extrusado. Não precisa de número do ERP.
        </Text>
        <Select
          label="Produto extrusado"
          withAsterisk
          data={produtos
            .filter((p) => p.tipo === 'EXTRUSADO')
            .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
          value={produtoId}
          onChange={setProdutoId}
        />
        <NumberInput
          label="Quantidade"
          withAsterisk
          rightSection={
            <Text size="xs" c="dimmed">
              kg
            </Text>
          }
          decimalSeparator=","
          hideControls
          value={quantidade}
          onChange={setQuantidade}
        />
        <AlertaErroApi erro={criar.error} />
        <Button onClick={() => criar.mutate()} loading={criar.isPending} w="fit-content">
          Criar ordem de extrusão
        </Button>
      </Stack>
    </Card>
  );
}

function Lotes() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const locais = useLocaisMp();
  const [comSaldo, setComSaldo] = useState(true);
  const { data = [], error } = useLotes(comSaldo);
  const [transferindo, setTransferindo] = useState<Lote | null>(null);
  const [tr, setTr] = useState({
    localOrigemId: null as string | null,
    localDestinoId: null as string | null,
    quantidadeKg: '' as number | string,
  });
  const transferir = useMutation({
    mutationFn: () =>
      api.post(`/materia-prima/lotes/${transferindo!.id}/transferir`, {
        ...tr,
        quantidadeKg: numeroOuNulo(tr.quantidadeKg),
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['lotes'] });
      notificarSucesso('Transferência registrada.');
      setTransferindo(null);
    },
  });
  return (
    <Stack>
      <SegmentedControl
        w="fit-content"
        value={comSaldo ? 's' : 't'}
        onChange={(x) => setComSaldo(x === 's')}
        data={[
          { value: 's', label: 'Com saldo' },
          { value: 't', label: 'Todos' },
        ]}
      />
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped verticalSpacing="xs" miw={900}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Lote</Table.Th>
              <Table.Th>Material</Table.Th>
              <Table.Th>Origem</Table.Th>
              <Table.Th>Fornecedor / NF</Table.Th>
              <Table.Th>Saldo por local</Table.Th>
              <Table.Th>Etiqueta</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Text fw={700} ff="monospace">
                    {l.numero}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatarDataHora(l.criadoEm)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {l.material.codigo}
                  {l.mistura && (
                    <Text size="xs" c="dimmed">
                      {l.mistura.componentes
                        .map((c) => `${c.lote.material.codigo} ${fmtNumero(c.percentual)}%`)
                        .join(' + ')}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{ROTULO_ORIGEM_LOTE[l.origem]}</Badge>
                </Table.Td>
                <Table.Td>
                  {l.fornecedor ?? '—'}
                  {l.notaFiscal ? ` · NF ${l.notaFiscal}` : ''}
                </Table.Td>
                <Table.Td>
                  <Text fw={700}>{fmtNumero(l.saldo, 3)} kg</Text>
                  {l.porLocal.map((p) => (
                    <Text size="xs" key={p.localId}>
                      {p.local}: {fmtNumero(p.saldo, 3)} kg
                    </Text>
                  ))}
                </Table.Td>
                <Table.Td ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                  {l.etiquetas.map((e) => e.codigo).join(', ') || '—'}
                </Table.Td>
                <Table.Td>
                  {pode('materiaprima.escrever') && l.saldo > 0 && (
                    <Tooltip label="Transferir entre locais">
                      <ActionIcon
                        variant="subtle"
                        size="lg"
                        aria-label="Transferir lote"
                        onClick={() => {
                          setTr({
                            localOrigemId: l.porLocal[0]?.localId ?? null,
                            localDestinoId: null,
                            quantidadeKg: '',
                          });
                          setTransferindo(l);
                        }}
                      >
                        <IconArrowsExchange size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Modal
        opened={!!transferindo}
        onClose={() => setTransferindo(null)}
        title={`Transferir lote ${transferindo?.numero}`}
      >
        <Stack>
          <Select
            label="De"
            data={
              transferindo?.porLocal.map((p) => ({
                value: p.localId,
                label: `${p.local} (${fmtNumero(p.saldo)} kg)`,
              })) ?? []
            }
            value={tr.localOrigemId}
            onChange={(x) => setTr({ ...tr, localOrigemId: x })}
          />
          <Select
            label="Para"
            data={locais}
            value={tr.localDestinoId}
            onChange={(x) => setTr({ ...tr, localDestinoId: x })}
          />
          <NumberInput
            label="Quantidade (kg)"
            decimalSeparator=","
            hideControls
            value={tr.quantidadeKg}
            onChange={(x) => setTr({ ...tr, quantidadeKg: x })}
          />
          <AlertaErroApi erro={transferir.error} />
          <Button onClick={() => transferir.mutate()} loading={transferir.isPending}>
            Transferir
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

export function PaginaMateriaPrima() {
  const { pode } = useAutenticacao();
  const escreve = pode('materiaprima.escrever');
  return (
    <Stack>
      <Title order={2}>Matéria-prima</Title>
      <Tabs defaultValue="lotes">
        <Tabs.List>
          <Tabs.Tab value="lotes">Lotes e saldo</Tabs.Tab>
          {escreve && <Tabs.Tab value="compra">Entrada de compra</Tabs.Tab>}
          {escreve && <Tabs.Tab value="mistura">Mistura</Tabs.Tab>}
          {escreve && <Tabs.Tab value="receber">Receber da produção</Tabs.Tab>}
          {escreve && <Tabs.Tab value="retorno">Moído / reciclado</Tabs.Tab>}
          {escreve && <Tabs.Tab value="estorno">Estorno</Tabs.Tab>}
          {pode('ordens.extrusao') && <Tabs.Tab value="extrusao">Ordem de extrusão</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="lotes" pt="md">
          <Lotes />
        </Tabs.Panel>
        <Tabs.Panel value="compra" pt="md">
          <EntradaCompra />
        </Tabs.Panel>
        <Tabs.Panel value="mistura" pt="md">
          <NovaMistura />
        </Tabs.Panel>
        <Tabs.Panel value="receber" pt="md">
          <ReceberDaProducao />
        </Tabs.Panel>
        <Tabs.Panel value="retorno" pt="md">
          <EntradaRetorno />
        </Tabs.Panel>
        <Tabs.Panel value="estorno" pt="md">
          <EstornoRecebimento setor="materia-prima" />
        </Tabs.Panel>
        <Tabs.Panel value="extrusao" pt="md">
          <OrdemExtrusao />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

export const MATERIAIS_PRODUCAO: TipoProduto[] = TIPOS_MATERIAL.filter((t) => t !== 'SEMIACABADO');
