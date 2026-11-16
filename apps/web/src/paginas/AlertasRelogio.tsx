import { Alert, Badge, Button, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDataHora } from '@apontamento/shared';
import { api } from '../api/cliente';
import { AlertaErroApi } from '../componentes/utilitarios';

interface AlertaRelogio {
  id: string;
  aparelho: string;
  diferencaSeg: number;
  maiorSeg: number;
  ocorrencias: number;
  primeiraEm: string;
  ultimaEm: string;
  resolvido: boolean;
  usuario: { nome: string; login: string } | null;
}

const duracao = (seg: number) => {
  const s = Math.abs(seg);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${seg >= 0 ? 'adiantado' : 'atrasado'} ${h ? `${h} h ` : ''}${m} min`;
};

/** Seção 11 — tablets com relógio diferente do servidor (horas de registro offline podem estar erradas). */
export function PaginaAlertasRelogio() {
  const cliente = useQueryClient();
  const lista = useQuery({
    queryKey: ['alertas-relogio'],
    queryFn: () => api.get<AlertaRelogio[]>('/offline/alertas-relogio'),
  });
  const resolver = useMutation({
    mutationFn: (id: string) => api.post(`/offline/alertas-relogio/${id}/resolver`, {}),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['alertas-relogio'] }),
  });
  return (
    <Stack>
      <Title order={2}>Alertas de relógio</Title>
      <Text size="sm" c="dimmed">
        Tablets cujo relógio difere do servidor além do parâmetro "alerta_diferenca_relogio_min". A hora do
        registro dos lançamentos offline é a do tablet: acerte o relógio do aparelho.
      </Text>
      <AlertaErroApi erro={lista.error ?? resolver.error} />
      {lista.data?.length === 0 && <Alert color="green">Nenhum alerta.</Alert>}
      {!!lista.data?.length && (
        <ScrollArea>
          <Table striped miw={800}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Aparelho</Table.Th>
                <Table.Th>Último usuário</Table.Th>
                <Table.Th>Diferença atual</Table.Th>
                <Table.Th>Maior diferença</Table.Th>
                <Table.Th>Ocorrências</Table.Th>
                <Table.Th>Última</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.data.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td ff="monospace" fz="xs">
                    {a.aparelho}
                  </Table.Td>
                  <Table.Td>{a.usuario?.nome ?? '—'}</Table.Td>
                  <Table.Td>{duracao(a.diferencaSeg)}</Table.Td>
                  <Table.Td>{duracao(a.maiorSeg)}</Table.Td>
                  <Table.Td>{a.ocorrencias}</Table.Td>
                  <Table.Td>{formatarDataHora(a.ultimaEm)}</Table.Td>
                  <Table.Td>
                    {a.resolvido ? (
                      <Badge color="green">Resolvido</Badge>
                    ) : (
                      <Button
                        size="xs"
                        variant="light"
                        loading={resolver.isPending && resolver.variables === a.id}
                        onClick={() => resolver.mutate(a.id)}
                      >
                        Marcar como resolvido
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}
