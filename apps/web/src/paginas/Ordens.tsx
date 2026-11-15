import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import {
  IconBan,
  IconFileSpreadsheet,
  IconLock,
  IconPencil,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  esquemaOrdem,
  formatarDataCivil,
  ROTULO_SITUACAO_ORDEM,
  ROTULO_TIPO_ORDEM,
  ROTULO_UNIDADE,
  type SituacaoOrdem,
  type TipoOrdem,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista } from '../componentes/PaginaCadastro';
import {
  AlertaErroApi,
  errosApiPorCampo,
  errosZod,
  fmtNumero,
  notificarErro,
  notificarSucesso,
  numeroOuNulo,
} from '../componentes/utilitarios';

export interface Ordem {
  id: string;
  numeroInterno: number;
  numeroErp: string | null;
  tipo: TipoOrdem;
  produtoId: string;
  quantidade: number;
  unidade: Unidade;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacao: string | null;
  situacao: SituacaoOrdem;
  produto: { id: string; codigo: string; descricao: string; unidade: Unidade };
  produzido: number;
  saldo: number;
  percentualConcluido: number;
}

const COR_SITUACAO: Record<SituacaoOrdem, string> = {
  ABERTA: 'blue',
  EM_PRODUCAO: 'green',
  ENCERRADA: 'gray',
  CANCELADA: 'red',
};

/** "ERP 04508401001 · nº 17" — toda tela mostra os dois números (RN-01). */
export function NumerosOp({ ordem }: { ordem: { numeroErp: string | null; numeroInterno: number } }) {
  return (
    <Stack gap={0}>
      <Text fw={700}>{ordem.numeroErp ?? '—'}</Text>
      <Text size="xs" c="dimmed">
        nº interno {ordem.numeroInterno}
      </Text>
    </Stack>
  );
}

type ValoresOrdem = {
  tipo: TipoOrdem;
  numeroErp: string;
  produtoId: string | null;
  quantidade: number | string;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacao: string;
};

function FormularioOrdem({ ordem, aoFechar }: { ordem: Ordem | null; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos', true);
  const paraEnvio = (v: ValoresOrdem) => ({
    tipo: v.tipo,
    numeroErp: v.numeroErp || null,
    produtoId: v.produtoId,
    quantidade: numeroOuNulo(v.quantidade),
    dataInicioPrevista: v.dataInicioPrevista,
    dataFimPrevista: v.dataFimPrevista,
    observacao: v.observacao || null,
  });
  const form = useForm<ValoresOrdem>({
    mode: 'controlled',
    initialValues: ordem
      ? {
          tipo: ordem.tipo,
          numeroErp: ordem.numeroErp ?? '',
          produtoId: ordem.produtoId,
          quantidade: ordem.quantidade,
          dataInicioPrevista: ordem.dataInicioPrevista,
          dataFimPrevista: ordem.dataFimPrevista,
          observacao: ordem.observacao ?? '',
        }
      : {
          tipo: 'PRODUCAO',
          numeroErp: '',
          produtoId: null,
          quantidade: '',
          dataInicioPrevista: null,
          dataFimPrevista: null,
          observacao: '',
        },
    validate: (v) => errosZod(esquemaOrdem, paraEnvio(v)),
  });
  const v = form.getValues();
  const salvar = useMutation({
    mutationFn: (corpo: ReturnType<typeof paraEnvio>) =>
      ordem ? api.put(`/ordens/${ordem.id}`, corpo) : api.post('/ordens', corpo),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['ordens'] });
      notificarSucesso(ordem ? 'OP alterada.' : 'OP cadastrada.');
      aoFechar();
    },
    onError: (e) => form.setErrors(errosApiPorCampo(e)),
  });
  const filtrados = produtos.filter((p) =>
    v.tipo === 'EXTRUSAO'
      ? p.unidade === 'KG' && p.tipo === 'EXTRUSADO'
      : ['ACABADO', 'SEMIACABADO'].includes(p.tipo as string),
  );
  const unidade = produtos.find((p) => p.id === v.produtoId)?.unidade as Unidade | undefined;
  return (
    <form onSubmit={form.onSubmit((valores) => salvar.mutate(paraEnvio(valores)))}>
      <Stack>
        <SegmentedControl
          data={Object.entries(ROTULO_TIPO_ORDEM).map(([value, label]) => ({ value, label }))}
          {...form.getInputProps('tipo')}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            label="Número da OP no ERP"
            withAsterisk={v.tipo === 'PRODUCAO'}
            description={v.tipo === 'EXTRUSAO' ? 'Opcional na extrusão.' : undefined}
            {...form.getInputProps('numeroErp')}
          />
          <Select
            label="Produto"
            withAsterisk
            searchable
            data={filtrados.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))}
            {...form.getInputProps('produtoId')}
          />
          <NumberInput
            label="Quantidade"
            withAsterisk
            decimalSeparator=","
            thousandSeparator="."
            hideControls
            rightSection={
              unidade ? (
                <Text size="xs" c="dimmed">
                  {ROTULO_UNIDADE[unidade]}
                </Text>
              ) : undefined
            }
            {...form.getInputProps('quantidade')}
          />
          <div />
          <DatePickerInput
            label="Início previsto"
            valueFormat="DD/MM/YYYY"
            clearable
            {...form.getInputProps('dataInicioPrevista')}
          />
          <DatePickerInput
            label="Término previsto"
            valueFormat="DD/MM/YYYY"
            clearable
            {...form.getInputProps('dataFimPrevista')}
          />
        </SimpleGrid>
        <Textarea label="Observação" autosize minRows={2} {...form.getInputProps('observacao')} />
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

