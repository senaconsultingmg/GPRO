import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput, MonthPickerInput } from '@mantine/dates';
import { IconCalendarPlus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { diaDaSemana, formatarDataCivil, ROTULO_DIA_SEMANA, somarDias } from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista, type Registro } from '../componentes/PaginaCadastro';
import { AlertaErroApi, notificarErro, notificarSucesso } from '../componentes/utilitarios';

interface LinhaEscala {
  id: string;
  data: string;
  horarioTurno: { id: string; nome: string; horaInicio: string; horaFim: string };
  equipe: { id: string; letra: string };
}

type Atribuicao = { horarioTurnoId: string | null; equipeId: string | null };

const CORES_EQUIPE = ['blue', 'teal', 'grape', 'orange', 'pink', 'cyan', 'lime', 'indigo'];

function ModalGerar({ aoFechar }: { aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { data: horarios = [] } = useLista('horarios-turno', true);
  const { data: equipes = [] } = useLista('equipes', true);
  const [modalidade, setModalidade] = useState<'REVEZAMENTO' | 'CENTRAL'>('REVEZAMENTO');
  const hoje = dayjs().format('YYYY-MM-DD');
  const [periodo, setPeriodo] = useState<[string | null, string | null]>([
    hoje,
    dayjs().add(3, 'month').format('YYYY-MM-DD'),
  ]);
  const [ciclo, setCiclo] = useState<Atribuicao[][]>([[{ horarioTurnoId: null, equipeId: null }]]);
  const [central, setCentral] = useState<Atribuicao>({ horarioTurnoId: null, equipeId: null });
  const [substituir, setSubstituir] = useState(true);

  const revezamento = horarios.filter((h) => h.modalidade === 'REVEZAMENTO');
  const centrais = horarios.filter((h) => h.modalidade === 'CENTRAL');
  const opcoesEquipe = equipes.map((e) => ({ value: e.id, label: e.letra as string }));

  const aplicarPadrao12x36 = () => {
    const [dia, noite] = [...revezamento].sort((a, b) =>
      String(a.horaInicio).localeCompare(String(b.horaInicio)),
    );
    const eq = (l: string) => equipes.find((e) => e.letra === l)?.id ?? null;
    if (!dia || !noite)
      return notificarErro('Cadastre dois horários de revezamento (ex.: Dia 07–19 e Noite 19–07).');
    setCiclo([
      [
        { horarioTurnoId: dia.id, equipeId: eq('A') },
        { horarioTurnoId: noite.id, equipeId: eq('B') },
      ],
      [
        { horarioTurnoId: dia.id, equipeId: eq('C') },
        { horarioTurnoId: noite.id, equipeId: eq('D') },
      ],
    ]);
  };

  const gerar = useMutation({
    mutationFn: () =>
      api.post<{ geradas: number; substituidas: number; ignoradas: number }>(
        '/escalas/gerar',
        modalidade === 'REVEZAMENTO'
          ? { modalidade, dataInicial: periodo[0], dataFinal: periodo[1], ciclo, substituir }
          : { modalidade, dataInicial: periodo[0], dataFinal: periodo[1], ...central, substituir },
      ),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['escalas'] });
      notificarSucesso(
        `Escala gerada: ${r.geradas} turnos${r.substituidas ? `, ${r.substituidas} substituídos` : ''}${r.ignoradas ? `, ${r.ignoradas} já existentes mantidos` : ''}.`,
      );
      aoFechar();
    },
  });

  const mudar = (d: number, i: number, campo: keyof Atribuicao, v: string | null) =>
    setCiclo(
      ciclo.map((dia, j) => (j === d ? dia.map((a, k) => (k === i ? { ...a, [campo]: v } : a)) : dia)),
    );

  return (
    <Stack>
      <SegmentedControl
        value={modalidade}
        onChange={(v) => setModalidade(v as typeof modalidade)}
        data={[
          { value: 'REVEZAMENTO', label: 'Revezamento (12x36)' },
          { value: 'CENTRAL', label: 'Horário central' },
        ]}
      />
      <DatePickerInput
        type="range"
        label="Período"
        valueFormat="DD/MM/YYYY"
        value={periodo}
        onChange={(v) => setPeriodo(v as [string | null, string | null])}
        withAsterisk
      />

      {modalidade === 'REVEZAMENTO' ? (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Ciclo (repetido a partir da data inicial)
            </Text>
            <Button size="xs" variant="light" onClick={aplicarPadrao12x36}>
              Padrão 12x36: A/B, C/D
            </Button>
          </Group>
          {ciclo.map((dia, d) => (
            <Paper key={d} withBorder p="xs">
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>
                  Dia {d + 1} do ciclo
                </Text>
                {ciclo.length > 1 && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Remover dia"
                    onClick={() => setCiclo(ciclo.filter((_, j) => j !== d))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              {dia.map((a, i) => (
                <Group key={i} gap="xs" mb={4} wrap="nowrap">
                  <Select
                    placeholder="Horário"
                    data={revezamento.map((h) => ({
                      value: h.id,
                      label: `${h.nome} (${h.horaInicio}–${h.horaFim})`,
                    }))}
                    value={a.horarioTurnoId}
                    onChange={(v) => mudar(d, i, 'horarioTurnoId', v)}
                    style={{ flex: 2 }}
                  />
                  <Select
                    placeholder="Equipe"
                    data={opcoesEquipe}
                    value={a.equipeId}
                    onChange={(v) => mudar(d, i, 'equipeId', v)}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Remover turno"
                    disabled={dia.length === 1}
                    onClick={() => setCiclo(ciclo.map((x, j) => (j === d ? x.filter((_, k) => k !== i) : x)))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={() =>
                  setCiclo(
                    ciclo.map((x, j) => (j === d ? [...x, { horarioTurnoId: null, equipeId: null }] : x)),
                  )
                }
              >
                Turno
              </Button>
            </Paper>
          ))}
          <Button
            size="xs"
            variant="subtle"
            w="fit-content"
            leftSection={<IconPlus size={14} />}
            onClick={() => setCiclo([...ciclo, [{ horarioTurnoId: null, equipeId: null }]])}
          >
            Adicionar dia ao ciclo
          </Button>
        </Stack>
      ) : (
        <Group grow>
          <Select
            label="Horário central"
            withAsterisk
            data={centrais.map((h) => ({ value: h.id, label: `${h.nome} (${h.horaInicio}–${h.horaFim})` }))}
            value={central.horarioTurnoId}
            onChange={(v) => setCentral({ ...central, horarioTurnoId: v })}
          />
          <Select
            label="Equipe"
            withAsterisk
            data={opcoesEquipe}
            value={central.equipeId}
            onChange={(v) => setCentral({ ...central, equipeId: v })}
          />
        </Group>
      )}
      <Checkbox
        label="Substituir a escala existente no período para estes horários"
        checked={substituir}
        onChange={(e) => setSubstituir(e.currentTarget.checked)}
      />
      <AlertaErroApi erro={gerar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button
          onClick={() => gerar.mutate()}
          loading={gerar.isPending}
          disabled={!periodo[0] || !periodo[1]}
        >
          Gerar escala
        </Button>
      </Group>
    </Stack>
  );
}

export function PaginaEscala() {
  const { pode } = useAutenticacao();
  const podeEscrever = pode('escala.escrever');
  const cliente = useQueryClient();
  const [mes, setMes] = useState<string>(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [gerando, setGerando] = useState(false);
  const de = dayjs(mes).startOf('month').format('YYYY-MM-DD');
  const ate = dayjs(mes).endOf('month').format('YYYY-MM-DD');
  const { data: linhas = [], error } = useQuery({
    queryKey: ['escalas', de, ate],
    queryFn: () => api.get<LinhaEscala[]>(`/escalas?de=${de}&ate=${ate}`),
  });
  const { data: equipes = [] } = useLista('equipes', true);
  const corEquipe = useMemo(
    () => new Map(equipes.map((e: Registro, i) => [e.id, CORES_EQUIPE[i % CORES_EQUIPE.length]])),
    [equipes],
  );

  const horarios = useMemo(() => {
    const m = new Map<string, LinhaEscala['horarioTurno']>();
    for (const l of linhas) m.set(l.horarioTurno.id, l.horarioTurno);
    return [...m.values()].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [linhas]);
  const dias = useMemo(() => {
    const r: string[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) r.push(d);
    return r;
  }, [de, ate]);
  const indice = useMemo(() => new Map(linhas.map((l) => [`${l.data}|${l.horarioTurno.id}`, l])), [linhas]);

  const trocar = useMutation({
    mutationFn: ({ id, equipeId }: { id: string; equipeId: string }) =>
      api.put(`/escalas/${id}`, { equipeId }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['escalas'] }),
    onError: (e) => notificarErro(e),
  });

  const hoje = dayjs().format('YYYY-MM-DD');
  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Escala de turnos</Title>
          <Text c="dimmed" size="sm">
            O turno da noite pertence à data em que começa.
            {podeEscrever ? ' Clique na equipe para trocá-la em um dia.' : ''}
          </Text>
        </div>
        {podeEscrever && (
          <Button leftSection={<IconCalendarPlus size={18} />} onClick={() => setGerando(true)}>
            Gerar escala
          </Button>
        )}
      </Group>
      <MonthPickerInput
        label="Mês"
        value={mes}
        onChange={(v) => v && setMes(v)}
        valueFormat="MMMM [de] YYYY"
        w={240}
      />
      <AlertaErroApi erro={error} />
      {linhas.length === 0 ? (
        <Text c="dimmed">Nenhum turno na escala deste mês.</Text>
      ) : (
        <ScrollArea>
          <Table withTableBorder withColumnBorders striped miw={400}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                {horarios.map((h) => (
                  <Table.Th key={h.id}>
                    {h.nome}
                    <Text size="xs" c="dimmed">
                      {h.horaInicio}–{h.horaFim}
                    </Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dias.map((d) => (
                <Table.Tr
                  key={d}
                  style={d === hoje ? { outline: '2px solid var(--mantine-color-blue-5)' } : undefined}
                >
                  <Table.Td>
                    <Text size="sm" fw={d === hoje ? 700 : 400}>
                      {formatarDataCivil(d)}{' '}
                      <Text span c="dimmed" size="xs">
                        {ROTULO_DIA_SEMANA[diaDaSemana(d)]}
                      </Text>
                    </Text>
                  </Table.Td>
                  {horarios.map((h) => {
                    const l = indice.get(`${d}|${h.id}`);
                    if (!l) return <Table.Td key={h.id}>—</Table.Td>;
                    const badge = (
                      <Badge
                        size="lg"
                        color={corEquipe.get(l.equipe.id)}
                        style={podeEscrever ? { cursor: 'pointer' } : undefined}
                      >
                        {l.equipe.letra}
                      </Badge>
                    );
                    return (
                      <Table.Td key={h.id}>
                        {podeEscrever ? (
                          <Menu>
                            <Menu.Target>{badge}</Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Label>Trocar equipe</Menu.Label>
                              {equipes.map((e) => (
                                <Menu.Item
                                  key={e.id}
                                  onClick={() => trocar.mutate({ id: l.id, equipeId: e.id })}
                                >
                                  {e.letra as string}
                                </Menu.Item>
                              ))}
                            </Menu.Dropdown>
                          </Menu>
                        ) : (
                          badge
                        )}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Modal
        opened={gerando}
        onClose={() => setGerando(false)}
        title={<Text fw={600}>Gerar escala</Text>}
        size="lg"
      >
        {gerando && <ModalGerar aoFechar={() => setGerando(false)} />}
      </Modal>
    </Stack>
  );
}
