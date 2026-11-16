import { Inject, Injectable } from '@nestjs/common';
import {
  formatarDataHora,
  ROTULO_TIPO_CORRECAO,
  ROTULO_TIPO_EVENTO,
  type Perfil,
  type SolicitarCorrecao,
} from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado, proibido } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { EventosService } from '../turnos/eventos.service.js';
import { TurnosService } from '../turnos/turnos.service.js';
import { aplicarCorrecao, montarCorretivo } from './correcoes.js';

const EDITAVEIS = ['ABERTO', 'FECHADO', 'APROVADO'];
class Simulacao extends Error {}

/** Correções (RN-09), fila de aprovações do líder e aprovação do relatório do turno (RN-13). */
@Injectable()
export class AprovacoesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(EventosService) private readonly eventos: EventosService,
    @Inject(TurnosService) private readonly turnos: TurnosService,
  ) {}

  private exigirEditavel(situacao: string) {
    if (!EDITAVEIS.includes(situacao)) {
      throw conflito(
        `Turno ${situacao === 'EXPORTADO' ? 'exportado' : 'apurado'} não aceita nenhuma alteração.`,
      );
    }
  }

  // ---------- Correções ----------

  async solicitarCorrecao(
    dados: SolicitarCorrecao,
    usuario: UsuarioAutenticado,
    posto: string | null = null,
  ) {
    const evento = await this.prisma.evento.findUnique({
      where: { id: dados.eventoId },
      include: { turno: true },
    });
    if (!evento) throw naoEncontrado('Lançamento');
    this.exigirEditavel(evento.turno.situacao);
    if (!usuario.perfis.includes('LIDER') && evento.turno.apontadorId !== usuario.id) {
      throw proibido('O apontador só solicita correção nos turnos que ele abriu.');
    }
    if (evento.situacao === 'CORRECAO_PENDENTE')
      throw conflito('Este lançamento já tem uma correção pendente.');
    if (evento.situacao === 'INCORRETO') throw conflito('Este lançamento já foi corrigido.');
    const valores = dados.tipo === 'CORRIGIR' ? (dados.valores ?? {}) : null;
    if (valores) montarCorretivo(evento, valores); // valida o formato antes da simulação

    // Simula a aplicação (sem gravar) para dar retorno imediato sobre a viabilidade.
    try {
      await this.prisma.$transaction(async (tx) => {
        await aplicarCorrecao(tx, this.eventos, {
          original: evento,
          turno: evento.turno,
          tipo: dados.tipo,
          valores,
          solicitante: usuario,
          usuarioId: usuario.id,
          verificarRecebidas: false,
          postoPadrao: posto,
        });
        throw new Simulacao();
      });
    } catch (e) {
      if (!(e instanceof Simulacao)) {
        if (e instanceof ErroNegocio) {
          const r = e.getResponse() as { mensagem: string; detalhes: [] };
          throw new ErroNegocio(`A correção não pode ser aplicada: ${r.mensagem}`, r.detalhes, e.getStatus());
        }
        throw e;
      }
    }

    const descricao = `${ROTULO_TIPO_CORRECAO[dados.tipo]}: ${ROTULO_TIPO_EVENTO[evento.tipo]} de ${formatarDataHora(evento.horaOcorrencia)} — ${dados.justificativa}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.evento.update({ where: { id: evento.id }, data: { situacao: 'CORRECAO_PENDENTE' } });
      const aprov = await tx.aprovacao.create({
        data: {
          tipo: 'CORRECAO',
          turnoId: evento.turnoId,
          eventoId: evento.id,
          solicitanteId: usuario.id,
          descricao,
          correcaoTipo: dados.tipo,
          justificativa: dados.justificativa,
          valoresCorrecao: (valores ?? Prisma.DbNull) as Prisma.InputJsonValue,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Evento',
        entidadeId: evento.id,
        acao: 'SOLICITAR_CORRECAO',
        anterior: { situacao: 'VALIDO' },
        novo: {
          situacao: 'CORRECAO_PENDENTE',
          tipo: dados.tipo,
          justificativa: dados.justificativa,
          valores,
        },
        completo: true,
      });
      return aprov;
    });
  }

  // ---------- Fila de aprovações ----------

  async listar(filtro: { turnoId?: string; situacao?: string }) {
    const where: Prisma.AprovacaoWhereInput = { tipo: { not: 'RELATORIO_TURNO' } };
    if (filtro.turnoId) where.turnoId = filtro.turnoId;
    where.situacao = (filtro.situacao ?? 'PENDENTE') as Prisma.EnumSituacaoAprovacaoFilter['equals'];
    const itens = await this.prisma.aprovacao.findMany({
      where,
      include: {
        turno: {
          include: {
            horarioTurno: { select: { nome: true } },
            equipe: { select: { letra: true } },
            apontador: { select: { nome: true } },
          },
        },
        evento: true,
        solicitante: { select: { id: true, nome: true } },
        aprovador: { select: { nome: true } },
      },
      orderBy: [{ turno: { data: 'asc' } }, { criadoEm: 'asc' }],
      take: 500,
    });
    const nomes = await this.turnos.mapasDescricao(
      itens.map((i) => i.evento).filter((e): e is NonNullable<typeof e> => !!e),
    );
    const corretivos = await this.prisma.evento.findMany({
      where: { id: { in: itens.map((i) => i.eventoCorretivoId).filter((x): x is string => !!x) } },
    });
    return itens.map((i) => ({
      ...i,
      turno: { ...i.turno, data: i.turno.data.toISOString().slice(0, 10) },
      evento: i.evento ? { ...i.evento, resumo: this.turnos.resumo(i.evento, nomes) } : null,
      eventoCorretivo: corretivos.find((c) => c.id === i.eventoCorretivoId) ?? null,
    }));
  }

  private async carregarPendente(id: string, usuario: UsuarioAutenticado) {
    const aprov = await this.prisma.aprovacao.findUnique({
      where: { id },
      include: { turno: true, evento: true, solicitante: true },
    });
    if (!aprov) throw naoEncontrado('Pendência');
    if (aprov.situacao !== 'PENDENTE') throw conflito('Esta pendência já foi decidida.');
    this.exigirEditavel(aprov.turno.situacao);
    if (aprov.solicitanteId === usuario.id) {
      throw proibido(
        aprov.tipo === 'CORRECAO'
          ? 'Quem solicitou a correção não pode aprová-la.'
          : 'Você não pode decidir uma pendência gerada por você.',
      );
    }
    return aprov;
  }

  async aprovar(
    id: string,
    parecer: string | null,
    usuario: UsuarioAutenticado,
    posto: string | null = null,
  ) {
    const aprov = await this.carregarPendente(id, usuario);
    return this.prisma.$transaction(async (tx) => {
      let eventoCorretivoId: string | null = null;
      let detalhe: Record<string, unknown> = {};
      if (aprov.tipo === 'CORRECAO') {
        if (!aprov.evento) throw naoEncontrado('Lançamento');
        const r = await aplicarCorrecao(tx, this.eventos, {
          original: aprov.evento,
          turno: aprov.turno,
          tipo: aprov.correcaoTipo as 'CORRIGIR' | 'ANULAR',
          valores: (aprov.valoresCorrecao as Record<string, unknown> | null) ?? null,
          solicitante: {
            id: aprov.solicitante.id,
            login: aprov.solicitante.login,
            nome: aprov.solicitante.nome,
            perfis: aprov.solicitante.perfis as Perfil[],
          },
          usuarioId: usuario.id,
          verificarRecebidas: true,
          postoPadrao: posto,
        });
        eventoCorretivoId = r.corretivo?.id ?? null;
        detalhe = {
          eventoCorretivoId,
          etiquetasCanceladas: r.etiquetasCanceladas,
          etiquetasNovas: r.etiquetasNovas.map((e) => e.codigo),
        };
      }
      const novo = await tx.aprovacao.update({
        where: { id },
        data: {
          situacao: 'APROVADA',
          aprovadorId: usuario.id,
          parecer,
          decididoEm: new Date(),
          eventoCorretivoId,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Aprovacao',
        entidadeId: id,
        acao: aprov.tipo === 'CORRECAO' ? 'APROVAR_CORRECAO' : 'APROVAR',
        anterior: { situacao: 'PENDENTE' },
        novo: { situacao: 'APROVADA', parecer, ...detalhe },
        completo: true,
      });
      return { ...novo, ...detalhe };
    });
  }

  async rejeitar(id: string, parecer: string, usuario: UsuarioAutenticado) {
    const aprov = await this.carregarPendente(id, usuario);
    return this.prisma.$transaction(async (tx) => {
      if (aprov.tipo === 'CORRECAO' && aprov.eventoId) {
        await tx.evento.update({ where: { id: aprov.eventoId }, data: { situacao: 'VALIDO' } });
      }
      const novo = await tx.aprovacao.update({
        where: { id },
        data: { situacao: 'REJEITADA', aprovadorId: usuario.id, parecer, decididoEm: new Date() },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Aprovacao',
        entidadeId: id,
        acao: aprov.tipo === 'CORRECAO' ? 'REJEITAR_CORRECAO' : 'REJEITAR',
        anterior: { situacao: 'PENDENTE' },
        novo: { situacao: 'REJEITADA', parecer },
        completo: true,
      });
      return novo;
    });
  }

  // ---------- Relatório do turno ----------

  /** O líder aprova o relatório quando não há pendência em aberto (RN-13). */
  async aprovarRelatorio(turnoId: string, parecer: string | null, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turnoApontamento.findUnique({ where: { id: turnoId } });
    if (!turno) throw naoEncontrado('Turno');
    if (turno.situacao !== 'FECHADO') {
      throw conflito(
        turno.situacao === 'ABERTO'
          ? 'O turno ainda está aberto.'
          : 'O relatório deste turno já foi aprovado.',
      );
    }
    if (turno.apontadorId === usuario.id)
      throw proibido('Você não pode aprovar o relatório de um turno que você apontou.');
    // P17 / seção 11: a fila de envio do tablet daquele turno precisa estar vazia.
    const fila = await this.prisma.estadoFilaAparelho.aggregate({
      where: { turnoId, pendentes: { gt: 0 } },
      _sum: { pendentes: true },
    });
    if (fila._sum.pendentes) {
      throw conflito(
        `O relatório não pode ser aprovado: há ${fila._sum.pendentes} lançamento(s) deste turno aguardando envio no tablet.`,
      );
    }
    const pendentes = await this.prisma.aprovacao.count({ where: { turnoId, situacao: 'PENDENTE' } });
    const corrPend = await this.prisma.evento.count({ where: { turnoId, situacao: 'CORRECAO_PENDENTE' } });
    if (pendentes + corrPend > 0) {
      throw conflito(
        `O relatório não pode ser aprovado: há ${pendentes} pendência(s) em aberto. Decida cada uma antes.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const agora = new Date();
      const novo = await tx.turnoApontamento.update({
        where: { id: turnoId },
        data: { situacao: 'APROVADO', aprovadoEm: agora, aprovadoPorId: usuario.id },
      });
      await tx.aprovacao.create({
        data: {
          tipo: 'RELATORIO_TURNO',
          turnoId,
          solicitanteId: turno.apontadorId,
          aprovadorId: usuario.id,
          situacao: 'APROVADA',
          descricao: 'Relatório do turno',
          parecer,
          decididoEm: agora,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'TurnoApontamento',
        entidadeId: turnoId,
        acao: 'APROVAR_RELATORIO',
        anterior: { situacao: 'FECHADO' },
        novo: { situacao: 'APROVADO', parecer },
        completo: true,
      });
      return novo;
    });
  }
}
