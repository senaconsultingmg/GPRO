import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
import {
  formatarDataCivil,
  formatarDataHora,
  ROTULO_TIPO_EVENTO,
  type TipoEvento,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, notificarErro, notificarSucesso } from '../componentes/utilitarios';
import { tipoRotulo } from '../offline/fila';
import { FormularioLancamento, type TipoLancamento } from './apontamento/Lancamento';
import type { TurnoDetalhe } from './apontamento/tipos';

interface Recusa {
  id: string;
  tipo: keyof typeof tipoRotulo;
  rota: string;
  corpo: Record<string, unknown>;
  status: number;
  mensagem: string;
  criadoEm: string;
  situacao: 'PENDENTE' | 'DESCARTADO' | 'RELANCADO';
  justificativa: string | null;
  decididoEm: string | null;
  usuarioId: string;
  usuario: { nome: string };
  decididoPor: { nome: string } | null;
  turno: {
    id: string;
    data: string;
    situacao: string;
    apontadorId: string;
    horarioTurno: { nome: string };
  } | null;
}

function Descartar({ r, aoConcluir }: { r: Recusa; aoConcluir: () => void }) {
  const cliente = useQueryClient();
  const [justificativa, setJustificativa] = useState('');
  const descartar = useMutation({
    mutationFn: () => api.post(`/offline/recusados/${r.id}/descartar`, { justificativa }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['recusados'] });
      notificarSucesso('Lançamento recusado descartado. O registro continua na auditoria.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text size="sm">{r.mensagem}</Text>
      <Textarea
        label="Justificativa do descarte"
        withAsterisk
        autosize
        minRows={2}
        value={justificativa}
        onChange={(e) => setJustificativa(e.currentTarget.value)}
      />
      <AlertaErroApi erro={descartar.error} />
      <Group justify="flex-end">
        <Button
          color="red"
          disabled={justificativa.trim().length < 5}
          loading={descartar.isPending}
          onClick={() => descartar.mutate()}
        >
          Descartar
        </Button>
      </Group>
    </Stack>
  );
}

/** Resumo do conteúdo recusado para a lista. */
function resumo(r: Recusa) {
  if (r.tipo !== 'EVENTO') return tipoRotulo[r.tipo];
  const tipo = r.corpo.tipo as TipoEvento;
  const partes = [ROTULO_TIPO_EVENTO[tipo] ?? tipo];
  if (r.corpo.horaOcorrencia) partes.push(formatarDataHora(String(r.corpo.horaOcorrencia)));
  if (r.corpo.conjuntosPadrao) partes.push(`${r.corpo.conjuntosPadrao} conjunto(s)`);
  if (r.corpo.quantidadeKg) partes.push(`${r.corpo.quantidadeKg} kg`);
  if (r.corpo.pesoKg) partes.push(`${r.corpo.pesoKg} kg`);
  if (r.corpo.quantidadePecas) partes.push(`${r.corpo.quantidadePecas} pç`);
  return partes.join(' · ');
}

/**
 * Seção 11 — lançamentos que o servidor recusou ao sincronizar (ex.: OP encerrada enquanto o
 * tablet estava offline). Nada é descartado em silêncio: o apontador relança corrigido ou o
 * líder/apontador descarta com justificativa.
 */
export function PaginaRecusados() {
  const { usuario, pode } = useAutenticacao();
  const cliente = useQueryClient();
  const [situacao, setSituacao] = useState('PENDENTE');
  const [descartando, setDescartando] = useState<Recusa | null>(null);
  const [relancando, setRelancando] = useState<Recusa | null>(null);
  const lista = useQuery({
    queryKey: ['recusados', situacao],
    queryFn: () => api.get<Recusa[]>(`/offline/recusados?situacao=${situacao}`),
  });
  const apontador = pode('apontamento.lancar');
  const meu = useQuery({
    queryKey: ['recusados', 'turno-aberto'],
    queryFn: async () => {
      const r = await api.get<{ id: string | null }>('/turnos/meu-aberto');
      return r.id ? api.get<TurnoDetalhe>(`/turnos/${r.id}`) : null;
    },
    enabled: apontador,
  });
  const podeRelancar = (r: Recusa) =>
    r.situacao === 'PENDENTE' &&
    r.tipo === 'EVENTO' &&
    r.usuarioId === usuario?.id &&
    !!meu.data &&
    meu.data.id === r.turno?.id &&
    meu.data.maquinas.some((m) => m.maquinaId === r.corpo.maquinaId);
  const maquinaRelancar =
    relancando && meu.data?.maquinas.find((m) => m.maquinaId === relancando.corpo.maquinaId);
  return (
    <Stack>
      <Title order={2}>Lançamentos recusados</Title>
      <Text size="sm" c="dimmed">
        Lançamentos feitos no tablet que o servidor recusou ao receber. Relance corrigido ou descarte com
        justificativa.
      </Text>
      <SegmentedControl
        w="fit-content"
        value={situacao}
        onChange={setSituacao}
        data={[
          { value: 'PENDENTE', label: 'A resolver' },
          { value: 'RELANCADO', label: 'Relançados' },
          { value: 'DESCARTADO', label: 'Descartados' },
        ]}
      />
      <AlertaErroApi erro={lista.error} />
      {lista.data?.length === 0 && <Alert color="green">Nenhum lançamento recusado nesta situação.</Alert>}
      {!!lista.data?.length && (
        <ScrollArea>
          <Table striped miw={900} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Lançado em</Table.Th>
                <Table.Th>Apontador</Table.Th>
                <Table.Th>Turno</Table.Th>
                <Table.Th>Lançamento</Table.Th>
                <Table.Th>Motivo da recusa</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.data.map((r) => (
                <Table.Tr key={r.id} data-recusado={r.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(r.criadoEm)}</Table.Td>
                  <Table.Td>{r.usuario.nome}</Table.Td>
                  <Table.Td>
                    {r.turno
                      ? `${r.turno.horarioTurno.nome} ${formatarDataCivil(r.turno.data.slice(0, 10))}`
                      : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" mr={4}>
                      {tipoRotulo[r.tipo]}
                    </Badge>
                    <Text size="sm" span>
                      {resumo(r)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="red">
                      {r.mensagem}
                    </Text>
                    {r.justificativa && (
                      <Text size="xs" c="dimmed">
                        Descartado por {r.decididoPor?.nome}: {r.justificativa}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {r.situacao === 'PENDENTE' && pode('recusados.decidir') && (
                      <Group gap={4} wrap="nowrap" justify="flex-end">
                        {podeRelancar(r) && (
                          <Button size="xs" onClick={() => setRelancando(r)}>
                            Relançar corrigido
                          </Button>
                        )}
                        {(r.usuarioId === usuario?.id || usuario?.perfis.includes('LIDER')) && (
                          <Button size="xs" color="red" variant="light" onClick={() => setDescartando(r)}>
                            Descartar
                          </Button>
                        )}
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Modal
        opened={!!descartando}
        onClose={() => setDescartando(null)}
        title={<Text fw={700}>Descartar lançamento recusado</Text>}
      >
        {descartando && <Descartar r={descartando} aoConcluir={() => setDescartando(null)} />}
      </Modal>
      <Modal
        opened={!!relancando}
        onClose={() => setRelancando(null)}
        size="xl"
        title={
          <Text fw={700}>
            Relançar corrigido — {relancando && ROTULO_TIPO_EVENTO[relancando.corpo.tipo as TipoEvento]}
          </Text>
        }
      >
        {relancando && meu.data && maquinaRelancar && (
          <Stack>
            <Alert color="red">Recusado: {relancando.mensagem}</Alert>
            <FormularioLancamento
              turno={meu.data}
              maquina={maquinaRelancar}
              tipo={relancando.corpo.tipo as TipoLancamento}
              inicial={relancando.corpo}
              aoConcluir={() => setRelancando(null)}
              aoRegistrar={(eventoId, enviado) => {
                if (!enviado) {
                  notificarErro(
                    new Error('O novo lançamento ficou na fila; marque o recusado depois que ele subir.'),
                  );
                  return;
                }
                api
                  .post(`/offline/recusados/${relancando.id}/relancado`, { eventoId })
                  .then(() => {
                    cliente.invalidateQueries({ queryKey: ['recusados'] });
                    notificarSucesso('Lançamento relançado e ligado ao recusado.');
                  })
                  .catch(notificarErro);
              }}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
