/** Regras puras do apontamento de produção (RN-04, RN-06, RN-07, RN-08). */
import type { MarcaHorario, Unidade } from './enumeracoes.js';

const arred = (n: number, casas = 3) => Math.round(n * 10 ** casas) / 10 ** casas;

/**
 * RN-08 — compara a hora da ocorrência com a hora do registro.
 * Diferença acima da tolerância marca o evento como retroativo ou antecipado.
 */
export function marcaHorario(ocorrencia: Date, registro: Date, toleranciaMin: number): MarcaHorario {
  const diferencaMin = (ocorrencia.getTime() - registro.getTime()) / 60_000;
  if (Math.abs(diferencaMin) <= toleranciaMin) return 'NO_MOMENTO';
  return diferencaMin < 0 ? 'RETROATIVO' : 'ANTECIPADO';
}

/**
 * RN-08 — período em que a hora da ocorrência é aceita: do início nominal do horário
 * (ou da abertura, se foi antes) até o fim nominal, estendido até o fechamento real
 * (ou até agora, com o turno aberto) quando o turno passa da hora.
 */
export function periodoValidoTurno(p: {
  inicioNominal: Date;
  fimNominal: Date;
  abertoEm: Date;
  fechadoEm?: Date | null;
  agora: Date;
}): { inicio: Date; fim: Date } {
  const inicio = new Date(Math.min(p.inicioNominal.getTime(), p.abertoEm.getTime()));
  const limiteReal = p.fechadoEm ?? p.agora;
  const fim = new Date(Math.max(p.fimNominal.getTime(), limiteReal.getTime()));
  return { inicio, fim };
}

/** RN-07 — conferência do peso médio da peça contra o padrão da ficha técnica. */
export function avaliarPeso(
  pesoMedioG: number,
  pesoPadraoG: number | null | undefined,
  toleranciaPct: number | null | undefined,
): { naoConforme: boolean; desvioPct: number | null } {
  if (!pesoPadraoG || pesoPadraoG <= 0) return { naoConforme: false, desvioPct: null };
  const desvioPct = arred(((pesoMedioG - pesoPadraoG) / pesoPadraoG) * 100, 2);
  return { naoConforme: Math.abs(desvioPct) > (toleranciaPct ?? 0), desvioPct };
}

/** RN-04 — código da divisão: número do ERP (ou interno) + "-" + sequencial com 2 dígitos. */
export function codigoDivisao(numeroOp: string, sequencial: number): string {
  return `${numeroOp}-${String(sequencial).padStart(2, '0')}`;
}

/**
 * RN-04 — horas disponíveis sugeridas: do início da máquina (ou do início nominal, se ligou antes)
 * até o fim nominal do turno, menos as paradas programadas previstas. Nunca negativo.
 */
export function horasDisponiveisSugeridas(p: {
  inicioMaquina: Date;
  inicioNominal: Date;
  fimNominal: Date;
  paradaProgramadaPrevistaMin: number;
}): number {
  const inicio = Math.max(p.inicioMaquina.getTime(), p.inicioNominal.getTime());
  const minutos = (p.fimNominal.getTime() - inicio) / 60_000 - p.paradaProgramadaPrevistaMin;
  return Math.max(0, arred(minutos / 60, 2));
}

/**
 * RN-04 — meta da divisão = horas disponíveis × PH da ficha, limitada ao saldo a produzir.
 * Em peças a meta é inteira (arredondada para baixo); em kg, com 1 casa.
 */
export function calcularMeta(horas: number, ph: number, saldoAProduzir: number, unidade: Unidade): number {
  const bruta = Math.max(0, horas * ph);
  const limitada = Math.min(bruta, Math.max(0, saldoAProduzir));
  return unidade === 'PECA' ? Math.floor(limitada + 1e-9) : Math.floor(limitada * 10 + 1e-9) / 10;
}

/** RN-06 — produção do turno por OP = etiquetado + saldo solto deixado − saldo solto recebido. */
export function producaoDoTurno(etiquetado: number, saldoDeixado: number, saldoRecebido: number): number {
  return arred(etiquetado + saldoDeixado - saldoRecebido);
}

export interface ConjuntoLancado {
  numero: number;
  quantidade: number;
  avulso: boolean;
}

/**
 * RN-06 — monta os conjuntos de uma saída de produção: N conjuntos padrão e, opcionalmente,
 * conjuntos avulsos (quantidade diferente do padrão). Cada conjunto gera uma etiqueta (Fase 3).
 */
export function montarConjuntos(
  quantidadePorConjunto: number,
  conjuntosPadrao: number,
  avulsos: number[],
): { conjuntos: ConjuntoLancado[]; total: number } {
  if (!Number.isInteger(conjuntosPadrao) || conjuntosPadrao < 0)
    throw new Error('Número de conjuntos inválido.');
  const conjuntos: ConjuntoLancado[] = [];
  for (let i = 0; i < conjuntosPadrao; i++) {
    conjuntos.push({ numero: i + 1, quantidade: quantidadePorConjunto, avulso: false });
  }
  for (const q of avulsos) {
    if (!(q > 0)) throw new Error('Quantidade do conjunto avulso deve ser maior que zero.');
    if (q === quantidadePorConjunto)
      throw new Error('Conjunto avulso deve ter quantidade diferente do padrão.');
    conjuntos.push({ numero: conjuntos.length + 1, quantidade: q, avulso: true });
  }
  if (conjuntos.length === 0) throw new Error('Informe ao menos um conjunto.');
  return { conjuntos, total: arred(conjuntos.reduce((s, c) => s + c.quantidade, 0)) };
}
