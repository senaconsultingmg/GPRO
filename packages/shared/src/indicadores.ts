/**
 * Linha do tempo da máquina, tempos, produção esperada e OEE (RN-05, seção 10).
 * Funções puras: instantes em milissegundos (UTC).
 */

export interface Intervalo {
  inicio: number;
  fim: number;
}

export interface EventoTempo {
  tipo: 'INICIO_MAQUINA' | 'FIM_MAQUINA' | 'PARADA' | 'REINICIO' | 'SAIDA_PRODUCAO';
  hora: number;
  id?: string;
  /** Ordem de registro (desempata eventos com a mesma hora da ocorrência). */
  seq?: number;
  /** Somente em PARADA. */
  programada?: boolean;
  motivoId?: string;
}

export interface ParadaIntervalo extends Intervalo {
  programada: boolean;
  motivoId?: string;
  /** Parada sem reinício (ainda aberta ou encerrada pelo fim da máquina/turno). */
  aberta: boolean;
}

// Ordem de desempate para eventos no mesmo instante.
const ORDEM: Record<EventoTempo['tipo'], number> = {
  INICIO_MAQUINA: 0,
  REINICIO: 1,
  SAIDA_PRODUCAO: 2,
  PARADA: 3,
  FIM_MAQUINA: 4,
};

/** Ordena pela hora da ocorrência; empates pela ordem de registro e, sem ela, pelo tipo. */
export const ordenarEventosTempo = <T extends EventoTempo>(eventos: T[]): T[] =>
  [...eventos].sort(
    (a, b) =>
      a.hora - b.hora ||
      (a.seq !== undefined && b.seq !== undefined ? a.seq - b.seq : 0) ||
      ORDEM[a.tipo] - ORDEM[b.tipo],
  );

/**
 * Valida a sequência de eventos de uma máquina no turno (RN-05):
 * início → (parada → reinício)* → fim; saída de produção só com a máquina ligada e fora de parada.
 * Retorna a mensagem de erro ou null.
 */
export function validarLinhaTempo(eventos: EventoTempo[]): string | null {
  let estado: 'DESLIGADA' | 'LIGADA' | 'PARADA' = 'DESLIGADA';
  for (const e of ordenarEventosTempo(eventos)) {
    switch (e.tipo) {
      case 'INICIO_MAQUINA':
        if (estado !== 'DESLIGADA') return 'A máquina já está ligada nesse horário.';
        estado = 'LIGADA';
        break;
      case 'FIM_MAQUINA':
        if (estado === 'DESLIGADA') return 'A máquina não está ligada nesse horário.';
        estado = 'DESLIGADA';
        break;
      case 'PARADA':
        if (estado === 'DESLIGADA') return 'A máquina não está ligada nesse horário.';
        if (estado === 'PARADA')
          return 'Já existe uma parada em aberto nesse horário (paradas não podem se sobrepor).';
        estado = 'PARADA';
        break;
      case 'REINICIO':
        if (estado !== 'PARADA') return 'Não há parada em aberto nesse horário para reiniciar.';
        estado = 'LIGADA';
        break;
      case 'SAIDA_PRODUCAO':
        if (estado === 'DESLIGADA') return 'A máquina não estava ligada no horário da saída de produção.';
        if (estado === 'PARADA') return 'A máquina estava parada no horário da saída de produção.';
        break;
    }
  }
  return null;
}

/**
 * Monta os intervalos ligados e as paradas a partir dos eventos.
 * Intervalo ligado sem fim termina em `fimPadrao` (fechamento do turno ou agora);
 * parada sem reinício termina no fim do intervalo ligado.
 */
export function montarLinhaTempo(
  eventos: EventoTempo[],
  fimPadrao: number,
): { ligados: Intervalo[]; paradas: ParadaIntervalo[] } {
  const ligados: Intervalo[] = [];
  const paradas: ParadaIntervalo[] = [];
  let ligadoDesde: number | null = null;
  let parada: Omit<ParadaIntervalo, 'fim'> | null = null;
  const fecharParada = (fim: number, aberta: boolean) => {
    if (parada) paradas.push({ ...parada, fim: Math.max(parada.inicio, fim), aberta });
    parada = null;
  };
  for (const e of ordenarEventosTempo(eventos)) {
    if (e.tipo === 'INICIO_MAQUINA' && ligadoDesde === null) ligadoDesde = e.hora;
    else if (e.tipo === 'FIM_MAQUINA' && ligadoDesde !== null) {
      fecharParada(e.hora, true);
      ligados.push({ inicio: ligadoDesde, fim: e.hora });
      ligadoDesde = null;
    } else if (e.tipo === 'PARADA' && ligadoDesde !== null && !parada) {
      parada = { inicio: e.hora, programada: !!e.programada, motivoId: e.motivoId, aberta: false };
    } else if (e.tipo === 'REINICIO' && parada) fecharParada(e.hora, false);
  }
  if (ligadoDesde !== null) {
    const fim = Math.max(ligadoDesde, fimPadrao);
    fecharParada(fim, true);
    ligados.push({ inicio: ligadoDesde, fim });
  }
  return { ligados, paradas };
}

