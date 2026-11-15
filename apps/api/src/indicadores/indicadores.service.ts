import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Subscription } from 'rxjs';
import {
  agregarPor,
  granularidadePadrao,
  type Agregado,
  type FatoProducao,
  type FiltroIndicadores,
  type TabelaExportacao,
} from '@apontamento/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Barramento } from '../comum/barramento.js';
import { RelatorioService, type Calculo, type MaquinaCalculada } from '../turnos/relatorio.service.js';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number | null) => (n === null ? null : Math.round(n * 10_000) / 10_000);
const horas = (ms: number) => Math.round((ms / 3_600_000) * 100) / 100;

type Unidade = 'PECA' | 'KG';
interface FatoMaquina extends FatoProducao {
  turno: Calculo['turno'] & { horarioNome: string };
  parcial: boolean;
  unidade: Unidade;
  maquina: MaquinaCalculada['maquina'];
  molde: string | null;
  m: MaquinaCalculada;
}

/** Saída de um agregado com fatores arredondados (frações de 0 a 1; a tela formata em %). */
const fatores = (a: Agregado) => ({
  horasLigado: horas(a.ligadoMs),
  horasPlanejado: horas(a.planejadoMs),
  horasProduzindo: horas(a.produzindoMs),
  producaoEsperada: r3(a.producaoEsperada),
  boas: a.boas,
  refugadas: a.refugadas,
  producaoTotal: a.producaoTotal,
  disponibilidade: r4(a.disponibilidade),
  performance: r4(a.performance),
  qualidade: r4(a.qualidade),
  oee: r4(a.oee),
  alertaPerformance: a.alertaPerformance,
  phReal: a.phReal,
});

/**
 * Painel de indicadores (seção 10): fatos por máquina e turno, calculados com as mesmas fórmulas
 * do relatório e somados (tempos e quantidades) antes de dividir. Turnos não abertos ficam em cache
 * até que um aviso do barramento indique alteração (ex.: correção aprovada).
 */
