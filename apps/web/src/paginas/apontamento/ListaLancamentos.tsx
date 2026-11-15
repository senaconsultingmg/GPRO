import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatarDataHora, ROTULO_MARCA_HORARIO, ROTULO_TIPO_EVENTO } from '@apontamento/shared';
import { api } from '../../api/cliente';
import { useAutenticacao } from '../../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, notificarSucesso } from '../../componentes/utilitarios';
import { FormularioLancamento, type TipoLancamento } from './Lancamento';
import type { EventoLista, TurnoDetalhe } from './tipos';

const EDITAVEIS = ['ABERTO', 'FECHADO', 'APROVADO'];

/** Correção com valores (formulário do lançamento) ou anulação; vai para aprovação do líder (RN-09). */
function SolicitarCorrecao({
  turno,
  evento,
  aoConcluir,
}: {
  turno: TurnoDetalhe;
  evento: EventoLista;
  aoConcluir: () => void;
}) {
  const cliente = useQueryClient();
  const saldo = evento.tipo === 'SALDO_AVULSO_DEIXADO' || evento.tipo === 'SALDO_AVULSO_RECEBIDO';
  const [modo, setModo] = useState<'CORRIGIR' | 'ANULAR'>('CORRIGIR');
  const [motivo, setMotivo] = useState('');
  const [quantidade, setQuantidade] = useState<number | string>(
    (evento as EventoLista & { quantidade?: number }).quantidade ?? 0,
  );
  const maquina = turno.maquinas.find((m) => m.maquinaId === evento.maquinaId);
  const enviar = useMutation({
    mutationFn: () =>
      api.post('/correcoes', {
        eventoId: evento.id,
        tipo: modo,
        justificativa: motivo.trim(),
        valores: modo === 'CORRIGIR' ? { quantidade: Number(quantidade) } : null,
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['turno', turno.id] });
      cliente.invalidateQueries({ queryKey: ['aprovacoes'] });
      notificarSucesso('Correção enviada para aprovação do líder.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Alert color="blue">
        {ROTULO_TIPO_EVENTO[evento.tipo]} de {formatarDataHora(evento.horaOcorrencia)}: {evento.resumo}. O
        lançamento original continua registrado e só sai dos cálculos quando o líder aprovar.
      </Alert>
      <SegmentedControl
        value={modo}
        onChange={(v) => setModo(v as 'CORRIGIR' | 'ANULAR')}
        data={[
          { value: 'CORRIGIR', label: 'Corrigir valores' },
          { value: 'ANULAR', label: 'Anular (marcar como incorreto)' },
        ]}
      />
      {modo === 'CORRIGIR' && !saldo && maquina ? (
        <FormularioLancamento
          turno={turno}
          maquina={maquina}
          tipo={evento.tipo as TipoLancamento}
          correcao={evento}
          aoConcluir={aoConcluir}
        />
      ) : (
        <>
          {modo === 'CORRIGIR' && (
            <NumberInput
              label="Quantidade correta do saldo solto"
              min={0}
              value={quantidade}
              onChange={setQuantidade}
            />
          )}
          <Textarea
            label="Motivo da correção"
            withAsterisk
            autosize
            minRows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <AlertaErroApi erro={enviar.error} />
          <Group grow>
            <Button variant="default" onClick={aoConcluir}>
              Cancelar
            </Button>
            <Button
              color={modo === 'ANULAR' ? 'red' : undefined}
              disabled={motivo.trim().length < 5}
              loading={enviar.isPending}
              onClick={() => enviar.mutate()}
            >
              Solicitar {modo === 'ANULAR' ? 'anulação' : 'correção'}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

/** Lançamentos do turno: incorretos em vermelho (riscados) ligados ao corretivo; nada some. */
export function ListaLancamentos({ turno }: { turno: TurnoDetalhe }) {
  const { usuario, pode } = useAutenticacao();
  const [corrigindo, setCorrigindo] = useState<EventoLista | null>(null);
  const podeCorrigir =
    EDITAVEIS.includes(turno.situacao) &&
    pode('correcoes.solicitar') &&
    (usuario?.perfis.includes('LIDER') || turno.apontador.id === usuario?.id);
  const porId = new Map(turno.eventos.map((e) => [e.id, e]));
  const corretivoDe = new Map(
    turno.eventos.filter((e) => e.corrigeEventoId).map((e) => [e.corrigeEventoId!, e]),
  );
  return (
    <>
      <ScrollArea>
        <Table striped verticalSpacing="xs" miw={800}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ocorrência</Table.Th>
              <Table.Th>Máquina</Table.Th>
              <Table.Th>Lançamento</Table.Th>
              <Table.Th>Detalhe</Table.Th>
              <Table.Th>Marcas</Table.Th>
              {podeCorrigir && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {turno.eventos.map((e) => {
              const incorreto = e.situacao === 'INCORRETO';
              const corretivo = corretivoDe.get(e.id);
              const corrige = e.corrigeEventoId ? porId.get(e.corrigeEventoId) : undefined;
              return (
                <Table.Tr
                  key={e.id}
                  data-situacao={e.situacao}
                  style={
                    incorreto
                      ? { color: 'var(--mantine-color-red-7)', textDecoration: 'line-through' }
                      : undefined
                  }
                >
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(e.horaOcorrencia)}</Table.Td>
                  <Table.Td>
                    {turno.maquinas.find((m) => m.maquinaId === e.maquinaId)?.maquina.codigo}
                  </Table.Td>
                  <Table.Td>{ROTULO_TIPO_EVENTO[e.tipo]}</Table.Td>
                  <Table.Td>
                    <Text size="sm" inherit>
                      {e.resumo}
                    </Text>
                    {e.justificativa && (
                      <Text size="xs" c="dimmed">
                        Justificativa: {e.justificativa}
                      </Text>
                    )}
                    {incorreto && (
                      <Text size="xs" c="red" style={{ textDecoration: 'none' }}>
                        Incorreto — fora dos cálculos
                        {corretivo
                          ? ` · corrigido pelo lançamento de ${formatarDataHora(corretivo.horaOcorrencia)}`
                          : ' · anulado'}
                      </Text>
                    )}
                    {corrige && (
                      <Text size="xs" c="teal">
                        Corrige o lançamento de {formatarDataHora(corrige.horaOcorrencia)} ({corrige.resumo})
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {incorreto && <Badge color="red">Incorreto</Badge>}
                      {e.situacao === 'CORRECAO_PENDENTE' && <Badge color="yellow">Correção pendente</Badge>}
                      {corrige && <Badge color="teal">Corretivo</Badge>}
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
                  {podeCorrigir && (
                    <Table.Td>
                      {e.situacao === 'VALIDO' && (
                        <Button size="xs" variant="light" onClick={() => setCorrigindo(e)}>
                          Corrigir
                        </Button>
                      )}
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Modal
        opened={!!corrigindo}
        onClose={() => setCorrigindo(null)}
        size="xl"
        title={
          <Text fw={700} size="lg">
            Solicitar correção
          </Text>
        }
      >
        {corrigindo && (
          <SolicitarCorrecao turno={turno} evento={corrigindo} aoConcluir={() => setCorrigindo(null)} />
        )}
      </Modal>
    </>
  );
}
