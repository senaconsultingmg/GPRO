import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { producaoPorOrdem } from '../ordens/producao-ordem.js';
import { RelatorioService } from '../turnos/relatorio.service.js';
import { estadoMaquina } from '../turnos/turnos.service.js';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Painel de acompanhamento (seção 10): um cartão por máquina, com o turno aberto em que ela está. */
@Injectable()
export class PainelService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RelatorioService) private readonly relatorio: RelatorioService,
  ) {}

  async acompanhamento() {
    const [maquinas, abertos, motivos] = await Promise.all([
      this.prisma.maquina.findMany({ where: { ativa: true }, orderBy: { codigo: 'asc' } }),
      this.prisma.turnoApontamento.findMany({
        where: { situacao: 'ABERTO' },
        include: {
          maquinas: { select: { maquinaId: true } },
          apontador: { select: { nome: true } },
          horarioTurno: { select: { nome: true } },
          equipe: { select: { letra: true } },
        },
        orderBy: { abertoEm: 'desc' },
      }),
      this.prisma.motivoParada.findMany(),
    ]);
    const motivo = new Map(motivos.map((m) => [m.id, m]));
    const calculos = await this.relatorio.calcularTurnos(abertos.map((t) => t.id));
    const eventos = abertos.length
      ? await this.prisma.evento.findMany({
          where: {
            turnoId: { in: abertos.map((t) => t.id) },
            situacao: { not: 'INCORRETO' },
            tipo: { in: ['INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO'] },
          },
          select: {
            turnoId: true,
            maquinaId: true,
            tipo: true,
            horaOcorrencia: true,
            recebidoEm: true,
            dados: true,
          },
        })
      : [];
    // Máquinas fora de turno aberto: mostra as OPs da rodada em andamento (se houver).
    const rodadasAndamento = await this.prisma.rodada.findMany({
      where: { situacao: 'EM_ANDAMENTO', maquinaId: { in: maquinas.map((m) => m.id) } },
      include: {
        molde: { select: { codigo: true } },
        ops: { include: { ordem: { include: { produto: { select: { codigo: true, descricao: true } } } } } },
      },
    });

    const ordemIds = new Set<string>();
    for (const c of calculos.values())
      for (const m of c.maquinas) for (const o of m.ops) ordemIds.add(o.ordem.id);
    for (const r of rodadasAndamento) for (const o of r.ops) ordemIds.add(o.ordemId);
    const produzido = await producaoPorOrdem(this.prisma, [...ordemIds]);

    const cartoes = maquinas.map((maq) => {
      const turno = abertos.find((t) => t.maquinas.some((m) => m.maquinaId === maq.id));
      const calc = turno ? calculos.get(turno.id)?.maquinas.find((m) => m.maquina.id === maq.id) : undefined;
      const base = { maquina: { id: maq.id, codigo: maq.codigo, descricao: maq.descricao, tipo: maq.tipo } };
      if (!turno || !calc) {
        const rodada = rodadasAndamento.find((r) => r.maquinaId === maq.id);
        return {
          ...base,
          situacao: 'DESLIGADA' as const,
          desde: null,
          parada: null,
          turno: null,
          rodada: rodada ? { numero: rodada.numero, molde: rodada.molde?.codigo ?? null } : null,
          ops: (rodada?.ops ?? []).map((o) => {
            const feito = r3(produzido.get(o.ordemId) ?? 0);
            return {
              divisao: null,
              ordem: {
                numeroErp: o.ordem.numeroErp,
                numeroInterno: o.ordem.numeroInterno,
                quantidade: o.ordem.quantidade,
                unidade: o.ordem.unidade,
              },
              produto: o.ordem.produto,
              produzidoOp: feito,
              percentual: o.ordem.quantidade > 0 ? feito / o.ordem.quantidade : null,
              meta: null,
              realizado: null,
              phReal: null,
              phPadrao: null,
            };
          }),
          oee: null,
          cavidadesBloqueadas: [],
        };
      }
      const estado = estadoMaquina(eventos.filter((e) => e.turnoId === turno.id && e.maquinaId === maq.id));
      const m = estado.motivoParadaId ? motivo.get(estado.motivoParadaId) : undefined;
      return {
        ...base,
        situacao: estado.situacao,
        desde: estado.desde,
        parada:
          estado.situacao === 'PARADA'
            ? { motivo: m ? `${m.codigo} — ${m.descricao}` : '?', programada: m?.programada ?? false }
            : null,
        turno: {
          id: turno.id,
          horario: turno.horarioTurno.nome,
          equipe: turno.equipe.letra,
          apontador: turno.apontador.nome,
        },
        rodada: { numero: calc.rodada.numero, molde: calc.rodada.molde },
        ops: calc.ops.map((o) => {
          const feito = r3(produzido.get(o.ordem.id) ?? 0);
          return {
            divisao: o.divisao.codigo,
            ordem: o.ordem,
            produto: { codigo: o.produto.codigo, descricao: o.produto.descricao },
            produzidoOp: feito,
            percentual: o.ordem.quantidade > 0 ? feito / o.ordem.quantidade : null,
            meta: o.divisao.meta,
            realizado: o.producao,
            phReal: o.phReal,
            phPadrao: o.phPadrao,
          };
        }),
        oee: calc.oee,
        cavidadesBloqueadas: calc.cavidadesBloqueadas.filter((b) => b.fim === null).map((b) => b.cavidade),
      };
    });
    return { geradoEm: new Date(), maquinas: cartoes };
  }
}
