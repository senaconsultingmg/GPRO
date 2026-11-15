import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { BarChart, LineChart } from '@mantine/charts';
import { IconAlertTriangle, IconFileSpreadsheet } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  formatarDataCivil,
  ROTULO_TIPO_MAQUINA,
  ROTULO_UNIDADE,
  TIPOS_MAQUINA,
  type Unidade,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useLista } from '../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarErro } from '../componentes/utilitarios';

type Valor = string | number | boolean | null;
type Linha = Record<string, Valor>;
interface Coluna {
  chave: string;
  rotulo: string;
  formato?: 'texto' | 'numero' | 'percentual';
  casas?: number;
}
interface Fatores {
  horasLigado: number;
  horasPlanejado: number;
  horasProduzindo: number;
  producaoEsperada: number;
  boas: number;
  refugadas: number;
  producaoTotal: number;
  disponibilidade: number | null;
  performance: number | null;
  qualidade: number | null;
  oee: number | null;
  alertaPerformance: boolean;
  phReal: number | null;
}
interface Indicadores {
  filtros: { granularidade: 'DIA' | 'MES' };
  turnos: number;
  parciais: number;
  totais: (Fatores & { unidade: Unidade })[];
  oeeMaquinas: (Fatores & { maquina: string; tipo: string; unidade: Unidade; turnos: number })[];
  evolucao: (Fatores & { periodo: string; unidade: Unidade })[];
  producaoMaquinaProduto: Linha[];
  producaoProduto: Linha[];
  ph: Linha[];
  paradas: (Linha & { motivo: string; programada: boolean; minutos: number })[];
  perdas: Linha[];
  consumo: Linha[];
  equipes: (Fatores & { nome: string; unidade: Unidade; turnos: number })[];
  horarios: (Fatores & { nome: string; unidade: Unidade; turnos: number })[];
}

// Paleta categórica validada (ordem fixa): OEE, Disponibilidade, Performance, Qualidade.
const COR = { oee: '#2a78d6', disponibilidade: '#eb6834', performance: '#1baf7a', qualidade: '#eda100' };

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const pct = (v: Valor) => (typeof v === 'number' ? `${fmtNumero(v * 100, 1)}%` : '—');

function formatar(v: Valor, c: Coluna) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (c.formato === 'percentual') return pct(v);
  if (typeof v === 'number') return fmtNumero(v, c.casas ?? 2);
  return v;
}

