import { Inject, Injectable } from '@nestjs/common';
import {
  calcularMeta,
  codigoDivisao,
  horarioVigente,
  horasDisponiveisSugeridas,
  ordenarEventosTempo,
  periodoNominal,
  ROTULO_TIPO_EVENTO,
  type EventoEntrada,
  type EventoTempo,
  type FecharTurno,
  type TipoEvento,
} from '@apontamento/shared';
import { Prisma, type TurnoApontamento } from '../generated/prisma/client.js';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado, proibido } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { producaoPorOrdem } from '../ordens/producao-ordem.js';
import { EventosService, type ContextoLancamento } from './eventos.service.js';

const deDate = (d: Date) => d.toISOString().slice(0, 10);
const paraDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

export type EstadoMaquina = {
  situacao: 'LIGADA' | 'PARADA' | 'DESLIGADA';
  desde: Date | null;
  motivoParadaId: string | null;
};

/** Estado atual da máquina a partir dos eventos de tempo (válidos) do turno. */
export function estadoMaquina(
  eventos: { tipo: string; horaOcorrencia: Date; recebidoEm: Date; dados: unknown }[],
): EstadoMaquina {
  let estado: EstadoMaquina = { situacao: 'DESLIGADA', desde: null, motivoParadaId: null };
  const tempo = eventos
    .filter((e) => ['INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO'].includes(e.tipo))
    .map((e) => ({
      tipo: e.tipo as EventoTempo['tipo'],
      hora: e.horaOcorrencia.getTime(),
      seq: e.recebidoEm.getTime(),
      dados: e.dados,
    }));
  for (const e of ordenarEventosTempo(tempo)) {
    const desde = new Date(e.hora);
    if (e.tipo === 'INICIO_MAQUINA' || e.tipo === 'REINICIO')
      estado = { situacao: 'LIGADA', desde, motivoParadaId: null };
    else if (e.tipo === 'PARADA')
      estado = {
        situacao: 'PARADA',
        desde,
        motivoParadaId: (e.dados as { motivoParadaId: string }).motivoParadaId,
      };
    else estado = { situacao: 'DESLIGADA', desde, motivoParadaId: null };
  }
  return estado;
}

