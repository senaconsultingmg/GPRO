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
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
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
  ROTULO_TIPO_EVENTO,
  ROTULO_UNIDADE,
  usaMolde,
} from '@apontamento/shared';
import { api, ErroApi } from '../../api/cliente';
import * as acoes from '../../offline/acoes';
import { useSincronizacao } from '../../offline/estado';
import { itensDoUsuario, pendentesDoTurno } from '../../offline/fila';
import { atualizarPacote, consultarComCache, lerPacote, semConexao } from '../../offline/pacote';
import { projetarTurno } from '../../offline/projecao';
import { useLista } from '../../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../../componentes/utilitarios';
import { ListaLancamentos } from './ListaLancamentos';
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
    queryFn: async () => {
      try {
        return await consultarComCache('sugestao', () =>
          api.get<{ data: string; horarioTurnoId: string | null; equipeId: string | null }>(
            '/turnos/sugestao',
          ),
        );
      } catch (e) {
        // Sem servidor e sem cópia: usa a sugestão do pacote do tablet.
        const p = await lerPacote();
        if (p) return p.sugestao;
        throw e;
      }
    },
  });
  const [valores, setValores] = useState<{
    data: string | null;
    horarioTurnoId: string | null;
    equipeId: string | null;
  } | null>(null);
  const v = valores ?? sugestao.data ?? null;
  const abrir = useMutation({
    mutationFn: () => acoes.abrirTurno(v as { data: string; horarioTurnoId: string; equipeId: string }),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['turno'] });
      if (r.enviado) notificarSucesso('Turno aberto.');
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
  // Seção 11: o turno vem do servidor (ou da última cópia) mais o que está na fila do tablet.
  const { versao } = useSincronizacao();
  // Ao abrir o apontamento com conexão, atualiza o pacote do tablet (dados e números de etiqueta).
  useEffect(() => {
    void atualizarPacote();
  }, []);
  const meu = useQuery({
    queryKey: ['turno', 'meu', versao],
    queryFn: async () => {
      const itens = await itensDoUsuario();
      let r: { id: string | null } = { id: null };
      try {
        r = await consultarComCache('meu-aberto', () => api.get<{ id: string | null }>('/turnos/meu-aberto'));
      } catch {
        /* sem servidor e sem cópia */
      }
      const fechadoNoTablet = (id: string) =>
        itens.some((i) => i.tipo === 'FECHAR_TURNO' && i.turnoId === id);
      if (r.id && !fechadoNoTablet(r.id)) return r;
      const abertura = [...itens]
        .reverse()
        .find((i) => i.tipo === 'ABRIR_TURNO' && !fechadoNoTablet(i.turnoId));
      return { id: abertura?.turnoId ?? null };
    },
    placeholderData: (anterior) => anterior,
  });
  const turnoId = meu.data?.id ?? null;
  const detalhe = useQuery({
    queryKey: ['turno', turnoId, versao],
    queryFn: async () => {
      let base: TurnoDetalhe | null = null;
      try {
        base = await consultarComCache(`turno:${turnoId}`, () => api.get<TurnoDetalhe>(`/turnos/${turnoId}`));
      } catch (e) {
        // 404: turno aberto neste tablet e ainda não enviado.
        if (!semConexao(e) && !(e instanceof ErroApi && e.status === 404)) throw e;
      }
      const t = projetarTurno(base, await pendentesDoTurno(turnoId!), await lerPacote());
      if (!t) throw new ErroApi(0, 'Turno ainda não disponível neste tablet.');
      return t;
    },
    enabled: !!turnoId,
    refetchInterval: 30_000,
    placeholderData: (anterior) => anterior,
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
      <ListaLancamentos turno={turno} />

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
            aoConcluir={(enviado) =>
              enviado ? navegar(`/turnos/${turno.id}/relatorio`) : setFechando(false)
            }
          />
        )}
      </Modal>
    </Stack>
  );
}
