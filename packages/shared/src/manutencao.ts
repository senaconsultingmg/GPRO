/**
 * RN-14 — regras puras da manutenção: sequência de etapas (mesma ordem = em paralelo),
 * quem pode executar cada etapa e os tempos do módulo.
 */
import type { EspecialidadeManutencao, SituacaoEtapa } from './enumeracoes.js';

export interface EtapaRegra {
  id: string;
  ordem: number;
  situacao: SituacaoEtapa;
  especialidade: EspecialidadeManutencao;
  responsavelId: string | null;
  inicio?: Date | string | null;
  fim?: Date | string | null;
}

const terminou = (s: SituacaoEtapa) => s === 'CONCLUIDA' || s === 'CANCELADA';

/**
 * Situação de exibição: uma etapa pendente fica "liberada" quando todas as etapas de ordem
 * menor estão concluídas ou canceladas; senão, "aguardando".
 */
export function situacaoExibida(
  etapa: EtapaRegra,
  todas: EtapaRegra[],
): SituacaoEtapa | 'AGUARDANDO' | 'LIBERADA' {
  if (etapa.situacao !== 'PENDENTE') return etapa.situacao;
  return todas.every((e) => e.ordem >= etapa.ordem || terminou(e.situacao)) ? 'LIBERADA' : 'AGUARDANDO';
}

export const etapaLiberada = (etapa: EtapaRegra, todas: EtapaRegra[]) =>
  situacaoExibida(etapa, todas) === 'LIBERADA';

/** Todas as etapas concluídas ou canceladas, com ao menos uma concluída. */
export const etapasFinalizadas = (todas: EtapaRegra[]) =>
  todas.length > 0 &&
  todas.every((e) => terminou(e.situacao)) &&
  todas.some((e) => e.situacao === 'CONCLUIDA');

/**
 * Quem executa: o controlador sempre; o técnico da especialidade da etapa, desde que ela não
 * tenha responsável definido ou o responsável seja ele.
 */
export function podeExecutarEtapa(
  etapa: Pick<EtapaRegra, 'especialidade' | 'responsavelId'>,
  usuario: { id: string; especialidades: readonly string[]; controladorManutencao: boolean },
): boolean {
  if (usuario.controladorManutencao) return true;
  if (!usuario.especialidades.includes(etapa.especialidade)) return false;
  return !etapa.responsavelId || etapa.responsavelId === usuario.id;
}

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/** Tempo até o atendimento: da ocorrência (parada) até o início da primeira etapa. */
export function tempoAteAtendimentoMs(ocorridaEm: Date | string, etapas: EtapaRegra[]): number | null {
  const inicios = etapas.map((e) => ms(e.inicio)).filter((x): x is number => x !== null);
  if (!inicios.length) return null;
  return Math.max(0, Math.min(...inicios) - new Date(ocorridaEm).getTime());
}

/** Tempo de reparo: do início da primeira etapa ao fim da última (só com todas finalizadas). */
export function tempoReparoMs(etapas: EtapaRegra[]): number | null {
  if (!etapasFinalizadas(etapas)) return null;
  const concluidas = etapas.filter((e) => e.situacao === 'CONCLUIDA');
  const inicios = concluidas.map((e) => ms(e.inicio)).filter((x): x is number => x !== null);
  const fins = concluidas.map((e) => ms(e.fim)).filter((x): x is number => x !== null);
  if (!inicios.length || !fins.length) return null;
  return Math.max(0, Math.max(...fins) - Math.min(...inicios));
}

/** Horas trabalhadas por especialidade (soma das durações das etapas concluídas). */
export function horasPorEspecialidade(
  etapas: EtapaRegra[],
): Partial<Record<EspecialidadeManutencao, number>> {
  const r: Partial<Record<EspecialidadeManutencao, number>> = {};
  for (const e of etapas) {
    const i = ms(e.inicio);
    const f = ms(e.fim);
    if (e.situacao !== 'CONCLUIDA' || i === null || f === null) continue;
    r[e.especialidade] = Math.round(((r[e.especialidade] ?? 0) + (f - i) / 3_600_000) * 100) / 100;
  }
  return r;
}