@Injectable()
export class TurnosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  // ---------- Consultas ----------

  /** Sugestão de horário e equipe pela escala (RN-04). */
  async sugestao(agora = new Date()) {
    const horarios = await this.prisma.horarioTurno.findMany({
      where: { ativo: true },
      orderBy: { horaInicio: 'asc' },
    });
    const vigente = horarioVigente(horarios, agora);
    if (!vigente) return { data: deDate(agora), horarioTurnoId: null, equipeId: null };
    const escala = await this.prisma.escala.findUnique({
      where: { data_horarioTurnoId: { data: paraDate(vigente.data), horarioTurnoId: vigente.horario.id } },
    });
    return { data: vigente.data, horarioTurnoId: vigente.horario.id, equipeId: escala?.equipeId ?? null };
  }

  meuAberto(usuario: UsuarioAutenticado) {
    return this.prisma.turnoApontamento.findFirst({
      where: { apontadorId: usuario.id, situacao: 'ABERTO' },
      select: { id: true },
    });
  }

  async listar(filtro: { situacao?: string; data?: string; apontadorId?: string }) {
    const where: Prisma.TurnoApontamentoWhereInput = {};
    if (filtro.situacao)
      where.situacao = { in: filtro.situacao.split(',') as Prisma.EnumSituacaoTurnoFilter['in'] };
    if (filtro.data) where.data = paraDate(filtro.data);
    if (filtro.apontadorId) where.apontadorId = filtro.apontadorId;
    const turnos = await this.prisma.turnoApontamento.findMany({
      where,
      include: {
        apontador: { select: { nome: true } },
        horarioTurno: { select: { nome: true, horaInicio: true, horaFim: true } },
        equipe: { select: { letra: true } },
        _count: {
          select: { maquinas: true, eventos: true, aprovacoes: { where: { situacao: 'PENDENTE' } } },
        },
      },
      orderBy: [{ data: 'desc' }, { abertoEm: 'desc' }],
      take: 200,
    });
    return turnos.map((t) => ({ ...t, data: deDate(t.data) }));
  }

  private async carregar(id: string) {
    const turno = await this.prisma.turnoApontamento.findUnique({ where: { id } });
    if (!turno) throw naoEncontrado('Turno');
    return turno;
  }

  /** O apontador só lança no turno que ele abriu e enquanto estiver aberto (seção 5). */
  private async carregarParaLancar(id: string, usuario: UsuarioAutenticado): Promise<TurnoApontamento> {
    const turno = await this.carregar(id);
    if (turno.apontadorId !== usuario.id) throw proibido('Você só pode lançar no turno que você abriu.');
    if (turno.situacao !== 'ABERTO') throw conflito('Turno fechado não recebe novos lançamentos.');
    return turno;
  }

  private ctx(turno: TurnoApontamento, usuario: UsuarioAutenticado, dispositivo: string): ContextoLancamento {
    return { turno, usuario, dispositivo, agora: new Date() };
  }

  /** Visão completa do turno para a tela do apontador. */
  async detalhe(id: string) {
    const turno = await this.prisma.turnoApontamento.findUnique({
      where: { id },
      include: {
        apontador: { select: { id: true, nome: true } },
        horarioTurno: true,
        equipe: { select: { id: true, letra: true } },
        maquinas: {
          include: {
            maquina: { select: { id: true, codigo: true, descricao: true, tipo: true } },
            rodada: {
              include: {
                molde: { select: { codigo: true, numeroCavidades: true } },
                ops: {
                  orderBy: { ordem: { numeroInterno: 'asc' } },
                  include: {
                    ordem: {
                      include: {
                        produto: { select: { id: true, codigo: true, descricao: true, unidade: true } },
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
            },
          },
          orderBy: { maquina: { codigo: 'asc' } },
        },
        divisoes: { orderBy: { codigo: 'asc' } },
      },
    });
    if (!turno) throw naoEncontrado('Turno');
    const eventos = await this.prisma.evento.findMany({
      where: { turnoId: id },
      orderBy: [{ horaOcorrencia: 'desc' }, { recebidoEm: 'desc' }],
      include: { usuario: { select: { nome: true } } },
    });
    const validos = eventos.filter((e) => e.situacao !== 'INCORRETO');
    const motivos = new Map((await this.prisma.motivoParada.findMany()).map((m) => [m.id, m]));
    const ordemIds = turno.divisoes.map((d) => d.ordemId);
    const producaoOrdem = await producaoPorOrdem(this.prisma, ordemIds);
    const rodadaIds = turno.maquinas.map((m) => m.rodadaId);
    const bloqueiosRodada = await this.prisma.evento.findMany({
      where: {
        rodadaId: { in: rodadaIds },
        tipo: { in: ['BLOQUEIO_CAVIDADE', 'DESBLOQUEIO_CAVIDADE'] },
        situacao: { not: 'INCORRETO' },
      },
      orderBy: { horaOcorrencia: 'asc' },
    });
    const pendentes = await this.prisma.aprovacao.findMany({
      where: { turnoId: id, situacao: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
    });
    const descricoes = await this.mapasDescricao(validos);

    return {
      ...turno,
      data: deDate(turno.data),
      maquinas: turno.maquinas.map((mt) => {
        const doMaquina = validos.filter((e) => e.maquinaId === mt.maquinaId);
        const estado = estadoMaquina(doMaquina);
        const bloqueadas = new Map<number, string>();
        for (const b of bloqueiosRodada.filter((x) => x.rodadaId === mt.rodadaId)) {
          const d = b.dados as { cavidade: number; motivo?: string };
          if (b.tipo === 'BLOQUEIO_CAVIDADE') bloqueadas.set(d.cavidade, d.motivo ?? '');
          else bloqueadas.delete(d.cavidade);
        }
        return {
          ...mt,
          estado: {
            ...estado,
            motivoParada: estado.motivoParadaId ? (motivos.get(estado.motivoParadaId) ?? null) : null,
          },
          cavidadesBloqueadas: [...bloqueadas].map(([cavidade, motivo]) => ({ cavidade, motivo })),
          divisoes: turno.divisoes
            .filter((d) => d.maquinaId === mt.maquinaId)
            .map((d) => {
              const ev = doMaquina.filter((e) => e.divisaoId === d.id);
              const soma = (tipo: TipoEvento) =>
                ev.filter((e) => e.tipo === tipo).reduce((s, e) => s + (e.quantidade ?? 0), 0);
              const etiquetado = soma('SAIDA_PRODUCAO');
              const ordem = mt.rodada.ops.find((o) => o.id === d.rodadaOpId)!.ordem;
              return {
                ...d,
                etiquetado,
                saldoRecebido: soma('SALDO_AVULSO_RECEBIDO'),
                saldoDeixado: soma('SALDO_AVULSO_DEIXADO'),
                producaoOp: producaoOrdem.get(d.ordemId) ?? 0,
                quantidadeOp: ordem.quantidade,
              };
            }),
        };
      }),
      eventos: eventos.map((e) => ({ ...e, resumo: this.resumo(e, descricoes) })),
      pendencias: pendentes,
    };
  }

  private async mapasDescricao(eventos: { dados: unknown }[]) {
    const ids = new Set<string>();
    for (const e of eventos) {
      const d = e.dados as Record<string, unknown>;
      for (const k of ['motivoParadaId', 'tipoPerdaId', 'materialId', 'produtoId'])
        if (typeof d[k] === 'string') ids.add(d[k] as string);
    }
    const [motivos, tipos, produtos] = await Promise.all([
      this.prisma.motivoParada.findMany({ where: { id: { in: [...ids] } } }),
      this.prisma.tipoPerda.findMany({ where: { id: { in: [...ids] } } }),
      this.prisma.produto.findMany({ where: { id: { in: [...ids] } } }),
    ]);
    const mapa = new Map<string, string>();
    for (const m of motivos) mapa.set(m.id, `${m.codigo} — ${m.descricao}`);
    for (const t of tipos) mapa.set(t.id, t.descricao);
    for (const p of produtos) mapa.set(p.id, `${p.codigo}`);
    return mapa;
  }

  /** Texto curto do lançamento para a lista do turno. */
  private resumo(
    e: { tipo: string; dados: unknown; quantidade: number | null },
    nomes: Map<string, string>,
  ): string {
    const d = e.dados as Record<string, unknown>;
    const n = (x: unknown) => Number(x ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    switch (e.tipo) {
      case 'PARADA':
        return `${nomes.get(d.motivoParadaId as string) ?? ''}${d.programada ? ' (programada)' : ''}`;
      case 'SAIDA_PRODUCAO': {
        if (Array.isArray(d.volumes))
          return `${d.volumes.length} volume(s), ${n(e.quantidade)} kg — operador ${d.operador}`;
        const conjuntos = (d.conjuntos as { quantidade: number; avulso: boolean }[]) ?? [];
        const avulsos = conjuntos.filter((c) => c.avulso);
        return `${conjuntos.length} conjunto(s), ${n(e.quantidade)} pç${avulsos.length ? ` — AVULSO: ${avulsos.map((a) => a.quantidade).join(', ')} pç` : ''} — peso ${n(d.pesoMedioG)} g`;
      }
      case 'PERDA':
        return `${nomes.get(d.tipoPerdaId as string) ?? ''}: ${d.pesoKg != null ? `${n(d.pesoKg)} kg` : ''}${d.pesoKg != null && d.quantidadePecas != null ? ' / ' : ''}${d.quantidadePecas != null ? `${n(d.quantidadePecas)} pç` : ''}`;
      case 'ENTRADA_MATERIA_PRIMA':
      case 'DEVOLUCAO_MATERIA_PRIMA':
        return `${nomes.get(d.materialId as string) ?? ''} lote ${d.lote}: ${n(d.quantidadeKg)} kg`;
      case 'TRANSFERENCIA':
        return `${nomes.get(d.materialId as string) ?? ''} lote ${d.lote}: ${n(d.quantidadeKg)} kg → ${d.codigoDivisaoDestino}`;
      case 'ENTRADA_SEMIACABADO':
        return `${nomes.get(d.produtoId as string) ?? ''}: ${n(d.quantidade)} pç${d.lote ? ` (lote ${d.lote})` : ''}`;
      case 'BLOQUEIO_CAVIDADE':
        return `Cavidade ${d.cavidade}: ${d.motivo}`;
      case 'DESBLOQUEIO_CAVIDADE':
        return `Cavidade ${d.cavidade}`;
      case 'SALDO_AVULSO_DEIXADO':
      case 'SALDO_AVULSO_RECEBIDO':
        return `${n(e.quantidade)} pç`;
      default:
        return ROTULO_TIPO_EVENTO[e.tipo as TipoEvento] ?? e.tipo;
    }
  }

  // ---------- Abertura ----------

  async abrir(
    dados: { data: string; horarioTurnoId: string; equipeId: string },
    usuario: UsuarioAutenticado,
    dispositivo: string,
  ) {
    const aberto = await this.meuAberto(usuario);
    if (aberto) throw conflito('Você já tem um turno aberto. Feche-o antes de abrir outro.');
    const [horario, equipe] = await Promise.all([
      this.prisma.horarioTurno.findUnique({ where: { id: dados.horarioTurnoId } }),
      this.prisma.equipe.findUnique({ where: { id: dados.equipeId } }),
    ]);
    if (!horario?.ativo) throw new ErroNegocio('Horário de turno inexistente ou inativo.');
    if (!equipe?.ativo) throw new ErroNegocio('Equipe inexistente ou inativa.');
    const nominal = periodoNominal(dados.data, horario.horaInicio, horario.horaFim);
    const turno = await this.prisma.$transaction(async (tx) => {
      const t = await tx.turnoApontamento.create({
        data: {
          apontadorId: usuario.id,
          data: paraDate(dados.data),
          horarioTurnoId: horario.id,
          equipeId: equipe.id,
          inicioNominal: nominal.inicio,
          fimNominal: nominal.fim,
          dispositivo,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'TurnoApontamento',
        entidadeId: t.id,
        acao: 'ABRIR',
        novo: t,
      });
      return t;
    });
    return this.detalhe(turno.id);
  }

  /** Máquinas que podem ser ligadas no turno, com sugestões herdadas do turno anterior (RN-04). */
  async maquinasDisponiveis(turnoId: string, usuario: UsuarioAutenticado) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    const maquinas = await this.prisma.maquina.findMany({
      where: { ativa: true },
      orderBy: { codigo: 'asc' },
    });
    const rodadas = await this.prisma.rodada.findMany({
      where: { situacao: { in: ['PLANEJADA', 'EM_ANDAMENTO'] } },
      include: {
        molde: { select: { codigo: true } },
        ops: {
          include: {
            ordem: {
              select: {
                numeroErp: true,
                numeroInterno: true,
                produto: { select: { codigo: true, descricao: true } },
              },
            },
          },
        },
      },
      orderBy: { numero: 'asc' },
    });
    const emTurnos = await this.prisma.maquinaTurno.findMany({
      where: { turno: { situacao: 'ABERTO' } },
      include: { turno: { include: { apontador: { select: { nome: true } } } } },
    });
    const r = [];
    for (const m of maquinas) {
      const ocupada = emTurnos.find((x) => x.maquinaId === m.id);
      const anterior = await this.prisma.maquinaTurno.findFirst({
        where: { maquinaId: m.id, turno: { situacao: { not: 'ABERTO' } } },
        orderBy: { turno: { fechadoEm: 'desc' } },
        include: { turno: true },
      });
      const segue = anterior?.segueRodando && anterior.turno.fechadoEm;
      r.push({
        maquina: { id: m.id, codigo: m.codigo, descricao: m.descricao, tipo: m.tipo },
        rodadas: rodadas.filter((x) => x.maquinaId === m.id),
        noTurno: ocupada?.turnoId === turno.id,
        emOutroTurno:
          ocupada && ocupada.turnoId !== turno.id ? { apontador: ocupada.turno.apontador.nome } : null,
        sugestaoInicio: segue ? anterior!.turno.fechadoEm : null,
        sugestaoParadaMotivoId: segue ? anterior!.paradaAbertaMotivoId : null,
        rodadaAnteriorId: segue ? anterior!.rodadaId : null,
      });
    }
    return r;
  }

  /** Liga a máquina no turno: gera o evento de início e o tempo começa a contar (RN-04). */
  async ligarMaquina(
    turnoId: string,
    dados: {
      eventoId: string;
      maquinaId: string;
      rodadaId: string;
      horaOcorrencia: string;
      iniciarParadaMotivoId: string | null;
    },
    usuario: UsuarioAutenticado,
    dispositivo: string,
  ) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    const maquina = await this.prisma.maquina.findUnique({ where: { id: dados.maquinaId } });
    if (!maquina?.ativa) throw new ErroNegocio('Máquina inexistente ou inativa.');
    const rodada = await this.prisma.rodada.findUnique({ where: { id: dados.rodadaId } });
    if (!rodada || rodada.maquinaId !== maquina.id) throw new ErroNegocio('A rodada não é desta máquina.');
    if (rodada.situacao === 'ENCERRADA') throw new ErroNegocio('A rodada está encerrada.');
    const outra = await this.prisma.rodada.findFirst({
      where: { maquinaId: maquina.id, situacao: 'EM_ANDAMENTO', id: { not: rodada.id } },
    });
    if (outra)
      throw conflito(
        `A máquina já tem a rodada ${outra.numero} em andamento. O PCP precisa encerrá-la antes.`,
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`maquina|${maquina.id}`}))`;
      const ocupada = await tx.maquinaTurno.findFirst({
        where: { maquinaId: maquina.id, turno: { situacao: 'ABERTO' } },
        include: { turno: { include: { apontador: { select: { nome: true } } } } },
      });
      if (ocupada?.turnoId === turno.id)
        throw conflito('A máquina já está neste turno. Use "Início de máquina" para religá-la.');
      if (ocupada) throw conflito(`A máquina está no turno aberto de ${ocupada.turno.apontador.nome}.`);
      await tx.maquinaTurno.create({
        data: { turnoId: turno.id, maquinaId: maquina.id, rodadaId: rodada.id },
      });
      const ctx = this.ctx(turno, usuario, dispositivo);
      await this.eventos.registrar(tx, ctx, {
        id: dados.eventoId,
        tipo: 'INICIO_MAQUINA',
        maquinaId: maquina.id,
        horaOcorrencia: dados.horaOcorrencia,
        justificativa: null,
      });
      if (dados.iniciarParadaMotivoId) {
        await this.eventos.registrar(tx, ctx, {
          id: this.eventos.novoId(),
          tipo: 'PARADA',
          maquinaId: maquina.id,
          horaOcorrencia: dados.horaOcorrencia,
          motivoParadaId: dados.iniciarParadaMotivoId,
          justificativa: 'Parada iniciada no turno anterior.',
        });
      }
      if (rodada.situacao === 'PLANEJADA') {
        await tx.rodada.update({
          where: { id: rodada.id },
          data: { situacao: 'EM_ANDAMENTO', iniciadaEm: new Date(dados.horaOcorrencia) },
        });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'Rodada',
          entidadeId: rodada.id,
          acao: 'INICIAR',
          anterior: { situacao: 'PLANEJADA' },
          novo: { situacao: 'EM_ANDAMENTO' },
        });
      }
    });
    return this.detalhe(turno.id);
  }

  // ---------- Divisão da OP ----------

  private async saldoSoltoPendente(tx: Transacao | PrismaService, ordemId: string) {
    const deixados = await tx.evento.findMany({
      where: {
        tipo: 'SALDO_AVULSO_DEIXADO',
        situacao: { not: 'INCORRETO' },
        divisao: { ordemId },
        turno: { situacao: { not: 'ABERTO' } },
      },
      orderBy: { horaOcorrencia: 'asc' },
    });
    if (!deixados.length) return { quantidade: 0, eventoIds: [] as string[] };
    const recebidos = await tx.evento.findMany({
      where: { tipo: 'SALDO_AVULSO_RECEBIDO', situacao: { not: 'INCORRETO' }, divisao: { ordemId } },
    });
    const jaRecebidos = new Set(
      recebidos.flatMap((r) => (r.dados as { deixadoEventoIds?: string[] }).deixadoEventoIds ?? []),
    );
    const pendentes = deixados.filter((d) => !jaRecebidos.has(d.id));
    return {
      quantidade: pendentes.reduce((s, e) => s + (e.quantidade ?? 0), 0),
      eventoIds: pendentes.map((p) => p.id),
    };
  }

  /** Proposta da divisão: próximo sequencial, código, horas disponíveis, PH, meta e saldo solto (RN-04, RN-06). */
  async propostaDivisao(
    turnoId: string,
    rodadaOpId: string,
    maquinaId: string,
    usuario: UsuarioAutenticado,
    horasInformadas?: number | null,
  ) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    const mt = await this.prisma.maquinaTurno.findUnique({
      where: { turnoId_maquinaId: { turnoId, maquinaId } },
    });
    if (!mt) throw new ErroNegocio('A máquina não está neste turno.');
    const rodadaOp = await this.prisma.rodadaOp.findUnique({
      where: { id: rodadaOpId },
      include: { ordem: { include: { produto: true } }, fichaTecnica: true },
    });
    if (!rodadaOp || rodadaOp.rodadaId !== mt.rodadaId)
      throw new ErroNegocio('A OP não pertence à rodada desta máquina.');
    const horario = await this.prisma.horarioTurno.findUniqueOrThrow({ where: { id: turno.horarioTurnoId } });
    const inicio = await this.prisma.evento.findFirst({
      where: { turnoId, maquinaId, tipo: 'INICIO_MAQUINA', situacao: { not: 'INCORRETO' } },
      orderBy: { horaOcorrencia: 'asc' },
    });
    const ultima = await this.prisma.divisaoOp.aggregate({
      where: { ordemId: rodadaOp.ordemId },
      _max: { sequencial: true },
    });
    const sequencial = (ultima._max.sequencial ?? 0) + 1;
    const ordem = rodadaOp.ordem;
    const produzido = (await producaoPorOrdem(this.prisma, [ordem.id])).get(ordem.id) ?? 0;
    const saldoOp = Math.max(0, Math.round((ordem.quantidade - produzido) * 1000) / 1000);
    const horasSugeridas = horasDisponiveisSugeridas({
      inicioMaquina: inicio?.horaOcorrencia ?? new Date(),
      inicioNominal: turno.inicioNominal,
      fimNominal: turno.fimNominal,
      paradaProgramadaPrevistaMin: horario.paradaProgramadaPrevistaMin,
    });
    const horas = horasInformadas ?? horasSugeridas;
    const ph = rodadaOp.fichaTecnica.phPadrao;
    return {
      rodadaOpId,
      ordem: {
        id: ordem.id,
        numeroErp: ordem.numeroErp,
        numeroInterno: ordem.numeroInterno,
        quantidade: ordem.quantidade,
        unidade: ordem.unidade,
        produto: { codigo: ordem.produto.codigo, descricao: ordem.produto.descricao },
      },
      sequencial,
      codigo: codigoDivisao(ordem.numeroErp ?? String(ordem.numeroInterno), sequencial),
      horasSugeridas,
      horasDisponiveis: horas,
      paradaProgramadaPrevistaMin: horario.paradaProgramadaPrevistaMin,
      phReferencia: ph,
      produzidoOp: produzido,
      saldoOp,
      meta: calcularMeta(horas, ph, saldoOp, ordem.unidade),
      saldoSoltoPendente: (await this.saldoSoltoPendente(this.prisma, ordem.id)).quantidade,
    };
  }

  async criarDivisao(
    turnoId: string,
    dados: {
      rodadaOpId: string;
      maquinaId: string;
      horasDisponiveis?: number | null;
      saldoRecebido?: number | null;
    },
    usuario: UsuarioAutenticado,
    dispositivo: string,
  ) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    const proposta = await this.propostaDivisao(
      turnoId,
      dados.rodadaOpId,
      dados.maquinaId,
      usuario,
      dados.horasDisponiveis,
    );
    const ordem = await this.prisma.ordemProducao.findUniqueOrThrow({ where: { id: proposta.ordem.id } });
    if (!['ABERTA', 'EM_PRODUCAO'].includes(ordem.situacao))
      throw new ErroNegocio('A OP está encerrada ou cancelada.');
    if (
      await this.prisma.divisaoOp.findUnique({
        where: { turnoId_rodadaOpId: { turnoId, rodadaOpId: dados.rodadaOpId } },
      })
    ) {
      throw conflito('Esta OP já tem divisão neste turno.');
    }
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ordem|${ordem.id}`}))`;
      const ultima = await tx.divisaoOp.aggregate({
        where: { ordemId: ordem.id },
        _max: { sequencial: true },
      });
      const sequencial = (ultima._max.sequencial ?? 0) + 1;
      const divisao = await tx.divisaoOp.create({
        data: {
          ordemId: ordem.id,
          rodadaOpId: dados.rodadaOpId,
          sequencial,
          codigo: codigoDivisao(ordem.numeroErp ?? String(ordem.numeroInterno), sequencial),
          turnoId,
          maquinaId: dados.maquinaId,
          horasDisponiveis: proposta.horasDisponiveis,
          phReferencia: proposta.phReferencia,
          meta: proposta.meta,
        },
      });
      if (ordem.situacao === 'ABERTA')
        await tx.ordemProducao.update({ where: { id: ordem.id }, data: { situacao: 'EM_PRODUCAO' } });

      // RN-06: o novo apontador confirma o saldo solto recebido do turno anterior.
      const pendente = await this.saldoSoltoPendente(tx, ordem.id);
      if (pendente.eventoIds.length) {
        if (dados.saldoRecebido == null) {
          throw new ErroNegocio(
            `Há ${pendente.quantidade} peça(s) de saldo solto deixadas pelo turno anterior. Confirme o saldo recebido.`,
            [{ campo: 'saldoRecebido', mensagem: 'Confirme o saldo recebido.' }],
          );
        }
        await this.eventos.registrar(tx, this.ctx(turno, usuario, dispositivo), {
          id: this.eventos.novoId(),
          tipo: 'SALDO_AVULSO_RECEBIDO',
          maquinaId: dados.maquinaId,
          divisaoId: divisao.id,
          horaOcorrencia: new Date().toISOString(),
          quantidade: dados.saldoRecebido,
          dados: { deixadoEventoIds: pendente.eventoIds, quantidadeDeixada: pendente.quantidade },
        });
      } else if (dados.saldoRecebido) {
        throw new ErroNegocio('Não há saldo solto pendente para esta OP.');
      }
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'DivisaoOp',
        entidadeId: divisao.id,
        acao: 'CRIAR',
        novo: divisao,
      });
      return divisao.id;
    });
    return this.prisma.divisaoOp.findUniqueOrThrow({ where: { id } });
  }

  /** O apontador pode ajustar as horas disponíveis; a meta é recalculada (RN-04). */
  async ajustarDivisao(turnoId: string, divisaoId: string, horas: number, usuario: UsuarioAutenticado) {
    await this.carregarParaLancar(turnoId, usuario);
    const anterior = await this.prisma.divisaoOp.findUnique({
      where: { id: divisaoId },
      include: { ordem: true },
    });
    if (!anterior || anterior.turnoId !== turnoId) throw naoEncontrado('Divisão');
    const producao = (await producaoPorOrdem(this.prisma, [anterior.ordemId])).get(anterior.ordemId) ?? 0;
    // Saldo considerado na abertura: desconta o que esta divisão já produziu.
    const daDivisao = await this.prisma.evento.aggregate({
      where: { divisaoId, tipo: 'SAIDA_PRODUCAO', situacao: { not: 'INCORRETO' } },
      _sum: { quantidade: true },
    });
    const saldo = anterior.ordem.quantidade - (producao - (daDivisao._sum.quantidade ?? 0));
    const meta = calcularMeta(horas, anterior.phReferencia, saldo, anterior.ordem.unidade);
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.divisaoOp.update({
        where: { id: divisaoId },
        data: { horasDisponiveis: horas, meta },
      });
      const { ordem: _o, ...semOrdem } = anterior;
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'DivisaoOp',
        entidadeId: divisaoId,
        acao: 'AJUSTAR_HORAS',
        anterior: semOrdem,
        novo,
      });
      return novo;
    });
  }

  /** Divisões em turnos abertos (destino de transferências de material). */
  async divisoesAbertas() {
    return this.prisma.divisaoOp.findMany({
      where: { turno: { situacao: 'ABERTO' } },
      include: {
        maquina: { select: { id: true, codigo: true } },
        ordem: { include: { produto: { select: { codigo: true } } } },
      },
      orderBy: { codigo: 'asc' },
    });
  }

  // ---------- Eventos ----------

  async lancar(turnoId: string, entrada: EventoEntrada, usuario: UsuarioAutenticado, dispositivo: string) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    if (entrada.tipo === 'INICIO_MAQUINA') {
      const mt = await this.prisma.maquinaTurno.findUnique({
        where: { turnoId_maquinaId: { turnoId, maquinaId: entrada.maquinaId } },
      });
      if (!mt) throw new ErroNegocio('Use "Ligar máquina" para incluir a máquina no turno.');
    }
    return this.prisma.$transaction((tx) =>
      this.eventos.registrar(tx, this.ctx(turno, usuario, dispositivo), entrada),
    );
  }

  // ---------- Fechamento (RN-13) ----------

  async fechar(turnoId: string, dados: FecharTurno, usuario: UsuarioAutenticado, dispositivo: string) {
    const turno = await this.carregarParaLancar(turnoId, usuario);
    const maquinas = await this.prisma.maquinaTurno.findMany({
      where: { turnoId },
      include: { maquina: true },
    });
    const eventos = await this.prisma.evento.findMany({ where: { turnoId, situacao: { not: 'INCORRETO' } } });
    const decisoes = new Map(dados.maquinas.map((m) => [m.maquinaId, m.acao]));
    const faltando = maquinas.filter(
      (m) =>
        estadoMaquina(eventos.filter((e) => e.maquinaId === m.maquinaId)).situacao !== 'DESLIGADA' &&
        !decisoes.has(m.maquinaId),
    );
    if (faltando.length) {
      throw new ErroNegocio(
        `Informe se cada máquina ligada será desligada ou segue rodando: ${faltando.map((m) => m.maquina.codigo).join(', ')}.`,
      );
    }
    const divisoes = await this.prisma.divisaoOp.findMany({ where: { turnoId }, include: { ordem: true } });
    for (const s of dados.saldos) {
      const d = divisoes.find((x) => x.id === s.divisaoId);
      if (!d) throw new ErroNegocio('Saldo solto informado para divisão de outro turno.');
      if (s.quantidade > 0 && d.ordem.unidade !== 'PECA')
        throw new ErroNegocio(`A OP ${d.codigo} é em kg e não tem saldo solto.`);
    }

    const agora = new Date();
    await this.prisma.$transaction(async (tx) => {
      const ctx: ContextoLancamento = { turno, usuario, dispositivo, agora };
      for (const mt of maquinas) {
        const estado = estadoMaquina(eventos.filter((e) => e.maquinaId === mt.maquinaId));
        if (estado.situacao === 'DESLIGADA') continue;
        if (decisoes.get(mt.maquinaId) === 'DESLIGAR') {
          await this.eventos.registrar(tx, ctx, {
            id: this.eventos.novoId(),
            tipo: 'FIM_MAQUINA',
            maquinaId: mt.maquinaId,
            horaOcorrencia: agora.toISOString(),
            justificativa: null,
          });
        } else {
          await tx.maquinaTurno.update({
            where: { id: mt.id },
            data: {
              segueRodando: true,
              paradaAbertaMotivoId: estado.situacao === 'PARADA' ? estado.motivoParadaId : null,
            },
          });
        }
      }
      for (const s of dados.saldos.filter((x) => x.quantidade > 0)) {
        const d = divisoes.find((x) => x.id === s.divisaoId)!;
        await this.eventos.registrar(tx, ctx, {
          id: this.eventos.novoId(),
          tipo: 'SALDO_AVULSO_DEIXADO',
          maquinaId: d.maquinaId,
          divisaoId: d.id,
          horaOcorrencia: agora.toISOString(),
          quantidade: s.quantidade,
          dados: {},
        });
      }
      await tx.turnoApontamento.update({
        where: { id: turnoId },
        data: { situacao: 'FECHADO', fechadoEm: agora },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'TurnoApontamento',
        entidadeId: turnoId,
        acao: 'FECHAR',
        anterior: { situacao: 'ABERTO' },
        novo: {
          situacao: 'FECHADO',
          fechadoEm: agora.toISOString(),
          maquinas: dados.maquinas,
          saldos: dados.saldos,
        },
        completo: true,
      });
    });
    return this.detalhe(turnoId);
  }
}