const duracao = (l: Intervalo[]) => l.reduce((s, i) => s + Math.max(0, i.fim - i.inicio), 0);

/** Subtrai do intervalo base uma lista de intervalos. */
export function subtrairIntervalos(base: Intervalo[], remover: Intervalo[]): Intervalo[] {
  let resultado = base.map((i) => ({ ...i }));
  for (const r of remover) {
    const proximo: Intervalo[] = [];
    for (const i of resultado) {
      if (r.fim <= i.inicio || r.inicio >= i.fim) {
        proximo.push(i);
        continue;
      }
      if (r.inicio > i.inicio) proximo.push({ inicio: i.inicio, fim: r.inicio });
      if (r.fim < i.fim) proximo.push({ inicio: r.fim, fim: i.fim });
    }
    resultado = proximo;
  }
  return resultado.filter((i) => i.fim > i.inicio);
}

export interface TemposMaquina {
  ligadoMs: number;
  paradasProgramadasMs: number;
  paradasNaoProgramadasMs: number;
  planejadoMs: number;
  produzindoMs: number;
  /** Intervalos em que a máquina estava ligada e sem parada. */
  produzindo: Intervalo[];
}

/** Seção 10 — tempo ligado, planejado (− programadas) e produzindo (− não programadas). */
export function calcularTempos(ligados: Intervalo[], paradas: ParadaIntervalo[]): TemposMaquina {
  const ligadoMs = duracao(ligados);
  const recortar = (p: Intervalo) =>
    ligados
      .map((l) => ({ inicio: Math.max(l.inicio, p.inicio), fim: Math.min(l.fim, p.fim) }))
      .filter((i) => i.fim > i.inicio);
  const programadas = paradas.filter((p) => p.programada).flatMap(recortar);
  const naoProgramadas = paradas.filter((p) => !p.programada).flatMap(recortar);
  const paradasProgramadasMs = duracao(programadas);
  const paradasNaoProgramadasMs = duracao(naoProgramadas);
  const planejadoMs = ligadoMs - paradasProgramadasMs;
  const produzindoMs = planejadoMs - paradasNaoProgramadasMs;
  return {
    ligadoMs,
    paradasProgramadasMs,
    paradasNaoProgramadasMs,
    planejadoMs,
    produzindoMs,
    produzindo: subtrairIntervalos(ligados, [...programadas, ...naoProgramadas]),
  };
}

export interface EventoCavidade {
  tipo: 'BLOQUEIO_CAVIDADE' | 'DESBLOQUEIO_CAVIDADE';
  cavidade: number;
  hora: number;
}

export interface BloqueioIntervalo extends Intervalo {
  cavidade: number;
}

/** Valida a sequência de bloqueios/desbloqueios de cada cavidade. Retorna erro ou null. */
export function validarBloqueios(eventos: EventoCavidade[]): string | null {
  const bloqueadas = new Set<number>();
  for (const e of [...eventos].sort((a, b) => a.hora - b.hora)) {
    if (e.tipo === 'BLOQUEIO_CAVIDADE') {
      if (bloqueadas.has(e.cavidade)) return `A cavidade ${e.cavidade} já está bloqueada nesse horário.`;
      bloqueadas.add(e.cavidade);
    } else {
      if (!bloqueadas.has(e.cavidade)) return `A cavidade ${e.cavidade} não está bloqueada nesse horário.`;
      bloqueadas.delete(e.cavidade);
    }
  }
  return null;
}

/** Intervalos de bloqueio por cavidade; bloqueio sem desbloqueio vai até `fimPadrao`. */
export function montarBloqueios(eventos: EventoCavidade[], fimPadrao: number): BloqueioIntervalo[] {
  const abertos = new Map<number, number>();
  const r: BloqueioIntervalo[] = [];
  for (const e of [...eventos].sort((a, b) => a.hora - b.hora)) {
    if (e.tipo === 'BLOQUEIO_CAVIDADE' && !abertos.has(e.cavidade)) abertos.set(e.cavidade, e.hora);
    else if (e.tipo === 'DESBLOQUEIO_CAVIDADE' && abertos.has(e.cavidade)) {
      r.push({ cavidade: e.cavidade, inicio: abertos.get(e.cavidade)!, fim: e.hora });
      abertos.delete(e.cavidade);
    }
  }
  for (const [cavidade, inicio] of abertos) r.push({ cavidade, inicio, fim: Math.max(inicio, fimPadrao) });
  return r;
}

