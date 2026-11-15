import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconBox,
  IconFileReport,
  IconLock,
  IconLockOpen,
  IconPackageImport,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconPower,
  IconRecycle,
  IconTruckReturn,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import {
  formatarDataCivil,
  formatarDataHora,
  ROTULO_MARCA_HORARIO,
  ROTULO_TIPO_EVENTO,
  ROTULO_UNIDADE,
  usaMolde,
} from '@apontamento/shared';
import { api } from '../../api/cliente';
import { useLista } from '../../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../../componentes/utilitarios';
import { FormularioLancamento, type TipoLancamento } from './Lancamento';
import { Divisoes, Fechamento, LigarMaquina } from './Modais';
import type { MaquinaNoTurno, TurnoDetalhe } from './tipos';

const COR_ESTADO = { LIGADA: 'green', PARADA: 'red', DESLIGADA: 'gray' } as const;
const ROTULO_ESTADO = { LIGADA: 'Produzindo', PARADA: 'Parada', DESLIGADA: 'Desligada' } as const;

function Cronometro({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <Text span ff="monospace" fw={700}>
      {p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}
    </Text>
  );
}

function AbrirTurno() {
  const cliente = useQueryClient();
  const { data: horarios = [] } = useLista('horarios-turno', true);
  const { data: equipes = [] } = useLista('equipes', true);
  const sugestao = useQuery({
    queryKey: ['turnos', 'sugestao'],
    queryFn: () =>
      api.get<{ data: string; horarioTurnoId: string | null; equipeId: string | null }>('/turnos/sugestao'),
  });
  const [valores, setValores] = useState<{
    data: string | null;
    horarioTurnoId: string | null;
    equipeId: string | null;
  } | null>(null);
  const v = valores ?? sugestao.data ?? null;
  const abrir = useMutation({
    mutationFn: () => api.post('/turnos', v),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['turno'] });
      notificarSucesso('Turno aberto.');
    },
  });
  if (!v) return <Loader />;
  return (
    <Center>
      <Card withBorder shadow="sm" padding="xl" w="100%" maw={560}>
        <Stack>
          <Title order={2}>Abrir turno</Title>
          <Text c="dimmed">Horário e equipe sugeridos pela escala.</Text>
          <DatePickerInput
            label="Data"
            size="lg"
            valueFormat="DD/MM/YYYY"
            value={v.data}
            onChange={(d) => setValores({ ...v, data: d as string })}
          />
          <Select
            label="Horário de turno"
            size="lg"
            data={horarios.map((h) => ({ value: h.id, label: `${h.nome} (${h.horaInicio}–${h.horaFim})` }))}
            value={v.horarioTurnoId}
            onChange={(x) => setValores({ ...v, horarioTurnoId: x })}
          />
          <Select
            label="Equipe"
            size="lg"
            data={equipes.map((e) => ({ value: e.id, label: e.letra as string }))}
            value={v.equipeId}
            onChange={(x) => setValores({ ...v, equipeId: x })}
          />
          <AlertaErroApi erro={abrir.error} />
          <Button
            size="xl"
            onClick={() => abrir.mutate()}
            loading={abrir.isPending}
            disabled={!v.data || !v.horarioTurnoId || !v.equipeId}
          >
            Abrir turno
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}

const ACOES: {
  tipo: TipoLancamento;
  rotulo: string;
  icone: React.ReactNode;
  cor?: string;
  quando?: (m: MaquinaNoTurno) => boolean;
}[] = [
  {
    tipo: 'SAIDA_PRODUCAO',
    rotulo: 'Produção',
    icone: <IconBox />,
    cor: 'blue',
    quando: (m) => m.estado.situacao === 'LIGADA',
  },
  {
    tipo: 'PARADA',
    rotulo: 'Parada',
    icone: <IconPlayerPause />,
    cor: 'red',
    quando: (m) => m.estado.situacao === 'LIGADA',
  },
  {
    tipo: 'REINICIO',
    rotulo: 'Reinício',
    icone: <IconPlayerPlay />,
    cor: 'green',
    quando: (m) => m.estado.situacao === 'PARADA',
  },
  { tipo: 'PERDA', rotulo: 'Perda', icone: <IconRecycle />, cor: 'orange' },
  { tipo: 'ENTRADA_MATERIA_PRIMA', rotulo: 'Matéria-prima', icone: <IconPackageImport /> },
  {
    tipo: 'ENTRADA_SEMIACABADO',
    rotulo: 'Semiacabado',
    icone: <IconPackageImport />,
    quando: (m) => usaMolde(m.maquina.tipo),
  },
  { tipo: 'DEVOLUCAO_MATERIA_PRIMA', rotulo: 'Devolução', icone: <IconTruckReturn /> },
  { tipo: 'TRANSFERENCIA', rotulo: 'Transferência', icone: <IconArrowsExchange /> },
  {
    tipo: 'BLOQUEIO_CAVIDADE',
    rotulo: 'Bloquear cavidade',
    icone: <IconLock />,
    quando: (m) => usaMolde(m.maquina.tipo),
  },
  {
    tipo: 'DESBLOQUEIO_CAVIDADE',
    rotulo: 'Desbloquear',
    icone: <IconLockOpen />,
    quando: (m) => m.cavidadesBloqueadas.length > 0,
  },
  {
    tipo: 'FIM_MAQUINA',
    rotulo: 'Desligar',
    icone: <IconPlayerStop />,
    cor: 'gray',
    quando: (m) => m.estado.situacao !== 'DESLIGADA',
  },
  {
    tipo: 'INICIO_MAQUINA',
    rotulo: 'Religar',
    icone: <IconPower />,
    cor: 'green',
    quando: (m) => m.estado.situacao === 'DESLIGADA',
  },
];

