/**
 * Geração de escala de turnos. Datas são tratadas como texto "AAAA-MM-DD" (data civil,
 * sem fuso), pois a escala é um calendário da fábrica e não um instante no tempo.
 */

export interface AtribuicaoTurno {
  horarioTurnoId: string;
  equipeId: string;
}

export interface LinhaEscala extends AtribuicaoTurno {
  data: string;
}

export const LIMITE_DIAS_ESCALA = 400;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function paraUtc(data: string): number {
  if (!RE_DATA.test(data)) throw new Error(`Data inválida: ${data}`);
  const [a, m, d] = data.split('-').map(Number);
  const t = Date.UTC(a, m - 1, d);
  const conferencia = new Date(t);
  if (
    conferencia.getUTCFullYear() !== a ||
    conferencia.getUTCMonth() !== m - 1 ||
    conferencia.getUTCDate() !== d
  ) {
    throw new Error(`Data inválida: ${data}`);
  }
  return t;
}

function deUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function somarDias(data: string, dias: number): string {
  return deUtc(paraUtc(data) + dias * 86_400_000);
}

/** Diferença em dias entre duas datas (fim − início). */
export function diferencaDias(inicio: string, fim: string): number {
  return Math.round((paraUtc(fim) - paraUtc(inicio)) / 86_400_000);
}

/** Dia da semana: 0 = domingo ... 6 = sábado. */
export function diaDaSemana(data: string): number {
  return new Date(paraUtc(data)).getUTCDay();
}

function validarPeriodo(dataInicial: string, dataFinal: string): number {
  const dias = diferencaDias(dataInicial, dataFinal);
  if (dias < 0) throw new Error('A data final deve ser igual ou posterior à data inicial.');
  if (dias + 1 > LIMITE_DIAS_ESCALA)
    throw new Error(`O período não pode passar de ${LIMITE_DIAS_ESCALA} dias.`);
  return dias;
}

/**
 * Escala de revezamento (ex.: 12x36). O ciclo é uma lista de dias; cada dia lista as
 * atribuições horário → equipe. O padrão 12x36 com 4 equipes tem ciclo de 2 dias:
 *   dia 1: Dia = A, Noite = B;  dia 2: Dia = C, Noite = D.
 * Assim cada equipe trabalha 12 h e folga 36 h.
 */
export function gerarEscalaRevezamento(params: {
  dataInicial: string;
  dataFinal: string;
  ciclo: AtribuicaoTurno[][];
}): LinhaEscala[] {
  const dias = validarPeriodo(params.dataInicial, params.dataFinal);
  if (params.ciclo.length === 0) throw new Error('O ciclo da escala precisa ter ao menos um dia.');
  const linhas: LinhaEscala[] = [];
  for (let i = 0; i <= dias; i++) {
    const data = somarDias(params.dataInicial, i);
    for (const atribuicao of params.ciclo[i % params.ciclo.length]) {
      linhas.push({ data, ...atribuicao });
    }
  }
  return linhas;
}

/** Escala de horário central: a equipe trabalha nos dias da semana informados (ex.: seg a sex). */
export function gerarEscalaCentral(params: {
  dataInicial: string;
  dataFinal: string;
  horarioTurnoId: string;
  equipeId: string;
  diasSemana: number[];
}): LinhaEscala[] {
  const dias = validarPeriodo(params.dataInicial, params.dataFinal);
  if (params.diasSemana.length === 0) throw new Error('Informe ao menos um dia da semana.');
  const linhas: LinhaEscala[] = [];
  for (let i = 0; i <= dias; i++) {
    const data = somarDias(params.dataInicial, i);
    if (params.diasSemana.includes(diaDaSemana(data))) {
      linhas.push({ data, horarioTurnoId: params.horarioTurnoId, equipeId: params.equipeId });
    }
  }
  return linhas;
}

/** Duração de um horário de turno em minutos; trata turno que atravessa a meia-noite. */
export function duracaoTurnoMinutos(horaInicio: string, horaFim: string): number {
  const min = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  const d = min(horaFim) - min(horaInicio);
  return d > 0 ? d : d + 24 * 60;
}
