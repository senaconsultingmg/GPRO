import {
  avaliarPeso,
  estadoMaquina,
  marcaHorario,
  montarConjuntos,
  periodoNominal,
  ROTULO_TIPO_EVENTO,
  usaMolde,
  type TipoEvento,
} from '@apontamento/shared';
import type { ItemFila } from './db';
import type { Pacote } from './pacote';
import type { DivisaoNoTurno, EventoLista, MaquinaNoTurno, TurnoDetalhe } from '../paginas/apontamento/tipos';

const n = (x: unknown) => Number(x ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Dados e resumo do lançamento montados no tablet (o servidor recalcula ao receber). */
function dadosLocais(c: Record<string, unknown>, turno: TurnoDetalhe, pacote: Pacote | undefined) {
  const tipo = c.tipo as TipoEvento;
  const maquina = turno.maquinas.find((m) => m.maquinaId === c.maquinaId);
  const divisao = maquina?.divisoes.find((d) => d.id === c.divisaoId);
  const op = maquina?.rodada.ops.find((o) => o.id === divisao?.rodadaOpId);
  let dados: Record<string, unknown> = {};
  let quantidade: number | null = null;
  let resumo = ROTULO_TIPO_EVENTO[tipo] ?? tipo;
  let pesoNaoConforme = false;
  switch (tipo) {
    case 'PARADA': {
      const m = pacote?.motivos.find((x) => x.id === c.motivoParadaId);
      dados = { motivoParadaId: c.motivoParadaId, programada: m?.programada ?? false };
      resumo = m ? `${m.codigo} — ${m.descricao}${m.programada ? ' (programada)' : ''}` : 'Parada';
      break;
    }
    case 'SAIDA_PRODUCAO': {
      if (maquina && usaMolde(maquina.maquina.tipo)) {
        const conj = pacote?.conjuntos.find((x) => x.id === c.conjuntoPadraoId);
        try {
          const m = montarConjuntos(
            conj?.quantidade ?? 0,
            Number(c.conjuntosPadrao ?? 0),
            (c.avulsos as number[]) ?? [],
          );
          quantidade = m.total;
          dados = {
            conjuntos: m.conjuntos,
            temAvulso: ((c.avulsos as number[]) ?? []).length > 0,
            pesoMedioG: c.pesoMedioG,
          };
          const avulsos = m.conjuntos.filter((x) => x.avulso);
          resumo = `${m.conjuntos.length} conjunto(s), ${n(m.total)} pç${avulsos.length ? ` — AVULSO: ${avulsos.map((a) => a.quantidade).join(', ')} pç` : ''} — peso ${n(c.pesoMedioG)} g`;
        } catch {
          resumo = 'Saída de produção';
        }
        if (op && c.pesoMedioG != null) {
          pesoNaoConforme = !!avaliarPeso(
            Number(c.pesoMedioG),
            op.fichaTecnica.pesoPadraoG,
            op.fichaTecnica.toleranciaPesoPct,
          )?.naoConforme;
        }
      } else {
        const volumes = (c.volumes as { pesoKg: number }[]) ?? [];
        quantidade = volumes.reduce((s, v) => s + v.pesoKg, 0);
        dados = { volumes, operador: c.operador };
        resumo = `${volumes.length} volume(s), ${n(quantidade)} kg — operador ${c.operador ?? ''}`;
      }
      break;
    }
    case 'PERDA': {
      const t = pacote?.tiposPerda.find((x) => x.id === c.tipoPerdaId);
      dados = {
        tipoPerdaId: c.tipoPerdaId,
        pesoKg: c.pesoKg ?? null,
        quantidadePecas: c.quantidadePecas ?? null,
      };
      quantidade = (c.quantidadePecas as number | null) ?? null;
      resumo = `${t?.descricao ?? ''}: ${c.pesoKg != null ? `${n(c.pesoKg)} kg` : ''}${c.pesoKg != null && c.quantidadePecas != null ? ' / ' : ''}${c.quantidadePecas != null ? `${n(c.quantidadePecas)} pç` : ''}`;
      break;
    }
    case 'ENTRADA_MATERIA_PRIMA':
    case 'DEVOLUCAO_MATERIA_PRIMA':
    case 'TRANSFERENCIA': {
      const lote = pacote?.lotes.find((l) => l.numero === c.leitura);
      dados = { lote: lote?.numero ?? c.leitura, quantidadeKg: c.quantidadeKg, materialId: lote?.materialId };
      quantidade = Number(c.quantidadeKg ?? 0);
      resumo = `${lote?.material.codigo ?? ''} lote ${lote?.numero ?? c.leitura}: ${n(c.quantidadeKg)} kg`;
      break;
    }
    case 'ENTRADA_SEMIACABADO':
      dados = { lote: c.leitura };
      resumo = `Semiacabado ${c.leitura}`;
      break;
    case 'BLOQUEIO_CAVIDADE':
      dados = { cavidade: c.cavidade, motivo: c.motivo };
      resumo = `Cavidade ${c.cavidade}: ${c.motivo}`;
      break;
    case 'DESBLOQUEIO_CAVIDADE':
      dados = { cavidade: c.cavidade };
      resumo = `Cavidade ${c.cavidade}`;
      break;
  }
  return { dados, quantidade, resumo, pesoNaoConforme };
}

/** Turno aberto no próprio tablet, ainda não enviado. */
function turnoInicial(item: ItemFila, pacote: Pacote | undefined): TurnoDetalhe {
  const c = item.corpo as {
    id: string;
    data: string;
    horarioTurnoId: string;
    equipeId: string;
    abertoEm: string;
  };
  const horario = pacote?.horarios.find((h) => h.id === c.horarioTurnoId);
  const nominal = horario
    ? periodoNominal(c.data, horario.horaInicio, horario.horaFim)
    : { inicio: new Date(c.abertoEm), fim: new Date(c.abertoEm) };
  return {
    id: c.id,
    data: c.data,
    situacao: 'ABERTO',
    abertoEm: c.abertoEm,
    fechadoEm: null,
    inicioNominal: nominal.inicio.toISOString(),
    fimNominal: nominal.fim.toISOString(),
    apontador: { id: item.usuarioId, nome: pacote?.usuario.nome ?? '' },
    horarioTurno: {
      nome: horario?.nome ?? '',
      horaInicio: horario?.horaInicio ?? '',
      horaFim: horario?.horaFim ?? '',
    },
    equipe: { letra: pacote?.equipes.find((e) => e.id === c.equipeId)?.letra ?? '' },
    maquinas: [],
    eventos: [],
    pendencias: [],
  };
}

/**
 * Seção 11 — o turno como o apontador vê no tablet: a última cópia do servidor mais os itens
 * da fila ainda não enviados (aberturas, máquinas, divisões, lançamentos e fechamento).
 */
export function projetarTurno(
  base: TurnoDetalhe | null,
  itens: ItemFila[],
  pacote: Pacote | undefined,
): TurnoDetalhe | null {
  const abertura = itens.find((i) => i.tipo === 'ABRIR_TURNO');
  if (!base && !abertura) return null;
  const turno: TurnoDetalhe = structuredClone(base ?? turnoInicial(abertura!, pacote));
  const nomeUsuario = pacote?.usuario.nome ?? '';
  const tolerancia = pacote?.parametros.toleranciaHorarioMin ?? 10;
  const novoEvento = (
    item: ItemFila,
    c: Record<string, unknown>,
    extra: Partial<EventoLista>,
  ): EventoLista => {
    const hora = String(c.horaOcorrencia ?? item.horaRegistro);
    return {
      id: String(c.id ?? c.eventoId ?? item.id),
      tipo: c.tipo as TipoEvento,
      maquinaId: String(c.maquinaId),
      divisaoId: (c.divisaoId as string) ?? null,
      horaOcorrencia: hora,
      horaRegistro: item.horaRegistro,
      marcaHorario: marcaHorario(new Date(hora), new Date(item.horaRegistro), tolerancia),
      pesoNaoConforme: false,
      situacao: 'VALIDO',
      corrigeEventoId: null,
      resumo: ROTULO_TIPO_EVENTO[c.tipo as TipoEvento] ?? '',
      justificativa: (c.justificativa as string) ?? null,
      dados: {},
      usuario: { nome: nomeUsuario },
      pendenteEnvio: true,
      ...extra,
    };
  };

  for (const item of itens) {
    const c = item.corpo;
    if (item.tipo === 'LIGAR_MAQUINA') {
      if (turno.maquinas.some((m) => m.maquinaId === c.maquinaId)) continue;
      const pm = pacote?.maquinas.find((m) => m.maquina.id === c.maquinaId);
      const rodada = pm?.rodadas.find((r) => r.id === c.rodadaId);
      if (!pm || !rodada) continue;
      const mt: MaquinaNoTurno = {
        id: `local-${item.id}`,
        maquinaId: pm.maquina.id,
        rodadaId: rodada.id,
        segueRodando: false,
        maquina: pm.maquina,
        rodada: {
          id: rodada.id,
          numero: rodada.numero,
          situacao: rodada.situacao,
          molde: rodada.molde,
          ops: rodada.ops,
        },
        estado: { situacao: 'DESLIGADA', desde: null, motivoParada: null },
        cavidadesBloqueadas: [],
        divisoes: [],
      };
      turno.maquinas.push(mt);
      turno.eventos.push(novoEvento(item, { ...c, id: c.eventoId, tipo: 'INICIO_MAQUINA' }, {}));
      if (c.iniciarParadaMotivoId) {
        const m = pacote?.motivos.find((x) => x.id === c.iniciarParadaMotivoId);
        turno.eventos.push(
          novoEvento(
            item,
            { ...c, id: `${c.eventoId}-parada`, tipo: 'PARADA' },
            {
              dados: { motivoParadaId: c.iniciarParadaMotivoId, programada: m?.programada ?? false },
              resumo: m ? `${m.codigo} — ${m.descricao}` : 'Parada',
            },
          ),
        );
      }
    } else if (item.tipo === 'CRIAR_DIVISAO') {
      const mt = turno.maquinas.find((m) => m.maquinaId === c.maquinaId);
      const op = mt?.rodada.ops.find((o) => o.id === c.rodadaOpId);
      if (!mt || !op || mt.divisoes.some((d) => d.rodadaOpId === op.id)) continue;
      const l = item.local ?? {};
      const ordem = pacote?.ordens.find((o) => o.id === op.ordemId);
      const d: DivisaoNoTurno = {
        id: String(c.id),
        codigo: String(l.codigo ?? '…'),
        ordemId: op.ordemId,
        rodadaOpId: op.id,
        maquinaId: mt.maquinaId,
        meta: Number(l.meta ?? 0),
        horasDisponiveis: Number(c.horasDisponiveis ?? 0),
        phReferencia: op.fichaTecnica.phPadrao,
        etiquetado: 0,
        saldoRecebido: Number(c.saldoRecebido ?? 0),
        saldoDeixado: 0,
        producaoOp: ordem?.produzido ?? 0,
        quantidadeOp: op.ordem.quantidade,
      };
      mt.divisoes.push(d);
    } else if (item.tipo === 'EVENTO') {
      const local = dadosLocais(c, turno, pacote);
      turno.eventos.push(
        novoEvento(item, c, {
          dados: local.dados,
          resumo: local.resumo,
          pesoNaoConforme: local.pesoNaoConforme,
        }),
      );
      const mt = turno.maquinas.find((m) => m.maquinaId === c.maquinaId);
      if (mt && c.tipo === 'SAIDA_PRODUCAO') {
        const d = mt.divisoes.find((x) => x.id === c.divisaoId);
        if (d) {
          d.etiquetado += local.quantidade ?? 0;
          d.producaoOp += local.quantidade ?? 0;
        }
      }
      if (mt && c.tipo === 'BLOQUEIO_CAVIDADE')
        mt.cavidadesBloqueadas = [
          ...mt.cavidadesBloqueadas.filter((b) => b.cavidade !== c.cavidade),
          { cavidade: Number(c.cavidade), motivo: String(c.motivo ?? '') },
        ];
      if (mt && c.tipo === 'DESBLOQUEIO_CAVIDADE')
        mt.cavidadesBloqueadas = mt.cavidadesBloqueadas.filter((b) => b.cavidade !== c.cavidade);
    } else if (item.tipo === 'FECHAR_TURNO') {
      turno.situacao = 'FECHADO';
      turno.fechadoEm = String(c.horaFechamento ?? item.horaRegistro);
    }
  }

  // Estado de cada máquina recalculado com os eventos do servidor e os do tablet.
  const validos = turno.eventos.filter((e) => e.situacao !== 'INCORRETO');
  for (const mt of turno.maquinas) {
    const doMaquina = validos.filter((e) => e.maquinaId === mt.maquinaId);
    if (!doMaquina.some((e) => e.pendenteEnvio)) continue;
    const est = estadoMaquina(doMaquina.map((e) => ({ ...e, recebidoEm: e.horaRegistro })));
    const m = est.motivoParadaId ? pacote?.motivos.find((x) => x.id === est.motivoParadaId) : undefined;
    mt.estado = {
      situacao: est.situacao,
      desde: est.desde?.toISOString() ?? null,
      motivoParada: m ? { codigo: m.codigo, descricao: m.descricao, programada: m.programada } : null,
    };
  }
  turno.eventos.sort((a, b) => b.horaOcorrencia.localeCompare(a.horaOcorrencia));
  return turno;
}