export function PaginaOrdens() {
  const { pode } = useAutenticacao();
  const podeEscrever = pode('ordens.escrever');
  const cliente = useQueryClient();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<string | null>('ABERTA,EM_PRODUCAO');
  const [editando, setEditando] = useState<Ordem | null | undefined>(undefined);
  const parametros = new URLSearchParams();
  if (situacao) parametros.set('situacao', situacao);
  if (busca.trim()) parametros.set('busca', busca.trim());
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['ordens', parametros.toString()],
    queryFn: () => api.get<Ordem[]>(`/ordens?${parametros}`),
  });
  const acao = useMutation({
    mutationFn: ({ id, tipo }: { id: string; tipo: 'encerrar' | 'cancelar' }) =>
      api.post(`/ordens/${id}/${tipo}`),
    onSuccess: (_, { tipo }) => {
      cliente.invalidateQueries({ queryKey: ['ordens'] });
      notificarSucesso(tipo === 'encerrar' ? 'OP encerrada.' : 'OP cancelada.');
    },
    onError: (e) => notificarErro(e),
  });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Ordens de produção</Title>
          <Text c="dimmed" size="sm">
            Cada OP tem o número do ERP e um número interno automático.
          </Text>
        </div>
        {podeEscrever && (
          <Group>
            <Button
              variant="light"
              component={Link}
              to="/importacoes"
              leftSection={<IconFileSpreadsheet size={18} />}
            >
              Importar do Excel
            </Button>
            <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando(null)}>
              Nova OP
            </Button>
          </Group>
        )}
      </Group>
      <Group>
        <TextInput
          placeholder="Número, produto…"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
          w={300}
        />
        <Select
          value={situacao}
          onChange={setSituacao}
          clearable
          placeholder="Todas as situações"
          data={[
            { value: 'ABERTA,EM_PRODUCAO', label: 'Abertas e em produção' },
            ...Object.entries(ROTULO_SITUACAO_ORDEM).map(([value, label]) => ({ value, label })),
          ]}
          w={240}
        />
      </Group>
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped highlightOnHover verticalSpacing="sm" miw={900}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>OP</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Produto</Table.Th>
              <Table.Th>Quantidade</Table.Th>
              <Table.Th w={220}>Produzido</Table.Th>
              <Table.Th>Previsão</Table.Th>
              <Table.Th>Situação</Table.Th>
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
                  <Text c="dimmed">Nenhuma OP.</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {data.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>
                  <NumerosOp ordem={o} />
                </Table.Td>
                <Table.Td>{ROTULO_TIPO_ORDEM[o.tipo]}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {o.produto.codigo}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {o.produto.descricao}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {fmtNumero(o.quantidade, 3)} {ROTULO_UNIDADE[o.unidade]}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {fmtNumero(o.produzido, 3)} ({fmtNumero(o.percentualConcluido, 1)}%)
                  </Text>
                  <Progress
                    value={Math.min(100, o.percentualConcluido)}
                    color={o.percentualConcluido > 100 ? 'orange' : 'blue'}
                    size="sm"
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {o.dataInicioPrevista ? formatarDataCivil(o.dataInicioPrevista) : '—'}
                    {o.dataFimPrevista ? ` a ${formatarDataCivil(o.dataFimPrevista)}` : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={COR_SITUACAO[o.situacao]}>{ROTULO_SITUACAO_ORDEM[o.situacao]}</Badge>
                </Table.Td>
                <Table.Td>
                  {podeEscrever && (
                    <Group gap={4} wrap="nowrap">
                      {o.situacao === 'ABERTA' && o.produzido === 0 && (
                        <Tooltip label="Editar">
                          <ActionIcon
                            variant="subtle"
                            size="lg"
                            aria-label="Editar OP"
                            onClick={() => setEditando(o)}
                          >
                            <IconPencil size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {['ABERTA', 'EM_PRODUCAO'].includes(o.situacao) && (
                        <Tooltip label="Encerrar OP">
                          <ActionIcon
                            variant="subtle"
                            size="lg"
                            aria-label="Encerrar OP"
                            onClick={() =>
                              confirm(`Encerrar a OP ${o.numeroErp ?? o.numeroInterno}?`) &&
                              acao.mutate({ id: o.id, tipo: 'encerrar' })
                            }
                          >
                            <IconLock size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {o.situacao === 'ABERTA' && o.produzido === 0 && (
                        <Tooltip label="Cancelar OP">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="lg"
                            aria-label="Cancelar OP"
                            onClick={() =>
                              confirm(`Cancelar a OP ${o.numeroErp ?? o.numeroInterno}?`) &&
                              acao.mutate({ id: o.id, tipo: 'cancelar' })
                            }
                          >
                            <IconBan size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Modal
        opened={editando !== undefined}
        onClose={() => setEditando(undefined)}
        title={<Text fw={600}>{editando ? 'Editar OP' : 'Nova OP'}</Text>}
        size="lg"
      >
        {editando !== undefined && (
          <FormularioOrdem ordem={editando} aoFechar={() => setEditando(undefined)} />
        )}
      </Modal>
    </Stack>
  );
}
