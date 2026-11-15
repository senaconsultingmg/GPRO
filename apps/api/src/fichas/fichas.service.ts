import { Inject, Injectable } from '@nestjs/common';
import {
  calcularPhPadrao,
  TIPOS_MATERIAL,
  usaMolde,
  type FichaTecnicaEntrada,
  type TipoMaquina,
  type TipoProduto,
} from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { compatibilidade } from '../moldes/moldes.service.js';

const INCLUIR = {
  produto: { select: { id: true, codigo: true, descricao: true, unidade: true } },
  molde: { select: { id: true, codigo: true, descricao: true, numeroCavidades: true } },
  maquina: { select: { id: true, codigo: true, descricao: true, tipo: true } },
  criadoPor: { select: { id: true, nome: true } },
  aprovador: { select: { id: true, nome: true } },
  composicao: {
    include: { material: { select: { id: true, codigo: true, descricao: true, unidade: true } } },
  },
} satisfies Prisma.FichaTecnicaInclude;

interface Combinacao {
  produtoId: string;
  moldeId: string | null;
  maquinaId: string;
}

const filtroCombinacao = (c: Combinacao): Prisma.FichaTecnicaWhereInput => ({
  produtoId: c.produtoId,
  moldeId: c.moldeId,
  maquinaId: c.maquinaId,
});

