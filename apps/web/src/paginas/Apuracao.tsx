import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconDownload, IconFileExport } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  formatarDataCivil,
  formatarDataHora,
  LAYOUTS_EXCEL,
  LAYOUTS_EXPORTACAO,
  ROTULO_SITUACAO_TURNO,
  type LayoutExportacao,
  type SituacaoTurno,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, fmtNumero, notificarErro, notificarSucesso } from '../componentes/utilitarios';

interface TurnoApuracao {
  id: string;
  data: string;
  situacao: SituacaoTurno;
  apontador: { nome: string };
  horarioTurno: { nome: string };
  equipe: { letra: string };
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  apuradoEm: string | null;
  apuradoPor: string | null;
  _count: { divisoes: number; eventos: number };
}

type Linha = Record<string, string | number | null>;
interface Previa {
  turnos: number;
  etiquetas: number;
  naoRecebidas: { codigo: string; quantidade: number; divisao: string }[];
  linhas: Record<LayoutExportacao, Linha[]>;
}
interface LoteExportacao {
  id: string;
  numero: number;
  criadoEm: string;
  turnos: number;
  resumo: Record<string, number>;
  usuario: { nome: string };
}

const TITULO_CURTO: Record<LayoutExportacao, string> = {
  EXPORTACAO_PRODUCAO: 'Produção',
  EXPORTACAO_CONSUMO: 'Consumo',
  EXPORTACAO_PERDAS: 'Perdas',
  EXPORTACAO_ETIQUETAS: 'Etiquetas',
};

