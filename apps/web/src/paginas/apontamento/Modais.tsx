import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDataHora, ROTULO_UNIDADE, type TipoMaquina, type Unidade } from '@apontamento/shared';
import { api, ErroApi } from '../../api/cliente';
import * as acoes from '../../offline/acoes';
import { semConexao } from '../../offline/pacote';
import { useLista } from '../../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../../componentes/utilitarios';
import { CampoHora } from './CampoHora';
import { deCampoHora, paraCampoHora, type MaquinaNoTurno, type OpDaRodada, type TurnoDetalhe } from './tipos';

interface MaquinaDisponivel {
  maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
  rodadas: {
    id: string;
    numero: number;
    molde: { codigo: string } | null;
    ops: { ordem: { numeroErp: string | null; numeroInterno: number; produto: { codigo: string } } }[];
  }[];
  noTurno: boolean;
  emOutroTurno: { apontador: string } | null;
  sugestaoInicio: string | null;
  sugestaoParadaMotivoId: string | null;
  rodadaAnteriorId: string | null;
}

/** Ligar máquina: seleção em lista, sem teclado (RN-04). */
export function LigarMaquina({
  turno,
  aoLigar,
  aoCancelar,
}: {
  turno: TurnoDetalhe;
  aoLigar: (maquinaId: string) => void;
  aoCancelar: () => void;
}) {
  const cliente = useQueryClient();
  const { data: motivos = [] } = useLista('motivos-parada');
  const [idEvento] = useState(() => crypto.randomUUID());
  const disp = useQuery({
    queryKey: ['turno', turno.id, 'disponiveis'],
    queryFn: async (): Promise<MaquinaDisponivel[]> => {
      try {
        return await api.get<MaquinaDisponivel[]>(`/turnos/${turno.id}/maquinas-disponiveis`);
      } catch (e) {
        // Sem servidor (ou turno ainda só no tablet): monta com o pacote.
        if (semConexao(e) || (e instanceof ErroApi && e.status === 404))
          return acoes.maquinasDisponiveisLocal(turno);
        throw e;
      }
    },
  });
  const [escolhida, setEscolhida] = useState<MaquinaDisponivel | null>(null);
  const [horaEditadaRef] = useState({ editada: false });
  const [rodadaId, setRodadaId] = useState<string | null>(null);
  const [hora, setHora] = useState(paraCampoHora());
  /** Hora exata a enviar enquanto o apontador não editar o campo (agora ou a sugestão do turno anterior). */
  const [horaExata, setHoraExata] = useState<string | null>(null);
  const [iniciarParada, setIniciarParada] = useState(false);

  const escolher = (m: MaquinaDisponivel) => {
    setEscolhida(m);
    setRodadaId(m.rodadaAnteriorId ?? m.rodadas[0]?.id ?? null);
    setHora(paraCampoHora(m.sugestaoInicio ?? new Date()));
    setHoraExata(m.sugestaoInicio);
    setIniciarParada(!!m.sugestaoParadaMotivoId);
  };
  const ligar = useMutation({
    mutationFn: () =>
      acoes.ligarMaquina(turno.id, {
        eventoId: idEvento,
        maquinaId: escolhida!.maquina.id,
        rodadaId: rodadaId!,
        horaOcorrencia: horaExata ?? (horaEditadaRef.editada ? deCampoHora(hora) : new Date().toISOString()),
        iniciarParadaMotivoId: iniciarParada ? escolhida!.sugestaoParadaMotivoId : null,
      }),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['turno', turno.id] });
      if (r.enviado) notificarSucesso(`Máquina ${escolhida!.maquina.codigo} ligada.`);
      aoLigar(escolhida!.maquina.id);
    },
  });

  if (!escolhida) {
    return (
      <Stack>
        <AlertaErroApi erro={disp.error} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {disp.data?.map((m) => {
            const motivo = m.noTurno
              ? 'Já está no turno'
              : m.emOutroTurno
                ? `No turno de ${m.emOutroTurno.apontador}`
                : m.rodadas.length === 0
                  ? 'Sem rodada planejada'
                  : null;
            return (
              <Button
                key={m.maquina.id}
                size="xl"
                h="auto"
                py="md"
                variant="default"
                disabled={!!motivo}
                onClick={() => escolher(m)}
                styles={{ label: { whiteSpace: 'normal' } }}
              >
                <Stack gap={2} align="center">
                  <Text fw={700} size="lg">
                    {m.maquina.codigo}
                  </Text>
                  <Text size="sm">
                    {motivo ?? m.rodadas[0].ops.map((o) => o.ordem.produto.codigo).join(', ')}
                  </Text>
                  {m.sugestaoInicio && !motivo && <Badge color="green">Seguia rodando</Badge>}
                </Stack>
              </Button>
            );
          })}
        </SimpleGrid>
        <Button size="lg" variant="default" onClick={aoCancelar}>
          Cancelar
        </Button>
      </Stack>
    );
  }
  const motivoParada = motivos.find((m) => m.id === escolhida.sugestaoParadaMotivoId);
  return (
    <Stack>
      <Text size="xl" fw={700}>
        {escolhida.maquina.codigo} — {escolhida.maquina.descricao}
      </Text>
      {escolhida.rodadas.length > 1 && (
        <Select
          label="Rodada"
          size="lg"
          data={escolhida.rodadas.map((r) => ({
            value: r.id,
            label: `Rodada ${r.numero}${r.molde ? ` · ${r.molde.codigo}` : ''} · ${r.ops.map((o) => o.ordem.produto.codigo).join(', ')}`,
          }))}
          value={rodadaId}
          onChange={setRodadaId}
        />
      )}
      {escolhida.sugestaoInicio && (
        <Alert color="green">
          A máquina vinha rodando do turno anterior: hora de início sugerida{' '}
          {formatarDataHora(escolhida.sugestaoInicio)}.
        </Alert>
      )}
      <CampoHora
        valor={hora}
        aoMudar={(v, editada) => {
          setHora(v);
          setHoraExata(null);
          horaEditadaRef.editada = editada;
        }}
      />
      {motivoParada && (
        <Checkbox
          size="md"
          label={`Iniciar já parada: ${motivoParada.codigo} — ${motivoParada.descricao} (parada aberta no turno anterior)`}
          checked={iniciarParada}
          onChange={(e) => setIniciarParada(e.currentTarget.checked)}
        />
      )}
      <AlertaErroApi erro={ligar.error} />
      <Group grow>
        <Button size="xl" variant="default" onClick={() => setEscolhida(null)}>
          Voltar
        </Button>
        <Button
          size="xl"
          color="green"
          onClick={() => ligar.mutate()}
          loading={ligar.isPending}
          disabled={!rodadaId}
        >
          Ligar máquina
        </Button>
      </Group>
    </Stack>
  );
}

