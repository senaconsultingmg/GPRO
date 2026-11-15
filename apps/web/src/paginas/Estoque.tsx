import { useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconBarcode, IconCheck } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarDataCivil,
  formatarDataHora,
  ROTULO_SITUACAO_ETIQUETA,
  ROTULO_UNIDADE,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista } from '../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../componentes/utilitarios';
import { COR_SITUACAO_ETIQUETA, type EtiquetaLista } from './Etiquetas';

interface EtiquetaDetalhe extends EtiquetaLista {
  divisao: {
    codigo: string;
    ordem: { numeroErp: string | null; numeroInterno: number };
    maquina: { codigo: string };
  } | null;
  turno: { data: string; horarioTurno: { nome: string }; equipe: { letra: string } } | null;
}

const ROTULO_VISAO: Record<string, string> = {
  PENDENTES: 'só pendentes',
  RECEBIDAS: 'só recebidas',
  AMBAS: 'pendentes e recebidas',
};

function Recebimento() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const { data: locais = [] } = useLista('locais-estoque', true);
  const [leitura, setLeitura] = useState('');
  const [localId, setLocalId] = useState<string | null>(null);
  const [lida, setLida] = useState<EtiquetaDetalhe | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useQuery({
    queryKey: ['estoque', 'recebimento'],
    queryFn: () => api.get<{ visao: string; etiquetas: EtiquetaDetalhe[] }>('/estoque/recebimento'),
  });
  const consultar = useMutation({
    mutationFn: (codigo: string) =>
      api.get<EtiquetaDetalhe>(`/estoque/leitura?codigo=${encodeURIComponent(codigo)}`),
    onSuccess: setLida,
    onError: () => setLida(null),
  });
  const receber = useMutation({
    mutationFn: () =>
      api.post<EtiquetaDetalhe>('/estoque/receber', {
        leitura: lida!.codigo,
        localEstoqueId: localEscolhido,
      }),
    onSuccess: (e) => {
      notificarSucesso(`Etiqueta ${e.codigo} recebida em ${e.localEstoque?.nome}.`);
      setLida(null);
      setLeitura('');
      cliente.invalidateQueries({ queryKey: ['estoque'] });
      campo.current?.focus();
    },
  });
  const locaisPa = locais.filter((l) => l.tipo === 'PRODUTO_ACABADO');
  const localEscolhido = localId ?? locaisPa[0]?.id ?? null;
  return (
    <Stack>
      <Card withBorder>
        <Stack>
          <Select
            label="Local de estoque"
            size="lg"
            data={locaisPa.map((l) => ({ value: l.id, label: l.nome as string }))}
            value={localEscolhido}
            onChange={setLocalId}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (leitura.trim()) consultar.mutate(leitura.trim());
            }}
          >
            <TextInput
              ref={campo}
              autoFocus
              label="Leitura da etiqueta"
              description="Leia o código de barras ou digite o código (ex.: T3-0001245) e tecle Enter."
              size="xl"
              leftSection={<IconBarcode />}
              value={leitura}
              onChange={(e) => setLeitura(e.currentTarget.value)}
            />
          </form>
          <AlertaErroApi erro={consultar.error} />
          {lida && (
            <Alert color="blue" title={`Etiqueta ${lida.codigo}`}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={4}>
                <Text>
                  <b>Produto:</b> {lida.produto.codigo} — {lida.produto.descricao}
                </Text>
                <Text>
                  <b>Quantidade:</b> {fmtNumero(lida.quantidade)} {ROTULO_UNIDADE[lida.unidade]}{' '}
                  {lida.avulso && (
                    <Badge color="orange" variant="filled">
                      AVULSO
                    </Badge>
                  )}
                </Text>
                <Text>
                  <b>OP:</b>{' '}
                  {lida.divisao
                    ? `${lida.divisao.ordem.numeroErp ?? '—'} (nº ${lida.divisao.ordem.numeroInterno}) · ${lida.divisao.codigo}`
                    : '—'}
                </Text>
                <Text>
                  <b>Turno:</b>{' '}
                  {lida.turno
                    ? `${formatarDataCivil(lida.turno.data.slice(0, 10))} ${lida.turno.horarioTurno.nome} · equipe ${lida.turno.equipe.letra}`
                    : '—'}
                </Text>
              </SimpleGrid>
              {pode('estoque.receber') && (
                <Button
                  mt="md"
                  size="xl"
                  color="green"
                  leftSection={<IconCheck />}
                  disabled={!localEscolhido}
                  loading={receber.isPending}
                  onClick={() => receber.mutate()}
                >
                  Confirmar recebimento
                </Button>
              )}
              {!localEscolhido && (
                <Text size="sm" c="red" mt={4}>
                  Escolha o local de estoque.
                </Text>
              )}
            </Alert>
          )}
          <AlertaErroApi erro={receber.error} />
        </Stack>
      </Card>
      <Title order={4}>
        Etiquetas de produto ({ROTULO_VISAO[lista.data?.visao ?? 'AMBAS']}, últimos 30 dias)
      </Title>
      <ScrollArea>
        <Table striped miw={800}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Código</Table.Th>
              <Table.Th>Produto</Table.Th>
              <Table.Th>Quantidade</Table.Th>
              <Table.Th>Divisão</Table.Th>
              <Table.Th>Emitida</Table.Th>
              <Table.Th>Situação</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.data?.etiquetas.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td ff="monospace">{e.codigo}</Table.Td>
                <Table.Td>{e.produto.codigo}</Table.Td>
                <Table.Td>
                  {fmtNumero(e.quantidade)} {ROTULO_UNIDADE[e.unidade]}
                </Table.Td>
                <Table.Td>{e.divisao?.codigo ?? '—'}</Table.Td>
                <Table.Td>{formatarDataHora(e.emitidaEm)}</Table.Td>
                <Table.Td>
                  <Badge color={COR_SITUACAO_ETIQUETA[e.situacao]}>
                    {ROTULO_SITUACAO_ETIQUETA[e.situacao]}
                  </Badge>{' '}
                  {e.localEstoque?.nome}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

