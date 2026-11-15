import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconPrinter, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarDataHora,
  ROTULO_SITUACAO_ETIQUETA,
  ROTULO_TIPO_ETIQUETA,
  ROTULO_UNIDADE,
  type SituacaoEtiqueta,
  type TipoEtiqueta,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { imprimirComAviso } from '../componentes/notificarImpressao';
import { AlertaErroApi, fmtNumero } from '../componentes/utilitarios';

export interface EtiquetaLista {
  id: string;
  codigo: string;
  tipo: TipoEtiqueta;
  quantidade: number;
  unidade: Unidade;
  situacao: SituacaoEtiqueta;
  impressaoPendente: boolean;
  reimpressoes: number;
  avulso: boolean;
  emitidaEm: string;
  produto: { codigo: string; descricao: string };
  lote: { numero: string } | null;
  divisao: { codigo: string } | null;
  responsavel: { nome: string };
  localEstoque: { nome: string } | null;
}

export const COR_SITUACAO_ETIQUETA: Record<SituacaoEtiqueta, string> = {
  EMITIDA: 'blue',
  RECEBIDA: 'green',
  CONSUMIDA: 'grape',
  EXPORTADA: 'gray',
  CANCELADA: 'red',
};

export function PaginaEtiquetas() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState(false);
  const params = new URLSearchParams();
  if (busca.trim()) params.set('busca', busca.trim());
  if (tipo) params.set('tipo', tipo);
  if (pendentes) params.set('pendentes', 'true');
  const { data = [], error } = useQuery({
    queryKey: ['etiquetas', params.toString()],
    queryFn: () => api.get<EtiquetaLista[]>(`/etiquetas?${params}`),
  });
  const imprimir = useMutation({
    mutationFn: (lista: EtiquetaLista[]) => imprimirComAviso(lista),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['etiquetas'] }),
  });
  const podeImprimir = pode('etiquetas.imprimir');
  const listaPendentes = data.filter((e) => e.impressaoPendente && e.situacao !== 'CANCELADA');
  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Etiquetas</Title>
          <Text c="dimmed" size="sm">
            Código único com código de barras GS1-128. Reimpressão sai como "2ª via" e fica registrada.
          </Text>
        </div>
        {podeImprimir && listaPendentes.length > 0 && (
          <Button
            color="orange"
            leftSection={<IconPrinter size={18} />}
            loading={imprimir.isPending}
            onClick={() => imprimir.mutate(listaPendentes)}
          >
            Reenviar {listaPendentes.length} pendente(s)
          </Button>
        )}
      </Group>
      <Group>
        <TextInput
          placeholder="Leia ou digite o código, produto, lote ou divisão"
          leftSection={<IconSearch size={16} />}
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
          w={380}
        />
        <Select
          placeholder="Tipo"
          clearable
          value={tipo}
          onChange={setTipo}
          data={Object.entries(ROTULO_TIPO_ETIQUETA).map(([value, label]) => ({ value, label }))}
          w={260}
        />
        <Switch
          label="Só impressão pendente"
          checked={pendentes}
          onChange={(e) => setPendentes(e.currentTarget.checked)}
        />
      </Group>
      <AlertaErroApi erro={error} />
      <ScrollArea>
        <Table striped verticalSpacing="xs" miw={1000}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Código</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Produto / material</Table.Th>
              <Table.Th>Quantidade</Table.Th>
              <Table.Th>OP / lote</Table.Th>
              <Table.Th>Emitida</Table.Th>
              <Table.Th>Situação</Table.Th>
              <Table.Th>Impressão</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Text ff="monospace" fw={700}>
                    {e.codigo}
                  </Text>
                  {e.avulso && (
                    <Badge color="orange" variant="filled">
                      AVULSO
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{ROTULO_TIPO_ETIQUETA[e.tipo]}</Table.Td>
                <Table.Td>
                  {e.produto.codigo}
                  <Text size="xs" c="dimmed">
                    {e.produto.descricao}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {fmtNumero(e.quantidade, 3)} {ROTULO_UNIDADE[e.unidade]}
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {e.divisao?.codigo ?? e.lote?.numero ?? '—'}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatarDataHora(e.emitidaEm)}</Text>
                  <Text size="xs" c="dimmed">
                    {e.responsavel.nome}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={COR_SITUACAO_ETIQUETA[e.situacao]}>
                    {ROTULO_SITUACAO_ETIQUETA[e.situacao]}
                  </Badge>
                  {e.localEstoque && (
                    <Text size="xs" c="dimmed">
                      {e.localEstoque.nome}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {e.impressaoPendente ? (
                    <Badge color="orange">Pendente</Badge>
                  ) : (
                    <Badge color="green" variant="light">
                      Impressa
                    </Badge>
                  )}
                  {e.reimpressoes > 0 && (
                    <Text size="xs" c="dimmed">
                      {e.reimpressoes} reimpressão(ões)
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {podeImprimir && e.situacao !== 'CANCELADA' && (
                    <Tooltip label={e.impressaoPendente ? 'Imprimir' : 'Reimprimir (2ª via)'}>
                      <ActionIcon
                        size="lg"
                        variant="light"
                        aria-label={`Imprimir ${e.codigo}`}
                        onClick={() => imprimir.mutate([e])}
                      >
                        <IconPrinter size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