interface Proposta {
  /** Código calculado no tablet sem servidor: o definitivo vem na sincronização. */
  provisoria?: boolean;
  codigo: string;
  sequencial: number;
  horasSugeridas: number;
  horasDisponiveis: number;
  paradaProgramadaPrevistaMin: number;
  phReferencia: number;
  produzidoOp: number;
  saldoOp: number;
  meta: number;
  saldoSoltoPendente: number;
  ordem: {
    numeroErp: string | null;
    numeroInterno: number;
    quantidade: number;
    unidade: Unidade;
    produto: { codigo: string; descricao: string };
  };
}

function CartaoDivisao({
  turno,
  maquina,
  op,
}: {
  turno: TurnoDetalhe;
  maquina: MaquinaNoTurno;
  op: OpDaRodada;
}) {
  const cliente = useQueryClient();
  const [horas, setHoras] = useState<number | null>(null);
  const [saldoRecebido, setSaldoRecebido] = useState<number | string | null>(null);
  const proposta = useQuery({
    queryKey: ['turno', turno.id, 'proposta', op.id, horas],
    queryFn: async (): Promise<Proposta> => {
      try {
        return await api.get<Proposta>(
          `/turnos/${turno.id}/divisoes/proposta?rodadaOpId=${op.id}&maquinaId=${maquina.maquinaId}${horas !== null ? `&horas=${horas}` : ''}`,
        );
      } catch (e) {
        if (semConexao(e) || (e instanceof ErroApi && (e.status === 404 || e.status === 422))) {
          return acoes.propostaLocal(turno, maquina, op, horas);
        }
        throw e;
      }
    },
    placeholderData: (anterior) => anterior,
  });
  const p = proposta.data;
  const criar = useMutation({
    mutationFn: () =>
      acoes.criarDivisao(
        turno.id,
        {
          rodadaOpId: op.id,
          maquinaId: maquina.maquinaId,
          horasDisponiveis: horas ?? p?.horasDisponiveis,
          saldoRecebido: p && p.saldoSoltoPendente > 0 ? Number(saldoRecebido ?? p.saldoSoltoPendente) : null,
        },
        { codigo: p!.codigo, meta: p!.meta },
      ),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['turno', turno.id] });
      if (r.enviado) notificarSucesso(`Divisão ${r.corpo.codigo} criada.`);
    },
  });
  if (!p) return <Card withBorder>Carregando proposta…</Card>;
  const un = ROTULO_UNIDADE[p.ordem.unidade];
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="xl" fw={700}>
            {p.codigo}
            {p.provisoria && (
              <Badge ml="xs" color="yellow" variant="light">
                provisório
              </Badge>
            )}
          </Text>
          <Badge size="lg">{p.ordem.produto.codigo}</Badge>
        </Group>
        <Text size="sm" c="dimmed">
          OP {p.ordem.numeroErp ?? '—'} (nº {p.ordem.numeroInterno}) · {p.ordem.produto.descricao} · saldo a
          produzir {fmtNumero(p.saldoOp)} de {fmtNumero(p.ordem.quantidade)} {un}
        </Text>
        <Group align="flex-end">
          <NumberInput
            label="Horas disponíveis"
            description={`Turno − ${p.paradaProgramadaPrevistaMin} min de parada programada prevista`}
            size="lg"
            w={240}
            decimalSeparator=","
            value={horas ?? p.horasDisponiveis}
            onChange={(v) => setHoras(Number(v) || 0)}
            min={0}
            max={24}
            step={0.5}
          />
          <Stack gap={0}>
            <Text size="sm" c="dimmed">
              Meta (horas × PH {fmtNumero(p.phReferencia)})
            </Text>
            <Text size="xl" fw={700}>
              {fmtNumero(p.meta)} {un}
            </Text>
          </Stack>
        </Group>
        {p.saldoSoltoPendente > 0 && (
          <Alert color="blue" title="Saldo solto do turno anterior">
            <NumberInput
              label={`O turno anterior deixou ${fmtNumero(p.saldoSoltoPendente)} peça(s). Confirme o saldo recebido:`}
              size="lg"
              w={260}
              allowDecimal={false}
              value={saldoRecebido ?? p.saldoSoltoPendente}
              onChange={(v) => setSaldoRecebido(v)}
            />
          </Alert>
        )}
        <AlertaErroApi erro={criar.error} />
        <Button size="lg" onClick={() => criar.mutate()} loading={criar.isPending}>
          Criar divisão {p.codigo}
        </Button>
      </Stack>
    </Card>
  );
}

