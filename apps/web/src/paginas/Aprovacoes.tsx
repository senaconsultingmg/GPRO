import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  formatarDataCivil,
  formatarDataHora,
  ROTULO_TIPO_APROVACAO,
  ROTULO_TIPO_CORRECAO,
  type TipoAprovacao,
  type TipoCorrecao,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, notificarSucesso } from '../componentes/utilitarios';

export interface Pendencia {
  id: string;
  tipo: TipoAprovacao;
  situacao: 'PENDENTE' | 'APROVADA' | 'REJEITADA';
  descricao: string;
  criadoEm: string;
  decididoEm: string | null;
  parecer: string | null;
  correcaoTipo: TipoCorrecao | null;
  justificativa: string | null;
  turnoId: string;
  turno: {
    id: string;
    data: string;
    situacao: string;
    horarioTurno: { nome: string };
    equipe: { letra: string };
    apontador: { nome: string };
  };
  evento: { id: string; resumo: string; horaOcorrencia: string } | null;
  solicitante: { id: string; nome: string };
  aprovador: { nome: string } | null;
}

interface TurnoFechado {
  id: string;
  data: string;
  apontador: { nome: string };
  horarioTurno: { nome: string };
  equipe: { letra: string };
  _count: { aprovacoes: number };
  parecerDevolucao?: string | null;
}

