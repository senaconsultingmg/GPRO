import { Inject, Injectable } from '@nestjs/common';
import {
  calcularOee,
  calcularPhReal,
  calcularTempos,
  consumoTeorico,
  montarBloqueios,
  montarLinhaTempo,
  producaoDoTurno,
  producaoEsperada,
  type EventoTempo,
  type Intervalo,
} from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { naoEncontrado } from '../comum/erros.js';
import type { Evento, MotivoParada, TipoPerda } from '../generated/prisma/client.js';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const minutos = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

const INCLUIR_TURNO = {
  apontador: { select: { nome: true, login: true } },
  horarioTurno: true,
  equipe: { select: { letra: true } },
  maquinas: {
    include: {
      maquina: true,
      rodada: {
        include: {
          molde: { select: { id: true, codigo: true } },
          ops: {
            include: {
              ordem: {
                include: {
                  produto: { select: { id: true, codigo: true, descricao: true, unidade: true } },
                },
              },
              fichaTecnica: { include: { composicao: true } },
            },
          },
        },
      },
    },
    orderBy: { maquina: { codigo: 'asc' } },
  },
  divisoes: true,
} satisfies Prisma.TurnoApontamentoInclude;
type TurnoCarregado = Prisma.TurnoApontamentoGetPayload<{ include: typeof INCLUIR_TURNO }>;
interface Apoio {
  motivo: Map<string, MotivoParada>;
  tipoPerda: Map<string, TipoPerda>;
  material: Map<string, { id: string; codigo: string; descricao: string }>;
}
export type Calculo = ReturnType<RelatorioService['montar']>;
export type MaquinaCalculada = Calculo['maquinas'][number];

