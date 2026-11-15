import { Inject, Injectable } from '@nestjs/common';
import {
  lerCodigoEtiqueta,
  TIPOS_MATERIAL,
  type LoteCompra,
  type LoteRetorno,
  type MisturaEntrada,
  type TipoProduto,
} from '@apontamento/shared';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { emitirEtiquetas, proximoNumeroLote, saldosLote } from '../etiquetas/emissao.js';
import { estornarRecebimento } from '../estoque/estorno.js';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Resolve a leitura (etiqueta do lote/mistura/extrusão/devolução ou número do lote) para o lote. */
export async function resolverLote(tx: Transacao | PrismaService, leitura: string) {
  const codigo = lerCodigoEtiqueta(leitura);
  if (codigo) {
    const e = await tx.etiqueta.findUnique({
      where: { codigo },
      include: { lote: { include: { material: true } } },
    });
    if (e) {
      if (e.situacao === 'CANCELADA') throw new ErroNegocio(`A etiqueta ${codigo} está cancelada.`);
      if (!e.lote) throw new ErroNegocio(`A etiqueta ${codigo} não é de lote de material.`);
      return e.lote;
    }
  }
  const lote = await tx.loteMaterial.findFirst({
    where: { numero: { equals: leitura.trim(), mode: 'insensitive' } },
    include: { material: true },
  });
  if (!lote) throw new ErroNegocio(`Lote ou etiqueta "${leitura.trim()}" não encontrado.`);
  return lote;
}

/**
 * Baixa o estoque do lote pelos locais com saldo (maior saldo primeiro). Recusa se o saldo não basta.
 * Usado na entrada de material na produção e na mistura.
 */
export async function baixarLote(
  tx: Transacao,
  p: {
    loteId: string;
    loteNumero: string;
    produtoId: string;
    quantidadeKg: number;
    tipo: 'CONSUMO_PRODUCAO' | 'SAIDA_MISTURA';
    usuarioId: string;
    eventoId?: string | null;
    localId?: string | null;
  },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lote|${p.loteId}`}))`;
  const saldos = (await saldosLote(tx, [p.loteId]))
    .filter((s) => s.saldo > 0 && (!p.localId || s.local_id === p.localId))
    .sort((a, b) => b.saldo - a.saldo);
  const disponivel = r3(saldos.reduce((s, x) => s + x.saldo, 0));
  if (disponivel + 1e-9 < p.quantidadeKg) {
    throw new ErroNegocio(
      `Saldo insuficiente no lote ${p.loteNumero}${p.localId ? ' neste local' : ''}: disponível ${disponivel.toLocaleString('pt-BR')} kg.`,
    );
  }
  let restante = p.quantidadeKg;
  for (const s of saldos) {
    if (restante <= 0) break;
    const q = r3(Math.min(s.saldo, restante));
    await tx.movimentoEstoque.create({
      data: {
        tipo: p.tipo,
        produtoId: p.produtoId,
        loteId: p.loteId,
        localOrigemId: s.local_id,
        quantidade: q,
        eventoId: p.eventoId ?? null,
        usuarioId: p.usuarioId,
      },
    });
    restante = r3(restante - q);
  }
}