/** Tabela do painel com exportação para Excel (seção 10). */
function TabelaIndicador({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: Coluna[];
  linhas: Linha[];
}) {
  const [baixando, setBaixando] = useState(false);
  const exportar = async () => {
    setBaixando(true);
    try {
      const nome = titulo
        .normalize('NFD')
        .replace(/[^\w -]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
      await api.baixar('/indicadores/exportar', `${nome}.xlsx`, {
        titulo,
        colunas: colunas.map(({ chave, rotulo, formato }) => ({
          chave,
          rotulo,
          formato: formato ?? 'texto',
        })),
        linhas: linhas.map((l) => Object.fromEntries(colunas.map((c) => [c.chave, l[c.chave] ?? null]))),
      });
    } catch (e) {
      notificarErro(e);
    } finally {
      setBaixando(false);
    }
  };
  return (
    <Card withBorder data-tabela={titulo}>
      <Group justify="space-between" mb="xs">
        <Title order={4}>{titulo}</Title>
        <Button
          size="xs"
          variant="light"
          color="green"
          leftSection={<IconFileSpreadsheet size={14} />}
          disabled={!linhas.length}
          loading={baixando}
          onClick={exportar}
          aria-label={`Exportar ${titulo} para Excel`}
        >
          Excel
        </Button>
      </Group>
      {linhas.length === 0 ? (
        <Text c="dimmed" size="sm">
          Sem dados no período.
        </Text>
      ) : (
        <ScrollArea>
          <Table striped verticalSpacing={4} fz="sm" miw={colunas.length * 90}>
            <Table.Thead>
              <Table.Tr>
                {colunas.map((c) => (
                  <Table.Th key={c.chave} ta={c.formato && c.formato !== 'texto' ? 'right' : undefined}>
                    {c.rotulo}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {linhas.map((l, i) => (
                <Table.Tr key={i}>
                  {colunas.map((c) => (
                    <Table.Td key={c.chave} ta={c.formato && c.formato !== 'texto' ? 'right' : undefined}>
                      {formatar(l[c.chave], c)}
                      {c.chave === 'performance' && l.alertaPerformance === true && (
                        <IconAlertTriangle
                          size={14}
                          color="var(--mantine-color-orange-6)"
                          style={{ marginLeft: 4, verticalAlign: 'middle' }}
                          aria-label="Performance acima de 100%: ficha técnica possivelmente desatualizada"
                        />
                      )}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Card>
  );
}

const COLUNAS_OEE: Coluna[] = [
  { chave: 'horasLigado', rotulo: 'Ligado (h)', formato: 'numero' },
  { chave: 'horasPlanejado', rotulo: 'Planejado (h)', formato: 'numero' },
  { chave: 'horasProduzindo', rotulo: 'Produzindo (h)', formato: 'numero' },
  { chave: 'producaoEsperada', rotulo: 'Esperada', formato: 'numero', casas: 0 },
  { chave: 'boas', rotulo: 'Boas', formato: 'numero', casas: 0 },
  { chave: 'refugadas', rotulo: 'Refugadas', formato: 'numero', casas: 0 },
  { chave: 'disponibilidade', rotulo: 'Disponibilidade', formato: 'percentual' },
  { chave: 'performance', rotulo: 'Performance', formato: 'percentual' },
  { chave: 'qualidade', rotulo: 'Qualidade', formato: 'percentual' },
  { chave: 'oee', rotulo: 'OEE', formato: 'percentual' },
];
const comUnidade = <T extends { unidade: Unidade }>(l: T[]) =>
  l.map((x) => ({ ...x, unidadeRotulo: ROTULO_UNIDADE[x.unidade] }) as unknown as Linha);

/** Painel de indicadores (seção 10): filtros, OEE, produção, PH, paradas, perdas, consumo e comparações. */
export function PaginaPainelIndicadores() {
  const hoje = hojeSP();
  const [periodo, setPeriodo] = useState<[string | null, string | null]>([`${hoje.slice(0, 8)}01`, hoje]);
  const [filtro, setFiltro] = useState<Record<string, string | null>>({});
  const [granularidade, setGranularidade] = useState('AUTO');
  const [unidadeGrafico, setUnidadeGrafico] = useState<Unidade>('PECA');
  const { data: maquinas = [] } = useLista('maquinas');
  const { data: moldes = [] } = useLista('moldes');
  const { data: produtos = [] } = useLista('produtos');
  const { data: horarios = [] } = useLista('horarios-turno');
  const { data: equipes = [] } = useLista('equipes');

  const [inicio, fim] = periodo;
  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    if (inicio) p.set('inicio', inicio);
    if (fim) p.set('fim', fim);
    for (const [k, v] of Object.entries(filtro)) if (v) p.set(k, v);
    if (granularidade !== 'AUTO') p.set('granularidade', granularidade);
    return p.toString();
  }, [inicio, fim, filtro, granularidade]);
  const dados = useQuery({
    queryKey: ['indicadores', consulta],
    queryFn: () => api.get<Indicadores>(`/indicadores?${consulta}`),
    enabled: !!inicio && !!fim,
  });
  const d = dados.data;

  const atalho = (tipo: 'dia' | 'mes' | 'ano') =>
    setPeriodo(
      tipo === 'dia'
        ? [hoje, hoje]
        : tipo === 'mes'
          ? [`${hoje.slice(0, 8)}01`, hoje]
          : [`${hoje.slice(0, 4)}-01-01`, hoje],
    );
  const seletor = (chave: string, rotulo: string, opcoes: { value: string; label: string }[]) => (
    <Select
      label={rotulo}
      placeholder="Todos"
      clearable
      searchable
      data={opcoes}
      value={filtro[chave] ?? null}
      onChange={(v) => setFiltro({ ...filtro, [chave]: v })}
      w={170}
    />
  );
  const unidades = [...new Set(d?.totais.map((t) => t.unidade) ?? [])];
  const unidadeAtiva = unidades.includes(unidadeGrafico) ? unidadeGrafico : (unidades[0] ?? 'PECA');
  const evolucao = (d?.evolucao ?? [])
    .filter((e) => e.unidade === unidadeAtiva)
    .map((e) => ({
      periodo:
        e.periodo.length === 10
          ? formatarDataCivil(e.periodo).slice(0, 5)
          : `${e.periodo.slice(5)}/${e.periodo.slice(0, 4)}`,
      OEE: e.oee === null ? null : e.oee * 100,
      Disponibilidade: e.disponibilidade === null ? null : e.disponibilidade * 100,
      Performance: e.performance === null ? null : e.performance * 100,
      Qualidade: e.qualidade === null ? null : e.qualidade * 100,
    }));
  const barras = (d?.oeeMaquinas ?? []).map((m) => ({
    maquina: m.maquina,
    OEE: m.oee === null ? 0 : m.oee * 100,
  }));

  return (
    <Stack>
      <Title order={2}>Painel de indicadores</Title>
      <Card withBorder>
        <Group align="flex-end" gap="sm">
          <DatePickerInput
            type="range"
            label="Período (data do turno)"
            valueFormat="DD/MM/YYYY"
            value={periodo}
            onChange={(v) => setPeriodo(v as [string | null, string | null])}
            w={240}
          />
          <Button.Group>
            <Button variant="default" onClick={() => atalho('dia')}>
              Hoje
            </Button>
            <Button variant="default" onClick={() => atalho('mes')}>
              Mês
            </Button>
            <Button variant="default" onClick={() => atalho('ano')}>
              Ano
            </Button>
          </Button.Group>
          {seletor(
            'maquinaId',
            'Máquina',
            maquinas.map((m) => ({ value: m.id, label: m.codigo as string })),
          )}
          {seletor(
            'tipoMaquina',
            'Tipo de máquina',
            TIPOS_MAQUINA.map((t) => ({ value: t, label: ROTULO_TIPO_MAQUINA[t] })),
          )}
          {seletor(
            'moldeId',
            'Molde',
            moldes.map((m) => ({ value: m.id, label: m.codigo as string })),
          )}
          {seletor(
            'produtoId',
            'Produto',
            produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` })),
          )}
          {seletor(
            'horarioTurnoId',
            'Horário de turno',
            horarios.map((h) => ({ value: h.id, label: h.nome as string })),
          )}
          {seletor(
            'equipeId',
            'Equipe',
            equipes.map((e) => ({ value: e.id, label: `Equipe ${e.letra}` })),
          )}
        </Group>
      </Card>
      <AlertaErroApi erro={dados.error} />
      {d && (
        <>
          <Group gap="xs">
            <Badge variant="light">{d.turnos} turno(s)</Badge>
            {d.parciais > 0 && (
              <Badge color="blue" variant="light">
                {d.parciais} turno(s) aberto(s): valores parciais
              </Badge>
            )}
          </Group>
          {d.turnos === 0 && (
            <Alert color="blue">Nenhum turno com máquina ligada no período e filtros escolhidos.</Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {d.totais.map((t) => (
              <Card key={t.unidade} withBorder data-total={t.unidade}>
                <Text size="xs" c="dimmed">
                  OEE {t.unidade === 'KG' ? 'extrusão (kg)' : 'injeção/sopro (peças)'}
                </Text>
                <Text size="xl" fw={700}>
                  {pct(t.oee)}
                </Text>
                <Text size="xs" c="dimmed">
                  Disp. {pct(t.disponibilidade)} · Perf. {pct(t.performance)} · Qual. {pct(t.qualidade)}
                </Text>
                <Text size="xs" c="dimmed">
                  Produção {fmtNumero(t.producaoTotal, 0)} {ROTULO_UNIDADE[t.unidade]} · PH real{' '}
                  {fmtNumero(t.phReal ?? 0)}
                </Text>
              </Card>
            ))}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Card withBorder>
              <Title order={4} mb="xs">
                OEE por máquina
              </Title>
              {barras.length ? (
                <BarChart
                  h={260}
                  data={barras}
                  dataKey="maquina"
                  series={[{ name: 'OEE', color: COR.oee }]}
                  valueFormatter={(v) => `${fmtNumero(v, 1)}%`}
                  yAxisProps={{ domain: [0, 'auto'] }}
                  barProps={{ radius: [4, 4, 0, 0] }}
                  gridAxis="y"
                />
              ) : (
                <Text c="dimmed">Sem dados.</Text>
              )}
            </Card>
            <Card withBorder>
              <Group justify="space-between" mb="xs">
                <Title order={4}>Evolução do OEE</Title>
                <Group gap="xs">
                  {unidades.length > 1 && (
                    <SegmentedControl
                      size="xs"
                      value={unidadeAtiva}
                      onChange={(v) => setUnidadeGrafico(v as Unidade)}
                      data={[
                        { value: 'PECA', label: 'Peças' },
                        { value: 'KG', label: 'kg' },
                      ]}
                    />
                  )}
                  <SegmentedControl
                    size="xs"
                    value={granularidade}
                    onChange={setGranularidade}
                    data={[
                      { value: 'AUTO', label: `Auto (${d.filtros.granularidade === 'DIA' ? 'dia' : 'mês'})` },
                      { value: 'DIA', label: 'Por dia' },
                      { value: 'MES', label: 'Por mês' },
                    ]}
                  />
                </Group>
              </Group>
              {evolucao.length ? (
                <LineChart
                  h={260}
                  data={evolucao}
                  dataKey="periodo"
                  withLegend
                  connectNulls={false}
                  strokeWidth={2}
                  valueFormatter={(v) => `${fmtNumero(v, 1)}%`}
                  series={[
                    { name: 'OEE', color: COR.oee },
                    { name: 'Disponibilidade', color: COR.disponibilidade },
                    { name: 'Performance', color: COR.performance },
                    { name: 'Qualidade', color: COR.qualidade },
                  ]}
                  gridAxis="y"
                />
              ) : (
                <Text c="dimmed">Sem dados.</Text>
              )}
            </Card>
          </SimpleGrid>

          <TabelaIndicador
            titulo="OEE por máquina"
            colunas={[
              { chave: 'maquina', rotulo: 'Máquina' },
              { chave: 'unidadeRotulo', rotulo: 'Unidade' },
              { chave: 'turnos', rotulo: 'Turnos', formato: 'numero', casas: 0 },
              ...COLUNAS_OEE,
            ]}
            linhas={comUnidade(d.oeeMaquinas)}
          />
          <TabelaIndicador
            titulo="Evolução no tempo"
            colunas={[
              { chave: 'periodo', rotulo: d.filtros.granularidade === 'DIA' ? 'Dia' : 'Mês' },
              { chave: 'unidadeRotulo', rotulo: 'Unidade' },
              ...COLUNAS_OEE,
            ]}
            linhas={comUnidade(d.evolucao).map((l) => ({
              ...l,
              periodo:
                (l.periodo as string).length === 10 ? formatarDataCivil(l.periodo as string) : l.periodo,
            }))}
          />
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <TabelaIndicador
              titulo="Produção por máquina e produto"
              colunas={[
                { chave: 'maquina', rotulo: 'Máquina' },
                { chave: 'produto', rotulo: 'Produto' },
                { chave: 'boas', rotulo: 'Boas', formato: 'numero', casas: 0 },
                { chave: 'refugadas', rotulo: 'Refugadas', formato: 'numero', casas: 0 },
                { chave: 'total', rotulo: 'Total', formato: 'numero', casas: 0 },
                { chave: 'unidade', rotulo: 'Unidade' },
              ]}
              linhas={d.producaoMaquinaProduto.map((l) => ({
                ...l,
                unidade: ROTULO_UNIDADE[l.unidade as Unidade],
              }))}
            />
            <TabelaIndicador
              titulo="Produção por produto"
              colunas={[
                { chave: 'produto', rotulo: 'Produto' },
                { chave: 'descricao', rotulo: 'Descrição' },
                { chave: 'total', rotulo: 'Total', formato: 'numero', casas: 0 },
                { chave: 'unidade', rotulo: 'Unidade' },
              ]}
              linhas={d.producaoProduto.map((l) => ({ ...l, unidade: ROTULO_UNIDADE[l.unidade as Unidade] }))}
            />
          </SimpleGrid>
          <TabelaIndicador
            titulo="PH real x padrão"
            colunas={[
              { chave: 'maquina', rotulo: 'Máquina' },
              { chave: 'molde', rotulo: 'Molde' },
              { chave: 'produto', rotulo: 'Produto' },
              { chave: 'fichaVersao', rotulo: 'Versão da ficha', formato: 'numero', casas: 0 },
              { chave: 'horasProduzindo', rotulo: 'Produzindo (h)', formato: 'numero' },
              { chave: 'total', rotulo: 'Produção', formato: 'numero', casas: 0 },
              { chave: 'phReal', rotulo: 'PH real', formato: 'numero' },
              { chave: 'phPadrao', rotulo: 'PH padrão', formato: 'numero' },
              { chave: 'relacao', rotulo: 'Real ÷ padrão', formato: 'percentual' },
            ]}
            linhas={d.ph}
          />
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <TabelaIndicador
              titulo="Paradas não programadas"
              colunas={[
                { chave: 'motivo', rotulo: 'Motivo' },
                { chave: 'minutos', rotulo: 'Tempo (min)', formato: 'numero', casas: 1 },
                { chave: 'ocorrencias', rotulo: 'Ocorrências', formato: 'numero', casas: 0 },
              ]}
              linhas={d.paradas.filter((p) => !p.programada)}
            />
            <TabelaIndicador
              titulo="Paradas programadas"
              colunas={[
                { chave: 'motivo', rotulo: 'Motivo' },
                { chave: 'minutos', rotulo: 'Tempo (min)', formato: 'numero', casas: 1 },
                { chave: 'ocorrencias', rotulo: 'Ocorrências', formato: 'numero', casas: 0 },
              ]}
              linhas={d.paradas.filter((p) => p.programada)}
            />
          </SimpleGrid>
          <TabelaIndicador
            titulo="Perdas por tipo"
            colunas={[
              { chave: 'tipo', rotulo: 'Tipo' },
              { chave: 'contaComoRefugo', rotulo: 'Refugo de peça' },
              { chave: 'pesoKg', rotulo: 'Peso (kg)', formato: 'numero', casas: 3 },
              { chave: 'percentualKg', rotulo: '% do consumo (kg)', formato: 'percentual' },
              { chave: 'pecas', rotulo: 'Peças', formato: 'numero', casas: 0 },
              { chave: 'percentualPecas', rotulo: '% da produção (peças)', formato: 'percentual' },
              { chave: 'ocorrencias', rotulo: 'Ocorrências', formato: 'numero', casas: 0 },
            ]}
            linhas={d.perdas}
          />
          <TabelaIndicador
            titulo="Consumo real x teórico por OP"
            colunas={[
              { chave: 'op', rotulo: 'OP ERP' },
              { chave: 'numeroInterno', rotulo: 'Nº interno', formato: 'numero', casas: 0 },
              { chave: 'produto', rotulo: 'Produto' },
              { chave: 'material', rotulo: 'Material' },
              { chave: 'real', rotulo: 'Real (kg)', formato: 'numero', casas: 3 },
              { chave: 'teorico', rotulo: 'Teórico (kg)', formato: 'numero', casas: 3 },
              { chave: 'diferencaPct', rotulo: 'Diferença', formato: 'percentual' },
            ]}
            linhas={d.consumo}
          />
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <TabelaIndicador
              titulo="Comparação entre equipes"
              colunas={[
                { chave: 'nome', rotulo: 'Equipe' },
                { chave: 'unidadeRotulo', rotulo: 'Unidade' },
                { chave: 'turnos', rotulo: 'Turnos', formato: 'numero', casas: 0 },
                { chave: 'producaoTotal', rotulo: 'Produção', formato: 'numero', casas: 0 },
                { chave: 'disponibilidade', rotulo: 'Disp.', formato: 'percentual' },
                { chave: 'performance', rotulo: 'Perf.', formato: 'percentual' },
                { chave: 'qualidade', rotulo: 'Qual.', formato: 'percentual' },
                { chave: 'oee', rotulo: 'OEE', formato: 'percentual' },
              ]}
              linhas={comUnidade(d.equipes)}
            />
            <TabelaIndicador
              titulo="Comparação entre horários de turno"
              colunas={[
                { chave: 'nome', rotulo: 'Horário' },
                { chave: 'unidadeRotulo', rotulo: 'Unidade' },
                { chave: 'turnos', rotulo: 'Turnos', formato: 'numero', casas: 0 },
                { chave: 'producaoTotal', rotulo: 'Produção', formato: 'numero', casas: 0 },
                { chave: 'disponibilidade', rotulo: 'Disp.', formato: 'percentual' },
                { chave: 'performance', rotulo: 'Perf.', formato: 'percentual' },
                { chave: 'qualidade', rotulo: 'Qual.', formato: 'percentual' },
                { chave: 'oee', rotulo: 'OEE', formato: 'percentual' },
              ]}
              linhas={comUnidade(d.horarios)}
            />
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
