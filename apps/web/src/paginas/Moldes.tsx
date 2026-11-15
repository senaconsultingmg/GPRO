import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  List,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconListDetails } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULO_TIPO_MAQUINA, type ResultadoCompatibilidade, type TipoMaquina } from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { configMoldes } from '../cadastros/configuracoes';
import { PaginaCadastro, useLista, type Registro } from '../componentes/PaginaCadastro';
import { AlertaErroApi, notificarSucesso } from '../componentes/utilitarios';

interface Cavidade {
  numero: number;
  produtoId: string | null;
}

interface ItemCompatibilidade extends ResultadoCompatibilidade {
  maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
}

function DetalheMolde({ molde }: { molde: Registro }) {
  const { pode } = useAutenticacao();
  const podeEscrever = pode('cadastros.escrever');
  const cliente = useQueryClient();
  const { data: produtos = [] } = useLista('produtos');
  const [cavidades, setCavidades] = useState<Cavidade[]>(
    (molde.cavidades as Cavidade[]).map((c) => ({ numero: c.numero, produtoId: c.produtoId })),
  );
  const compat = useQuery({
    queryKey: ['moldes', molde.id, 'compatibilidade'],
    queryFn: () => api.get<ItemCompatibilidade[]>(`/moldes/${molde.id}/compatibilidade`),
  });
  const salvar = useMutation({
    mutationFn: () => api.put(`/moldes/${molde.id}/cavidades`, { cavidades }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['moldes'] });
      notificarSucesso('Cavidades salvas.');
    },
  });
  const opcoesProduto = produtos
    .filter((p) => p.unidade === 'PECA' && (p.ativo || cavidades.some((c) => c.produtoId === p.id)))
    .map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }));

  return (
    <Stack>
      <Title order={4}>Cavidades</Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={90}>Cavidade</Table.Th>
            <Table.Th>Produto que ela produz</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {cavidades.map((c) => (
            <Table.Tr key={c.numero}>
              <Table.Td>{c.numero}</Table.Td>
              <Table.Td>
                <Select
                  aria-label={`Produto da cavidade ${c.numero}`}
                  data={opcoesProduto}
                  value={c.produtoId}
                  searchable
                  clearable
                  readOnly={!podeEscrever}
                  onChange={(v) =>
                    setCavidades(cavidades.map((x) => (x.numero === c.numero ? { ...x, produtoId: v } : x)))
                  }
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <AlertaErroApi erro={salvar.error} />
      {podeEscrever && (
        <Button onClick={() => salvar.mutate()} loading={salvar.isPending} w="fit-content">
          Salvar cavidades
        </Button>
      )}

      <Title order={4} mt="md">
        Compatibilidade com as máquinas
      </Title>
      <AlertaErroApi erro={compat.error} />
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Máquina</Table.Th>
            <Table.Th miw={170}>Situação</Table.Th>
            <Table.Th>Critério que falhou</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {compat.data?.map((item) => (
            <Table.Tr key={item.maquina.id}>
              <Table.Td>
                <Text fw={600}>{item.maquina.codigo}</Text>
                <Text size="xs" c="dimmed">
                  {item.maquina.descricao} · {ROTULO_TIPO_MAQUINA[item.maquina.tipo]}
                </Text>
              </Table.Td>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>
                {item.compativel ? (
                  <Badge color="green" tt="none" size="lg" styles={{ label: { overflow: 'visible' } }}>
                    Compatível{item.exigeGiro ? ' (girado 90°)' : ''}
                  </Badge>
                ) : (
                  <Badge color="red" tt="none" size="lg" styles={{ label: { overflow: 'visible' } }}>
                    Incompatível
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                {item.falhas.length > 0 && (
                  <List size="sm">
                    {item.falhas.map((f) => (
                      <List.Item key={f.criterio}>{f.mensagem}</List.Item>
                    ))}
                  </List>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function PaginaMoldes() {
  const [selecionado, setSelecionado] = useState<Registro | null>(null);
  return (
    <>
      <PaginaCadastro
        config={{
          ...configMoldes,
          acoesExtras: (r) => (
            <Tooltip label="Cavidades e máquinas compatíveis">
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Cavidades e compatibilidade"
                onClick={() => setSelecionado(r)}
              >
                <IconListDetails size={18} />
              </ActionIcon>
            </Tooltip>
          ),
        }}
      />
      <Drawer
        opened={!!selecionado}
        onClose={() => setSelecionado(null)}
        position="right"
        size="xl"
        title={
          <Group>
            <Text fw={700}>{selecionado?.codigo as string}</Text>
            <Text c="dimmed">{selecionado?.descricao as string}</Text>
          </Group>
        }
      >
        {selecionado && <DetalheMolde key={selecionado.id} molde={selecionado} />}
      </Drawer>
    </>
  );
}