function Devolver({ turno, aoConcluir }: { turno: TurnoApuracao; aoConcluir: () => void }) {
  const cliente = useQueryClient();
  const [parecer, setParecer] = useState('');
  const devolver = useMutation({
    mutationFn: () => api.post(`/turnos/${turno.id}/devolver`, { parecer: parecer.trim() }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['apuracao'] });
      notificarSucesso('Turno devolvido ao líder.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        O turno volta para o líder como pendência, com o seu parecer. Depois de corrigido, o líder aprova de
        novo.
      </Text>
      <Textarea
        label="Parecer (divergência encontrada)"
        withAsterisk
        autosize
        minRows={3}
        value={parecer}
        onChange={(e) => setParecer(e.currentTarget.value)}
      />
      <AlertaErroApi erro={devolver.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button
          color="orange"
          disabled={parecer.trim().length < 3}
          loading={devolver.isPending}
          onClick={() => devolver.mutate()}
        >
          Devolver ao líder
        </Button>
      </Group>
    </Stack>
  );
}

function TabelaLinhas({ layout, linhas }: { layout: LayoutExportacao; linhas: Linha[] }) {
  const campos = LAYOUTS_EXCEL[layout].campos.filter((c) => c.campo !== 'loteExportacao');
  if (!linhas.length) return <Text c="dimmed">Nada a exportar neste arquivo.</Text>;
  return (
    <ScrollArea>
      <Table striped withTableBorder miw={900} fz="xs">
        <Table.Thead>
          <Table.Tr>
            {campos.map((c) => (
              <Table.Th key={c.campo}>{c.rotulo}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {linhas.map((l, i) => (
            <Table.Tr key={i}>
              {campos.map((c) => (
                <Table.Td key={c.campo}>
                  {typeof l[c.campo] === 'number' ? fmtNumero(l[c.campo] as number, 3) : (l[c.campo] ?? '')}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

/** Exportação ao ERP: prévia, geração do lote e download dos quatro arquivos (seção 9). */
function Exportacao() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const previa = useQuery({
    queryKey: ['apuracao', 'previa'],
    queryFn: () => api.get<Previa>('/exportacoes/previa'),
  });
  const lotes = useQuery({
    queryKey: ['apuracao', 'lotes'],
    queryFn: () => api.get<LoteExportacao[]>('/exportacoes'),
  });
  const exportar = useMutation({
    mutationFn: () => api.post<LoteExportacao>('/exportacoes', {}),
    onSuccess: (l) => {
      cliente.invalidateQueries({ queryKey: ['apuracao'] });
      cliente.invalidateQueries({ queryKey: ['turnos'] });
      notificarSucesso(`Lote de exportação ${l.numero} gerado. Baixe os arquivos na lista.`);
    },
  });
  const p = previa.data;
  const total = p ? LAYOUTS_EXPORTACAO.reduce((s, l) => s + p.linhas[l].length, 0) : 0;
  return (
    <Stack>
      <AlertaErroApi erro={previa.error} />
      {p && (
        <Card withBorder>
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Próximo lote</Title>
              <Text size="sm" c="dimmed">
                {p.turnos} turno(s) apurado(s) · {p.etiquetas} etiqueta(s) recebida(s) a exportar
              </Text>
            </div>
            {pode('exportacao.executar') && (
              <Button
                leftSection={<IconFileExport size={18} />}
                disabled={total === 0 && p.turnos === 0}
                loading={exportar.isPending}
                onClick={() => exportar.mutate()}
              >
                Exportar
              </Button>
            )}
          </Group>
          <AlertaErroApi erro={exportar.error} />
          {p.naoRecebidas.length > 0 && (
            <Alert
              color="yellow"
              mb="sm"
              title={`${p.naoRecebidas.length} etiqueta(s) ainda não recebida(s) no estoque`}
            >
              Ficam para um próximo lote, depois do recebimento:{' '}
              {p.naoRecebidas.map((e) => `${e.codigo} (${e.divisao})`).join(', ')}
            </Alert>
          )}
          <Tabs defaultValue="EXPORTACAO_PRODUCAO">
            <Tabs.List>
              {LAYOUTS_EXPORTACAO.map((l) => (
                <Tabs.Tab key={l} value={l}>
                  {TITULO_CURTO[l]} ({p.linhas[l].length})
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {LAYOUTS_EXPORTACAO.map((l) => (
              <Tabs.Panel key={l} value={l} pt="sm">
                <TabelaLinhas layout={l} linhas={p.linhas[l]} />
              </Tabs.Panel>
            ))}
          </Tabs>
        </Card>
      )}
      <Title order={4}>Lotes exportados</Title>
      <AlertaErroApi erro={lotes.error} />
      {lotes.data?.length === 0 && <Text c="dimmed">Nenhum lote exportado ainda.</Text>}
      {!!lotes.data?.length && (
        <ScrollArea>
          <Table striped miw={800}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Lote</Table.Th>
                <Table.Th>Gerado em</Table.Th>
                <Table.Th>Por</Table.Th>
                <Table.Th>Turnos</Table.Th>
                <Table.Th>Arquivos</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lotes.data.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td fw={700}>{l.numero}</Table.Td>
                  <Table.Td>{formatarDataHora(l.criadoEm)}</Table.Td>
                  <Table.Td>{l.usuario.nome}</Table.Td>
                  <Table.Td>{l.turnos}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {LAYOUTS_EXPORTACAO.map((layout) => (
                        <Button
                          key={layout}
                          size="compact-xs"
                          variant="light"
                          leftSection={<IconDownload size={12} />}
                          onClick={() =>
                            api
                              .baixar(
                                `/exportacoes/${l.numero}/arquivos/${layout}`,
                                `exportacao-${l.numero}-${layout.replace('EXPORTACAO_', '').toLowerCase()}.xlsx`,
                              )
                              .catch(notificarErro)
                          }
                        >
                          {TITULO_CURTO[layout]} ({l.resumo[layout] ?? 0})
                        </Button>
                      ))}
                    </Group>
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

/** Apuração do PCP: só turnos com relatório aprovado pelo líder (RN-13); depois, exportação ao ERP. */
export function PaginaApuracao() {
  const { pode } = useAutenticacao();
  const cliente = useQueryClient();
  const [devolvendo, setDevolvendo] = useState<TurnoApuracao | null>(null);
  const turnos = useQuery({
    queryKey: ['apuracao', 'turnos'],
    queryFn: () => api.get<TurnoApuracao[]>('/apuracao/turnos'),
  });
  const apurar = useMutation({
    mutationFn: (id: string) => api.post(`/turnos/${id}/apurar`, {}),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['apuracao'] });
      notificarSucesso('Turno apurado; entra no próximo lote de exportação.');
    },
    onError: (e) => notificarErro(e),
  });
  const executa = pode('apuracao.executar');
  const lista = turnos.data ?? [];
  return (
    <Stack>
      <Title order={2}>Apuração e exportação</Title>
      <Tabs defaultValue="apuracao" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="apuracao">
            Apuração ({lista.filter((t) => t.situacao === 'APROVADO').length})
          </Tabs.Tab>
          <Tabs.Tab value="exportacao">Exportação</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="apuracao" pt="md">
          <Stack>
            <Text size="sm" c="dimmed">
              Aparecem aqui só os turnos com relatório aprovado pelo líder. Confira o relatório e apure, ou
              devolva ao líder com parecer se houver divergência.
            </Text>
            <AlertaErroApi erro={turnos.error} />
            {lista.length === 0 && <Alert color="blue">Nenhum turno aprovado aguardando apuração.</Alert>}
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              {lista.map((t) => (
                <Card key={t.id} withBorder data-turno={t.id}>
                  <Group justify="space-between">
                    <div>
                      <Text fw={700}>
                        {t.horarioTurno.nome} {formatarDataCivil(t.data)} · Equipe {t.equipe.letra}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Apontador {t.apontador.nome} · {t._count.divisoes} OP(s) · {t._count.eventos}{' '}
                        lançamento(s)
                      </Text>
                      <Text size="xs" c="dimmed">
                        Aprovado por {t.aprovadoPor} em {formatarDataHora(t.aprovadoEm)}
                        {t.apuradoEm
                          ? ` · apurado por ${t.apuradoPor} em ${formatarDataHora(t.apuradoEm)}`
                          : ''}
                      </Text>
                    </div>
                    <Badge color={t.situacao === 'APURADO' ? 'grape' : 'teal'}>
                      {ROTULO_SITUACAO_TURNO[t.situacao]}
                    </Badge>
                  </Group>
                  <Group mt="sm" gap="xs">
                    <Button size="xs" variant="default" component={Link} to={`/turnos/${t.id}/relatorio`}>
                      Relatório
                    </Button>
                    {executa && (
                      <>
                        {t.situacao === 'APROVADO' && (
                          <Button
                            size="xs"
                            color="grape"
                            loading={apurar.isPending && apurar.variables === t.id}
                            onClick={() => apurar.mutate(t.id)}
                          >
                            Apurar
                          </Button>
                        )}
                        <Button size="xs" color="orange" variant="light" onClick={() => setDevolvendo(t)}>
                          Devolver ao líder
                        </Button>
                      </>
                    )}
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="exportacao" pt="md">
          <Exportacao />
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={!!devolvendo}
        onClose={() => setDevolvendo(null)}
        title={<Text fw={700}>Devolver ao líder</Text>}
      >
        {devolvendo && <Devolver turno={devolvendo} aoConcluir={() => setDevolvendo(null)} />}
      </Modal>
    </Stack>
  );
}