/** Trava a combinação produto + molde + máquina durante a transação (evita versões duplicadas). */
async function travarCombinacao(tx: Transacao, c: Combinacao): Promise<void> {
  const chave = `${c.produtoId}|${c.moldeId ?? '-'}|${c.maquinaId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;
}

function copiaParaAuditoria(f: Record<string, unknown>) {
  const { produto: _p, molde: _m, maquina: _q, criadoPor: _c, aprovador: _a, ...resto } = f;
  return resto;
}

/** Fichas técnicas versionadas (RN-02). */
@Injectable()
export class FichasService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  listar(filtro: { produtoId?: string; moldeId?: string; maquinaId?: string; situacao?: string }) {
    const where: Prisma.FichaTecnicaWhereInput = {};
    if (filtro.produtoId) where.produtoId = filtro.produtoId;
    if (filtro.moldeId) where.moldeId = filtro.moldeId;
    if (filtro.maquinaId) where.maquinaId = filtro.maquinaId;
    if (filtro.situacao) where.situacao = filtro.situacao as Prisma.EnumSituacaoFichaFilter['equals'];
    return this.prisma.fichaTecnica.findMany({
      where,
      include: INCLUIR,
      orderBy: [{ produto: { codigo: 'asc' } }, { maquina: { codigo: 'asc' } }, { versao: 'desc' }],
    });
  }

  async obter(id: string) {
    const f = await this.prisma.fichaTecnica.findUnique({ where: { id }, include: INCLUIR });
    if (!f) throw naoEncontrado('Ficha técnica');
    return f;
  }

  /** Todas as versões da mesma combinação, da mais nova para a mais antiga. */
  async historico(id: string) {
    const f = await this.obter(id);
    return this.prisma.fichaTecnica.findMany({
      where: filtroCombinacao(f),
      include: INCLUIR,
      orderBy: { versao: 'desc' },
    });
  }

  /** Valida a ficha e devolve os dados prontos para gravar. */
  private async preparar(dados: FichaTecnicaEntrada) {
    const [produto, maquina] = await Promise.all([
      this.prisma.produto.findUnique({ where: { id: dados.produtoId } }),
      this.prisma.maquina.findUnique({ where: { id: dados.maquinaId } }),
    ]);
    if (!produto) throw naoEncontrado('Produto');
    if (!maquina) throw naoEncontrado('Máquina');
    if (!produto.ativo) throw new ErroNegocio('Produto inativo.');
    if (!maquina.ativa) throw new ErroNegocio('Máquina inativa.');

    let cavidades = dados.cavidades;
    if (usaMolde(maquina.tipo as TipoMaquina)) {
      if (!dados.moldeId) {
        throw new ErroNegocio('Informe o molde: injetora e sopradora exigem molde.', [
          { campo: 'moldeId', mensagem: 'Obrigatório.' },
        ]);
      }
      const molde = await this.prisma.molde.findUnique({ where: { id: dados.moldeId } });
      if (!molde) throw naoEncontrado('Molde');
      if (!molde.ativo) throw new ErroNegocio('Molde inativo.');
      const r = compatibilidade(molde, maquina);
      if (!r.compativel) {
        throw new ErroNegocio(
          `O molde ${molde.codigo} não é compatível com a máquina ${maquina.codigo}.`,
          r.falhas.map((f) => ({ criterio: f.criterio, mensagem: f.mensagem })),
        );
      }
      if (cavidades > molde.numeroCavidades) {
        throw new ErroNegocio(`O molde ${molde.codigo} tem ${molde.numeroCavidades} cavidades.`, [
          { campo: 'cavidades', mensagem: `Máximo de ${molde.numeroCavidades}.` },
        ]);
      }
      if (produto.unidade !== 'PECA')
        throw new ErroNegocio('Injetora e sopradora produzem itens medidos em peças.');
    } else {
      if (dados.moldeId)
        throw new ErroNegocio('Extrusora não usa molde: a ficha vale para produto + máquina.');
      if (dados.phPadrao == null) {
        throw new ErroNegocio('Na extrusão informe o PH padrão em kg/h.', [
          { campo: 'phPadrao', mensagem: 'Obrigatório.' },
        ]);
      }
      if (produto.unidade !== 'KG') throw new ErroNegocio('Extrusora produz itens medidos em kg.');
      cavidades = 1;
    }

    if (dados.composicao.length) {
      const ids = dados.composicao.map((c) => c.materialId);
      if (ids.includes(produto.id)) throw new ErroNegocio('O produto não pode compor a própria ficha.');
      const materiais = await this.prisma.produto.findMany({ where: { id: { in: ids } } });
      if (materiais.length !== ids.length) throw naoEncontrado('Material da composição');
      const invalido = materiais.find((m) => !TIPOS_MATERIAL.includes(m.tipo as TipoProduto));
      if (invalido) throw new ErroNegocio(`${invalido.codigo} não é um material válido para composição.`);
    }

    const phCalculado = dados.phPadrao == null;
    const phPadrao = phCalculado ? calcularPhPadrao(dados.cicloS!, cavidades) : dados.phPadrao!;
    const { composicao, ...resto } = dados;
    return {
      dados: {
        ...resto,
        moldeId: usaMolde(maquina.tipo as TipoMaquina) ? dados.moldeId : null,
        cavidades,
        phPadrao,
        phCalculado,
        parametrosProcesso: dados.parametrosProcesso as Prisma.InputJsonValue,
      },
      composicao,
    };
  }

  async criar(entrada: FichaTecnicaEntrada, usuario: UsuarioAutenticado) {
    const { dados, composicao } = await this.preparar(entrada);
    const id = await this.prisma.$transaction(async (tx) => {
      await travarCombinacao(tx, dados);
      const rascunho = await tx.fichaTecnica.findFirst({
        where: { ...filtroCombinacao(dados), situacao: 'RASCUNHO' },
      });
      if (rascunho)
        throw conflito(`Já existe o rascunho versão ${rascunho.versao} para esta combinação. Edite-o.`);
      const ultima = await tx.fichaTecnica.aggregate({
        where: filtroCombinacao(dados),
        _max: { versao: true },
      });
      const ficha = await tx.fichaTecnica.create({
        data: {
          ...dados,
          versao: (ultima._max.versao ?? 0) + 1,
          criadoPorId: usuario.id,
          composicao: { create: composicao },
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'FichaTecnica',
        entidadeId: ficha.id,
        acao: 'CRIAR',
        novo: { ...ficha, composicao },
      });
      return ficha.id;
    });
    return this.obter(id);
  }

  /** Só rascunho pode ser editado; ficha vigente exige nova versão (RN-02). */
  async atualizar(id: string, entrada: FichaTecnicaEntrada, usuario: UsuarioAutenticado) {
    const anterior = await this.obter(id);
    if (anterior.situacao !== 'RASCUNHO') {
      throw conflito('Ficha vigente ou obsoleta não é editada. Crie uma nova versão.');
    }
    if (
      anterior.produtoId !== entrada.produtoId ||
      anterior.maquinaId !== entrada.maquinaId ||
      (anterior.moldeId ?? null) !== (entrada.moldeId ?? null)
    ) {
      throw new ErroNegocio(
        'Produto, molde e máquina não podem ser alterados. Crie uma ficha para a nova combinação.',
      );
    }
    const { dados, composicao } = await this.preparar(entrada);
    await this.prisma.$transaction(async (tx) => {
      await travarCombinacao(tx, dados);
      const atual = await tx.fichaTecnica.findUniqueOrThrow({ where: { id } });
      if (atual.situacao !== 'RASCUNHO') throw conflito('A ficha não está mais em rascunho.');
      await tx.componenteFicha.deleteMany({ where: { fichaId: id } });
      const novo = await tx.fichaTecnica.update({
        where: { id },
        data: { ...dados, composicao: { create: composicao } },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'FichaTecnica',
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior: {
          ...copiaParaAuditoria(anterior),
          composicao: anterior.composicao.map((c) => ({
            materialId: c.materialId,
            consumoGPorPeca: c.consumoGPorPeca,
            percentual: c.percentual,
          })),
        },
        novo: { ...novo, composicao },
      });
    });
    return this.obter(id);
  }

  /** Cria um rascunho com nova versão a partir de uma ficha existente (normalmente a vigente). */
  async novaVersao(id: string, usuario: UsuarioAutenticado) {
    const origem = await this.obter(id);
    const novaId = await this.prisma.$transaction(async (tx) => {
      await travarCombinacao(tx, origem);
      const rascunho = await tx.fichaTecnica.findFirst({
        where: { ...filtroCombinacao(origem), situacao: 'RASCUNHO' },
      });
      if (rascunho)
        throw conflito(`Já existe o rascunho versão ${rascunho.versao} para esta combinação. Edite-o.`);
      const ultima = await tx.fichaTecnica.aggregate({
        where: filtroCombinacao(origem),
        _max: { versao: true },
      });
      const ficha = await tx.fichaTecnica.create({
        data: {
          produtoId: origem.produtoId,
          moldeId: origem.moldeId,
          maquinaId: origem.maquinaId,
          versao: (ultima._max.versao ?? 0) + 1,
          cicloS: origem.cicloS,
          cavidades: origem.cavidades,
          phPadrao: origem.phPadrao,
          phCalculado: origem.phCalculado,
          pesoPadraoG: origem.pesoPadraoG,
          toleranciaPesoPct: origem.toleranciaPesoPct,
          parametrosProcesso: origem.parametrosProcesso as Prisma.InputJsonValue,
          observacao: origem.observacao,
          criadoPorId: usuario.id,
          composicao: {
            create: origem.composicao.map((c) => ({
              materialId: c.materialId,
              consumoGPorPeca: c.consumoGPorPeca,
              percentual: c.percentual,
            })),
          },
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'FichaTecnica',
        entidadeId: ficha.id,
        acao: 'NOVA_VERSAO',
        novo: { versao: ficha.versao, origemId: origem.id, origemVersao: origem.versao },
        completo: true,
      });
      return ficha.id;
    });
    return this.obter(novaId);
  }

  /** Aprova o rascunho: vira vigente e a vigente anterior da combinação vira obsoleta (P9, RN-02). */
  async aprovar(id: string, usuario: UsuarioAutenticado) {
    const ficha = await this.obter(id);
    if (ficha.situacao !== 'RASCUNHO') throw conflito('Somente fichas em rascunho podem ser aprovadas.');
    // Revalida a ficha (compatibilidade, cadastros ativos) no momento da aprovação.
    await this.preparar({
      produtoId: ficha.produtoId,
      moldeId: ficha.moldeId,
      maquinaId: ficha.maquinaId,
      cicloS: ficha.cicloS,
      cavidades: ficha.cavidades,
      phPadrao: ficha.phPadrao,
      pesoPadraoG: ficha.pesoPadraoG,
      toleranciaPesoPct: ficha.toleranciaPesoPct,
      parametrosProcesso: [],
      composicao: ficha.composicao.map((c) => ({
        materialId: c.materialId,
        consumoGPorPeca: c.consumoGPorPeca,
        percentual: c.percentual,
      })),
      observacao: null,
    });
    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await travarCombinacao(tx, ficha);
      const atual = await tx.fichaTecnica.findUniqueOrThrow({ where: { id } });
      if (atual.situacao !== 'RASCUNHO') throw conflito('A ficha não está mais em rascunho.');
      const vigentes = await tx.fichaTecnica.findMany({
        where: { ...filtroCombinacao(ficha), situacao: 'VIGENTE' },
      });
      for (const v of vigentes) {
        await tx.fichaTecnica.update({
          where: { id: v.id },
          data: { situacao: 'OBSOLETA', obsoletaEm: agora },
        });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'FichaTecnica',
          entidadeId: v.id,
          acao: 'OBSOLETAR',
          anterior: { situacao: 'VIGENTE' },
          novo: { situacao: 'OBSOLETA', substituidaPorVersao: ficha.versao },
          completo: true,
        });
      }
      await tx.fichaTecnica.update({
        where: { id },
        data: { situacao: 'VIGENTE', aprovadorId: usuario.id, vigenteDesde: agora, parecerReprovacao: null },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'FichaTecnica',
        entidadeId: id,
        acao: 'APROVAR',
        anterior: { situacao: 'RASCUNHO' },
        novo: { situacao: 'VIGENTE', vigenteDesde: agora.toISOString() },
        completo: true,
      });
    });
    return this.obter(id);
  }

  /** Devolve o rascunho ao PCP com parecer; a ficha continua em rascunho. */
  async reprovar(id: string, parecer: string, usuario: UsuarioAutenticado) {
    const ficha = await this.obter(id);
    if (ficha.situacao !== 'RASCUNHO') throw conflito('Somente fichas em rascunho podem ser reprovadas.');
    await this.prisma.$transaction(async (tx) => {
      await tx.fichaTecnica.update({ where: { id }, data: { parecerReprovacao: parecer } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'FichaTecnica',
        entidadeId: id,
        acao: 'REPROVAR',
        anterior: { parecerReprovacao: ficha.parecerReprovacao },
        novo: { parecerReprovacao: parecer },
        completo: true,
      });
    });
    return this.obter(id);
  }
}