/** Relatório do turno (RN-13): por máquina e OP, produção, meta, perdas, consumo, paradas, cavidades, OEE, PH e pendências. */
@Injectable()
export class RelatorioService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Relatório de um turno, com as pendências em aberto. */
  async gerar(turnoId: string) {
    const calc = (await this.calcularTurnos([turnoId])).get(turnoId);
    if (!calc) throw naoEncontrado('Turno');
    const pendencias = await this.prisma.aprovacao.findMany({
      where: { turnoId, situacao: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
    });
    return { ...calc, pendencias };
  }

  /**
   * Calcula vários turnos de uma vez (consultas em lote): base do relatório, do painel de
   * acompanhamento e do painel de indicadores — as mesmas fórmulas em todos (seção 10).
   */
  async calcularTurnos(ids: string[]) {
    const r = new Map<string, Calculo>();
    if (!ids.length) return r;
    const turnos = await this.prisma.turnoApontamento.findMany({
      where: { id: { in: ids } },
      include: INCLUIR_TURNO,
    });
    const todos = await this.prisma.evento.findMany({
      where: { turnoId: { in: ids } },
      orderBy: { horaOcorrencia: 'asc' },
    });
    const rodadaIds = [...new Set(turnos.flatMap((t) => t.maquinas.map((m) => m.rodadaId)))];
    const eventosCavidade = rodadaIds.length
      ? await this.prisma.evento.findMany({
          where: {
            rodadaId: { in: rodadaIds },
            tipo: { in: ['BLOQUEIO_CAVIDADE', 'DESBLOQUEIO_CAVIDADE'] },
            situacao: { not: 'INCORRETO' },
          },
        })
      : [];
    const divisaoIds = turnos.flatMap((t) => t.divisoes.map((d) => d.id));
    const idsTransf = divisaoIds.length
      ? await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM evento WHERE tipo = 'TRANSFERENCIA' AND situacao <> 'INCORRETO'
            AND dados->>'divisaoDestinoId' IN (${Prisma.join(divisaoIds)})`
      : [];
    const transferencias = idsTransf.length
      ? await this.prisma.evento.findMany({ where: { id: { in: idsTransf.map((x) => x.id) } } })
      : [];
    const [motivos, tiposPerda, materiais] = await Promise.all([
      this.prisma.motivoParada.findMany(),
      this.prisma.tipoPerda.findMany(),
      this.prisma.produto.findMany({ select: { id: true, codigo: true, descricao: true } }),
    ]);
    const apoio: Apoio = {
      motivo: new Map(motivos.map((m) => [m.id, m])),
      tipoPerda: new Map(tiposPerda.map((t) => [t.id, t])),
      material: new Map(materiais.map((m) => [m.id, m])),
    };
    const agora = new Date();
    for (const turno of turnos) {
      r.set(
        turno.id,
        this.montar(
          turno,
          todos.filter((e) => e.turnoId === turno.id),
          eventosCavidade,
          transferencias,
          apoio,
          agora,
        ),
      );
    }
    return r;
  }

  private montar(
    turno: TurnoCarregado,
    todos: Evento[],
    todosCavidade: Evento[],
    todasTransferencias: Evento[],
    { motivo, tipoPerda, material }: Apoio,
    agora: Date,
  ) {
    const fimPadrao = (turno.fechadoEm ?? agora).getTime();
    const janela: Intervalo = {
      inicio: Math.min(turno.inicioNominal.getTime(), turno.abertoEm.getTime()),
      fim: fimPadrao,
    };
    const validos = todos.filter((e) => e.situacao !== 'INCORRETO');
    const eventosCavidade = todosCavidade.filter((e) => e.horaOcorrencia.getTime() <= fimPadrao);
    const divisaoIds = turno.divisoes.map((d) => d.id);
    const transferenciasRecebidas = todasTransferencias.filter((e) =>
      divisaoIds.includes((e.dados as { divisaoDestinoId: string }).divisaoDestinoId),
    );

    const maquinas = turno.maquinas.map((mt) => {
      const ev = validos.filter((e) => e.maquinaId === mt.maquinaId);
      const tempoEventos: EventoTempo[] = ev
        .filter((e) => ['INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO'].includes(e.tipo))
        .map((e) => {
          const d = e.dados as { programada?: boolean; motivoParadaId?: string };
          return {
            tipo: e.tipo as EventoTempo['tipo'],
            hora: e.horaOcorrencia.getTime(),
            seq: e.recebidoEm.getTime(),
            programada: d.programada,
            motivoId: d.motivoParadaId,
          };
        });
      const linha = montarLinhaTempo(tempoEventos, fimPadrao);
      const tempos = calcularTempos(linha.ligados, linha.paradas);
      const bloqueios = montarBloqueios(
        eventosCavidade
          .filter((e) => e.rodadaId === mt.rodadaId)
          .map((e) => ({
            tipo: e.tipo as 'BLOQUEIO_CAVIDADE',
            cavidade: (e.dados as { cavidade: number }).cavidade,
            hora: e.horaOcorrencia.getTime(),
          })),
        fimPadrao,
      );

      const ops = turno.divisoes
        .filter((d) => d.maquinaId === mt.maquinaId)
        .map((d) => {
          const rodadaOp = mt.rodada.ops.find((o) => o.id === d.rodadaOpId)!;
          const evd = ev.filter((e) => e.divisaoId === d.id);
          const soma = (tipo: string, f: (e: Evento) => number = (e) => e.quantidade ?? 0) =>
            r3(evd.filter((e) => e.tipo === tipo).reduce((s, e) => s + f(e), 0));
          const etiquetado = soma('SAIDA_PRODUCAO');
          const deixado = soma('SALDO_AVULSO_DEIXADO');
          const recebido = soma('SALDO_AVULSO_RECEBIDO');
          const producao = producaoDoTurno(etiquetado, deixado, recebido);
          const saidas = evd.filter((e) => e.tipo === 'SAIDA_PRODUCAO');
          const conjuntos = saidas.flatMap((s) =>
            ((s.dados as { conjuntos?: { quantidade: number; avulso: boolean }[] }).conjuntos ?? []).map(
              (c) => ({ ...c, eventoId: s.id, hora: s.horaOcorrencia }),
            ),
          );
          const volumes = saidas.flatMap(
            (s) => (s.dados as { volumes?: { tipoVolume: string; pesoKg: number }[] }).volumes ?? [],
          );

          const perdasEv = evd.filter((e) => e.tipo === 'PERDA');
          const perdasPorTipo = new Map<
            string,
            { tipo: string; contaComoRefugo: boolean; pesoKg: number; pecas: number; ocorrencias: number }
          >();
          for (const p of perdasEv) {
            const dp = p.dados as {
              tipoPerdaId: string;
              pesoKg: number | null;
              quantidadePecas: number | null;
              contaComoRefugo: boolean;
            };
            const atual = perdasPorTipo.get(dp.tipoPerdaId) ?? {
              tipo: tipoPerda.get(dp.tipoPerdaId)?.descricao ?? '?',
              contaComoRefugo: dp.contaComoRefugo,
              pesoKg: 0,
              pecas: 0,
              ocorrencias: 0,
            };
            atual.pesoKg = r3(atual.pesoKg + (dp.pesoKg ?? 0));
            atual.pecas = r3(atual.pecas + (dp.quantidadePecas ?? 0));
            atual.ocorrencias++;
            perdasPorTipo.set(dp.tipoPerdaId, atual);
          }
          const refugadas = r3(
            [...perdasPorTipo.values()].filter((p) => p.contaComoRefugo).reduce((s, p) => s + p.pecas, 0),
          );
          const total = r3(producao + refugadas);
          const esperada = producaoEsperada({
            produzindo: tempos.produzindo,
            ph: rodadaOp.fichaTecnica.phPadrao,
            cavidadesOp: rodadaOp.cavidades,
            bloqueios,
          });

          // Consumo real = entradas − devoluções − transferências de saída (+ recebidas) (RN-10).
          const consumo = new Map<
            string,
            { entrada: number; devolucao: number; transferenciaSaida: number; transferenciaEntrada: number }
          >();
          const acumular = (
            materialId: string,
            campo: 'entrada' | 'devolucao' | 'transferenciaSaida' | 'transferenciaEntrada',
            kg: number,
          ) => {
            const c = consumo.get(materialId) ?? {
              entrada: 0,
              devolucao: 0,
              transferenciaSaida: 0,
              transferenciaEntrada: 0,
            };
            c[campo] = r3(c[campo] + kg);
            consumo.set(materialId, c);
          };
          for (const e of evd) {
            const dm = e.dados as { materialId?: string; quantidadeKg?: number };
            if (!dm.materialId) continue;
            if (e.tipo === 'ENTRADA_MATERIA_PRIMA') acumular(dm.materialId, 'entrada', dm.quantidadeKg ?? 0);
            if (e.tipo === 'DEVOLUCAO_MATERIA_PRIMA')
              acumular(dm.materialId, 'devolucao', dm.quantidadeKg ?? 0);
            if (e.tipo === 'TRANSFERENCIA')
              acumular(dm.materialId, 'transferenciaSaida', dm.quantidadeKg ?? 0);
          }
          for (const t of transferenciasRecebidas.filter(
            (x) => (x.dados as { divisaoDestinoId: string }).divisaoDestinoId === d.id,
          )) {
            const dm = t.dados as { materialId: string; quantidadeKg: number };
            acumular(dm.materialId, 'transferenciaEntrada', dm.quantidadeKg);
          }
          const ficha = rodadaOp.fichaTecnica;
          const teorico = new Map(
            consumoTeorico(ficha.composicao, total, rodadaOp.ordem.produto.unidade, ficha.pesoPadraoG).map(
              (t) => [t.materialId, t.kg],
            ),
          );
          const idsMaterial = new Set([...consumo.keys(), ...teorico.keys()]);
          const consumoLista = [...idsMaterial].map((id) => {
            const c = consumo.get(id) ?? {
              entrada: 0,
              devolucao: 0,
              transferenciaSaida: 0,
              transferenciaEntrada: 0,
            };
            return {
              material: material.get(id) ?? { id, codigo: '?', descricao: '' },
              ...c,
              liquido: r3(c.entrada + c.transferenciaEntrada - c.devolucao - c.transferenciaSaida),
              teorico: teorico.get(id) ?? null,
            };
          });
          const semiacabados = evd
            .filter((e) => e.tipo === 'ENTRADA_SEMIACABADO')
            .map((e) => ({
              produto: material.get((e.dados as { produtoId: string }).produtoId),
              quantidade: e.quantidade,
              lote: (e.dados as { lote: string | null }).lote,
            }));

          return {
            divisao: {
              id: d.id,
              codigo: d.codigo,
              horasDisponiveis: d.horasDisponiveis,
              phReferencia: d.phReferencia,
              meta: d.meta,
            },
            ordem: {
              id: rodadaOp.ordem.id,
              numeroErp: rodadaOp.ordem.numeroErp,
              numeroInterno: rodadaOp.ordem.numeroInterno,
              quantidade: rodadaOp.ordem.quantidade,
              unidade: rodadaOp.ordem.unidade,
            },
            produto: rodadaOp.ordem.produto,
            fichaVersao: ficha.versao,
            cavidades: rodadaOp.cavidades,
            etiquetado,
            saldoRecebido: recebido,
            saldoDeixado: deixado,
            producao,
            refugadas,
            producaoTotal: total,
            producaoEsperada: esperada,
            numeroConjuntos: conjuntos.length,
            conjuntosAvulsos: conjuntos.filter((c) => c.avulso),
            quantidadeAvulsos: r3(conjuntos.filter((c) => c.avulso).reduce((s, c) => s + c.quantidade, 0)),
            volumes,
            perdas: [...perdasPorTipo.values()],
            consumo: consumoLista,
            semiacabados,
            phReal: calcularPhReal(total, tempos.produzindoMs),
            phPadrao: ficha.phPadrao,
            pesoNaoConforme: saidas.filter((s) => s.pesoNaoConforme).length,
          };
        });

      const boas = r3(ops.reduce((s, o) => s + o.producao, 0));
      const refugadas = r3(ops.reduce((s, o) => s + o.refugadas, 0));
      const esperada = r3(ops.reduce((s, o) => s + o.producaoEsperada, 0));
      const oee = calcularOee({
        planejadoMs: tempos.planejadoMs,
        produzindoMs: tempos.produzindoMs,
        producaoEsperada: esperada,
        boas,
        refugadas,
      });

      return {
        maquina: {
          id: mt.maquina.id,
          codigo: mt.maquina.codigo,
          descricao: mt.maquina.descricao,
          tipo: mt.maquina.tipo,
        },
        rodada: {
          id: mt.rodada.id,
          numero: mt.rodada.numero,
          molde: mt.rodada.molde?.codigo ?? null,
          moldeId: mt.rodada.molde?.id ?? null,
        },
        segueRodando: mt.segueRodando,
        tempos: {
          ligadoMs: tempos.ligadoMs,
          planejadoMs: tempos.planejadoMs,
          produzindoMs: tempos.produzindoMs,
          ligadoMin: minutos(tempos.ligadoMs),
          paradasProgramadasMin: minutos(tempos.paradasProgramadasMs),
          paradasNaoProgramadasMin: minutos(tempos.paradasNaoProgramadasMs),
          planejadoMin: minutos(tempos.planejadoMs),
          produzindoMin: minutos(tempos.produzindoMs),
        },
        paradas: linha.paradas.map((p) => ({
          motivo: p.motivoId
            ? `${motivo.get(p.motivoId)?.codigo} — ${motivo.get(p.motivoId)?.descricao}`
            : '?',
          motivoId: p.motivoId ?? null,
          programada: p.programada,
          duracaoMs: p.fim - p.inicio,
          inicio: new Date(p.inicio),
          fim: new Date(p.fim),
          minutos: minutos(p.fim - p.inicio),
          semReinicio: p.aberta,
        })),
        cavidadesBloqueadas: bloqueios
          .filter((b) => b.fim > janela.inicio && b.inicio < janela.fim)
          .map((b) => ({
            cavidade: b.cavidade,
            inicio: new Date(b.inicio),
            fim: b.fim >= fimPadrao ? null : new Date(b.fim),
          })),
        ops,
        boas,
        refugadas,
        producaoEsperada: esperada,
        oee,
      };
    });

    return {
      turno: {
        id: turno.id,
        data: turno.data.toISOString().slice(0, 10),
        horarioTurnoId: turno.horarioTurnoId,
        equipeId: turno.equipeId,
        horario: {
          nome: turno.horarioTurno.nome,
          horaInicio: turno.horarioTurno.horaInicio,
          horaFim: turno.horarioTurno.horaFim,
        },
        equipe: turno.equipe.letra,
        apontador: turno.apontador.nome,
        situacao: turno.situacao,
        abertoEm: turno.abertoEm,
        fechadoEm: turno.fechadoEm,
      },
      maquinas,
      lancamentosMarcados: todos.filter((e) => e.marcaHorario !== 'NO_MOMENTO').length,
      totalLancamentos: todos.length,
      geradoEm: agora,
      parcial: !turno.fechadoEm,
    };
  }
}
