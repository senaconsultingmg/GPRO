import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconPrinter } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import {
  formatarDataCivil,
  formatarDataHora,
  ROTULO_SITUACAO_TURNO,
  ROTULO_TIPO_APROVACAO,
  ROTULO_UNIDADE,
  type SituacaoTurno,
  type TipoAprovacao,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { ListaLancamentos } from './apontamento/ListaLancamentos';
import type { TurnoDetalhe } from './apontamento/tipos';
import { AprovarRelatorio } from './Aprovacoes';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../componentes/utilitarios';

interface TurnoLista {
  id: string;
  data: string;
  situacao: SituacaoTurno;
  abertoEm: string;
  fechadoEm: string | null;
  apontador: { nome: string };
  horarioTurno: { nome: string };
  equipe: { letra: string };
  _count: { maquinas: number; eventos: number; aprovacoes: number };
}

const COR_TURNO: Record<SituacaoTurno, string> = {
  ABERTO: 'green',
  FECHADO: 'blue',
  APROVADO: 'teal',
  APURADO: 'grape',
  EXPORTADO: 'gray',
};

export function PaginaTurnos() {
  const [situacao, setSituacao] = useState<string | null>(null);
  const { data = [], error } = useQuery({
    queryKey: ['turnos', situacao],
    queryFn: () => api.get<TurnoLista[]>(`/turnos${situacao ? `?situacao=${situacao}` : ''}`),
  });
  return (
    <Stack>
      <Title order={2}>Turnos de apontamento</Title>
      <Select
        value={situacao}
        onChange={setSituacao}
        clearable
        placeholder="Todas as situações"
        w={240}
        data={Object.entries(ROTULO_SITUACAO_TURNO).map(([value, label]) => ({ value, label }))}
      />
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped verticalSpacing="sm" miw={800}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data</Table.Th>
              <Table.Th>Horário</Table.Th>
              <Table.Th>Equipe</Table.Th>
              <Table.Th>Apontador</Table.Th>
              <Table.Th>Máquinas</Table.Th>
              <Table.Th>Pendências</Table.Th>
              <Table.Th>Situação</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{formatarDataCivil(t.data)}</Table.Td>
                <Table.Td>{t.horarioTurno.nome}</Table.Td>
                <Table.Td>{t.equipe.letra}</Table.Td>
                <Table.Td>{t.apontador.nome}</Table.Td>
                <Table.Td>{t._count.maquinas}</Table.Td>
                <Table.Td>
                  {t._count.aprovacoes > 0 ? <Badge color="yellow">{t._count.aprovacoes}</Badge> : '—'}
                </Table.Td>
                <Table.Td>
                  <Badge color={COR_TURNO[t.situacao]}>{ROTULO_SITUACAO_TURNO[t.situacao]}</Badge>
                </Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" component={Link} to={`/turnos/${t.id}/relatorio`}>
                    Relatório
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

interface OpRelatorio {
  divisao: { codigo: string; horasDisponiveis: number; phReferencia: number; meta: number };
  ordem: { numeroErp: string | null; numeroInterno: number; quantidade: number; unidade: Unidade };
  produto: { codigo: string; descricao: string };
  fichaVersao: number;
  cavidades: number[];
  etiquetado: number;
  saldoRecebido: number;
  saldoDeixado: number;
  producao: number;
  refugadas: number;
  producaoTotal: number;
  producaoEsperada: number;
  numeroConjuntos: number;
  conjuntosAvulsos: { quantidade: number; hora: string }[];
  quantidadeAvulsos: number;
  volumes: { tipoVolume: string; pesoKg: number }[];
  perdas: { tipo: string; contaComoRefugo: boolean; pesoKg: number; pecas: number; ocorrencias: number }[];
  consumo: {
    material: { codigo: string; descricao: string };
    entrada: number;
    devolucao: number;
    transferenciaSaida: number;
    transferenciaEntrada: number;
    liquido: number;
    teorico: number | null;
  }[];
  semiacabados: { produto?: { codigo: string }; quantidade: number; lote: string | null }[];
  phReal: number | null;
  phPadrao: number;
  pesoNaoConforme: number;
}

interface Relatorio {
  turno: {
    id: string;
    data: string;
    horario: { nome: string; horaInicio: string; horaFim: string };
    equipe: string;
    apontador: string;
    situacao: SituacaoTurno;
    abertoEm: string;
    fechadoEm: string | null;
  };
  maquinas: {
    maquina: { codigo: string; descricao: string };
    rodada: { numero: number; molde: string | null };
    segueRodando: boolean;
    tempos: {
      ligadoMin: number;
      paradasProgramadasMin: number;
      paradasNaoProgramadasMin: number;
      planejadoMin: number;
      produzindoMin: number;
    };
    paradas: {
      motivo: string;
      programada: boolean;
      inicio: string;
      fim: string;
      minutos: number;
      semReinicio: boolean;
    }[];
    cavidadesBloqueadas: { cavidade: number; inicio: string; fim: string | null }[];
    ops: OpRelatorio[];
    boas: number;
    refugadas: number;
    producaoEsperada: number;
    oee: {
      disponibilidade: number | null;
      performance: number | null;
      qualidade: number | null;
      oee: number | null;
      alertaPerformance: boolean;
    };
  }[];
  pendencias: { id: string; tipo: TipoAprovacao; descricao: string }[];
  lancamentosMarcados: number;
  totalLancamentos: number;
  parcial: boolean;
}

const pct = (v: number | null) => (v === null ? '—' : `${fmtNumero(v * 100, 1)}%`);
const horas = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <Paper withBorder p="sm" bg={destaque ? 'var(--mantine-color-blue-0)' : undefined}>
      <Text size="xs" c="dimmed">
        {rotulo}
      </Text>
      <Text size="xl" fw={700}>
        {valor}
      </Text>
    </Paper>
  );
}

/** Seção 11: o tablet do turno tem fila não enviada e não pode se conectar (ex.: quebrou). */
function LiberarTroca({ turnoId, aoConcluir }: { turnoId: string; aoConcluir: () => void }) {
  const [justificativa, setJustificativa] = useState('');
  const liberar = useMutation({
    mutationFn: () => api.post(`/turnos/${turnoId}/liberar-aparelho`, { justificativa }),
    onSuccess: () => {
      notificarSucesso('Troca liberada: o apontador pode continuar o turno em outro tablet.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Alert color="orange">
        Os lançamentos que ficaram no tablet antigo e não foram enviados não chegam ao servidor. Use só quando
        aquele tablet não puder mais se conectar.
      </Alert>
      <Textarea
        label="Justificativa"
        withAsterisk
        value={justificativa}
        onChange={(e) => setJustificativa(e.currentTarget.value)}
      />
      <AlertaErroApi erro={liberar.error} />
      <Group justify="flex-end">
        <Button
          color="orange"
          disabled={justificativa.trim().length < 5}
          loading={liberar.isPending}
          onClick={() => liberar.mutate()}
        >
          Liberar troca
        </Button>
      </Group>
    </Stack>
  );
}

/** Relatório do turno (RN-13). */
export function PaginaRelatorioTurno() {
  const { id } = useParams();
  const { pode } = useAutenticacao();
  const [aprovando, setAprovando] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const {
    data: r,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['turno', id, 'relatorio'],
    queryFn: () => api.get<Relatorio>(`/turnos/${id}/relatorio`),
  });
  const detalhe = useQuery({
    queryKey: ['turno', id],
    queryFn: () =>
      api.get<TurnoDetalhe & { parecerDevolucao: string | null; devolvidoEm: string | null }>(
        `/turnos/${id}`,
      ),
    enabled: !!r,
  });
  if (isLoading) return <Text>Carregando…</Text>;
  if (!r) return <AlertaErroApi erro={error} />;
  const d = detalhe.data;
  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>
            Relatório do turno — {r.turno.horario.nome} {formatarDataCivil(r.turno.data)} · Equipe{' '}
            {r.turno.equipe}
          </Title>
          <Text c="dimmed" component="div">
            Apontador {r.turno.apontador} · aberto {formatarDataHora(r.turno.abertoEm)}
            {r.turno.fechadoEm ? ` · fechado ${formatarDataHora(r.turno.fechadoEm)}` : ''} ·{' '}
            <Badge>{ROTULO_SITUACAO_TURNO[r.turno.situacao]}</Badge>
          </Text>
        </div>
        <Group>
          {r.turno.situacao === 'ABERTO' && pode('aprovacoes.decidir') && (
            <Button variant="light" color="orange" onClick={() => setLiberando(true)}>
              Liberar troca de tablet
            </Button>
          )}
          {r.turno.situacao === 'FECHADO' && pode('aprovacoes.decidir') && (
            <Button color="green" disabled={r.pendencias.length > 0} onClick={() => setAprovando(true)}>
              Aprovar relatório
            </Button>
          )}
          <Button variant="default" leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>
            Imprimir
          </Button>
        </Group>
      </Group>
      {d?.parecerDevolucao && r.turno.situacao === 'FECHADO' && (
        <Alert color="orange" title={`Devolvido pelo PCP em ${formatarDataHora(d.devolvidoEm)}`}>
          {d.parecerDevolucao}
        </Alert>
      )}
      {r.turno.situacao === 'EXPORTADO' && (
        <Alert color="gray">Turno exportado ao ERP: não aceita nenhuma alteração.</Alert>
      )}
      {r.parcial && <Alert color="blue">Turno aberto: valores parciais até agora.</Alert>}

      {r.maquinas.map((m) => (
        <Card key={m.maquina.codigo} withBorder padding="lg">
          <Stack>
            <Group justify="space-between">
              <Title order={3}>
                {m.maquina.codigo}{' '}
                <Text span c="dimmed" size="md">
                  {m.maquina.descricao} · rodada {m.rodada.numero}
                  {m.rodada.molde ? ` · ${m.rodada.molde}` : ''}
                </Text>
              </Title>
              {m.segueRodando && <Badge color="green">Segue rodando</Badge>}
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4, lg: 8 }}>
              <Indicador rotulo="OEE" valor={pct(m.oee.oee)} destaque />
              <Indicador rotulo="Disponibilidade" valor={pct(m.oee.disponibilidade)} />
              <Indicador rotulo="Performance" valor={pct(m.oee.performance)} />
              <Indicador rotulo="Qualidade" valor={pct(m.oee.qualidade)} />
              <Indicador rotulo="Tempo ligado" valor={horas(m.tempos.ligadoMin)} />
              <Indicador rotulo="Planejado" valor={horas(m.tempos.planejadoMin)} />
              <Indicador rotulo="Produzindo" valor={horas(m.tempos.produzindoMin)} />
              <Indicador
                rotulo="Paradas (prog./não prog.)"
                valor={`${m.tempos.paradasProgramadasMin}/${m.tempos.paradasNaoProgramadasMin} min`}
              />
            </SimpleGrid>
            {m.oee.alertaPerformance && (
              <Alert color="orange" icon={<IconAlertTriangle />}>
                Performance acima de 100%: ficha técnica possivelmente desatualizada.
              </Alert>
            )}
            <ScrollArea>
              <Table withTableBorder verticalSpacing="xs" miw={900}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Divisão / OP</Table.Th>
                    <Table.Th>Produto</Table.Th>
                    <Table.Th>Meta</Table.Th>
                    <Table.Th>Esperada</Table.Th>
                    <Table.Th>Etiquetado</Table.Th>
                    <Table.Th>Saldo solto (+deixado −recebido)</Table.Th>
                    <Table.Th>Produção</Table.Th>
                    <Table.Th>Refugadas</Table.Th>
                    <Table.Th>Conjuntos</Table.Th>
                    <Table.Th>PH real × padrão</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {m.ops.map((o) => {
                    const un = ROTULO_UNIDADE[o.ordem.unidade];
                    return (
                      <Table.Tr key={o.divisao.codigo}>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          <Text fw={700}>{o.divisao.codigo}</Text>
                          <Text size="xs" c="dimmed">
                            OP ERP {o.ordem.numeroErp ?? '—'} · nº {o.ordem.numeroInterno}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {o.produto.codigo}
                          <Text size="xs" c="dimmed">
                            ficha v{o.fichaVersao}
                            {o.cavidades.length ? ` · cav. ${o.cavidades.join(', ')}` : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td>{fmtNumero(o.divisao.meta)}</Table.Td>
                        <Table.Td>{fmtNumero(o.producaoEsperada, 0)}</Table.Td>
                        <Table.Td>{fmtNumero(o.etiquetado)}</Table.Td>
                        <Table.Td>
                          +{fmtNumero(o.saldoDeixado)} −{fmtNumero(o.saldoRecebido)}
                        </Table.Td>
                        <Table.Td>
                          <Text fw={700}>
                            {fmtNumero(o.producao)} {un}
                          </Text>
                        </Table.Td>
                        <Table.Td>{fmtNumero(o.refugadas)}</Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          {o.numeroConjuntos}
                          {o.conjuntosAvulsos.length > 0 && (
                            <Badge
                              color="orange"
                              variant="filled"
                              ml={4}
                              styles={{ label: { overflow: 'visible' } }}
                            >
                              AVULSO {o.conjuntosAvulsos.map((a) => a.quantidade).join(', ')}
                            </Badge>
                          )}
                          {o.volumes.length > 0 && ` ${o.volumes.length} volume(s)`}
                          {o.pesoNaoConforme > 0 && (
                            <Badge color="red" ml={4} styles={{ label: { overflow: 'visible' } }}>
                              {o.pesoNaoConforme} peso NC
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {o.phReal === null ? '—' : fmtNumero(o.phReal)} × {fmtNumero(o.phPadrao)}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <div>
                <Title order={5}>Paradas</Title>
                {m.paradas.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Nenhuma.
                  </Text>
                ) : (
                  <Table>
                    <Table.Tbody>
                      {m.paradas.map((p, i) => (
                        <Table.Tr key={i}>
                          <Table.Td>{p.motivo}</Table.Td>
                          <Table.Td>
                            {p.programada ? (
                              <Badge variant="light">Programada</Badge>
                            ) : (
                              <Badge color="red" variant="light">
                                Não programada
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {formatarDataHora(p.inicio).slice(11)} – {formatarDataHora(p.fim).slice(11)}
                          </Table.Td>
                          <Table.Td>
                            {p.minutos} min{p.semReinicio ? ' (sem reinício)' : ''}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                <Title order={5} mt="sm">
                  Cavidades bloqueadas
                </Title>
                {m.cavidadesBloqueadas.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Nenhuma.
                  </Text>
                ) : (
                  <List size="sm">
                    {m.cavidadesBloqueadas.map((b, i) => (
                      <List.Item key={i}>
                        Cavidade {b.cavidade}: desde {formatarDataHora(b.inicio)}{' '}
                        {b.fim ? `até ${formatarDataHora(b.fim)}` : '(continua bloqueada)'}
                      </List.Item>
                    ))}
                  </List>
                )}
              </div>
              <div>
                <Title order={5}>Perdas</Title>
                {m.ops.every((o) => o.perdas.length === 0) ? (
                  <Text size="sm" c="dimmed">
                    Nenhuma.
                  </Text>
                ) : (
                  <Table>
                    <Table.Tbody>
                      {m.ops.flatMap((o) =>
                        o.perdas.map((p) => (
                          <Table.Tr key={`${o.divisao.codigo}-${p.tipo}`}>
                            <Table.Td>{o.divisao.codigo}</Table.Td>
                            <Table.Td>
                              {p.tipo}
                              {p.contaComoRefugo ? ' (refugo)' : ''}
                            </Table.Td>
                            <Table.Td>{fmtNumero(p.pesoKg, 3)} kg</Table.Td>
                            <Table.Td>{fmtNumero(p.pecas)} pç</Table.Td>
                          </Table.Tr>
                        )),
                      )}
                    </Table.Tbody>
                  </Table>
                )}
                <Title order={5} mt="sm">
                  Consumo de material (real × teórico)
                </Title>
                {m.ops.every((o) => o.consumo.length === 0) ? (
                  <Text size="sm" c="dimmed">
                    Nenhum.
                  </Text>
                ) : (
                  <ScrollArea>
                    <Table miw={480}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>OP</Table.Th>
                          <Table.Th>Material</Table.Th>
                          <Table.Th>Entrada</Table.Th>
                          <Table.Th>Dev./Transf.</Table.Th>
                          <Table.Th>Líquido</Table.Th>
                          <Table.Th>Teórico</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {m.ops.flatMap((o) =>
                          o.consumo.map((c) => (
                            <Table.Tr key={`${o.divisao.codigo}-${c.material.codigo}`}>
                              <Table.Td>{o.divisao.codigo}</Table.Td>
                              <Table.Td>{c.material.codigo}</Table.Td>
                              <Table.Td>{fmtNumero(c.entrada + c.transferenciaEntrada, 3)}</Table.Td>
                              <Table.Td>
                                {fmtNumero(c.devolucao, 3)} / {fmtNumero(c.transferenciaSaida, 3)}
                              </Table.Td>
                              <Table.Td>{fmtNumero(c.liquido, 3)} kg</Table.Td>
                              <Table.Td>
                                {c.teorico === null ? '—' : `${fmtNumero(c.teorico, 3)} kg`}
                              </Table.Td>
                            </Table.Tr>
                          )),
                        )}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </SimpleGrid>
          </Stack>
        </Card>
      ))}

      <Card withBorder>
        <Title order={4}>Pendências para o líder ({r.pendencias.length})</Title>
        <Text size="sm" c="dimmed">
          {r.lancamentosMarcados} de {r.totalLancamentos} lançamento(s) com hora fora da tolerância.
        </Text>
        {r.pendencias.length === 0 ? (
          <Text c="dimmed">Nenhuma pendência.</Text>
        ) : (
          <List mt="xs">
            {r.pendencias.map((p) => (
              <List.Item key={p.id}>
                <Badge mr="xs" color={p.tipo === 'PESO' ? 'red' : 'orange'}>
                  {ROTULO_TIPO_APROVACAO[p.tipo]}
                </Badge>
                {p.descricao}
              </List.Item>
            ))}
          </List>
        )}
        {r.pendencias.length > 0 && pode('aprovacoes.decidir') && (
          <Button mt="sm" variant="light" component={Link} to="/aprovacoes" w="fit-content">
            Decidir pendências
          </Button>
        )}
      </Card>

      {d && (
        <Card withBorder>
          <Title order={4} mb="xs">
            Lançamentos
          </Title>
          <ListaLancamentos turno={d} />
        </Card>
      )}
      <Modal
        opened={liberando}
        onClose={() => setLiberando(false)}
        title={<Text fw={700}>Liberar troca de tablet</Text>}
      >
        {liberando && <LiberarTroca turnoId={r.turno.id} aoConcluir={() => setLiberando(false)} />}
      </Modal>
      <Modal
        opened={aprovando}
        onClose={() => setAprovando(false)}
        title={<Text fw={700}>Aprovar relatório</Text>}
      >
        {aprovando && <AprovarRelatorio turnoId={r.turno.id} aoConcluir={() => setAprovando(false)} />}
      </Modal>
    </Stack>
  );
}