function CartaoMaquina({
  turno,
  m,
  aoLancar,
  aoDivisoes,
}: {
  turno: TurnoDetalhe;
  m: MaquinaNoTurno;
  aoLancar: (t: TipoLancamento) => void;
  aoDivisoes: () => void;
}) {
  const cor = COR_ESTADO[m.estado.situacao];
  const semDivisao = m.rodada.ops.filter((o) => !m.divisoes.some((d) => d.rodadaOpId === o.id));
  return (
    <Card
      withBorder
      padding="md"
      style={{ borderTop: `8px solid var(--mantine-color-${cor}-6)` }}
      data-maquina={m.maquina.codigo}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Text size="xl" fw={800}>
              {m.maquina.codigo}
            </Text>
            <Text size="sm" c="dimmed">
              Rodada {m.rodada.numero}
              {m.rodada.molde ? ` · ${m.rodada.molde.codigo}` : ''}
            </Text>
          </div>
          <Badge size="xl" color={cor}>
            {ROTULO_ESTADO[m.estado.situacao]}
          </Badge>
        </Group>
        {m.estado.situacao === 'PARADA' && m.estado.desde && (
          <Alert color="red" icon={<IconPlayerPause />} p="xs">
            {m.estado.motivoParada?.codigo} — {m.estado.motivoParada?.descricao} há{' '}
            <Cronometro desde={m.estado.desde} />
          </Alert>
        )}
        {m.cavidadesBloqueadas.length > 0 && (
          <Group gap={4}>
            {m.cavidadesBloqueadas.map((b) => (
              <Badge key={b.cavidade} color="red" variant="outline">
                Cavidade {b.cavidade} bloqueada
              </Badge>
            ))}
          </Group>
        )}
        {m.divisoes.map((d) => {
          const op = m.rodada.ops.find((o) => o.id === d.rodadaOpId);
          const un = op ? ROTULO_UNIDADE[op.ordem.unidade] : '';
          return (
            <Paper key={d.id} withBorder p="xs" bg="var(--mantine-color-gray-0)">
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={700}>{d.codigo}</Text>
                  <Text size="xs" c="dimmed">
                    {op?.ordem.produto.codigo} · OP {fmtNumero(d.producaoOp)} de {fmtNumero(d.quantidadeOp)}{' '}
                    {un}
                  </Text>
                </div>
                <Stack gap={0} align="flex-end">
                  <Text size="lg" fw={700}>
                    {fmtNumero(d.etiquetado)} / {fmtNumero(d.meta)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    realizado / meta
                  </Text>
                </Stack>
              </Group>
            </Paper>
          );
        })}
        {semDivisao.length > 0 && (
          <Button size="lg" variant="light" color="yellow" leftSection={<IconPlus />} onClick={aoDivisoes}>
            Criar divisão ({semDivisao.length} OP sem divisão)
          </Button>
        )}
        {turno.situacao === 'ABERTO' && (
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
            {ACOES.filter((a) => !a.quando || a.quando(m)).map((a) => (
              <Button
                key={a.tipo}
                h={76}
                px={4}
                variant={a.cor ? 'filled' : 'light'}
                color={a.cor}
                onClick={() => aoLancar(a.tipo)}
                styles={{ label: { whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.15 } }}
              >
                <Stack gap={4} align="center">
                  {a.icone}
                  <Text size="sm" fw={600} inherit>
                    {a.rotulo}
                  </Text>
                </Stack>
              </Button>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Card>
  );
}

export function PaginaApontamento() {
  const navegar = useNavigate();
  const meu = useQuery({
    queryKey: ['turno', 'meu'],
    queryFn: () => api.get<{ id: string | null }>('/turnos/meu-aberto'),
  });
  const turnoId = meu.data?.id ?? null;
  const detalhe = useQuery({
    queryKey: ['turno', turnoId],
    queryFn: () => api.get<TurnoDetalhe>(`/turnos/${turnoId}`),
    enabled: !!turnoId,
    refetchInterval: 30_000,
  });
  const [lancando, setLancando] = useState<{ maquinaId: string; tipo: TipoLancamento } | null>(null);
  const [ligando, setLigando] = useState(false);
  const [divisoesDe, setDivisoesDe] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);

  if (meu.isLoading || (turnoId && detalhe.isLoading)) return <Loader />;
  if (!turnoId) return <AbrirTurno />;
  const turno = detalhe.data;
  if (!turno) return <AlertaErroApi erro={detalhe.error} />;
  const maquinaLancando = turno.maquinas.find((m) => m.maquinaId === lancando?.maquinaId);
  const maquinaDivisoes = turno.maquinas.find((m) => m.maquinaId === divisoesDe);

  return (
    <Stack>
      <Paper withBorder p="md">
        <Group justify="space-between">
          <div>
            <Title order={3}>
              Turno {turno.horarioTurno.nome} · {formatarDataCivil(turno.data)} · Equipe {turno.equipe.letra}
            </Title>
            <Text c="dimmed" size="sm">
              {turno.horarioTurno.horaInicio}–{turno.horarioTurno.horaFim} · aberto em{' '}
              {formatarDataHora(turno.abertoEm)} por {turno.apontador.nome}
            </Text>
          </div>
          <Group>
            <Button size="lg" color="green" leftSection={<IconPower />} onClick={() => setLigando(true)}>
              Ligar máquina
            </Button>
            <Button
              size="lg"
              variant="default"
              component={Link}
              to={`/turnos/${turno.id}/relatorio`}
              leftSection={<IconFileReport />}
            >
              Relatório
            </Button>
            <Button size="lg" color="red" variant="light" onClick={() => setFechando(true)}>
              Fechar turno
            </Button>
          </Group>
        </Group>
      </Paper>
      {turno.maquinas.length === 0 && (
        <Alert color="blue">Nenhuma máquina ligada. Toque em "Ligar máquina".</Alert>
      )}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {turno.maquinas.map((m) => (
          <CartaoMaquina
            key={m.id}
            turno={turno}
            m={m}
            aoLancar={(tipo) => setLancando({ maquinaId: m.maquinaId, tipo })}
            aoDivisoes={() => setDivisoesDe(m.maquinaId)}
          />
        ))}
      </SimpleGrid>

      <Title order={4} mt="md">
        Lançamentos do turno
      </Title>
      <ScrollArea>
        <Table striped verticalSpacing="xs" miw={800}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ocorrência</Table.Th>
              <Table.Th>Máquina</Table.Th>
              <Table.Th>Lançamento</Table.Th>
              <Table.Th>Detalhe</Table.Th>
              <Table.Th>Marcas</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {turno.eventos.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(e.horaOcorrencia)}</Table.Td>
                <Table.Td>{turno.maquinas.find((m) => m.maquinaId === e.maquinaId)?.maquina.codigo}</Table.Td>
                <Table.Td>{ROTULO_TIPO_EVENTO[e.tipo]}</Table.Td>
                <Table.Td>
                  <Text size="sm">{e.resumo}</Text>
                  {e.justificativa && (
                    <Text size="xs" c="dimmed">
                      Justificativa: {e.justificativa}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {e.marcaHorario !== 'NO_MOMENTO' && (
                      <Badge color="orange" title={`Registrado em ${formatarDataHora(e.horaRegistro)}`}>
                        {ROTULO_MARCA_HORARIO[e.marcaHorario]}
                      </Badge>
                    )}
                    {e.pesoNaoConforme && (
                      <Badge color="red" leftSection={<IconAlertTriangle size={12} />}>
                        Peso NC
                      </Badge>
                    )}
                    {Boolean(e.dados.temAvulso) && (
                      <Badge color="orange" variant="filled">
                        AVULSO
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={!!lancando}
        onClose={() => setLancando(null)}
        size="xl"
        title={
          <Text fw={700} size="lg">
            {lancando && `${ROTULO_TIPO_EVENTO[lancando.tipo]} — ${maquinaLancando?.maquina.codigo}`}
          </Text>
        }
      >
        {lancando && maquinaLancando && (
          <FormularioLancamento
            turno={turno}
            maquina={maquinaLancando}
            tipo={lancando.tipo}
            aoConcluir={() => setLancando(null)}
          />
        )}
      </Modal>
      <Modal
        opened={ligando}
        onClose={() => setLigando(false)}
        size="xl"
        title={
          <Text fw={700} size="lg">
            Ligar máquina
          </Text>
        }
      >
        {ligando && (
          <LigarMaquina
            turno={turno}
            aoCancelar={() => setLigando(false)}
            aoLigar={(id) => {
              setLigando(false);
              setDivisoesDe(id);
            }}
          />
        )}
      </Modal>
      <Modal
        opened={!!maquinaDivisoes}
        onClose={() => setDivisoesDe(null)}
        size="xl"
        title={
          <Text fw={700} size="lg">
            Divisão das OPs — {maquinaDivisoes?.maquina.codigo}
          </Text>
        }
      >
        {maquinaDivisoes && (
          <Divisoes turno={turno} maquina={maquinaDivisoes} aoFechar={() => setDivisoesDe(null)} />
        )}
      </Modal>
      <Modal
        opened={fechando}
        onClose={() => setFechando(false)}
        size="lg"
        title={
          <Text fw={700} size="lg">
            Fechar turno
          </Text>
        }
      >
        {fechando && (
          <Fechamento
            turno={turno}
            aoFechar={() => setFechando(false)}
            aoConcluir={() => navegar(`/turnos/${turno.id}/relatorio`)}
          />
        )}
      </Modal>
    </Stack>
  );
}
