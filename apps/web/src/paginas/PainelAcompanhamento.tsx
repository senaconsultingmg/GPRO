import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconPlayerPause,
  IconPlayerPlay,
  IconPower,
  IconTool,
  IconWifi,
  IconWifiOff,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  formatarDataHora,
  ROTULO_TIPO_MAQUINA,
  ROTULO_UNIDADE,
  type TipoMaquina,
  type Unidade,
} from '@apontamento/shared';
import { api, lerFluxo } from '../api/cliente';
import { AlertaErroApi, fmtNumero } from '../componentes/utilitarios';

type Situacao = 'LIGADA' | 'PARADA' | 'DESLIGADA';
interface OpCartao {
  divisao: string | null;
  ordem: { numeroErp: string | null; numeroInterno: number; quantidade: number; unidade: Unidade };
  produto: { codigo: string; descricao: string };
  produzidoOp: number;
  percentual: number | null;
  meta: number | null;
  realizado: number | null;
  phReal: number | null;
  phPadrao: number | null;
}
interface Cartao {
  maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
  situacao: Situacao;
  desde: string | null;
  parada: { motivo: string; programada: boolean } | null;
  turno: { horario: string; equipe: string; apontador: string } | null;
  rodada: { numero: number; molde: string | null } | null;
  ops: OpCartao[];
  oee: { oee: number | null; alertaPerformance: boolean } | null;
  cavidadesBloqueadas: number[];
  manutencaoAberta: number;
}
interface Painel {
  geradoEm: string;
  maquinas: Cartao[];
}

