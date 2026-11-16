import { useMemo, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Button,
  Chip,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULO_DIA_SEMANA, type Permissao } from '@apontamento/shared';
import type { ZodType } from 'zod';
import { consultarComCache, listaDoPacote } from '../offline/pacote';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { ListaParametrosLivres, type ItemParametro } from './ListaParametrosLivres';
import { AlertaErroApi, errosApiPorCampo, errosZod, notificarSucesso } from './utilitarios';

export type Registro = Record<string, unknown> & { id: string };
export type Valores = Record<string, unknown>;

export interface Campo {
  nome: string;
  rotulo: string;
  tipo:
    | 'texto'
    | 'textoLongo'
    | 'numero'
    | 'inteiro'
    | 'booleano'
    | 'enum'
    | 'multienum'
    | 'referencia'
    | 'hora'
    | 'diasSemana'
    | 'parametrosLivres'
    | 'senha';
  opcoes?: Record<string, string>;
  referencia?: { rota: string; rotulo: (r: Registro) => string; filtro?: (r: Registro) => boolean };
  unidade?: string;
  ajuda?: string;
  obrigatorio?: boolean;
  /** Ocupa a linha inteira do formulário. */
  inteiro?: boolean;
  visivel?: (v: Valores) => boolean;
  somenteCriacao?: boolean;
}

export interface Coluna {
  rotulo: string;
  valor: (r: Registro) => ReactNode;
}

export interface ConfigCadastro {
  titulo: string;
  singular: string;
  rota: string;
  descricao?: string;
  esquema: ZodType;
  esquemaEdicao?: ZodType;
  campos: Campo[];
  colunas: Coluna[];
  valoresIniciais: Valores;
  campoAtivo?: 'ativo' | 'ativa';
  /** Converte o registro da API em valores do formulário (padrão: copia os campos). */
  paraFormulario?: (r: Registro) => Valores;
  /** Converte os valores do formulário no corpo enviado à API. */
  paraEnvio?: (v: Valores, edicao: boolean) => Valores;
  permissaoEscrita?: Permissao;
  acoesExtras?: (r: Registro) => ReactNode;
}

/** Normaliza campos numéricos vazios ('' → null). */
function normalizar(campos: Campo[], v: Valores): Valores {
  const r: Valores = { ...v };
  for (const c of campos) {
    if ((c.tipo === 'numero' || c.tipo === 'inteiro') && (r[c.nome] === '' || r[c.nome] === undefined))
      r[c.nome] = null;
    if (c.tipo === 'parametrosLivres') {
      r[c.nome] = ((r[c.nome] as ItemParametro[]) ?? []).map((p) => ({ ...p, unidade: p.unidade || null }));
    }
  }
  return r;
}

export function useLista<T = Registro>(rota: string, apenasAtivos = false) {
  return useQuery({
    queryKey: [rota, apenasAtivos ? 'ativos' : 'todos'],
    // Cópia no tablet: sem servidor, as listas (motivos, tipos de perda, conjuntos...) seguem disponíveis.
    queryFn: () =>
      consultarComCache(`lista:${rota}:${apenasAtivos}`, () =>
        api.get<T[]>(`/${rota}${apenasAtivos ? '?ativos=true' : ''}`),
      ).catch(async (e) => {
        const doPacote = await listaDoPacote(rota);
        if (doPacote) return doPacote as T[];
        throw e;
      }),
  });
}

function CampoReferencia({
  campo,
  valor,
  aoMudar,
  erro,
}: {
  campo: Campo;
  valor: unknown;
  aoMudar: (v: string | null) => void;
  erro?: string;
}) {
  const { data = [] } = useLista(campo.referencia!.rota);
  const opcoes = data
    .filter((r) => (campo.referencia!.filtro ? campo.referencia!.filtro(r) : true) || r.id === valor)
    .map((r) => ({ value: r.id, label: campo.referencia!.rotulo(r) }));
  return (
    <Select
      label={campo.rotulo}
      data={opcoes}
      value={(valor as string) ?? null}
      onChange={aoMudar}
      searchable
      clearable={!campo.obrigatorio}
      withAsterisk={campo.obrigatorio}
      error={erro}
      description={campo.ajuda}
      nothingFoundMessage="Nada encontrado"
    />
  );
}

