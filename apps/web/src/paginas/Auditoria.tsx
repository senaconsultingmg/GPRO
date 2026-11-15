import { useState } from 'react';
import {
  Badge,
  Code,
  Group,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { formatarDataHora } from '@apontamento/shared';
import { api } from '../api/cliente';
import { AlertaErroApi } from '../componentes/utilitarios';

interface ItemAuditoria {
  id: string;
  usuarioLogin: string | null;
  dataHora: string;
  entidade: string;
  entidadeId: string | null;
  acao: string;
  valorAnterior: Record<string, unknown> | null;
  valorNovo: Record<string, unknown> | null;
}

const exibir = (v: unknown) =>
  v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);

function Alteracoes({ item }: { item: ItemAuditoria }) {
  const chaves = [
    ...new Set([...Object.keys(item.valorAnterior ?? {}), ...Object.keys(item.valorNovo ?? {})]),
  ];
  if (chaves.length === 0)
    return (
      <Text size="xs" c="dimmed">
        —
      </Text>
    );
  return (
    <Stack gap={2}>
      {chaves.map((k) => (
        <Text size="xs" key={k}>
          <Text span fw={600}>
            {k}:
          </Text>{' '}
          {item.valorAnterior && (
            <>
              <Code color="red.1">{exibir(item.valorAnterior[k])}</Code> →{' '}
            </>
          )}
          <Code color="green.1">{exibir(item.valorNovo?.[k])}</Code>
        </Text>
      ))}
    </Stack>
  );
}

export function PaginaAuditoria() {
  const [entidade, setEntidade] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [periodo, setPeriodo] = useState<[string | null, string | null]>([null, null]);
  const [pagina, setPagina] = useState(1);
  const entidades = useQuery({
    queryKey: ['auditoria', 'entidades'],
    queryFn: () => api.get<string[]>('/auditoria/entidades'),
  });

  const params = new URLSearchParams({ pagina: String(pagina), tamanho: '50' });
  if (entidade) params.set('entidade', entidade);
  if (usuario.trim()) params.set('usuario', usuario.trim());
  // Período em data local de São Paulo (UTC−03:00).
  if (periodo[0]) params.set('de', `${periodo[0]}T00:00:00-03:00`);
  if (periodo[1]) params.set('ate', `${periodo[1]}T23:59:59.999-03:00`);
  const { data, error, isLoading } = useQuery({
    queryKey: ['auditoria', params.toString()],
    queryFn: () => api.get<{ total: number; itens: ItemAuditoria[] }>(`/auditoria?${params}`),
  });
  const paginas = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <Stack>
      <Title order={2}>Auditoria</Title>
      <Group align="flex-end">
        <Select
          label="Entidade"
          placeholder="Todas"
          clearable
          data={entidades.data ?? []}
          value={entidade}
          onChange={(v) => {
            setEntidade(v);
            setPagina(1);
          }}
          w={220}
        />
        <TextInput
          label="Usuário"
          placeholder="login"
          value={usuario}
          onChange={(e) => {
            setUsuario(e.currentTarget.value);
            setPagina(1);
          }}
          w={220}
        />
        <DatePickerInput
          type="range"
          label="Período"
          valueFormat="DD/MM/YYYY"
          clearable
          value={periodo}
          onChange={(v) => {
            setPeriodo(v as [string | null, string | null]);
            setPagina(1);
          }}
          w={260}
        />
        <Text size="sm" c="dimmed">
          {data?.total ?? 0} registros
        </Text>
      </Group>
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped verticalSpacing="xs" miw={900}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data/hora</Table.Th>
              <Table.Th>Usuário</Table.Th>
              <Table.Th>Entidade</Table.Th>
              <Table.Th>Ação</Table.Th>
              <Table.Th>Valor anterior → novo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>Carregando…</Table.Td>
              </Table.Tr>
            )}
            {data?.itens.map((i) => (
              <Table.Tr key={i.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(i.dataHora)}</Table.Td>
                <Table.Td>
                  {i.usuarioLogin ?? (
                    <Text c="dimmed" size="sm">
                      sistema
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{i.entidade}</Text>
                  {i.entidadeId && (
                    <Text size="xs" c="dimmed" ff="monospace">
                      {i.entidadeId.slice(0, 8)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{i.acao}</Badge>
                </Table.Td>
                <Table.Td>
                  <Alteracoes item={i} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Pagination value={pagina} onChange={setPagina} total={paginas} />
    </Stack>
  );
}
