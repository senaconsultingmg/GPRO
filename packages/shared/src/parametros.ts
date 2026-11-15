import type { TipoParametro } from './enumeracoes.js';

export interface DefinicaoParametro {
  chave: string;
  valorInicial: string;
  tipo: TipoParametro;
  opcoes?: string[];
  descricao: string;
}

/** Parâmetros do sistema editáveis pelo superusuário. */
export const PARAMETROS_INICIAIS: DefinicaoParametro[] = [
  {
    chave: 'tolerancia_horario_min',
    valorInicial: '10',
    tipo: 'INTEIRO',
    descricao:
      'Diferença máxima, em minutos, entre a hora da ocorrência e a hora do registro antes de o lançamento ser marcado como retroativo ou antecipado (RN-08).',
  },
  {
    chave: 'visao_recebimento',
    valorInicial: 'AMBAS',
    tipo: 'LISTA',
    opcoes: ['PENDENTES', 'RECEBIDAS', 'AMBAS'],
    descricao: 'Etiquetas exibidas na tela de recebimento do estoque (RN-12).',
  },
  {
    chave: 'alerta_diferenca_relogio_min',
    valorInicial: '5',
    tipo: 'INTEIRO',
    descricao:
      'Diferença, em minutos, entre o relógio do dispositivo e o do servidor a partir da qual o superusuário é alertado (seção 11).',
  },
];

/** Valida um valor conforme o tipo do parâmetro. Retorna mensagem de erro ou null. */
export function validarValorParametro(
  tipo: TipoParametro,
  valor: string,
  opcoes?: string[] | null,
): string | null {
  switch (tipo) {
    case 'INTEIRO':
      return /^-?\d+$/.test(valor) ? null : 'Informe um número inteiro.';
    case 'DECIMAL':
      return /^-?\d+([.,]\d+)?$/.test(valor) ? null : 'Informe um número.';
    case 'BOOLEANO':
      return valor === 'true' || valor === 'false' ? null : 'Informe verdadeiro ou falso.';
    case 'LISTA':
      return opcoes && opcoes.includes(valor) ? null : `Valor deve ser um de: ${(opcoes ?? []).join(', ')}.`;
    case 'TEXTO':
      return null;
  }
}