/** Parte do formulário usada pelos campos (evita amarrar ao tipo do validador). */
export interface FormularioCampos {
  getInputProps: (caminho: string) => { value?: unknown; onChange: (e: unknown) => void; error?: unknown };
  setFieldValue: (caminho: string, valor: unknown) => void;
}

export function CampoFormulario({ campo, form }: { campo: Campo; form: FormularioCampos }) {
  const props = form.getInputProps(campo.nome);
  const comuns = {
    label: campo.rotulo,
    description: campo.ajuda,
    withAsterisk: campo.obrigatorio,
    error: props.error as string | undefined,
  };
  const opcoes = Object.entries(campo.opcoes ?? {}).map(([value, label]) => ({ value, label }));
  switch (campo.tipo) {
    case 'texto':
      return <TextInput {...comuns} value={(props.value as string) ?? ''} onChange={props.onChange} />;
    case 'senha':
      return (
        <PasswordInput
          {...comuns}
          value={(props.value as string) ?? ''}
          onChange={props.onChange}
          autoComplete="new-password"
        />
      );
    case 'textoLongo':
      return (
        <Textarea
          {...comuns}
          value={(props.value as string) ?? ''}
          onChange={props.onChange}
          autosize
          minRows={3}
          maxRows={14}
          styles={{ input: { fontFamily: 'monospace' } }}
        />
      );
    case 'hora':
      return (
        <TextInput {...comuns} type="time" value={(props.value as string) ?? ''} onChange={props.onChange} />
      );
    case 'numero':
    case 'inteiro':
      return (
        <NumberInput
          {...comuns}
          value={(props.value as number | string) ?? ''}
          onChange={props.onChange}
          allowDecimal={campo.tipo === 'numero'}
          decimalSeparator=","
          thousandSeparator="."
          rightSection={
            campo.unidade ? (
              <Text size="xs" c="dimmed">
                {campo.unidade}
              </Text>
            ) : undefined
          }
          rightSectionWidth={campo.unidade ? 48 : undefined}
          hideControls
        />
      );
    case 'booleano':
      return (
        <Switch
          label={campo.rotulo}
          description={campo.ajuda}
          checked={!!props.value}
          onChange={(e) => form.setFieldValue(campo.nome, e.currentTarget.checked)}
          size="md"
          mt="lg"
        />
      );
    case 'enum':
      return (
        <Select
          {...comuns}
          data={opcoes}
          value={(props.value as string) ?? null}
          onChange={(v) => form.setFieldValue(campo.nome, v)}
          allowDeselect={false}
        />
      );
    case 'multienum':
      return (
        <MultiSelect
          {...comuns}
          data={opcoes}
          value={(props.value as string[]) ?? []}
          onChange={(v) => form.setFieldValue(campo.nome, v)}
        />
      );
    case 'referencia':
      return (
        <CampoReferencia
          campo={campo}
          valor={props.value}
          aoMudar={(v) => form.setFieldValue(campo.nome, v)}
          erro={props.error as string}
        />
      );
    case 'diasSemana':
      return (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {campo.rotulo}
          </Text>
          <Chip.Group
            multiple
            value={((props.value as number[]) ?? []).map(String)}
            onChange={(v) => form.setFieldValue(campo.nome, v.map(Number).sort())}
          >
            <Group gap={6}>
              {ROTULO_DIA_SEMANA.map((d, i) => (
                <Chip key={i} value={String(i)} size="md">
                  {d}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          {!!props.error && (
            <Text size="xs" c="red">
              {props.error as string}
            </Text>
          )}
        </Stack>
      );
    case 'parametrosLivres':
      return (
        <ListaParametrosLivres
          rotulo={campo.rotulo}
          valor={(props.value as ItemParametro[]) ?? []}
          aoMudar={(v) => form.setFieldValue(campo.nome, v)}
          erro={props.error as string}
        />
      );
  }
}

function FormularioCadastro({
  config,
  registro,
  aoFechar,
}: {
  config: ConfigCadastro;
  registro: Registro | null;
  aoFechar: () => void;
}) {
  const edicao = !!registro;
  const cliente = useQueryClient();
  const valoresIniciais = registro
    ? config.paraFormulario
      ? config.paraFormulario(registro)
      : { ...config.valoresIniciais, ...registro }
    : config.valoresIniciais;
  const esquema = edicao && config.esquemaEdicao ? config.esquemaEdicao : config.esquema;
  const paraEnvio = (v: Valores) => {
    const n = normalizar(config.campos, v);
    const corpo = config.paraEnvio ? config.paraEnvio(n, edicao) : n;
    // Envia só os campos do formulário (remove id, datas e relações).
    const nomes = new Set(config.campos.map((c) => c.nome));
    return Object.fromEntries(Object.entries(corpo).filter(([k]) => nomes.has(k)));
  };
  const form = useForm<Valores>({
    mode: 'controlled',
    initialValues: valoresIniciais,
    validate: (v) => errosZod(esquema, paraEnvio(v)),
  });
  const salvar = useMutation({
    mutationFn: (corpo: Valores) =>
      edicao ? api.put(`/${config.rota}/${registro!.id}`, corpo) : api.post(`/${config.rota}`, corpo),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: [config.rota] });
      notificarSucesso(`${config.singular} ${edicao ? 'alterado(a)' : 'cadastrado(a)'} com sucesso.`);
      aoFechar();
    },
    onError: (e) => form.setErrors(errosApiPorCampo(e)),
  });
  const valores = form.getValues();
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(paraEnvio(v)))}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {config.campos
            .filter((c) => (c.visivel ? c.visivel(valores) : true))
            .filter((c) => !(c.somenteCriacao && edicao))
            .map((c) => (
              <div
                key={c.nome}
                style={
                  c.inteiro || c.tipo === 'parametrosLivres' || c.tipo === 'textoLongo'
                    ? { gridColumn: '1 / -1' }
                    : undefined
                }
              >
                <CampoFormulario campo={c} form={form as unknown as FormularioCampos} />
              </div>
            ))}
        </SimpleGrid>
        <AlertaErroApi erro={salvar.error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Página genérica de cadastro: lista com busca e formulário em janela. */
export function PaginaCadastro({ config }: { config: ConfigCadastro }) {
  const { pode } = useAutenticacao();
  const podeEscrever = pode(config.permissaoEscrita ?? 'cadastros.escrever');
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<Registro | null | undefined>(undefined);
  const { data = [], isLoading, error } = useLista(config.rota);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return data.filter((r) => {
      if (!mostrarInativos && config.campoAtivo && r[config.campoAtivo] === false) return false;
      if (!termo) return true;
      return JSON.stringify(r).toLowerCase().includes(termo);
    });
  }, [data, busca, mostrarInativos, config.campoAtivo]);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>{config.titulo}</Title>
          {config.descricao && (
            <Text c="dimmed" size="sm">
              {config.descricao}
            </Text>
          )}
        </div>
        {podeEscrever && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando(null)}>
            Novo(a) {config.singular.toLowerCase()}
          </Button>
        )}
      </Group>
      <Group>
        <TextInput
          placeholder="Buscar"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 420 }}
        />
        {config.campoAtivo && (
          <Switch
            label="Mostrar inativos"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.currentTarget.checked)}
          />
        )}
      </Group>
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped highlightOnHover verticalSpacing="sm" miw={600}>
          <Table.Thead>
            <Table.Tr>
              {config.colunas.map((c) => (
                <Table.Th key={c.rotulo}>{c.rotulo}</Table.Th>
              ))}
              <Table.Th w={1} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={config.colunas.length + 1}>Carregando…</Table.Td>
              </Table.Tr>
            )}
            {!isLoading && filtrados.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={config.colunas.length + 1}>
                  <Text c="dimmed">Nenhum registro.</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {filtrados.map((r) => (
              <Table.Tr key={r.id}>
                {config.colunas.map((c) => (
                  <Table.Td key={c.rotulo}>{c.valor(r)}</Table.Td>
                ))}
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {config.acoesExtras?.(r)}
                    {podeEscrever && (
                      <Tooltip label="Editar">
                        <ActionIcon
                          variant="subtle"
                          size="lg"
                          aria-label="Editar"
                          onClick={() => setEditando(r)}
                        >
                          <IconPencil size={18} />
                        </ActionIcon>
                      </Tooltip>
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
        title={
          <Text fw={600}>
            {editando
              ? `Editar ${config.singular.toLowerCase()}`
              : `Novo(a) ${config.singular.toLowerCase()}`}
          </Text>
        }
        size="xl"
      >
        {editando !== undefined && (
          <FormularioCadastro config={config} registro={editando} aoFechar={() => setEditando(undefined)} />
        )}
      </Modal>
    </Stack>
  );
}