/** Divisões da OP no turno, uma por OP da rodada (RN-04). */
export function Divisoes({
  turno,
  maquina,
  aoFechar,
}: {
  turno: TurnoDetalhe;
  maquina: MaquinaNoTurno;
  aoFechar: () => void;
}) {
  const pendentes = maquina.rodada.ops.filter((o) => !maquina.divisoes.some((d) => d.rodadaOpId === o.id));
  return (
    <Stack>
      {pendentes.length === 0 && (
        <Alert color="green">Todas as OPs da rodada já têm divisão neste turno.</Alert>
      )}
      {pendentes.map((op) => (
        <CartaoDivisao key={op.id} turno={turno} maquina={maquina} op={op} />
      ))}
      <Button size="lg" variant="default" onClick={aoFechar}>
        {pendentes.length ? 'Depois' : 'Fechar'}
      </Button>
    </Stack>
  );
}

/** Fechamento do turno: decisão por máquina e saldo solto por OP (RN-06, RN-13). */
export function Fechamento({
  turno,
  aoFechar,
  aoConcluir,
}: {
  turno: TurnoDetalhe;
  aoFechar: () => void;
  aoConcluir: (enviado: boolean) => void;
}) {
  const cliente = useQueryClient();
  const ligadas = turno.maquinas.filter((m) => m.estado.situacao !== 'DESLIGADA');
  const [decisoes, setDecisoes] = useState<Record<string, string>>({});
  const [saldos, setSaldos] = useState<Record<string, number | string>>({});
  const fechar = useMutation({
    mutationFn: () =>
      acoes.fecharTurno(turno.id, {
        maquinas: Object.entries(decisoes).map(([maquinaId, acao]) => ({ maquinaId, acao })),
        saldos: Object.entries(saldos)
          .map(([divisaoId, q]) => ({ divisaoId, quantidade: Number(q) || 0 }))
          .filter((s) => s.quantidade > 0),
      }),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['turno'] });
      if (r.enviado) notificarSucesso('Turno fechado.');
      aoConcluir(r.enviado);
    },
  });
  const faltam = ligadas.filter((m) => !decisoes[m.maquinaId]);
  return (
    <Stack>
      {ligadas.length === 0 && <Text c="dimmed">Nenhuma máquina ligada.</Text>}
      {ligadas.map((m) => (
        <Card withBorder key={m.id}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="lg" fw={700}>
                {m.maquina.codigo}
              </Text>
              {m.estado.situacao === 'PARADA' && (
                <Badge color="red">Parada: {m.estado.motivoParada?.descricao}</Badge>
              )}
            </Group>
            <SegmentedControl
              size="lg"
              fullWidth
              value={decisoes[m.maquinaId] ?? ''}
              onChange={(v) => setDecisoes({ ...decisoes, [m.maquinaId]: v })}
              data={[
                { value: 'DESLIGAR', label: 'Desligar' },
                { value: 'SEGUE_RODANDO', label: 'Segue rodando' },
              ]}
            />
          </Stack>
        </Card>
      ))}
      {turno.maquinas.flatMap((m) =>
        m.divisoes
          .filter((d) => m.rodada.ops.find((o) => o.id === d.rodadaOpId)?.ordem.unidade === 'PECA')
          .map((d) => (
            <NumberInput
              key={d.id}
              size="lg"
              label={`Saldo solto (peças que não completaram conjunto) — ${d.codigo}`}
              allowDecimal={false}
              min={0}
              value={saldos[d.id] ?? 0}
              onChange={(v) => setSaldos({ ...saldos, [d.id]: v })}
            />
          )),
      )}
      {turno.pendencias.length > 0 && (
        <Alert color="yellow">Há {turno.pendencias.length} pendência(s) que irão para o líder.</Alert>
      )}
      <AlertaErroApi erro={fechar.error} />
      <Group grow>
        <Button size="xl" variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button
          size="xl"
          color="red"
          disabled={faltam.length > 0}
          onClick={() => fechar.mutate()}
          loading={fechar.isPending}
        >
          Fechar turno
        </Button>
      </Group>
    </Stack>
  );
}