/** Decisão de uma pendência: aprovar (parecer opcional) ou rejeitar (parecer obrigatório). */
export function DecidirPendencia({ p, aoConcluir }: { p: Pendencia; aoConcluir: () => void }) {
  const cliente = useQueryClient();
  const [parecer, setParecer] = useState('');
  const decidir = useMutation({
    mutationFn: (acao: 'aprovar' | 'rejeitar') =>
      api.post(`/aprovacoes/${p.id}/${acao}`, { parecer: parecer.trim() || null }),
    onSuccess: (_r, acao) => {
      cliente.invalidateQueries({ queryKey: ['aprovacoes'] });
      cliente.invalidateQueries({ queryKey: ['turno'] });
      cliente.invalidateQueries({ queryKey: ['turnos'] });
      notificarSucesso(acao === 'aprovar' ? 'Pendência aprovada.' : 'Pendência rejeitada.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text>
        <Badge mr="xs">{ROTULO_TIPO_APROVACAO[p.tipo]}</Badge>
        {p.descricao}
      </Text>
      {p.evento && (
        <Text size="sm" c="dimmed">
          Lançamento: {formatarDataHora(p.evento.horaOcorrencia)} — {p.evento.resumo}
        </Text>
      )}
      <Text size="sm" c="dimmed">
        Solicitado por {p.solicitante.nome} em {formatarDataHora(p.criadoEm)}
      </Text>
      <Textarea
        label="Parecer"
        description="Obrigatório para rejeitar."
        autosize
        minRows={2}
        value={parecer}
        onChange={(e) => setParecer(e.currentTarget.value)}
      />
      <AlertaErroApi erro={decidir.error} />
      <Group justify="flex-end">
        <Button
          color="red"
          variant="light"
          disabled={parecer.trim().length < 3}
          loading={decidir.isPending && decidir.variables === 'rejeitar'}
          onClick={() => decidir.mutate('rejeitar')}
        >
          Rejeitar
        </Button>
        <Button
          color="green"
          loading={decidir.isPending && decidir.variables === 'aprovar'}
          onClick={() => decidir.mutate('aprovar')}
        >
          Aprovar
        </Button>
      </Group>
    </Stack>
  );
}

/** Aprovação do relatório do turno pelo líder (RN-13). */
export function AprovarRelatorio({ turnoId, aoConcluir }: { turnoId: string; aoConcluir: () => void }) {
  const cliente = useQueryClient();
  const [parecer, setParecer] = useState('');
  const aprovar = useMutation({
    mutationFn: () => api.post(`/turnos/${turnoId}/aprovar`, { parecer: parecer.trim() || null }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['turnos'] });
      cliente.invalidateQueries({ queryKey: ['turno', turnoId] });
      notificarSucesso('Relatório do turno aprovado. O PCP já pode apurar.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Textarea
        label="Parecer (opcional)"
        autosize
        minRows={2}
        value={parecer}
        onChange={(e) => setParecer(e.currentTarget.value)}
      />
      <AlertaErroApi erro={aprovar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button color="green" loading={aprovar.isPending} onClick={() => aprovar.mutate()}>
          Aprovar relatório
        </Button>
      </Group>
    </Stack>
  );
}

const descricaoTurno = (t: Pendencia['turno'] | TurnoFechado) =>
  `${t.horarioTurno.nome} ${formatarDataCivil(t.data)} · Equipe ${t.equipe.letra}`;

/** Fila do líder: pendências (horário, peso, justificativa, correção) e relatórios a aprovar. */
export function PaginaAprovacoes() {
  const { usuario, pode } = useAutenticacao();
  const decide = pode('aprovacoes.decidir');
  const [situacao, setSituacao] = useState('PENDENTE');
  const [decidindo, setDecidindo] = useState<Pendencia | null>(null);
  const [aprovando, setAprovando] = useState<TurnoFechado | null>(null);
  const pendencias = useQuery({
    queryKey: ['aprovacoes', situacao],
    queryFn: () => api.get<Pendencia[]>(`/aprovacoes?situacao=${situacao}`),
  });
  const fechados = useQuery({
    queryKey: ['turnos', 'FECHADO'],
    queryFn: () => api.get<TurnoFechado[]>('/turnos?situacao=FECHADO'),
    enabled: decide,
  });
  return (
    <Stack>
      <Title order={2}>Aprovações</Title>
      {decide && (
        <Card withBorder>
          <Title order={4}>Relatórios de turno aguardando aprovação</Title>
          <Text size="sm" c="dimmed">
            O relatório só pode ser aprovado sem pendência em aberto. Depois de aprovado, segue para a
            apuração do PCP.
          </Text>
          <AlertaErroApi erro={fechados.error} />
          {fechados.data?.length === 0 && <Text c="dimmed">Nenhum turno fechado aguardando.</Text>}
          {!!fechados.data?.length && (
            <ScrollArea>
              <Table miw={640} verticalSpacing="xs">
                <Table.Tbody>
                  {fechados.data.map((t) => (
                    <Table.Tr key={t.id} data-turno={t.id}>
                      <Table.Td>{descricaoTurno(t)}</Table.Td>
                      <Table.Td>{t.apontador.nome}</Table.Td>
                      <Table.Td>
                        {t._count.aprovacoes > 0 ? (
                          <Badge color="yellow">{t._count.aprovacoes} pendência(s)</Badge>
                        ) : (
                          <Badge color="green">Sem pendências</Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button
                            size="xs"
                            variant="default"
                            component={Link}
                            to={`/turnos/${t.id}/relatorio`}
                          >
                            Relatório
                          </Button>
                          <Button
                            size="xs"
                            color="green"
                            disabled={t._count.aprovacoes > 0}
                            onClick={() => setAprovando(t)}
                          >
                            Aprovar relatório
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Card>
      )}
      <Group justify="space-between">
        <Title order={4}>Pendências</Title>
        <SegmentedControl
          value={situacao}
          onChange={setSituacao}
          data={[
            { value: 'PENDENTE', label: 'Em aberto' },
            { value: 'APROVADA', label: 'Aprovadas' },
            { value: 'REJEITADA', label: 'Rejeitadas' },
          ]}
        />
      </Group>
      <AlertaErroApi erro={pendencias.error} />
      {pendencias.data?.length === 0 && <Alert color="green">Nenhuma pendência nesta situação.</Alert>}
      {!!pendencias.data?.length && (
        <ScrollArea>
          <Table striped miw={900} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Turno</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Descrição</Table.Th>
                <Table.Th>Solicitante</Table.Th>
                <Table.Th>{situacao === 'PENDENTE' ? 'Desde' : 'Decisão'}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendencias.data.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <Text size="sm">{descricaoTurno(p.turno)}</Text>
                    <Text size="xs" c="dimmed">
                      {p.turno.apontador.nome}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={p.tipo === 'CORRECAO' ? 'grape' : p.tipo === 'PESO' ? 'red' : 'orange'}>
                      {ROTULO_TIPO_APROVACAO[p.tipo]}
                      {p.correcaoTipo ? ` · ${ROTULO_TIPO_CORRECAO[p.correcaoTipo]}` : ''}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{p.descricao}</Text>
                    {p.parecer && (
                      <Text size="xs" c="dimmed">
                        Parecer: {p.parecer}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{p.solicitante.nome}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {situacao === 'PENDENTE'
                      ? formatarDataHora(p.criadoEm)
                      : `${formatarDataHora(p.decididoEm)} · ${p.aprovador?.nome ?? ''}`}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button
                        size="xs"
                        variant="default"
                        component={Link}
                        to={`/turnos/${p.turnoId}/relatorio`}
                      >
                        Turno
                      </Button>
                      {decide && p.situacao === 'PENDENTE' && (
                        <Button
                          size="xs"
                          disabled={p.solicitante.id === usuario?.id}
                          title={
                            p.solicitante.id === usuario?.id
                              ? 'Quem solicitou não pode decidir; outro líder decide.'
                              : undefined
                          }
                          onClick={() => setDecidindo(p)}
                        >
                          Decidir
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Modal
        opened={!!decidindo}
        onClose={() => setDecidindo(null)}
        size="lg"
        title={<Text fw={700}>Decidir pendência</Text>}
      >
        {decidindo && <DecidirPendencia p={decidindo} aoConcluir={() => setDecidindo(null)} />}
      </Modal>
      <Modal
        opened={!!aprovando}
        onClose={() => setAprovando(null)}
        title={<Text fw={700}>Aprovar relatório — {aprovando && descricaoTurno(aprovando)}</Text>}
      >
        {aprovando && <AprovarRelatorio turnoId={aprovando.id} aoConcluir={() => setAprovando(null)} />}
      </Modal>
    </Stack>
  );
}