const ESTILO: Record<Situacao, { cor: string; rotulo: string; icone: React.ReactNode }> = {
  LIGADA: { cor: 'green', rotulo: 'Produzindo', icone: <IconPlayerPlay size={18} /> },
  PARADA: { cor: 'red', rotulo: 'Parada', icone: <IconPlayerPause size={18} /> },
  DESLIGADA: { cor: 'gray', rotulo: 'Desligada', icone: <IconPower size={18} /> },
};

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${fmtNumero(v * 100, 1)}%`;

/** Tempo decorrido em contagem (hh:mm:ss), atualizado a cada segundo. */
function Contagem({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <Text span ff="monospace" fw={700} data-contagem>
      {p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}
    </Text>
  );
}

/**
 * Mantém o painel atualizado: escuta o fluxo de alterações (SSE) e busca o estado de novo.
 * Se o fluxo cair, consulta a cada 30 s e tenta reconectar.
 */
function useTempoReal() {
  const cliente = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    let ativo = true;
    const atualizar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => cliente.invalidateQueries({ queryKey: ['painel'] }), 300);
    };
    (async () => {
      while (ativo) {
        try {
          await lerFluxo(
            '/painel/fluxo',
            (tipo) => {
              setConectado(true);
              if (tipo === 'alteracao') atualizar();
            },
            controle.signal,
          );
        } catch {
          /* cai para a consulta periódica */
        }
        if (!ativo) return;
        setConectado(false);
        await new Promise((ok) => setTimeout(ok, 5000));
        atualizar();
      }
    })();
    return () => {
      ativo = false;
      controle.abort();
      if (espera.current) clearTimeout(espera.current);
    };
  }, [cliente]);
  return conectado;
}

function CartaoMaquina({ c, tv }: { c: Cartao; tv: boolean }) {
  const e = ESTILO[c.situacao];
  const tam = tv ? 'lg' : 'sm';
  return (
    <Card
      withBorder
      padding={tv ? 'lg' : 'md'}
      data-maquina={c.maquina.codigo}
      data-situacao={c.situacao}
      style={{
        borderWidth: 3,
        borderColor: `var(--mantine-color-${e.cor}-6)`,
        background: c.situacao === 'PARADA' ? 'var(--mantine-color-red-0)' : undefined,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Title order={tv ? 2 : 3}>{c.maquina.codigo}</Title>
            <Text size="xs" c="dimmed">
              {ROTULO_TIPO_MAQUINA[c.maquina.tipo]} · {c.maquina.descricao}
            </Text>
          </div>
          <Badge size={tv ? 'xl' : 'lg'} color={e.cor} variant="filled" leftSection={e.icone}>
            {e.rotulo}
          </Badge>
        </Group>
        {c.situacao === 'PARADA' && c.parada && (
          <Alert color="red" variant="filled" p="xs" icon={<IconPlayerPause />}>
            <Text fw={700} size={tam} c="white">
              {c.parada.motivo}
              {c.parada.programada ? ' (programada)' : ''}
            </Text>
            <Text size={tam} c="white">
              Parada há {c.desde && <Contagem desde={c.desde} />}
            </Text>
          </Alert>
        )}
        {c.situacao === 'LIGADA' && c.desde && (
          <Text size="xs" c="dimmed">
            Produzindo desde {formatarDataHora(c.desde).slice(11)}
          </Text>
        )}
        {c.turno ? (
          <Text size="xs" c="dimmed">
            Turno {c.turno.horario} · Equipe {c.turno.equipe} · {c.turno.apontador}
            {c.rodada ? ` · rodada ${c.rodada.numero}${c.rodada.molde ? ` · ${c.rodada.molde}` : ''}` : ''}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            Fora de turno aberto{c.rodada ? ` · rodada ${c.rodada.numero} em andamento` : ''}
          </Text>
        )}
        {c.ops.map((o, i) => {
          const un = ROTULO_UNIDADE[o.ordem.unidade];
          return (
            <Box key={i} p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6 }}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text fw={700} size={tam} style={{ whiteSpace: 'nowrap' }}>
                  {o.produto.codigo}
                </Text>
                <Text size="xs" c="dimmed" ta="right">
                  OP ERP {o.ordem.numeroErp ?? '—'} · nº {o.ordem.numeroInterno}
                  {o.divisao ? ` · ${o.divisao}` : ''}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {o.produto.descricao}
              </Text>
              <Group justify="space-between" mt={4} gap="xs">
                <Text size="xs">
                  OP: {fmtNumero(o.produzidoOp, 0)} / {fmtNumero(o.ordem.quantidade, 0)} {un}
                </Text>
                <Text size="xs" fw={700}>
                  {pct(o.percentual)}
                </Text>
              </Group>
              <Progress
                value={Math.min(100, (o.percentual ?? 0) * 100)}
                size="sm"
                aria-label={`OP concluída ${pct(o.percentual)}`}
              />
              {o.meta !== null && (
                <Group justify="space-between" mt={4} gap="xs">
                  <Text size={tv ? 'md' : 'xs'}>
                    Turno: <b>{fmtNumero(o.realizado ?? 0, 0)}</b> / meta {fmtNumero(o.meta, 0)}
                  </Text>
                  <Text size={tv ? 'md' : 'xs'}>
                    PH {o.phReal === null ? '—' : fmtNumero(o.phReal, 0)} × {fmtNumero(o.phPadrao ?? 0, 0)}
                  </Text>
                </Group>
              )}
            </Box>
          );
        })}
        <Group justify="space-between">
          <Group gap={4}>
            {c.manutencaoAberta > 0 && (
              <Badge color="grape" variant="filled" leftSection={<IconTool size={12} />} data-manutencao>
                Manutenção aberta{c.manutencaoAberta > 1 ? ` (${c.manutencaoAberta})` : ''}
              </Badge>
            )}
            {c.cavidadesBloqueadas.length > 0 && (
              <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />}>
                Cavidade(s) {c.cavidadesBloqueadas.join(', ')} bloqueada(s)
              </Badge>
            )}
          </Group>
          {c.oee && (
            <Text size={tv ? 'xl' : 'md'} fw={700}>
              OEE {pct(c.oee.oee)}
              {c.oee.alertaPerformance && (
                <Tooltip label="Performance acima de 100%: ficha técnica possivelmente desatualizada.">
                  <IconAlertTriangle
                    size={16}
                    color="var(--mantine-color-orange-6)"
                    style={{ marginLeft: 4 }}
                  />
                </Tooltip>
              )}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

/** Painel de acompanhamento em tempo real (seção 10): um cartão por máquina; modo TV em tela cheia. */
export function PaginaPainelAcompanhamento({ tv = false }: { tv?: boolean }) {
  const conectado = useTempoReal();
  const painel = useQuery({
    queryKey: ['painel', 'acompanhamento'],
    queryFn: () => api.get<Painel>('/painel/acompanhamento'),
    refetchInterval: conectado ? false : 30_000,
  });
  useEffect(() => {
    if (!tv) return;
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [tv]);
  const maquinas = painel.data?.maquinas ?? [];
  const resumo = (s: Situacao) => maquinas.filter((m) => m.situacao === s).length;
  return (
    <Stack p={tv ? 'md' : 0} mih={tv ? '100vh' : undefined}>
      <Group justify="space-between">
        <Title order={tv ? 1 : 2}>Painel de acompanhamento</Title>
        <Group gap="xs">
          <Badge color="green" variant="light">
            {resumo('LIGADA')} produzindo
          </Badge>
          <Badge color="red" variant="light">
            {resumo('PARADA')} parada(s)
          </Badge>
          <Badge color="gray" variant="light">
            {resumo('DESLIGADA')} desligada(s)
          </Badge>
          <Tooltip label={conectado ? 'Atualização em tempo real' : 'Sem tempo real: atualiza a cada 30 s'}>
            <Badge
              color={conectado ? 'teal' : 'yellow'}
              variant="outline"
              leftSection={conectado ? <IconWifi size={12} /> : <IconWifiOff size={12} />}
              data-conectado={conectado}
            >
              {conectado ? 'Ao vivo' : 'Reconectando'}
            </Badge>
          </Tooltip>
          <Tooltip label={tv ? 'Sair da tela cheia' : 'Tela cheia (TV)'}>
            <ActionIcon
              variant="default"
              size="lg"
              component={Link}
              to={tv ? '/painel' : '/painel/tv'}
              aria-label={tv ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {tv ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <AlertaErroApi erro={painel.error} />
      <SimpleGrid cols={tv ? { base: 1, sm: 2, lg: 3, xl: 4 } : { base: 1, sm: 2, xl: 3 }}>
        {maquinas.map((c) => (
          <CartaoMaquina key={c.maquina.id} c={c} tv={tv} />
        ))}
      </SimpleGrid>
      {painel.data && (
        <Text size="xs" c="dimmed">
          Atualizado em {formatarDataHora(painel.data.geradoEm)}
        </Text>
      )}
    </Stack>
  );
}
