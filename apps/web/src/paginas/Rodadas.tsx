import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconLock, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULO_SITUACAO_RODADA, usaMolde, type SituacaoRodada, type TipoMaquina } from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista, type Registro } from '../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarErro, notificarSucesso } from '../componentes/utilitarios';
import type { Ordem } from './Ordens';

export interface Rodada {
  id: string;
  numero: number;
  situacao: SituacaoRodada;
  observacao: string | null;
  maquinaId: string;
  moldeId: string | null;
  maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
  molde: { id: string; codigo: string; descricao: string; numeroCavidades: number } | null;
  ops: {
    id: string;
    ordemId: string;
    cavidades: number[];
    ordem: {
      numeroErp: string | null;
      numeroInterno: number;
      quantidade: number;
      produto: { codigo: string; descricao: string; unidade: string };
    };
    fichaTecnica: { versao: number; phPadrao: number; cavidades: number };
  }[];
}

const COR: Record<SituacaoRodada, string> = { PLANEJADA: 'blue', EM_ANDAMENTO: 'green', ENCERRADA: 'gray' };

type ItemOp = { ordemId: string | null; cavidades: number[] };

function FormularioRodada({ rodada, aoFechar }: { rodada: Rodada | null; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { data: maquinas = [] } = useLista('maquinas', true);
  const { data: moldes = [] } = useLista('moldes', true);
  const { data: ordens = [] } = useQuery({
    queryKey: ['ordens', 'disponiveis'],
    queryFn: () => api.get<Ordem[]>('/ordens?situacao=ABERTA,EM_PRODUCAO'),
  });
  const [maquinaId, setMaquinaId] = useState<string | null>(rodada?.maquinaId ?? null);
  const [moldeId, setMoldeId] = useState<string | null>(rodada?.moldeId ?? null);
  const [itens, setItens] = useState<ItemOp[]>(
    rodada
      ? rodada.ops.map((o) => ({ ordemId: o.ordemId, cavidades: o.cavidades }))
      : [{ ordemId: null, cavidades: [] }],
  );
  const [observacao, setObservacao] = useState(rodada?.observacao ?? '');
  const maquina = maquinas.find((m) => m.id === maquinaId);
  const comMolde = maquina ? usaMolde(maquina.tipo as TipoMaquina) : true;
  const molde = moldes.find((m) => m.id === moldeId) as
    (Registro & { cavidades: { numero: number; produto: { codigo: string } | null }[] }) | undefined;
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        maquinaId,
        moldeId: comMolde ? moldeId : null,
        ops: itens.map((i) => ({ ordemId: i.ordemId, cavidades: comMolde ? i.cavidades : [] })),
        observacao: observacao || null,
      };
      return rodada ? api.put(`/rodadas/${rodada.id}`, corpo) : api.post('/rodadas', corpo);
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['rodadas'] });
      notificarSucesso(rodada ? 'Rodada alterada.' : 'Rodada criada.');
      aoFechar();
    },
  });
  const ordensFiltradas = ordens.filter((o) => (comMolde ? o.tipo === 'PRODUCAO' : o.tipo === 'EXTRUSAO'));
  const usadaPorOutra = (c: number, idx: number) =>
    itens.some((i, j) => j !== idx && i.cavidades.includes(c));

  return (
    <Stack>
      <Group grow>
        <Select
          label="Máquina"
          withAsterisk
          data={maquinas.map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descricao}` }))}
          value={maquinaId}
          onChange={setMaquinaId}
          searchable
        />
        {comMolde && (
          <Select
            label="Molde"
            withAsterisk
            data={moldes.map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descricao}` }))}
            value={moldeId}
            onChange={setMoldeId}
            searchable
          />
        )}
      </Group>
      {!comMolde && (
        <Text size="sm" c="dimmed">
          Na extrusão a rodada tem uma única OP e não tem molde.
        </Text>
      )}
      {itens.map((item, idx) => {
        const ordem = ordens.find((o) => o.id === item.ordemId);
        return (
          <Card key={idx} withBorder padding="sm">
            <Group align="flex-end" wrap="nowrap">
              <Select
                label={`OP ${idx + 1}`}
                style={{ flex: 1 }}
                searchable
                data={ordensFiltradas.map((o) => ({
                  value: o.id,
                  label: `${o.numeroErp ?? `nº ${o.numeroInterno}`} — ${o.produto.codigo} (${fmtNumero(o.saldo)} a produzir)`,
                }))}
                value={item.ordemId}
                onChange={(v) => setItens(itens.map((x, j) => (j === idx ? { ...x, ordemId: v } : x)))}
              />
              {itens.length > 1 && (
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="lg"
                  aria-label="Remover OP"
                  onClick={() => setItens(itens.filter((_, j) => j !== idx))}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              )}
            </Group>
            {comMolde && molde && (
              <Stack gap={4} mt="xs">
                <Text size="sm" fw={500}>
                  Cavidades {ordem ? `de ${ordem.produto.codigo}` : ''}
                </Text>
                <Chip.Group
                  multiple
                  value={item.cavidades.map(String)}
                  onChange={(v) =>
                    setItens(
                      itens.map((x, j) =>
                        j === idx ? { ...x, cavidades: v.map(Number).sort((a, b) => a - b) } : x,
                      ),
                    )
                  }
                >
                  <Group gap={6}>
                    {molde.cavidades.map((c) => (
                      <Chip
                        key={c.numero}
                        value={String(c.numero)}
                        disabled={usadaPorOutra(c.numero, idx)}
                        size="md"
                      >
                        {c.numero}
                        {c.produto ? ` · ${c.produto.codigo}` : ''}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </Stack>
            )}
          </Card>
        );
      })}
      {comMolde && (
        <Button
          variant="light"
          size="xs"
          w="fit-content"
          leftSection={<IconPlus size={14} />}
          onClick={() => setItens([...itens, { ordemId: null, cavidades: [] }])}
        >
          Vincular outra OP
        </Button>
      )}
      <Textarea
        label="Observação"
        autosize
        minRows={2}
        value={observacao}
        onChange={(e) => setObservacao(e.currentTarget.value)}
      />
      <AlertaErroApi erro={salvar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button onClick={() => salvar.mutate()} loading={salvar.isPending}>
          Salvar
        </Button>
      </Group>
    </Stack>
  );
}

export function PaginaRodadas() {
  const { pode } = useAutenticacao();
  const podeEscrever = pode('rodadas.escrever');
  const cliente = useQueryClient();
  const [situacao, setSituacao] = useState<string | null>('PLANEJADA,EM_ANDAMENTO');
  const [editando, setEditando] = useState<Rodada | null | undefined>(undefined);
  const { data = [], error } = useQuery({
    queryKey: ['rodadas', situacao],
    queryFn: () => api.get<Rodada[]>(`/rodadas${situacao ? `?situacao=${situacao}` : ''}`),
  });
  const encerrar = useMutation({
    mutationFn: (id: string) => api.post(`/rodadas/${id}/encerrar`),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['rodadas'] });
      notificarSucesso('Rodada encerrada.');
    },
    onError: (e) => notificarErro(e),
  });
  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Rodadas</Title>
          <Text c="dimmed" size="sm">
            Máquina + molde + OPs que rodam juntas. Tempo de máquina, paradas e bloqueios de cavidade
            pertencem à rodada; produção, perdas e consumo são por OP.
          </Text>
        </div>
        {podeEscrever && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando(null)}>
            Nova rodada
          </Button>
        )}
      </Group>
      <Select
        value={situacao}
        onChange={setSituacao}
        clearable
        placeholder="Todas"
        w={260}
        data={[
          { value: 'PLANEJADA,EM_ANDAMENTO', label: 'Planejadas e em andamento' },
          ...Object.entries(ROTULO_SITUACAO_RODADA).map(([value, label]) => ({ value, label })),
        ]}
      />
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped verticalSpacing="sm" miw={800}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rodada</Table.Th>
              <Table.Th>Máquina</Table.Th>
              <Table.Th>Molde</Table.Th>
              <Table.Th>OPs (cavidades · ficha)</Table.Th>
              <Table.Th>Situação</Table.Th>
              <Table.Th w={1} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed">Nenhuma rodada.</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {data.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td fw={700}>{r.numero}</Table.Td>
                <Table.Td>{r.maquina.codigo}</Table.Td>
                <Table.Td>{r.molde?.codigo ?? '—'}</Table.Td>
                <Table.Td>
                  <Stack gap={2}>
                    {r.ops.map((o) => (
                      <Text size="sm" key={o.id}>
                        <b>{o.ordem.numeroErp ?? `nº ${o.ordem.numeroInterno}`}</b> {o.ordem.produto.codigo}
                        {o.cavidades.length ? ` · cav. ${o.cavidades.join(', ')}` : ''} · ficha v
                        {o.fichaTecnica.versao} ({fmtNumero(o.fichaTecnica.phPadrao)}/h)
                      </Text>
                    ))}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge color={COR[r.situacao]}>{ROTULO_SITUACAO_RODADA[r.situacao]}</Badge>
                </Table.Td>
                <Table.Td>
                  {podeEscrever && r.situacao !== 'ENCERRADA' && (
                    <Group gap={4} wrap="nowrap">
                      {r.situacao === 'PLANEJADA' && (
                        <Tooltip label="Editar">
                          <ActionIcon
                            variant="subtle"
                            size="lg"
                            aria-label="Editar rodada"
                            onClick={() => setEditando(r)}
                          >
                            <IconPencil size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Encerrar rodada">
                        <ActionIcon
                          variant="subtle"
                          size="lg"
                          aria-label="Encerrar rodada"
                          onClick={() => confirm(`Encerrar a rodada ${r.numero}?`) && encerrar.mutate(r.id)}
                        >
                          <IconLock size={18} />
                        </ActionIcon>
                      </Tooltip>
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
        title={<Text fw={600}>{editando ? `Editar rodada ${editando.numero}` : 'Nova rodada'}</Text>}
        size="xl"
      >
        {editando !== undefined && (
          <FormularioRodada rodada={editando} aoFechar={() => setEditando(undefined)} />
        )}
      </Modal>
    </Stack>
  );
}
