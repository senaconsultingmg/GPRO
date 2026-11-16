import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { esquemaEstadoFila, esquemaImpressoesOffline, esquemaRecusado } from '@apontamento/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { conflito, ErroNegocio, naoEncontrado, proibido } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { obterPosto, reservarBloco, saldosLote } from '../etiquetas/emissao.js';
import { producaoPorOrdem } from '../ordens/producao-ordem.js';
import { TurnosService } from '../turnos/turnos.service.js';

/**
 * Seção 11 — apoio ao tablet offline: pacote de dados para trabalhar sem servidor, blocos de
 * numeração de etiquetas, estado da fila, lançamentos recusados, impressões feitas offline e
 * alertas de relógio.
 */
@Injectable()
export class OfflineService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(TurnosService) private readonly turnos: TurnosService,
  ) {}

  // ---------- blocos de numeração ----------

  private async blocosDoAparelho(postoId: string, aparelho: string) {
    const blocos = await this.prisma.blocoEtiqueta.findMany({
      where: { dispositivoId: postoId, aparelho },
      orderBy: { inicio: 'asc' },
    });
    const ultima = blocos.length
      ? await this.prisma.etiqueta.aggregate({
          where: {
            dispositivoId: postoId,
            OR: blocos.map((b) => ({ sequencia: { gte: b.inicio, lte: b.fim } })),
          },
          _max: { sequencia: true },
        })
      : null;
    return {
      blocos: blocos.map((b) => ({ id: b.id, inicio: b.inicio, fim: b.fim })),
      ultimaUsadaServidor: ultima?._max.sequencia ?? 0,
    };
  }

  async reservar(postoId: string | null, aparelho: string, usuario: UsuarioAutenticado) {
    const posto = await obterPosto(this.prisma, postoId);
    const tamanho = Math.max(10, Math.round(await this.parametros.numero('tamanho_bloco_etiquetas')));
    const bloco = await this.prisma.$transaction(async (tx) => {
      const b = await reservarBloco(tx, posto.id, aparelho, usuario.id, tamanho);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'BlocoEtiqueta',
        entidadeId: b.id,
        acao: 'RESERVAR',
        novo: { posto: posto.prefixo, aparelho, inicio: b.inicio, fim: b.fim },
      });
      return b;
    });
    return {
      bloco: { id: bloco.id, inicio: bloco.inicio, fim: bloco.fim },
      ...(await this.blocosDoAparelho(posto.id, aparelho)),
    };
  }

  // ---------- pacote do aparelho ----------

  /** Tudo o que o tablet precisa para abrir turno, ligar máquinas, criar divisões, lançar e imprimir sem servidor. */
  async pacote(usuario: UsuarioAutenticado, postoId: string | null, aparelho: string) {
    const [horarios, equipes, motivos, tiposPerda, conjuntos, produtos, layouts, impressoras, maquinas] =
      await Promise.all([
        this.prisma.horarioTurno.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
        this.prisma.equipe.findMany({ where: { ativo: true }, orderBy: { letra: 'asc' } }),
        this.prisma.motivoParada.findMany({ where: { ativo: true }, orderBy: { codigo: 'asc' } }),
        this.prisma.tipoPerda.findMany({ where: { ativo: true }, orderBy: { descricao: 'asc' } }),
        this.prisma.conjuntoPadrao.findMany({ where: { ativo: true } }),
        this.prisma.produto.findMany({
          where: { ativo: true },
          select: {
            id: true,
            codigo: true,
            descricao: true,
            tipo: true,
            unidade: true,
            cor: true,
            ativo: true,
          },
          orderBy: { codigo: 'asc' },
        }),
        this.prisma.layoutEtiqueta.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
        this.prisma.impressora.findMany({ where: { ativa: true } }),
        this.prisma.maquina.findMany({ where: { ativa: true }, orderBy: { codigo: 'asc' } }),
      ]);
    const rodadas = await this.prisma.rodada.findMany({
      where: { situacao: { in: ['PLANEJADA', 'EM_ANDAMENTO'] } },
      include: {
        molde: { select: { codigo: true, numeroCavidades: true } },
        ops: {
          orderBy: { ordem: { numeroInterno: 'asc' } },
          include: {
            ordem: {
              include: {
                produto: { select: { id: true, codigo: true, descricao: true, unidade: true, cor: true } },
              },
            },
            fichaTecnica: {
              select: {
                versao: true,
                phPadrao: true,
                pesoPadraoG: true,
                toleranciaPesoPct: true,
                cavidades: true,
              },
            },
          },
        },
      },
      orderBy: { numero: 'asc' },
    });
    const ordemIds = [...new Set(rodadas.flatMap((r) => r.ops.map((o) => o.ordemId)))];
    const [produzido, sequenciais] = await Promise.all([
      producaoPorOrdem(this.prisma, ordemIds),
      this.prisma.divisaoOp.groupBy({
        by: ['ordemId'],
        where: { ordemId: { in: ordemIds } },
        _max: { sequencial: true },
      }),
    ]);
    const saldoSolto = new Map<string, number>();
    for (const id of ordemIds)
      saldoSolto.set(id, (await this.turnos.saldoSoltoPendente(this.prisma, id)).quantidade);
    const emTurnos = await this.prisma.maquinaTurno.findMany({
      where: { turno: { situacao: 'ABERTO' } },
      include: { turno: { include: { apontador: { select: { id: true, nome: true } } } } },
    });
    const anteriores = await Promise.all(
      maquinas.map((m) =>
        this.prisma.maquinaTurno.findFirst({
          where: { maquinaId: m.id, turno: { situacao: { not: 'ABERTO' } } },
          orderBy: { turno: { fechadoEm: 'desc' } },
          include: { turno: true },
        }),
      ),
    );
    const lotes = await this.prisma.loteMaterial.findMany({
      include: { material: { select: { id: true, codigo: true, descricao: true, tipo: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 1000,
    });
    const saldos = await saldosLote(
      this.prisma,
      lotes.map((l) => l.id),
    );
    const saldoLote = new Map<string, number>();
    for (const s of saldos) saldoLote.set(s.lote_id, (saldoLote.get(s.lote_id) ?? 0) + s.saldo);

    const posto = postoId ? await this.prisma.dispositivo.findUnique({ where: { id: postoId } }) : null;
    const meu = await this.turnos.meuAberto(usuario);
    return {
      geradoEm: new Date(),
      usuario: { id: usuario.id, nome: usuario.nome, login: usuario.login },
      parametros: {
        toleranciaHorarioMin: await this.parametros.numero('tolerancia_horario_min'),
        tamanhoBloco: await this.parametros.numero('tamanho_bloco_etiquetas'),
      },
      sugestao: await this.turnos.sugestao(),
      horarios,
      equipes,
      motivos,
      tiposPerda,
      conjuntos,
      produtos,
      layouts,
      impressoras,
      maquinas: maquinas.map((m, i) => {
        const ocupada = emTurnos.find((x) => x.maquinaId === m.id);
        const anterior = anteriores[i];
        const segue = anterior?.segueRodando && anterior.turno.fechadoEm;
        return {
          maquina: { id: m.id, codigo: m.codigo, descricao: m.descricao, tipo: m.tipo },
          rodadas: rodadas.filter((r) => r.maquinaId === m.id),
          ocupadaPor: ocupada
            ? {
                turnoId: ocupada.turnoId,
                apontadorId: ocupada.turno.apontador.id,
                apontador: ocupada.turno.apontador.nome,
              }
            : null,
          sugestaoInicio: segue ? anterior!.turno.fechadoEm : null,
          sugestaoParadaMotivoId: segue ? anterior!.paradaAbertaMotivoId : null,
          rodadaAnteriorId: segue ? anterior!.rodadaId : null,
        };
      }),
      ordens: ordemIds.map((id) => ({
        id,
        produzido: produzido.get(id) ?? 0,
        ultimoSequencial: sequenciais.find((x) => x.ordemId === id)?._max.sequencial ?? 0,
        saldoSoltoPendente: saldoSolto.get(id) ?? 0,
      })),
      lotes: lotes
        .filter((l) => (saldoLote.get(l.id) ?? 0) > 0)
        .map((l) => ({
          id: l.id,
          numero: l.numero,
          materialId: l.materialId,
          material: l.material,
          saldo: Math.round((saldoLote.get(l.id) ?? 0) * 1000) / 1000,
        })),
      divisoesAbertas: await this.turnos.divisoesAbertas(),
      posto: posto ? { id: posto.id, prefixo: posto.prefixo, nome: posto.nome } : null,
      numeracao: posto ? await this.blocosDoAparelho(posto.id, aparelho) : null,
      turnoAberto: meu ? await this.turnos.detalhe(meu.id) : null,
    };
  }

  // ---------- estado da fila ----------

  async estadoFila(dados: z.infer<typeof esquemaEstadoFila>, aparelho: string, usuario: UsuarioAutenticado) {
    const informados = dados.pendentes.filter(
      (p): p is { turnoId: string; quantidade: number } => !!p.turnoId,
    );
    const existentes = await this.prisma.turnoApontamento.findMany({
      where: { id: { in: informados.map((p) => p.turnoId) } },
      select: { id: true },
    });
    const ids = new Set(existentes.map((t) => t.id));
    // Turnos que não aparecem mais na fila do aparelho ficam com zero pendentes.
    await this.prisma.estadoFilaAparelho.updateMany({
      where: { aparelho, turnoId: { notIn: [...ids] } },
      data: { pendentes: 0 },
    });
    for (const p of informados.filter((x) => ids.has(x.turnoId))) {
      await this.prisma.estadoFilaAparelho.upsert({
        where: { aparelho_turnoId: { aparelho, turnoId: p.turnoId } },
        create: { aparelho, turnoId: p.turnoId, pendentes: p.quantidade, usuarioId: usuario.id },
        update: { pendentes: p.quantidade, usuarioId: usuario.id },
      });
    }
    return { recebidoEm: new Date() };
  }

  // ---------- recusados ----------

  async registrarRecusa(
    dados: z.infer<typeof esquemaRecusado>,
    aparelho: string,
    usuario: UsuarioAutenticado,
  ) {
    const existente = await this.prisma.recusaSincronizacao.findUnique({ where: { itemId: dados.itemId } });
    if (existente) return existente;
    const turno = dados.turnoId
      ? await this.prisma.turnoApontamento.findUnique({ where: { id: dados.turnoId } })
      : null;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.recusaSincronizacao.create({
        data: {
          itemId: dados.itemId,
          turnoId: turno?.id ?? null,
          tipo: dados.tipo,
          rota: dados.rota,
          corpo: dados.corpo as Prisma.InputJsonValue,
          status: dados.status,
          mensagem: dados.mensagem,
          criadoEm: new Date(dados.criadoEm),
          usuarioId: usuario.id,
          aparelho,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'RecusaSincronizacao',
        entidadeId: r.id,
        acao: 'RECUSAR_SINCRONIZACAO',
        novo: { tipo: r.tipo, rota: r.rota, mensagem: r.mensagem },
      });
      return r;
    });
  }

  /** O apontador vê os próprios; líder e superusuário veem todos. */
  async listarRecusas(usuario: UsuarioAutenticado, situacao?: string) {
    const where: Prisma.RecusaSincronizacaoWhereInput = {
      situacao: (situacao || 'PENDENTE') as Prisma.EnumSituacaoRecusaFilter['equals'],
    };
    if (!usuario.perfis.some((p) => p === 'LIDER' || p === 'SUPERUSUARIO')) where.usuarioId = usuario.id;
    return this.prisma.recusaSincronizacao.findMany({
      where,
      include: {
        usuario: { select: { nome: true } },
        decididoPor: { select: { nome: true } },
        turno: {
          select: {
            id: true,
            data: true,
            situacao: true,
            apontadorId: true,
            horarioTurno: { select: { nome: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
      take: 300,
    });
  }

  private async recusaDecidivel(id: string, usuario: UsuarioAutenticado) {
    const r = await this.prisma.recusaSincronizacao.findUnique({ where: { id } });
    if (!r) throw naoEncontrado('Lançamento recusado');
    if (r.situacao !== 'PENDENTE') throw conflito('Este lançamento recusado já foi resolvido.');
    if (r.usuarioId !== usuario.id && !usuario.perfis.includes('LIDER')) {
      throw proibido('Só quem lançou ou o líder resolve este lançamento recusado.');
    }
    return r;
  }

  async descartar(id: string, justificativa: string, usuario: UsuarioAutenticado) {
    const r = await this.recusaDecidivel(id, usuario);
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.recusaSincronizacao.update({
        where: { id },
        data: { situacao: 'DESCARTADO', decididoEm: new Date(), decididoPorId: usuario.id, justificativa },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'RecusaSincronizacao',
        entidadeId: id,
        acao: 'DESCARTAR',
        anterior: { situacao: 'PENDENTE', corpo: r.corpo },
        novo: { situacao: 'DESCARTADO', justificativa },
        completo: true,
      });
      return novo;
    });
  }

  /** Relançado corrigido pela tela: liga o recusado ao novo lançamento. */
  async relancado(id: string, eventoId: string, usuario: UsuarioAutenticado) {
    await this.recusaDecidivel(id, usuario);
    const evento = await this.prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento) throw new ErroNegocio('O novo lançamento ainda não chegou ao servidor.');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.recusaSincronizacao.update({
        where: { id },
        data: {
          situacao: 'RELANCADO',
          decididoEm: new Date(),
          decididoPorId: usuario.id,
          eventoRelancadoId: eventoId,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'RecusaSincronizacao',
        entidadeId: id,
        acao: 'RELANCAR',
        anterior: { situacao: 'PENDENTE' },
        novo: { situacao: 'RELANCADO', eventoId },
      });
      return novo;
    });
  }

  // ---------- impressões feitas offline ----------

  async impressoes(dados: z.infer<typeof esquemaImpressoesOffline>, usuario: UsuarioAutenticado) {
    const etiquetas = await this.prisma.etiqueta.findMany({
      where: { codigo: { in: dados.itens.map((i) => i.codigo) } },
    });
    let registradas = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const i of dados.itens) {
        const e = etiquetas.find((x) => x.codigo === i.codigo);
        if (!e) continue; // o lançamento da etiqueta ainda não chegou ou foi recusado
        const jaRegistrada = await tx.impressaoEtiqueta.findFirst({
          where: { etiquetaId: e.id, criadoEm: new Date(i.em) },
        });
        if (jaRegistrada) continue;
        await tx.impressaoEtiqueta.create({
          data: {
            etiquetaId: e.id,
            layoutId: i.layoutId ?? null,
            impressoraId: i.impressoraId ?? null,
            usuarioId: usuario.id,
            sucesso: i.sucesso,
            mensagem: i.mensagem ?? null,
            criadoEm: new Date(i.em),
            concluidoEm: new Date(i.em),
          },
        });
        if (i.sucesso) await tx.etiqueta.update({ where: { id: e.id }, data: { impressaoPendente: false } });
        registradas++;
      }
    });
    return { registradas };
  }

  // ---------- relógio ----------

  /** Compara o relógio do tablet com o do servidor; acima do parâmetro, gera/atualiza o alerta. */
  async verificarRelogio(aparelho: string, horaAparelho: Date, usuarioId: string | null) {
    const limiteMin = await this.parametros.numero('alerta_diferenca_relogio_min');
    const diferencaSeg = Math.round((horaAparelho.getTime() - Date.now()) / 1000);
    if (Math.abs(diferencaSeg) <= limiteMin * 60) return null;
    const atual = await this.prisma.alertaRelogio.findUnique({ where: { aparelho } });
    if (!atual) {
      return this.prisma.alertaRelogio.create({
        data: { aparelho, usuarioId, diferencaSeg, maiorSeg: diferencaSeg },
      });
    }
    return this.prisma.alertaRelogio.update({
      where: { aparelho },
      data: {
        usuarioId: usuarioId ?? atual.usuarioId,
        diferencaSeg,
        maiorSeg: Math.abs(diferencaSeg) > Math.abs(atual.maiorSeg) ? diferencaSeg : atual.maiorSeg,
        ocorrencias: { increment: 1 },
        ultimaEm: new Date(),
        resolvido: false,
      },
    });
  }

  listarAlertas() {
    return this.prisma.alertaRelogio.findMany({
      include: { usuario: { select: { nome: true, login: true } } },
      orderBy: [{ resolvido: 'asc' }, { ultimaEm: 'desc' }],
    });
  }

  async resolverAlerta(id: string, usuario: UsuarioAutenticado) {
    const a = await this.prisma.alertaRelogio.findUnique({ where: { id } });
    if (!a) throw naoEncontrado('Alerta');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.alertaRelogio.update({ where: { id }, data: { resolvido: true } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'AlertaRelogio',
        entidadeId: id,
        acao: 'RESOLVER',
        anterior: { resolvido: false },
        novo: { resolvido: true },
      });
      return novo;
    });
  }
}
