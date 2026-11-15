import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  formatarDataCivil,
  formatarDataHora,
  LAYOUTS_EXCEL,
  LAYOUTS_EXPORTACAO,
  ROTULO_UNIDADE,
  type LayoutExportacao,
} from '@apontamento/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { ImportacaoService } from '../importacao/importacao.service.js';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
type Linha = Record<string, string | number | null>;

const INCLUIR_DIVISAO = {
  ordem: { include: { produto: { select: { codigo: true, unidade: true } } } },
  rodadaOp: { include: { rodada: { include: { molde: { select: { codigo: true } } } } } },
  maquina: { select: { codigo: true } },
  turno: { include: { horarioTurno: { select: { nome: true } }, equipe: { select: { letra: true } } } },
} satisfies Prisma.DivisaoOpInclude;

/** Apuração do PCP (só turnos aprovados) e exportação ao ERP em lotes (seção 9, RN-13). */
@Injectable()
export class ApuracaoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ImportacaoService) private readonly importacao: ImportacaoService,
  ) {}

  // ---------- Apuração ----------

  /** O PCP só enxerga turnos com relatório aprovado pelo líder (e os já apurados, aguardando exportação). */
  async listarTurnos(situacao?: string) {
    const situacoes =
      situacao === 'APURADO' ? ['APURADO'] : situacao === 'APROVADO' ? ['APROVADO'] : ['APROVADO', 'APURADO'];
    const turnos = await this.prisma.turnoApontamento.findMany({
      where: { situacao: { in: situacoes as ('APROVADO' | 'APURADO')[] } },
      include: {
        apontador: { select: { nome: true } },
        horarioTurno: { select: { nome: true } },
        equipe: { select: { letra: true } },
        _count: { select: { divisoes: true, eventos: true } },
      },
      orderBy: [{ data: 'asc' }, { inicioNominal: 'asc' }],
    });
    const aprovadores = await this.prisma.usuario.findMany({
      where: {
        id: { in: turnos.flatMap((t) => [t.aprovadoPorId, t.apuradoPorId]).filter((x): x is string => !!x) },
      },
      select: { id: true, nome: true },
    });
    const nome = new Map(aprovadores.map((u) => [u.id, u.nome]));
    return turnos.map((t) => ({
      ...t,
      data: t.data.toISOString().slice(0, 10),
      aprovadoPor: t.aprovadoPorId ? nome.get(t.aprovadoPorId) : null,
      apuradoPor: t.apuradoPorId ? nome.get(t.apuradoPorId) : null,
    }));
  }

  private async turnoNaSituacao(id: string, situacao: 'APROVADO' | 'APURADO') {
    const turno = await this.prisma.turnoApontamento.findUnique({ where: { id } });
    if (!turno) throw naoEncontrado('Turno');
    if (turno.situacao !== situacao) {
      const msg: Record<string, string> = {
        ABERTO: 'O turno ainda está aberto.',
        FECHADO: 'O relatório deste turno ainda não foi aprovado pelo líder.',
        APROVADO: 'O turno ainda não foi apurado.',
        APURADO: 'O turno já foi apurado.',
        EXPORTADO: 'Turno exportado não aceita nenhuma alteração.',
      };
      throw conflito(msg[turno.situacao] ?? 'Situação do turno não permite esta ação.');
    }
    return turno;
  }

  async apurar(id: string, usuario: UsuarioAutenticado) {
    await this.turnoNaSituacao(id, 'APROVADO');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.turnoApontamento.update({
        where: { id },
        data: { situacao: 'APURADO', apuradoEm: new Date(), apuradoPorId: usuario.id },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'TurnoApontamento',
        entidadeId: id,
        acao: 'APURAR',
        anterior: { situacao: 'APROVADO' },
        novo: { situacao: 'APURADO' },
      });
      return novo;
    });
  }

  /** Divergência na apuração: o turno volta ao líder (FECHADO) com o parecer do PCP como pendência. */
  async devolver(id: string, parecer: string, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turnoApontamento.findUnique({ where: { id } });
    if (!turno) throw naoEncontrado('Turno');
    if (!['APROVADO', 'APURADO'].includes(turno.situacao)) {
      throw conflito(
        turno.situacao === 'EXPORTADO'
          ? 'Turno exportado não aceita nenhuma alteração.'
          : 'Só turnos aprovados podem ser devolvidos ao líder.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const agora = new Date();
      const novo = await tx.turnoApontamento.update({
        where: { id },
        data: {
          situacao: 'FECHADO',
          devolvidoEm: agora,
          parecerDevolucao: parecer,
          aprovadoEm: null,
          aprovadoPorId: null,
          apuradoEm: null,
          apuradoPorId: null,
        },
      });
      await tx.aprovacao.create({
        data: {
          tipo: 'JUSTIFICATIVA',
          turnoId: id,
          solicitanteId: usuario.id,
          descricao: `Devolvido pelo PCP: ${parecer}`,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'TurnoApontamento',
        entidadeId: id,
        acao: 'DEVOLVER_AO_LIDER',
        anterior: { situacao: turno.situacao },
        novo: { situacao: 'FECHADO', parecer },
        completo: true,
      });
      return novo;
    });
  }

  // ---------- Exportação ----------

  /** Monta as linhas dos quatro arquivos (sem gravar). */
  private async montar(tx: Transacao | PrismaService) {
    const turnosApurados = await tx.turnoApontamento.findMany({
      where: { situacao: 'APURADO' },
      select: { id: true },
    });
    const idsApurados = turnosApurados.map((t) => t.id);

    // Etiquetas de produto recebidas e ainda não exportadas, de turnos apurados ou já exportados.
    const etiquetas = await tx.etiqueta.findMany({
      where: {
        tipo: 'PRODUTO',
        situacao: 'RECEBIDA',
        exportacaoId: null,
        divisao: { turno: { situacao: { in: ['APURADO', 'EXPORTADO'] } } },
      },
      include: {
        produto: { select: { codigo: true } },
        localEstoque: { select: { id: true, nome: true } },
        recebimentos: {
          where: { estornadoEm: null },
          orderBy: { recebidoEm: 'desc' },
          take: 1,
          include: { recebidoPor: { select: { nome: true } } },
        },
      },
      orderBy: { codigo: 'asc' },
    });
    // Etiquetas emitidas e não recebidas: ficam para o próximo lote (aviso).
    const naoRecebidas = await tx.etiqueta.findMany({
      where: {
        tipo: 'PRODUTO',
        situacao: 'EMITIDA',
        exportacaoId: null,
        divisao: { turno: { situacao: { in: ['APURADO', 'EXPORTADO'] } } },
      },
      select: { codigo: true, quantidade: true, unidade: true, divisao: { select: { codigo: true } } },
      orderBy: { codigo: 'asc' },
    });

    // Divisões: as dos turnos apurados ainda sem exportação (consumo, perdas, refugo) e as com etiquetas novas.
    const idsDivisao = new Set([...etiquetas.map((e) => e.divisaoId!)]);
    const primeiras = await tx.divisaoOp.findMany({
      where: { turnoId: { in: idsApurados }, exportacaoId: null },
      select: { id: true },
    });
    for (const d of primeiras) idsDivisao.add(d.id);
    const divisoes = await tx.divisaoOp.findMany({
      where: { id: { in: [...idsDivisao] } },
      include: INCLUIR_DIVISAO,
      orderBy: { codigo: 'asc' },
    });
    const primeiraVez = new Set(primeiras.map((d) => d.id));

    const eventos = await tx.evento.findMany({
      where: { divisaoId: { in: [...primeiraVez] }, situacao: { not: 'INCORRETO' } },
      orderBy: { horaOcorrencia: 'asc' },
    });
    const transfRecebidas = (
      await tx.evento.findMany({ where: { tipo: 'TRANSFERENCIA', situacao: { not: 'INCORRETO' } } })
    ).filter((e) => primeiraVez.has((e.dados as { divisaoDestinoId: string }).divisaoDestinoId));
    const loteIds = [...eventos, ...transfRecebidas]
      .map((e) => (e.dados as { loteId?: string }).loteId)
      .filter((x): x is string => !!x);
    const [lotes, tiposPerda] = await Promise.all([
      tx.loteMaterial.findMany({
        where: { id: { in: loteIds } },
        include: { material: { select: { codigo: true } } },
      }),
      tx.tipoPerda.findMany(),
    ]);
    const lote = new Map(lotes.map((l) => [l.id, l]));
    const tipoPerda = new Map(tiposPerda.map((t) => [t.id, t.descricao]));

    const producao: Linha[] = [];
    const consumo: Linha[] = [];
    const perdas: Linha[] = [];
    for (const d of divisoes) {
      const comum = {
        numeroErp: d.ordem.numeroErp ?? '',
        divisao: d.codigo,
        data: formatarDataCivil(d.turno.data.toISOString()),
      };
      const doLote = etiquetas.filter((e) => e.divisaoId === d.id);
      const evd = eventos.filter((e) => e.divisaoId === d.id);
      const primeira = primeiraVez.has(d.id);
      const refugadas = primeira
        ? r3(
            evd
              .filter((e) => e.tipo === 'PERDA' && (e.dados as { contaComoRefugo?: boolean }).contaComoRefugo)
              .reduce(
                (s, e) => s + ((e.dados as { quantidadePecas?: number | null }).quantidadePecas ?? 0),
                0,
              ),
          )
        : 0;
      // Extrusão (kg) não gera etiqueta de produto: a produção vai na primeira exportação da divisão.
      const extrusao = d.ordem.tipo === 'EXTRUSAO';
      const quantidade = extrusao
        ? primeira
          ? r3(evd.filter((e) => e.tipo === 'SAIDA_PRODUCAO').reduce((s, e) => s + (e.quantidade ?? 0), 0))
          : 0
        : r3(doLote.reduce((s, e) => s + e.quantidade, 0));
      if (quantidade > 0 || refugadas > 0) {
        producao.push({
          ...comum,
          numeroInterno: d.ordem.numeroInterno,
          horarioTurno: d.turno.horarioTurno.nome,
          equipe: d.turno.equipe.letra,
          maquina: d.maquina.codigo,
          molde: d.rodadaOp.rodada.molde?.codigo ?? '',
          codigoProduto: d.ordem.produto.codigo,
          quantidade,
          unidade: ROTULO_UNIDADE[d.ordem.produto.unidade],
          conjuntos: doLote.filter((e) => !e.avulso).length,
          quantidadeAvulsos: r3(doLote.filter((e) => e.avulso).reduce((s, e) => s + e.quantidade, 0)),
          pecasRefugadas: refugadas,
        });
      }
      if (!primeira) continue;

      // Consumo por lote de material (RN-10): entradas, devoluções e transferências.
      const porLote = new Map<string, { entrada: number; devolucao: number; transferencia: number }>();
      const somar = (
        loteId: string | undefined,
        campo: 'entrada' | 'devolucao' | 'transferencia',
        kg: number,
      ) => {
        if (!loteId) return;
        const c = porLote.get(loteId) ?? { entrada: 0, devolucao: 0, transferencia: 0 };
        c[campo] = r3(c[campo] + kg);
        porLote.set(loteId, c);
      };
      for (const e of evd) {
        const dm = e.dados as { loteId?: string; quantidadeKg?: number };
        if (e.tipo === 'ENTRADA_MATERIA_PRIMA') somar(dm.loteId, 'entrada', dm.quantidadeKg ?? 0);
        if (e.tipo === 'DEVOLUCAO_MATERIA_PRIMA') somar(dm.loteId, 'devolucao', dm.quantidadeKg ?? 0);
        if (e.tipo === 'TRANSFERENCIA') somar(dm.loteId, 'transferencia', dm.quantidadeKg ?? 0);
      }
      for (const t of transfRecebidas.filter(
        (x) => (x.dados as { divisaoDestinoId: string }).divisaoDestinoId === d.id,
      )) {
        const dm = t.dados as { loteId?: string; quantidadeKg?: number };
        somar(dm.loteId, 'transferencia', -(dm.quantidadeKg ?? 0));
      }
      for (const [loteId, c] of porLote) {
        const l = lote.get(loteId);
        consumo.push({
          ...comum,
          codigoMaterial: l?.material.codigo ?? '',
          loteMaterial: l?.numero ?? '',
          fornecedor: l?.fornecedor ?? '',
          notaFiscal: l?.notaFiscal ?? '',
          entradaKg: c.entrada,
          devolucaoKg: c.devolucao,
          // Positivo: enviado a outra máquina; negativo: recebido de outra máquina.
          transferenciaKg: c.transferencia,
          consumoLiquidoKg: r3(c.entrada - c.devolucao - c.transferencia),
        });
      }
      for (const e of evd.filter((x) => x.tipo === 'PERDA')) {
        const dp = e.dados as { tipoPerdaId: string; pesoKg: number | null; quantidadePecas: number | null };
        perdas.push({
          ...comum,
          maquina: d.maquina.codigo,
          tipoPerda: tipoPerda.get(dp.tipoPerdaId) ?? '',
          pesoKg: dp.pesoKg,
          quantidadePecas: dp.quantidadePecas,
        });
      }
    }
    const linhasEtiquetas: Linha[] = etiquetas.map((e) => {
      const d = divisoes.find((x) => x.id === e.divisaoId)!;
      const r = e.recebimentos[0];
      return {
        codigoEtiqueta: e.codigo,
        numeroErp: d.ordem.numeroErp ?? '',
        codigoProduto: e.produto.codigo,
        quantidade: e.quantidade,
        unidade: ROTULO_UNIDADE[e.unidade],
        localEstoque: e.localEstoque?.nome ?? '',
        recebidoEm: r ? formatarDataHora(r.recebidoEm) : '',
        recebidoPor: r?.recebidoPor.nome ?? '',
      };
    });
    return {
      idsApurados,
      divisoesPrimeira: [...primeiraVez],
      etiquetas,
      naoRecebidas: naoRecebidas.map((e) => ({
        codigo: e.codigo,
        quantidade: e.quantidade,
        unidade: e.unidade,
        divisao: e.divisao?.codigo ?? '',
      })),
      linhas: {
        EXPORTACAO_PRODUCAO: producao,
        EXPORTACAO_CONSUMO: consumo,
        EXPORTACAO_PERDAS: perdas,
        EXPORTACAO_ETIQUETAS: linhasEtiquetas,
      } satisfies Record<LayoutExportacao, Linha[]>,
    };
  }

  async previa() {
    const m = await this.montar(this.prisma);
    return {
      turnos: m.idsApurados.length,
      etiquetas: m.etiquetas.length,
      naoRecebidas: m.naoRecebidas,
      linhas: m.linhas,
    };
  }

  /** Gera o lote: grava as linhas, dá baixa no estoque e marca tudo como exportado (nada sai duas vezes). */
  async exportar(usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('exportacao_erp'))`;
        const m = await this.montar(tx);
        const total = Object.values(m.linhas).reduce((s, l) => s + l.length, 0);
        if (total === 0 && m.idsApurados.length === 0) {
          throw new ErroNegocio(
            'Nada a exportar: não há turno apurado nem etiqueta recebida pendente de exportação.',
          );
        }
        const resumo = {
          ...Object.fromEntries(Object.entries(m.linhas).map(([k, v]) => [k, v.length])),
          naoRecebidas: m.naoRecebidas.length,
        };
        const lote = await tx.loteExportacao.create({
          data: { usuarioId: usuario.id, turnos: m.idsApurados.length, resumo },
        });
        const itens = LAYOUTS_EXPORTACAO.flatMap((layout) =>
          m.linhas[layout].map((dados, ordem) => ({
            loteId: lote.id,
            layout,
            ordem,
            dados: { loteExportacao: lote.numero, ...dados },
          })),
        );
        if (itens.length) await tx.itemExportacao.createMany({ data: itens });

        // Baixa: as etiquetas exportadas saem do estoque do local onde foram recebidas.
        for (const e of m.etiquetas) {
          await tx.movimentoEstoque.create({
            data: {
              tipo: 'BAIXA_EXPORTACAO',
              produtoId: e.produtoId,
              etiquetaId: e.id,
              localOrigemId: e.localEstoqueId,
              quantidade: e.quantidade,
              usuarioId: usuario.id,
              observacao: `Exportação ${lote.numero}`,
            },
          });
        }
        if (m.etiquetas.length) {
          await tx.etiqueta.updateMany({
            where: { id: { in: m.etiquetas.map((e) => e.id) } },
            data: { situacao: 'EXPORTADA', exportacaoId: lote.id },
          });
        }
        if (m.divisoesPrimeira.length) {
          await tx.divisaoOp.updateMany({
            where: { id: { in: m.divisoesPrimeira } },
            data: { exportacaoId: lote.id },
          });
        }
        const agora = new Date();
        if (m.idsApurados.length) {
          await tx.turnoApontamento.updateMany({
            where: { id: { in: m.idsApurados } },
            data: { situacao: 'EXPORTADO', exportadoEm: agora, exportacaoId: lote.id },
          });
        }
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'LoteExportacao',
          entidadeId: lote.id,
          acao: 'EXPORTAR',
          anterior: null,
          novo: {
            numero: lote.numero,
            turnos: m.idsApurados,
            etiquetas: m.etiquetas.map((e) => e.codigo),
            resumo,
          },
          completo: true,
        });
        return { ...lote, naoRecebidas: m.naoRecebidas };
      },
      { timeout: 60_000 },
    );
  }

  async listar() {
    return this.prisma.loteExportacao.findMany({
      include: { usuario: { select: { nome: true } } },
      orderBy: { numero: 'desc' },
      take: 200,
    });
  }

  /** Gera (ou regera) o arquivo de um layout do lote com os nomes de coluna mapeados. */
  async arquivo(numero: number, layoutTexto: string): Promise<{ nome: string; conteudo: Buffer }> {
    if (!(LAYOUTS_EXPORTACAO as readonly string[]).includes(layoutTexto))
      throw new ErroNegocio('Layout de exportação desconhecido.', [], 400);
    const layout = layoutTexto as LayoutExportacao;
    const lote = await this.prisma.loteExportacao.findUnique({ where: { numero } });
    if (!lote) throw naoEncontrado('Lote de exportação');
    const itens = await this.prisma.itemExportacao.findMany({
      where: { loteId: lote.id, layout },
      orderBy: { ordem: 'asc' },
    });
    const colunas = await this.importacao.colunas(layout);
    const campos = LAYOUTS_EXCEL[layout].campos;
    const livro = new ExcelJS.Workbook();
    const planilha = livro.addWorksheet(LAYOUTS_EXCEL[layout].titulo);
    planilha.columns = campos.map((c) => ({
      header: colunas[c.campo],
      key: c.campo,
      width: Math.max(14, colunas[c.campo].length + 4),
    }));
    for (const campo of [
      'numeroErp',
      'codigoProduto',
      'codigoMaterial',
      'loteMaterial',
      'codigoEtiqueta',
      'notaFiscal',
    ]) {
      if (campos.some((c) => c.campo === campo)) planilha.getColumn(campo).numFmt = '@';
    }
    for (const i of itens) planilha.addRow(i.dados as Linha);
    planilha.getRow(1).font = { bold: true };
    const sufixo = layout.replace('EXPORTACAO_', '').toLowerCase();
    return {
      nome: `exportacao-${numero}-${sufixo}.xlsx`,
      conteudo: Buffer.from(await livro.xlsx.writeBuffer()),
    };
  }
}
