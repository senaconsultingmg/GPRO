import { Inject, Injectable } from '@nestjs/common';
import type { OrdemEntrada } from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { producaoPorOrdem } from './producao-ordem.js';

const paraDate = (d: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const deDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const INCLUIR = {
  produto: { select: { id: true, codigo: true, descricao: true, unidade: true, tipo: true } },
  criadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.OrdemProducaoInclude;

type OrdemComProduto = Prisma.OrdemProducaoGetPayload<{ include: typeof INCLUIR }>;

/** Ordens de produção (RN-01). */
@Injectable()
export class OrdensService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private async comProducao(ordens: OrdemComProduto[]) {
    const producao = await producaoPorOrdem(
      this.prisma,
      ordens.map((o) => o.id),
    );
    return ordens.map((o) => {
      const produzido = producao.get(o.id) ?? 0;
      return {
        ...o,
        dataInicioPrevista: deDate(o.dataInicioPrevista),
        dataFimPrevista: deDate(o.dataFimPrevista),
        produzido,
        saldo: Math.round((o.quantidade - produzido) * 1000) / 1000,
        percentualConcluido: o.quantidade > 0 ? Math.round((produzido / o.quantidade) * 1000) / 10 : 0,
      };
    });
  }

  async listar(filtro: { situacao?: string; busca?: string; tipo?: string; produtoId?: string }) {
    const where: Prisma.OrdemProducaoWhereInput = {};
    if (filtro.situacao)
      where.situacao = { in: filtro.situacao.split(',') as Prisma.EnumSituacaoOrdemFilter['in'] };
    if (filtro.tipo) where.tipo = filtro.tipo as Prisma.EnumTipoOrdemFilter['equals'];
    if (filtro.produtoId) where.produtoId = filtro.produtoId;
    if (filtro.busca?.trim()) {
      const b = filtro.busca.trim();
      const numero = Number(b);
      where.OR = [
        { numeroErp: { contains: b, mode: 'insensitive' } },
        { produto: { codigo: { contains: b, mode: 'insensitive' } } },
        { produto: { descricao: { contains: b, mode: 'insensitive' } } },
        ...(Number.isInteger(numero) && numero > 0 && numero < 2 ** 31 ? [{ numeroInterno: numero }] : []),
      ];
    }
    const ordens = await this.prisma.ordemProducao.findMany({
      where,
      include: INCLUIR,
      orderBy: { numeroInterno: 'desc' },
      take: 1000,
    });
    return this.comProducao(ordens);
  }

  async obter(id: string) {
    const o = await this.prisma.ordemProducao.findUnique({ where: { id }, include: INCLUIR });
    if (!o) throw naoEncontrado('Ordem de produção');
    const [comProducao] = await this.comProducao([o]);
    const divisoes = await this.prisma.divisaoOp.findMany({
      where: { ordemId: id },
      orderBy: { sequencial: 'asc' },
      include: {
        maquina: { select: { codigo: true } },
        turno: {
          select: {
            id: true,
            data: true,
            situacao: true,
            horarioTurno: { select: { nome: true } },
            equipe: { select: { letra: true } },
          },
        },
      },
    });
    const rodadas = await this.prisma.rodadaOp.findMany({
      where: { ordemId: id },
      include: {
        rodada: { include: { maquina: { select: { codigo: true } }, molde: { select: { codigo: true } } } },
      },
    });
    return {
      ...comProducao,
      divisoes: divisoes.map((d) => ({ ...d, turno: { ...d.turno, data: deDate(d.turno.data) } })),
      rodadas: rodadas.map((r) => r.rodada),
    };
  }

  private async validar(dados: OrdemEntrada) {
    const produto = await this.prisma.produto.findUnique({ where: { id: dados.produtoId } });
    if (!produto) throw naoEncontrado('Produto');
    if (!produto.ativo) throw new ErroNegocio('Produto inativo.');
    if (dados.tipo === 'EXTRUSAO' && produto.unidade !== 'KG') {
      throw new ErroNegocio('OP de extrusão deve ser de produto medido em kg.');
    }
    if (dados.tipo === 'PRODUCAO' && !['ACABADO', 'SEMIACABADO'].includes(produto.tipo)) {
      throw new ErroNegocio('OP de produção deve ser de produto acabado ou semiacabado.');
    }
    return produto;
  }

  private dadosGravacao(dados: OrdemEntrada, unidade: 'PECA' | 'KG') {
    return {
      tipo: dados.tipo,
      numeroErp: dados.numeroErp,
      produtoId: dados.produtoId,
      quantidade: dados.quantidade,
      unidade,
      dataInicioPrevista: paraDate(dados.dataInicioPrevista),
      dataFimPrevista: paraDate(dados.dataFimPrevista),
      observacao: dados.observacao,
    };
  }

  async criar(dados: OrdemEntrada, usuario: UsuarioAutenticado) {
    const produto = await this.validar(dados);
    const id = await this.prisma.$transaction(async (tx) => {
      const o = await tx.ordemProducao.create({
        data: { ...this.dadosGravacao(dados, produto.unidade), criadoPorId: usuario.id },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'OrdemProducao',
        entidadeId: o.id,
        acao: 'CRIAR',
        novo: o,
      });
      return o.id;
    });
    return this.obter(id);
  }

  /** Só altera OP aberta e sem apontamentos. */
  async atualizar(id: string, dados: OrdemEntrada, usuario: UsuarioAutenticado) {
    const anterior = await this.prisma.ordemProducao.findUnique({ where: { id } });
    if (!anterior) throw naoEncontrado('Ordem de produção');
    if (
      anterior.situacao !== 'ABERTA' ||
      (await this.prisma.divisaoOp.count({ where: { ordemId: id } })) > 0
    ) {
      throw conflito('A OP já possui apontamentos e não pode ser alterada.');
    }
    const produto = await this.validar(dados);
    await this.prisma.$transaction(async (tx) => {
      const novo = await tx.ordemProducao.update({
        where: { id },
        data: this.dadosGravacao(dados, produto.unidade),
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'OrdemProducao',
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior,
        novo,
      });
    });
    return this.obter(id);
  }

  async encerrar(id: string, usuario: UsuarioAutenticado) {
    const o = await this.prisma.ordemProducao.findUnique({ where: { id } });
    if (!o) throw naoEncontrado('Ordem de produção');
    if (!['ABERTA', 'EM_PRODUCAO'].includes(o.situacao))
      throw conflito('Somente OP aberta ou em produção pode ser encerrada.');
    await this.prisma.$transaction(async (tx) => {
      const novo = await tx.ordemProducao.update({
        where: { id },
        data: { situacao: 'ENCERRADA', encerradaEm: new Date() },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'OrdemProducao',
        entidadeId: id,
        acao: 'ENCERRAR',
        anterior: o,
        novo,
      });
    });
    return this.obter(id);
  }

  async cancelar(id: string, usuario: UsuarioAutenticado) {
    const o = await this.prisma.ordemProducao.findUnique({ where: { id } });
    if (!o) throw naoEncontrado('Ordem de produção');
    if (o.situacao !== 'ABERTA' || (await this.prisma.divisaoOp.count({ where: { ordemId: id } })) > 0) {
      throw conflito('Somente OP aberta e sem apontamentos pode ser cancelada.');
    }
    await this.prisma.$transaction(async (tx) => {
      const novo = await tx.ordemProducao.update({ where: { id }, data: { situacao: 'CANCELADA' } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'OrdemProducao',
        entidadeId: id,
        acao: 'CANCELAR',
        anterior: o,
        novo,
      });
    });
    return this.obter(id);
  }
}