/** Setor de matéria-prima (RN-10): lotes, misturas, devoluções, moído/reciclado e saldo por lote e local. */
@Injectable()
export class MateriaPrimaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private async localMp(id: string) {
    const l = await this.prisma.localEstoque.findUnique({ where: { id } });
    if (!l?.ativo) throw new ErroNegocio('Local de estoque inexistente ou inativo.');
    if (l.tipo !== 'MATERIA_PRIMA') throw new ErroNegocio('Escolha um local de matéria-prima.');
    return l;
  }

  private async material(id: string, tipos?: TipoProduto[]) {
    const m = await this.prisma.produto.findUnique({ where: { id } });
    if (!m?.ativo) throw new ErroNegocio('Material inexistente ou inativo.');
    const permitidos = tipos ?? TIPOS_MATERIAL.filter((t) => t !== 'SEMIACABADO');
    if (!permitidos.includes(m.tipo as TipoProduto))
      throw new ErroNegocio(`${m.codigo} não é um material deste tipo.`);
    return m;
  }

  async listarLotes(filtro: { materialId?: string; comSaldo?: boolean; busca?: string }) {
    const lotes = await this.prisma.loteMaterial.findMany({
      where: {
        ...(filtro.materialId ? { materialId: filtro.materialId } : {}),
        ...(filtro.busca?.trim()
          ? {
              OR: [
                { numero: { contains: filtro.busca.trim(), mode: 'insensitive' } },
                { material: { codigo: { contains: filtro.busca.trim(), mode: 'insensitive' } } },
                { loteFornecedor: { contains: filtro.busca.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        material: { select: { id: true, codigo: true, descricao: true, tipo: true } },
        etiquetas: {
          where: { tipo: { in: ['ENTRADA_MATERIA_PRIMA', 'MISTURA'] } },
          select: { id: true, codigo: true, impressaoPendente: true },
        },
        mistura: {
          include: {
            componentes: {
              include: { lote: { select: { numero: true, material: { select: { codigo: true } } } } },
            },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
      take: 500,
    });
    const saldos = await saldosLote(
      this.prisma,
      lotes.map((l) => l.id),
    );
    const locais = new Map((await this.prisma.localEstoque.findMany()).map((l) => [l.id, l.nome]));
    const r = lotes.map((l) => {
      const porLocal = saldos
        .filter((s) => s.lote_id === l.id)
        .map((s) => ({ localId: s.local_id, local: locais.get(s.local_id) ?? '?', saldo: s.saldo }));
      return { ...l, saldo: r3(porLocal.reduce((s, x) => s + x.saldo, 0)), porLocal };
    });
    return filtro.comSaldo ? r.filter((l) => l.saldo > 0) : r;
  }

  /** Entrada de lote comprado: novo lote, saldo no local e etiqueta de entrada de matéria-prima. */
  async entradaCompra(dados: LoteCompra, usuario: UsuarioAutenticado, postoId: string | null) {
    const material = await this.material(dados.materialId);
    await this.localMp(dados.localEstoqueId);
    return this.prisma.$transaction(async (tx) => {
      const numero = await proximoNumeroLote(tx);
      const lote = await tx.loteMaterial.create({
        data: {
          numero,
          materialId: material.id,
          origem: 'COMPRA',
          fornecedor: dados.fornecedor,
          notaFiscal: dados.notaFiscal,
          loteFornecedor: dados.loteFornecedor,
          quantidadeInicial: dados.quantidadeKg,
          indiceFluidez: dados.indiceFluidez,
          cor: dados.cor ?? material.cor,
          observacao: dados.observacao,
          criadoPorId: usuario.id,
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          tipo: 'ENTRADA_COMPRA',
          produtoId: material.id,
          loteId: lote.id,
          localDestinoId: dados.localEstoqueId,
          quantidade: dados.quantidadeKg,
          usuarioId: usuario.id,
        },
      });
      const [etiqueta] = await emitirEtiquetas(tx, postoId, usuario.id, [
        {
          tipo: 'ENTRADA_MATERIA_PRIMA',
          produtoId: material.id,
          quantidade: dados.quantidadeKg,
          unidade: 'KG',
          pesoKg: dados.quantidadeKg,
          loteId: lote.id,
          dados: { loteFornecedor: dados.loteFornecedor ?? '' },
        },
      ]);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'LoteMaterial',
        entidadeId: lote.id,
        acao: 'ENTRADA_COMPRA',
        novo: { ...lote, etiqueta: etiqueta.codigo },
      });
      return { lote, etiquetas: [etiqueta] };
    });
  }

  /** Moído ou reciclado que volta da produção entra com novo lote (P7). */
  async entradaRetorno(dados: LoteRetorno, usuario: UsuarioAutenticado, postoId: string | null) {
    const material = await this.material(
      dados.materialId,
      dados.origem === 'MOIDO' ? ['MOIDO'] : ['RECICLADO', 'MOIDO'],
    );
    await this.localMp(dados.localEstoqueId);
    let etiquetaPerda: string | null = null;
    if (dados.leituraPerda) {
      const codigo = lerCodigoEtiqueta(dados.leituraPerda);
      const e = codigo ? await this.prisma.etiqueta.findUnique({ where: { codigo } }) : null;
      if (!e || e.tipo !== 'PERDA') throw new ErroNegocio('A etiqueta informada não é de perda.');
      etiquetaPerda = e.codigo;
    }
    return this.prisma.$transaction(async (tx) => {
      const numero = await proximoNumeroLote(tx);
      const lote = await tx.loteMaterial.create({
        data: {
          numero,
          materialId: material.id,
          origem: dados.origem,
          quantidadeInicial: dados.quantidadeKg,
          cor: material.cor,
          observacao:
            [dados.observacao, etiquetaPerda ? `Perda ${etiquetaPerda}` : null].filter(Boolean).join(' · ') ||
            null,
          criadoPorId: usuario.id,
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          tipo: 'ENTRADA_RETORNO',
          produtoId: material.id,
          loteId: lote.id,
          localDestinoId: dados.localEstoqueId,
          quantidade: dados.quantidadeKg,
          usuarioId: usuario.id,
          observacao: etiquetaPerda,
        },
      });
      const etiquetas = await emitirEtiquetas(tx, postoId, usuario.id, [
        {
          tipo: 'ENTRADA_MATERIA_PRIMA',
          produtoId: material.id,
          quantidade: dados.quantidadeKg,
          unidade: 'KG',
          pesoKg: dados.quantidadeKg,
          loteId: lote.id,
          dados: {
            fornecedor: dados.origem === 'MOIDO' ? 'Moído interno' : 'Reciclado interno',
            notaFiscal: '—',
          },
        },
      ]);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'LoteMaterial',
        entidadeId: lote.id,
        acao: 'ENTRADA_RETORNO',
        novo: lote,
      });
      return { lote, etiquetas };
    });
  }

  /** Mistura: baixa os componentes, gera novo lote e etiqueta, com composição em kg e % (RN-10). */
  async mistura(dados: MisturaEntrada, usuario: UsuarioAutenticado, postoId: string | null) {
    const material = await this.material(dados.materialId, ['MISTURA']);
    await this.localMp(dados.localEstoqueId);
    const ids = dados.componentes.map((c) => c.loteId);
    if (new Set(ids).size !== ids.length)
      throw new ErroNegocio('O mesmo lote aparece duas vezes na mistura.');
    const lotes = await this.prisma.loteMaterial.findMany({
      where: { id: { in: ids } },
      include: { material: true },
    });
    if (lotes.length !== ids.length) throw naoEncontrado('Lote');
    const destinos = await this.prisma.produto.findMany({ where: { id: { in: dados.produtosDestino } } });
    const total = r3(dados.componentes.reduce((s, c) => s + c.quantidadeKg, 0));
    return this.prisma.$transaction(async (tx) => {
      for (const c of dados.componentes) {
        const l = lotes.find((x) => x.id === c.loteId)!;
        await baixarLote(tx, {
          loteId: l.id,
          loteNumero: l.numero,
          produtoId: l.materialId,
          quantidadeKg: c.quantidadeKg,
          tipo: 'SAIDA_MISTURA',
          usuarioId: usuario.id,
          localId: c.localEstoqueId,
        });
      }
      const numero = await proximoNumeroLote(tx);
      const lote = await tx.loteMaterial.create({
        data: {
          numero,
          materialId: material.id,
          origem: 'MISTURA',
          quantidadeInicial: total,
          cor: material.cor,
          observacao: dados.observacao,
          criadoPorId: usuario.id,
        },
      });
      const componentes = dados.componentes.map((c) => ({
        loteId: c.loteId,
        quantidadeKg: c.quantidadeKg,
        percentual: Math.round((c.quantidadeKg / total) * 10000) / 100,
      }));
      const mistura = await tx.mistura.create({
        data: {
          loteId: lote.id,
          produtosDestino: dados.produtosDestino,
          responsavelId: usuario.id,
          componentes: { create: componentes },
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          tipo: 'ENTRADA_MISTURA',
          produtoId: material.id,
          loteId: lote.id,
          localDestinoId: dados.localEstoqueId,
          quantidade: total,
          usuarioId: usuario.id,
        },
      });
      const composicao = componentes
        .map((c) => {
          const l = lotes.find((x) => x.id === c.loteId)!;
          return `${l.material.codigo} ${c.percentual.toLocaleString('pt-BR')}%`;
        })
        .join(', ');
      const etiquetas = await emitirEtiquetas(tx, postoId, usuario.id, [
        {
          tipo: 'MISTURA',
          produtoId: material.id,
          quantidade: total,
          unidade: 'KG',
          pesoKg: total,
          loteId: lote.id,
          dados: { composicao, destinos: destinos.map((d) => d.codigo).join(', ') },
        },
      ]);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Mistura',
        entidadeId: mistura.id,
        acao: 'CRIAR',
        novo: { lote: numero, total, componentes, produtosDestino: dados.produtosDestino },
        completo: true,
      });
      return { lote, mistura: { ...mistura, componentes }, etiquetas };
    });
  }

  /**
   * Recebe no setor de matéria-prima a etiqueta de devolução da produção ou de volume de extrusão:
   * o saldo entra no lote, no local escolhido (RN-10).
   */
  async receber(leitura: string, localEstoqueId: string, usuario: UsuarioAutenticado) {
    await this.localMp(localEstoqueId);
    const codigo = lerCodigoEtiqueta(leitura);
    if (!codigo) throw new ErroNegocio('Leitura inválida.');
    const e = await this.prisma.etiqueta.findUnique({
      where: { codigo },
      include: { lote: true, recebimentos: { where: { estornadoEm: null } } },
    });
    if (!e) throw naoEncontrado(`Etiqueta ${codigo}`);
    const devolucao =
      e.tipo === 'DEVOLUCAO_TRANSFERENCIA' && (e.dados as { operacao?: string }).operacao === 'DEVOLUÇÃO';
    if (!devolucao && e.tipo !== 'EXTRUSAO')
      throw new ErroNegocio(
        'Só etiquetas de devolução ou de extrusão são recebidas pelo setor de matéria-prima.',
      );
    if (e.situacao === 'CANCELADA') throw conflito(`A etiqueta ${codigo} está cancelada.`);
    if (e.situacao !== 'EMITIDA' || e.recebimentos.length)
      throw conflito(`A etiqueta ${codigo} já foi recebida.`);
    return this.prisma.$transaction(async (tx) => {
      await tx.recebimento.create({ data: { etiquetaId: e.id, localEstoqueId, recebidoPorId: usuario.id } });
      await tx.movimentoEstoque.create({
        data: {
          tipo: devolucao ? 'DEVOLUCAO_PRODUCAO' : 'ENTRADA_EXTRUSAO',
          produtoId: e.produtoId,
          loteId: e.loteId,
          etiquetaId: e.id,
          localDestinoId: localEstoqueId,
          quantidade: e.pesoKg ?? e.quantidade,
          usuarioId: usuario.id,
        },
      });
      const atualizada = await tx.etiqueta.update({
        where: { id: e.id },
        data: { situacao: 'RECEBIDA', localEstoqueId },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Etiqueta',
        entidadeId: e.id,
        acao: 'RECEBER_MATERIA_PRIMA',
        anterior: { situacao: e.situacao },
        novo: { situacao: 'RECEBIDA', localEstoqueId },
      });
      return atualizada;
    });
  }

  /** Estorna o recebimento de etiqueta de devolução/extrusão (antes de corrigir o lançamento). */
  estornar(leitura: string, motivo: string, usuario: UsuarioAutenticado) {
    return estornarRecebimento(this.prisma, this.auditoria, {
      leitura,
      motivo,
      usuario,
      setor: 'MATERIA_PRIMA',
    });
  }

  async transferir(
    loteId: string,
    dados: { localOrigemId: string; localDestinoId: string; quantidadeKg: number },
    usuario: UsuarioAutenticado,
  ) {
    const lote = await this.prisma.loteMaterial.findUnique({ where: { id: loteId } });
    if (!lote) throw naoEncontrado('Lote');
    await this.localMp(dados.localDestinoId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lote|${loteId}`}))`;
      const saldo =
        (await saldosLote(tx, [loteId])).find((s) => s.local_id === dados.localOrigemId)?.saldo ?? 0;
      if (saldo + 1e-9 < dados.quantidadeKg)
        throw new ErroNegocio(`Saldo insuficiente no local de origem: ${saldo.toLocaleString('pt-BR')} kg.`);
      const m = await tx.movimentoEstoque.create({
        data: {
          tipo: 'TRANSFERENCIA_LOCAL',
          produtoId: lote.materialId,
          loteId,
          localOrigemId: dados.localOrigemId,
          localDestinoId: dados.localDestinoId,
          quantidade: dados.quantidadeKg,
          usuarioId: usuario.id,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'LoteMaterial',
        entidadeId: loteId,
        acao: 'TRANSFERIR_LOCAL',
        novo: dados,
        completo: true,
      });
      return m;
    });
  }

  /** Etiquetas de devolução e extrusão aguardando recebimento pelo setor. */
  pendentesRecebimento() {
    return this.prisma.etiqueta.findMany({
      where: {
        situacao: 'EMITIDA',
        OR: [
          { tipo: 'EXTRUSAO' },
          { tipo: 'DEVOLUCAO_TRANSFERENCIA', dados: { path: ['operacao'], equals: 'DEVOLUÇÃO' } },
        ],
      },
      include: { produto: { select: { codigo: true, descricao: true } }, lote: { select: { numero: true } } },
      orderBy: { emitidaEm: 'desc' },
    });
  }
}