@Injectable()
export class IndicadoresService implements OnModuleDestroy {
  private readonly cache = new Map<string, Calculo>();
  private readonly inscricao: Subscription;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RelatorioService) private readonly relatorio: RelatorioService,
    @Inject(Barramento) barramento: Barramento,
  ) {
    this.inscricao = barramento.avisos$.subscribe((a) => this.cache.delete(a.turnoId));
  }

  onModuleDestroy() {
    this.inscricao.unsubscribe();
  }

  private async calcular(turnos: { id: string; situacao: string }[]) {
    const faltam = turnos.filter((t) => t.situacao === 'ABERTO' || !this.cache.has(t.id)).map((t) => t.id);
    const novos = await this.relatorio.calcularTurnos(faltam);
    for (const t of turnos) {
      const c = novos.get(t.id);
      if (c && t.situacao !== 'ABERTO') this.cache.set(t.id, c);
    }
    return turnos.map((t) => novos.get(t.id) ?? this.cache.get(t.id)!).filter(Boolean);
  }

  async consultar(f: FiltroIndicadores) {
    const where: Prisma.TurnoApontamentoWhereInput = {
      data: { gte: new Date(`${f.inicio}T00:00:00Z`), lte: new Date(`${f.fim}T00:00:00Z`) },
    };
    if (f.horarioTurnoId) where.horarioTurnoId = f.horarioTurnoId;
    if (f.equipeId) where.equipeId = f.equipeId;
    const turnos = await this.prisma.turnoApontamento.findMany({
      where,
      select: { id: true, situacao: true, horarioTurno: { select: { nome: true } } },
    });
    const nomeHorario = new Map(turnos.map((t) => [t.id, t.horarioTurno.nome]));
    const calculos = await this.calcular(turnos);

    // Filtro de produto/molde: escolhe as máquinas-turno cuja rodada tem o produto/molde;
    // o OEE é da rodada inteira (P1) e as tabelas de produção mostram só o produto filtrado.
    const fatos: FatoMaquina[] = [];
    for (const c of calculos) {
      for (const m of c.maquinas) {
        if (f.maquinaId && m.maquina.id !== f.maquinaId) continue;
        if (f.tipoMaquina && m.maquina.tipo !== f.tipoMaquina) continue;
        if (f.moldeId && m.rodada.moldeId !== f.moldeId) continue;
        if (f.produtoId && !m.ops.some((o) => o.produto.id === f.produtoId)) continue;
        fatos.push({
          turno: { ...c.turno, horarioNome: nomeHorario.get(c.turno.id) ?? '' },
          parcial: c.parcial,
          unidade: m.maquina.tipo === 'EXTRUSORA' ? 'KG' : 'PECA',
          maquina: m.maquina,
          molde: m.rodada.molde,
          m,
          ligadoMs: m.tempos.ligadoMs,
          planejadoMs: m.tempos.planejadoMs,
          produzindoMs: m.tempos.produzindoMs,
          producaoEsperada: m.producaoEsperada,
          boas: m.boas,
          refugadas: m.refugadas,
        });
      }
    }
    const opsDe = (x: FatoMaquina) => x.m.ops.filter((o) => !f.produtoId || o.produto.id === f.produtoId);
    const granularidade = f.granularidade ?? granularidadePadrao(f.inicio, f.fim);

    // OEE por máquina e totais por unidade (peças e kg nunca se misturam).
    const oeeMaquinas = [...agregarPor(fatos, (x) => x.maquina.id).values()].map((g) => ({
      maquina: g.itens[0].maquina.codigo,
      tipo: g.itens[0].maquina.tipo,
      unidade: g.itens[0].unidade,
      turnos: g.n,
      ...fatores(g),
    }));
    oeeMaquinas.sort((a, b) => a.maquina.localeCompare(b.maquina));
    const totais = [...agregarPor(fatos, (x) => x.unidade).entries()].map(([unidade, g]) => ({
      unidade,
      ...fatores(g),
    }));

    const periodo = (d: string) => (granularidade === 'DIA' ? d : d.slice(0, 7));
    const evolucao = [...agregarPor(fatos, (x) => `${periodo(x.turno.data)}|${x.unidade}`).entries()]
      .map(([k, g]) => {
        const [p, unidade] = k.split('|');
        return { periodo: p, unidade, ...fatores(g) };
      })
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    // Produção por máquina × produto e por produto.
    const prodMaq = new Map<
      string,
      {
        maquina: string;
        produto: string;
        descricao: string;
        unidade: string;
        boas: number;
        refugadas: number;
        total: number;
      }
    >();
    for (const x of fatos)
      for (const o of opsDe(x)) {
        const k = `${x.maquina.codigo}|${o.produto.codigo}`;
        const a = prodMaq.get(k) ?? {
          maquina: x.maquina.codigo,
          produto: o.produto.codigo,
          descricao: o.produto.descricao,
          unidade: o.produto.unidade,
          boas: 0,
          refugadas: 0,
          total: 0,
        };
        a.boas = r3(a.boas + o.producao);
        a.refugadas = r3(a.refugadas + o.refugadas);
        a.total = r3(a.total + o.producaoTotal);
        prodMaq.set(k, a);
      }
    const producaoMaquinaProduto = [...prodMaq.values()].sort(
      (a, b) => a.maquina.localeCompare(b.maquina) || a.produto.localeCompare(b.produto),
    );
    const prodProd = new Map<
      string,
      { produto: string; descricao: string; unidade: string; boas: number; refugadas: number; total: number }
    >();
    for (const p of producaoMaquinaProduto) {
      const a = prodProd.get(p.produto) ?? {
        produto: p.produto,
        descricao: p.descricao,
        unidade: p.unidade,
        boas: 0,
        refugadas: 0,
        total: 0,
      };
      a.boas = r3(a.boas + p.boas);
      a.refugadas = r3(a.refugadas + p.refugadas);
      a.total = r3(a.total + p.total);
      prodProd.set(p.produto, a);
    }
    const producaoProduto = [...prodProd.values()].sort((a, b) => b.total - a.total);

    // PH real × padrão por máquina + molde + produto, com a versão da ficha.
    const ph = new Map<
      string,
      {
        maquina: string;
        molde: string;
        produto: string;
        fichaVersao: number;
        phPadrao: number;
        total: number;
        produzindoMs: number;
      }
    >();
    for (const x of fatos)
      for (const o of opsDe(x)) {
        const k = `${x.maquina.codigo}|${x.molde ?? ''}|${o.produto.codigo}|${o.fichaVersao}`;
        const a = ph.get(k) ?? {
          maquina: x.maquina.codigo,
          molde: x.molde ?? '—',
          produto: o.produto.codigo,
          fichaVersao: o.fichaVersao,
          phPadrao: o.phPadrao,
          total: 0,
          produzindoMs: 0,
        };
        a.total = r3(a.total + o.producaoTotal);
        a.produzindoMs += x.produzindoMs;
        ph.set(k, a);
      }
    const phTabela = [...ph.values()]
      .map(({ produzindoMs, ...a }) => {
        const real = produzindoMs > 0 ? Math.round((a.total / (produzindoMs / 3_600_000)) * 100) / 100 : null;
        return {
          ...a,
          horasProduzindo: horas(produzindoMs),
          phReal: real,
          relacao: real === null || !a.phPadrao ? null : r4(real / a.phPadrao),
        };
      })
      .sort((a, b) => a.maquina.localeCompare(b.maquina) || a.produto.localeCompare(b.produto));

    // Paradas por motivo, em ordem decrescente de tempo, separando programadas e não programadas.
    const paradas = new Map<
      string,
      { motivo: string; programada: boolean; minutos: number; ocorrencias: number }
    >();
    for (const x of fatos)
      for (const p of x.m.paradas) {
        const k = `${p.motivoId ?? p.motivo}|${p.programada}`;
        const a = paradas.get(k) ?? {
          motivo: p.motivo,
          programada: p.programada,
          minutos: 0,
          ocorrencias: 0,
        };
        a.minutos = Math.round((a.minutos + p.duracaoMs / 60_000) * 10) / 10;
        a.ocorrencias++;
        paradas.set(k, a);
      }
    const listaParadas = [...paradas.values()].sort((a, b) => b.minutos - a.minutos);

    // Perdas por tipo: kg sobre o consumo líquido de material; peças sobre a produção total em peças.
    let consumoKg = 0;
    let producaoPecas = 0;
    const perdas = new Map<
      string,
      { tipo: string; contaComoRefugo: boolean; pesoKg: number; pecas: number; ocorrencias: number }
    >();
    for (const x of fatos)
      for (const o of opsDe(x)) {
        consumoKg += o.consumo.reduce((s, c) => s + c.liquido, 0);
        if (o.produto.unidade === 'PECA') producaoPecas += o.producaoTotal;
        for (const p of o.perdas) {
          const a = perdas.get(p.tipo) ?? {
            tipo: p.tipo,
            contaComoRefugo: p.contaComoRefugo,
            pesoKg: 0,
            pecas: 0,
            ocorrencias: 0,
          };
          a.pesoKg = r3(a.pesoKg + p.pesoKg);
          a.pecas = r3(a.pecas + p.pecas);
          a.ocorrencias += p.ocorrencias;
          perdas.set(p.tipo, a);
        }
      }
    const listaPerdas = [...perdas.values()]
      .map((p) => ({
        ...p,
        percentualKg: consumoKg > 0 ? r4(p.pesoKg / consumoKg) : null,
        percentualPecas: producaoPecas > 0 ? r4(p.pecas / producaoPecas) : null,
      }))
      .sort((a, b) => b.pesoKg - a.pesoKg || b.pecas - a.pecas);

    // Consumo real × teórico por OP e material.
    const consumo = new Map<
      string,
      {
        op: string;
        numeroInterno: number;
        produto: string;
        material: string;
        real: number;
        teorico: number | null;
      }
    >();
    for (const x of fatos)
      for (const o of opsDe(x))
        for (const c of o.consumo) {
          const k = `${o.ordem.id}|${c.material.codigo}`;
          const a = consumo.get(k) ?? {
            op: o.ordem.numeroErp ?? '—',
            numeroInterno: o.ordem.numeroInterno,
            produto: o.produto.codigo,
            material: c.material.codigo,
            real: 0,
            teorico: null,
          };
          a.real = r3(a.real + c.liquido);
          if (c.teorico !== null) a.teorico = r3((a.teorico ?? 0) + c.teorico);
          consumo.set(k, a);
        }
    const listaConsumo = [...consumo.values()]
      .map((c) => ({ ...c, diferencaPct: c.teorico ? r4(c.real / c.teorico - 1) : null }))
      .sort((a, b) => a.numeroInterno - b.numeroInterno || a.material.localeCompare(b.material));

    // Comparação entre equipes e entre horários de turno (por unidade).
    const comparar = (chave: (x: FatoMaquina) => string) =>
      [...agregarPor(fatos, (x) => `${chave(x)}|${x.unidade}`).entries()]
        .map(([k, g]) => {
          const [nome, unidade] = k.split('|');
          return { nome, unidade, turnos: new Set(g.itens.map((i) => i.turno.id)).size, ...fatores(g) };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome) || a.unidade.localeCompare(b.unidade));

    return {
      filtros: { ...f, granularidade },
      turnos: new Set(fatos.map((x) => x.turno.id)).size,
      parciais: new Set(fatos.filter((x) => x.parcial).map((x) => x.turno.id)).size,
      totais,
      oeeMaquinas,
      evolucao,
      producaoMaquinaProduto,
      producaoProduto,
      ph: phTabela,
      paradas: listaParadas,
      perdas: listaPerdas,
      consumo: listaConsumo,
      equipes: comparar((x) => x.turno.equipe),
      horarios: comparar((x) => x.turno.horarioNome),
    };
  }

  /** Gera o .xlsx de uma tabela do painel (a mesma que está na tela). */
  async exportar(t: TabelaExportacao): Promise<Buffer> {
    const livro = new ExcelJS.Workbook();
    const planilha = livro.addWorksheet(t.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    planilha.columns = t.colunas.map((c) => ({
      header: c.rotulo,
      key: c.chave,
      width: Math.max(12, c.rotulo.length + 2),
    }));
    for (const l of t.linhas) planilha.addRow(l);
    planilha.getRow(1).font = { bold: true };
    t.colunas.forEach((c, i) => {
      if (c.formato === 'percentual') planilha.getColumn(i + 1).numFmt = '0.0%';
    });
    return Buffer.from(await livro.xlsx.writeBuffer());
  }
}
