import { useState } from 'react';
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarDataHora } from '@apontamento/shared';
import { api } from '../api/cliente';
import { AlertaErroApi, notificarErro, notificarSucesso } from '../componentes/utilitarios';

interface Parametro {
  chave: string;
  valor: string;
  tipo: 'INTEIRO' | 'DECIMAL' | 'TEXTO' | 'BOOLEANO' | 'LISTA';
  opcoes: string[];
  descricao: string;
  atualizadoEm: string;
}

const ROTULO_OPCAO: Record<string, string> = {
  PENDENTES: 'Só pendentes',
  RECEBIDAS: 'Só recebidas',
  AMBAS: 'Ambas',
};

function LinhaParametro({ p }: { p: Parametro }) {
  const cliente = useQueryClient();
  const [valor, setValor] = useState(p.valor);
  const salvar = useMutation({
    mutationFn: () => api.put(`/parametros/${p.chave}`, { valor }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['parametros'] });
      notificarSucesso('Parâmetro salvo.');
    },
    onError: (e) => notificarErro(e),
  });
  let campo;
  switch (p.tipo) {
    case 'INTEIRO':
    case 'DECIMAL':
      campo = (
        <NumberInput
          aria-label={p.chave}
          value={valor}
          onChange={(v) => setValor(String(v))}
          allowDecimal={p.tipo === 'DECIMAL'}
          decimalSeparator=","
          w={140}
        />
      );
      break;
    case 'BOOLEANO':
      campo = (
        <Switch
          aria-label={p.chave}
          checked={valor === 'true'}
          onChange={(e) => setValor(String(e.currentTarget.checked))}
        />
      );
      break;
    case 'LISTA':
      campo = (
        <Select
          aria-label={p.chave}
          data={p.opcoes.map((o) => ({ value: o, label: ROTULO_OPCAO[o] ?? o }))}
          value={valor}
          onChange={(v) => v && setValor(v)}
          allowDeselect={false}
          w={200}
        />
      );
      break;
    default:
      campo = (
        <TextInput aria-label={p.chave} value={valor} onChange={(e) => setValor(e.currentTarget.value)} />
      );
  }
  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={600} ff="monospace" size="sm">
          {p.chave}
        </Text>
        <Text size="sm" c="dimmed" maw={520}>
          {p.descricao}
        </Text>
      </Table.Td>
      <Table.Td>{campo}</Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed">
          {formatarDataHora(p.atualizadoEm)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Button
          size="xs"
          disabled={valor === p.valor}
          loading={salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          Salvar
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

export function PaginaParametros() {
  const { data = [], error } = useQuery({
    queryKey: ['parametros'],
    queryFn: () => api.get<Parametro[]>('/parametros'),
  });
  return (
    <Stack>
      <Group>
        <div>
          <Title order={2}>Parâmetros do sistema</Title>
          <Text c="dimmed" size="sm">
            Limites parametrizáveis usados pelas regras de negócio. Toda alteração fica na auditoria.
          </Text>
        </div>
      </Group>
      <AlertaErroApi erro={error} />
      <Table verticalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Parâmetro</Table.Th>
            <Table.Th>Valor</Table.Th>
            <Table.Th>Alterado em</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((p) => (
            <LinhaParametro key={`${p.chave}-${p.valor}`} p={p} />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
