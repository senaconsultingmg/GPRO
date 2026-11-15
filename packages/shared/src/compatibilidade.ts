import { usaMolde, type TipoMaquina } from './enumeracoes.js';

/** Dados do molde usados na verificação de compatibilidade (RN-02). */
export interface DadosMoldeCompatibilidade {
  larguraMm: number;
  comprimentoMm: number;
  alturaMm: number;
  pesoKg: number;
  forcaFechamentoT: number;
  pressaoBar: number;
  pesoInjetadoG: number;
  /** Informado no cadastro: o molde pode ser montado girado 90° entre as colunas. */
  podeGirar: boolean;
}

/** Dados da máquina usados na verificação de compatibilidade (RN-02). */
export interface DadosMaquinaCompatibilidade {
  tipo: TipoMaquina;
  forcaFechamentoT?: number | null;
  distanciaColunasHorizontalMm?: number | null;
  distanciaColunasVerticalMm?: number | null;
  alturaMoldeMinMm?: number | null;
  alturaMoldeMaxMm?: number | null;
  pesoMaxMoldeKg?: number | null;
  pressaoInjecaoBar?: number | null;
  capacidadeInjecaoG?: number | null;
}

export type CriterioCompatibilidade =
  | 'TIPO_MAQUINA'
  | 'COLUNAS'
  | 'ALTURA_MOLDE'
  | 'PESO_MOLDE'
  | 'FORCA_FECHAMENTO'
  | 'PRESSAO_INJECAO'
  | 'CAPACIDADE_INJECAO';

export interface FalhaCompatibilidade {
  criterio: CriterioCompatibilidade;
  mensagem: string;
}

export interface ResultadoCompatibilidade {
  compativel: boolean;
  /** Indica se o molde só cabe entre as colunas quando girado 90°. */
  exigeGiro: boolean;
  falhas: FalhaCompatibilidade[];
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function ausente(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v);
}

/**
 * Verifica se o molde pode ser alocado na máquina (RN-02).
 * Convenção: a largura do molde é comparada à distância horizontal entre colunas e o
 * comprimento à vertical. Se o molde permitir giro, a orientação girada também é aceita.
 * Dado da máquina não cadastrado conta como falha do critério correspondente.
 */
export function avaliarCompatibilidade(
  molde: DadosMoldeCompatibilidade,
  maquina: DadosMaquinaCompatibilidade,
): ResultadoCompatibilidade {
  const falhas: FalhaCompatibilidade[] = [];
  let exigeGiro = false;

  if (!usaMolde(maquina.tipo)) {
    return {
      compativel: false,
      exigeGiro: false,
      falhas: [{ criterio: 'TIPO_MAQUINA', mensagem: 'Extrusora não trabalha com molde.' }],
    };
  }

  const h = maquina.distanciaColunasHorizontalMm;
  const v = maquina.distanciaColunasVerticalMm;
  if (ausente(h) || ausente(v)) {
    falhas.push({ criterio: 'COLUNAS', mensagem: 'Máquina sem distância entre colunas cadastrada.' });
  } else {
    const cabeNormal = molde.larguraMm <= h && molde.comprimentoMm <= v;
    const cabeGirado = molde.comprimentoMm <= h && molde.larguraMm <= v;
    if (!cabeNormal && cabeGirado && molde.podeGirar) {
      exigeGiro = true;
    } else if (!cabeNormal) {
      const complemento =
        cabeGirado && !molde.podeGirar ? ' Caberia girado 90°, mas o molde não permite giro.' : '';
      falhas.push({
        criterio: 'COLUNAS',
        mensagem: `Molde de ${fmt(molde.larguraMm)} × ${fmt(molde.comprimentoMm)} mm não passa entre as colunas (${fmt(h)} × ${fmt(v)} mm).${complemento}`,
      });
    }
  }

  const min = maquina.alturaMoldeMinMm;
  const max = maquina.alturaMoldeMaxMm;
  if (ausente(min) || ausente(max)) {
    falhas.push({
      criterio: 'ALTURA_MOLDE',
      mensagem: 'Máquina sem altura de molde mínima/máxima cadastrada.',
    });
  } else if (molde.alturaMm < min || molde.alturaMm > max) {
    falhas.push({
      criterio: 'ALTURA_MOLDE',
      mensagem: `Altura do molde (${fmt(molde.alturaMm)} mm) fora da faixa da máquina (${fmt(min)} a ${fmt(max)} mm).`,
    });
  }

  const pesoMax = maquina.pesoMaxMoldeKg;
  if (ausente(pesoMax)) {
    falhas.push({ criterio: 'PESO_MOLDE', mensagem: 'Máquina sem peso máximo de molde cadastrado.' });
  } else if (molde.pesoKg > pesoMax) {
    falhas.push({
      criterio: 'PESO_MOLDE',
      mensagem: `Peso do molde (${fmt(molde.pesoKg)} kg) excede o máximo da máquina (${fmt(pesoMax)} kg).`,
    });
  }

  const forca = maquina.forcaFechamentoT;
  if (ausente(forca)) {
    falhas.push({ criterio: 'FORCA_FECHAMENTO', mensagem: 'Máquina sem força de fechamento cadastrada.' });
  } else if (forca < molde.forcaFechamentoT) {
    falhas.push({
      criterio: 'FORCA_FECHAMENTO',
      mensagem: `Força de fechamento da máquina (${fmt(forca)} t) menor que a exigida pelo molde (${fmt(molde.forcaFechamentoT)} t).`,
    });
  }

  const pressao = maquina.pressaoInjecaoBar;
  if (ausente(pressao)) {
    falhas.push({ criterio: 'PRESSAO_INJECAO', mensagem: 'Máquina sem pressão de injeção cadastrada.' });
  } else if (pressao < molde.pressaoBar) {
    falhas.push({
      criterio: 'PRESSAO_INJECAO',
      mensagem: `Pressão da máquina (${fmt(pressao)} bar) menor que a exigida pelo molde (${fmt(molde.pressaoBar)} bar).`,
    });
  }

  const capacidade = maquina.capacidadeInjecaoG;
  if (ausente(capacidade)) {
    falhas.push({
      criterio: 'CAPACIDADE_INJECAO',
      mensagem: 'Máquina sem capacidade de injeção cadastrada.',
    });
  } else if (molde.pesoInjetadoG > capacidade) {
    falhas.push({
      criterio: 'CAPACIDADE_INJECAO',
      mensagem: `Peso injetado por ciclo (${fmt(molde.pesoInjetadoG)} g) excede a capacidade de injeção (${fmt(capacidade)} g).`,
    });
  }

  return { compativel: falhas.length === 0, exigeGiro: falhas.length === 0 && exigeGiro, falhas };
}
