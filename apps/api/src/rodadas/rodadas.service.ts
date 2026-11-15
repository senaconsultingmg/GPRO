import { Inject, Injectable } from '@nestjs/common';
import { usaMolde, type RodadaEntrada, type TipoMaquina } from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado, type DetalheErro } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { compatibilidade } from '../moldes/moldes.service.js';

export const INCLUIR_RODADA = {
  maquina: { select: { id: true, codigo: true, descricao: true, tipo: true } },
  molde: { select: { id: true, codigo: true, descricao: true, numeroCavidades: true } },
  criadoPor: { select: { id: true, nome: true } },
  ops: {
    orderBy: { ordem: { numeroInterno: 'asc' } },
    include: {
      ordem: {
        include: { produto: { select: { id: true, codigo: true, descricao: true, unidade: true } } },
      },
      fichaTecnica: {
        select: {
          id: true,
          versao: true,
          phPadrao: true,
          cavidades: true,
          pesoPadraoG: true,
          toleranciaPesoPct: true,
          cicloS: true,
        },
      },
    },
  },
} satisfies Prisma.RodadaInclude;

/** Rodadas (RN-02, RN-03). */
@Injectable()
export class RodadasService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  listar(filtro: { situacao?: string; maquinaId?: string }) {
    const where: Prisma.RodadaWhereInput = {};
    if (filtro.situacao)
      where.situacao = { in: filtro.situacao.split(',') as Prisma.EnumSituacaoRodadaFilter['in'] };
    if (filtro.maquinaId) where.maquinaId = filtro.maquinaId;
    return this.prisma.rodada.findMany({
      where,
      include: INCLUIR_RODADA,
      orderBy: { numero: 'desc' },
      take: 500,
    });
  }

  async obter(id: string) {
    const r = await this.prisma.rodada.findUnique({ where: { id }, include: INCLUIR_RODADA });
    if (!r) throw naoEncontrado('Rodada');
    return r;
  }

  /** Valida a rodada e devolve as OPs com a ficha vigente a congelar. */
  private async validar(dados: RodadaEntrada, rodadaId?: string) {
    const maquina = await this.prisma.maquina.findUnique({ where: { id: dados.maquinaId } });
    if (!maquina) throw naoEncontrado('Máquina');
    if (!maquina.ativa) throw new ErroNegocio('Máquina inativa.');
    const comMolde = usaMolde(maquina.tipo as TipoMaquina);
    let molde = null;
    if (comMolde) {
      if (!dados.moldeId)
        throw new ErroNegocio('Informe o molde: injetora e sopradora exigem molde.', [
          { campo: 'moldeId', mensagem: 'Obrigatório.' },
        ]);
      molde = await this.prisma.molde.findUnique({
        where: { id: dados.moldeId },
        include: { cavidades: true },
      });
      if (!molde) throw naoEncontrado('Molde');
      if (!molde.ativo) throw new ErroNegocio('Molde inativo.');
      const r = compatibilidade(molde, maquina);
      if (!r.compativel) {
        throw new ErroNegocio(
          `O molde ${molde.codigo} não é compatível com a máquina ${maquina.codigo}.`,
          r.falhas.map((f) => ({ criterio: f.criterio, mensagem: f.mensagem })),
        );
      }
    } else {
      if (dados.moldeId) throw new ErroNegocio('Extrusora não usa molde.');
      if (dados.ops.length !== 1) throw new ErroNegocio('Na extrusão a rodada tem uma única OP.');
    }

    const ids = dados.ops.map((o) => o.ordemId);
    if (new Set(ids).size !== ids.length) throw new ErroNegocio('A mesma OP aparece duas vezes na rodada.');
    const ordens = await this.prisma.ordemProducao.findMany({
      where: { id: { in: ids } },
      include: { produto: true },
    });
    const ocupadas = await this.prisma.rodadaOp.findMany({
      where: {
        ordemId: { in: ids },
        rodada: {
          situacao: { in: ['PLANEJADA', 'EM_ANDAMENTO'] },
          ...(rodadaId ? { id: { not: rodadaId } } : {}),
        },
      },
      include: {
        rodada: { select: { numero: true } },
        ordem: { select: { numeroErp: true, numeroInterno: true } },
      },
    });
    if (ocupadas.length) {
      const o = ocupadas[0];
      throw conflito(
        `A OP ${o.ordem.numeroErp ?? o.ordem.numeroInterno} já está na rodada ${o.rodada.numero}, ainda não encerrada.`,
      );
    }

    const usadas = new Set<number>();
    const resultado: { ordemId: string; fichaTecnicaId: string; cavidades: number[] }[] = [];
    for (const item of dados.ops) {
      const ordem = ordens.find((o) => o.id === item.ordemId);
      if (!ordem) throw naoEncontrado('Ordem de produção');
      const nome = ordem.numeroErp ?? String(ordem.numeroInterno);
      if (!['ABERTA', 'EM_PRODUCAO'].includes(ordem.situacao))
        throw new ErroNegocio(`A OP ${nome} está ${ordem.situacao.toLowerCase()}.`);
      if (comMolde && ordem.tipo !== 'PRODUCAO')
        throw new ErroNegocio(`A OP ${nome} é de extrusão e não roda em injetora/sopradora.`);
      if (!comMolde && ordem.tipo !== 'EXTRUSAO') throw new ErroNegocio(`A OP ${nome} não é de extrusão.`);
      const ficha = await this.prisma.fichaTecnica.findFirst({
        where: {
          produtoId: ordem.produtoId,
          moldeId: molde?.id ?? null,
          maquinaId: maquina.id,
          situacao: 'VIGENTE',
        },
      });
      if (!ficha) {
        throw new ErroNegocio(
          `Não há ficha técnica vigente para ${ordem.produto.codigo}${molde ? ` no molde ${molde.codigo}` : ''} na máquina ${maquina.codigo}.`,
        );
      }
      let cavidades: number[] = [];
      if (molde) {
        cavidades = [...item.cavidades].sort((a, b) => a - b);
        const erros: DetalheErro[] = [];
        if (cavidades.length === 0)
          erros.push({ campo: 'cavidades', mensagem: `Atribua as cavidades da OP ${nome}.` });
        for (const c of cavidades) {
          if (c > molde.numeroCavidades)
            erros.push({ mensagem: `O molde ${molde.codigo} não tem a cavidade ${c}.` });
          if (usadas.has(c)) erros.push({ mensagem: `A cavidade ${c} foi atribuída a mais de uma OP.` });
          usadas.add(c);
          const cad = molde.cavidades.find((x) => x.numero === c);
          if (cad?.produtoId && cad.produtoId !== ordem.produtoId) {
            erros.push({ mensagem: `A cavidade ${c} produz outro produto, não ${ordem.produto.codigo}.` });
          }
        }
        if (cavidades.length && cavidades.length !== ficha.cavidades) {
          erros.push({
            mensagem: `A ficha vigente de ${ordem.produto.codigo} prevê ${ficha.cavidades} cavidade(s); foram atribuídas ${cavidades.length}.`,
          });
        }
        if (erros.length) throw new ErroNegocio('Cavidades inválidas na rodada.', erros);
      }
      resultado.push({ ordemId: ordem.id, fichaTecnicaId: ficha.id, cavidades });
    }
    return { ops: resultado, moldeId: molde?.id ?? null };
  }

  async criar(dados: RodadaEntrada, usuario: UsuarioAutenticado) {
    const { ops, moldeId } = await this.validar(dados);
    const id = await this.prisma.$transaction(async (tx) => {
      const r = await tx.rodada.create({
        data: {
          maquinaId: dados.maquinaId,
          moldeId,
          observacao: dados.observacao,
          criadoPorId: usuario.id,
          ops: { create: ops },
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Rodada',
        entidadeId: r.id,
        acao: 'CRIAR',
        novo: { ...r, ops },
      });
      return r.id;
    });
    return this.obter(id);
  }

  async atualizar(id: string, dados: RodadaEntrada, usuario: UsuarioAutenticado) {
    const anterior = await this.obter(id);
    if (anterior.situacao !== 'PLANEJADA') throw conflito('Somente rodada planejada pode ser alterada.');
    const { ops, moldeId } = await this.validar(dados, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.rodadaOp.deleteMany({ where: { rodadaId: id } });
      const novo = await tx.rodada.update({
        where: { id },
        data: { maquinaId: dados.maquinaId, moldeId, observacao: dados.observacao, ops: { create: ops } },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Rodada',
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior: {
          maquinaId: anterior.maquinaId,
          moldeId: anterior.moldeId,
          observacao: anterior.observacao,
          ops: anterior.ops.map((o) => ({
            ordemId: o.ordemId,
            fichaTecnicaId: o.fichaTecnicaId,
            cavidades: o.cavidades,
          })),
        },
        novo: { maquinaId: novo.maquinaId, moldeId: novo.moldeId, observacao: novo.observacao, ops },
      });
    });
    return this.obter(id);
  }

  async encerrar(id: string, usuario: UsuarioAutenticado) {
    const r = await this.obter(id);
    if (r.situacao === 'ENCERRADA') throw conflito('A rodada já está encerrada.');
    const emTurno = await this.prisma.maquinaTurno.findFirst({
      where: { rodadaId: id, turno: { situacao: 'ABERTO' } },
    });
    if (emTurno) throw conflito('A rodada está em um turno aberto. Encerre depois do fechamento do turno.');
    await this.prisma.$transaction(async (tx) => {
      await tx.rodada.update({ where: { id }, data: { situacao: 'ENCERRADA', encerradaEm: new Date() } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Rodada',
        entidadeId: id,
        acao: 'ENCERRAR',
        anterior: { situacao: r.situacao },
        novo: { situacao: 'ENCERRADA' },
      });
    });
    return this.obter(id);
  }
}