/**
 * RN-05 e seção 10 — produção esperada da OP: horas produzindo × PH da ficha, ponderado pela
 * fração de cavidades ativas da OP em cada trecho (cavidades ativas ÷ cavidades da OP).
 */
export function producaoEsperada(p: {
  produzindo: Intervalo[];
  ph: number;
  cavidadesOp: number[];
  bloqueios: BloqueioIntervalo[];
}): number {
  const minhas = p.bloqueios.filter((b) => p.cavidadesOp.includes(b.cavidade));
  const total = p.cavidadesOp.length || 1;
  let horasPonderadas = 0;
  for (const intervalo of p.produzindo) {
    const cortes = new Set<number>([intervalo.inicio, intervalo.fim]);
    for (const b of minhas) {
      if (b.inicio > intervalo.inicio && b.inicio < intervalo.fim) cortes.add(b.inicio);
      if (b.fim > intervalo.inicio && b.fim < intervalo.fim) cortes.add(b.fim);
    }
    const pontos = [...cortes].sort((a, b) => a - b);
    for (let i = 0; i < pontos.length - 1; i++) {
      const [ini, fim] = [pontos[i], pontos[i + 1]];
      const meio = (ini + fim) / 2;
      const bloqueadas = new Set(
        minhas.filter((b) => b.inicio <= meio && b.fim > meio).map((b) => b.cavidade),
      ).size;
      horasPonderadas += ((fim - ini) / 3_600_000) * ((total - bloqueadas) / total);
    }
  }
  return Math.round(horasPonderadas * p.ph * 1000) / 1000;
}

export interface Oee {
  disponibilidade: number | null;
  performance: number | null;
  qualidade: number | null;
  oee: number | null;
  /** Performance acima de 100%: ficha técnica possivelmente desatualizada (P8). */
  alertaPerformance: boolean;
}

/**
 * Seção 10 — OEE = Disponibilidade × Performance × Qualidade.
 * Disponibilidade = produzindo ÷ planejado; Performance = (boas + refugadas) ÷ esperada;
 * Qualidade = boas ÷ (boas + refugadas). Sem denominador, o fator fica nulo.
 * Para períodos e grupos, some tempos e quantidades antes de chamar esta função.
 */
export function calcularOee(p: {
  planejadoMs: number;
  produzindoMs: number;
  producaoEsperada: number;
  boas: number;
  refugadas: number;
}): Oee {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const disponibilidade = div(p.produzindoMs, p.planejadoMs);
  const total = p.boas + p.refugadas;
  const performance = div(total, p.producaoEsperada);
  const qualidade = div(p.boas, total);
  const oee =
    disponibilidade !== null && performance !== null && qualidade !== null
      ? disponibilidade * performance * qualidade
      : null;
  return { disponibilidade, performance, qualidade, oee, alertaPerformance: (performance ?? 0) > 1 };
}

/** PH real = produção total ÷ horas produzindo. */
export function calcularPhReal(producaoTotal: number, produzindoMs: number): number | null {
  if (produzindoMs <= 0) return null;
  return Math.round((producaoTotal / (produzindoMs / 3_600_000)) * 100) / 100;
}

/**
 * RN-10 (relatório) — consumo teórico de cada material da ficha.
 * Consumo por peça em g → kg; percentual sobre o peso produzido (kg ou peças × peso padrão).
 */
export function consumoTeorico(
  composicao: { materialId: string; consumoGPorPeca: number | null; percentual: number | null }[],
  producao: number,
  unidade: 'PECA' | 'KG',
  pesoPadraoG: number | null,
): { materialId: string; kg: number }[] {
  const pesoTotalKg = unidade === 'KG' ? producao : pesoPadraoG ? (producao * pesoPadraoG) / 1000 : 0;
  return composicao.map((c) => ({
    materialId: c.materialId,
    kg:
      Math.round(
        (unidade === 'PECA' && c.consumoGPorPeca != null
          ? (c.consumoGPorPeca * producao) / 1000
          : ((c.percentual ?? 0) / 100) * pesoTotalKg) * 1000,
      ) / 1000,
  }));
}
