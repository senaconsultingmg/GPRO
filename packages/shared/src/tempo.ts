import { FUSO_EXIBICAO } from './datas.js';
import { duracaoTurnoMinutos } from './escala.js';

/** Deslocamento do fuso (minutos a somar ao UTC para obter a hora local) num instante. */
function deslocamentoMinutos(instante: number, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((local - Math.floor(instante / 1000) * 1000) / 60_000);
}

/** Converte data civil + hora local (no fuso da fábrica) em instante UTC. */
export function instanteLocal(data: string, hora: string, fuso = FUSO_EXIBICAO): Date {
  const [a, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, hh, mm);
  // Duas passadas resolvem a maioria das transições de horário de verão.
  let t = ingenuo - deslocamentoMinutos(ingenuo, fuso) * 60_000;
  t = ingenuo - deslocamentoMinutos(t, fuso) * 60_000;
  return new Date(t);
}

/** Data civil (AAAA-MM-DD) de um instante no fuso da fábrica. */
export function dataLocal(instante: Date | number, fuso = FUSO_EXIBICAO): string {
  const t = typeof instante === 'number' ? instante : instante.getTime();
  return new Date(t + deslocamentoMinutos(t, fuso) * 60_000).toISOString().slice(0, 10);
}

/** Hora local HH:MM de um instante no fuso da fábrica. */
export function horaLocal(instante: Date | number, fuso = FUSO_EXIBICAO): string {
  const t = typeof instante === 'number' ? instante : instante.getTime();
  return new Date(t + deslocamentoMinutos(t, fuso) * 60_000).toISOString().slice(11, 16);
}

/** Início e fim nominais de um turno (o da noite termina no dia seguinte). */
export function periodoNominal(
  data: string,
  horaInicio: string,
  horaFim: string,
): { inicio: Date; fim: Date } {
  const inicio = instanteLocal(data, horaInicio);
  const fim = new Date(inicio.getTime() + duracaoTurnoMinutos(horaInicio, horaFim) * 60_000);
  return { inicio, fim };
}

/**
 * Horário de turno que contém o instante informado e a data civil a que o turno pertence.
 * Considera o dia anterior para turnos que atravessam a meia-noite.
 */
export function horarioVigente<T extends { horaInicio: string; horaFim: string; diasSemana: number[] }>(
  horarios: T[],
  instante: Date,
): { horario: T; data: string } | null {
  const hoje = dataLocal(instante);
  const ontem = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10) - 1))
    .toISOString()
    .slice(0, 10);
  for (const data of [hoje, ontem]) {
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
    for (const h of horarios) {
      if (!h.diasSemana.includes(diaSemana)) continue;
      const { inicio, fim } = periodoNominal(data, h.horaInicio, h.horaFim);
      if (instante >= inicio && instante < fim) return { horario: h, data };
    }
  }
  return null;
}