interface SaldoLocal {
  local: { id: string; nome: string; tipo: string };
  produtos: {
    produto?: { codigo: string; descricao: string; unidade: Unidade };
    saldo: number;
    etiquetas: number;
  }[];
  lotes: { lote?: { numero: string; material: { codigo: string } }; saldo: number }[];
}

export function Saldos() {
  const { data = [], error } = useQuery({
    queryKey: ['estoque', 'saldos'],
    queryFn: () => api.get<SaldoLocal[]>('/estoque/saldos'),
  });
  return (
    <Stack>
      <AlertaErroApi erro={error} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {data.map((s) => (
          <Card key={s.local.id} withBorder>
            <Title order={5}>{s.local.nome}</Title>
            {s.produtos.length === 0 && s.lotes.length === 0 && (
              <Text c="dimmed" size="sm">
                Sem saldo.
              </Text>
            )}
            <Table>
              <Table.Tbody>
                {s.produtos.map((p, i) => (
                  <Table.Tr key={`p${i}`}>
                    <Table.Td>{p.produto?.codigo}</Table.Td>
                    <Table.Td>{p.produto?.descricao}</Table.Td>
                    <Table.Td ta="right">
                      {fmtNumero(p.saldo, 3)} {p.produto ? ROTULO_UNIDADE[p.produto.unidade] : ''}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {s.lotes.map((l, i) => (
                  <Table.Tr key={`l${i}`}>
                    <Table.Td>{l.lote?.material.codigo}</Table.Td>
                    <Table.Td>lote {l.lote?.numero}</Table.Td>
                    <Table.Td ta="right">{fmtNumero(l.saldo, 3)} kg</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export function PaginaEstoque() {
  return (
    <Stack>
      <Title order={2}>Estoque</Title>
      <Tabs defaultValue="receber">
        <Tabs.List>
          <Tabs.Tab value="receber">Recebimento</Tabs.Tab>
          <Tabs.Tab value="saldos">Saldo por local</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="receber" pt="md">
          <Recebimento />
        </Tabs.Panel>
        <Tabs.Panel value="saldos" pt="md">
          <Saldos />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
