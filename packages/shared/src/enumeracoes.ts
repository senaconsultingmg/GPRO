/** Enumerações do domínio e seus rótulos em português do Brasil. */

export const PERFIS = [
  'SUPERUSUARIO',
  'PCP',
  'APONTADOR',
  'LIDER',
  'ESTOQUE',
  'MATERIA_PRIMA',
  'MANUTENCAO',
] as const;
export type Perfil = (typeof PERFIS)[number];
export const ROTULO_PERFIL: Record<Perfil, string> = {
  SUPERUSUARIO: 'Superusuário',
  PCP: 'PCP',
  APONTADOR: 'Apontador',
  LIDER: 'Líder de produção',
  ESTOQUE: 'Estoque',
  MATERIA_PRIMA: 'Matéria-prima',
  MANUTENCAO: 'Manutenção',
};

export const TIPOS_MAQUINA = ['INJETORA', 'SOPRADORA', 'EXTRUSORA'] as const;
export type TipoMaquina = (typeof TIPOS_MAQUINA)[number];
export const ROTULO_TIPO_MAQUINA: Record<TipoMaquina, string> = {
  INJETORA: 'Injetora',
  SOPRADORA: 'Sopradora',
  EXTRUSORA: 'Extrusora',
};
/** Máquinas que trabalham com molde e produzem em peças. */
export const usaMolde = (tipo: TipoMaquina): boolean => tipo === 'INJETORA' || tipo === 'SOPRADORA';

export const TIPOS_PRODUTO = [
  'ACABADO',
  'SEMIACABADO',
  'MATERIA_PRIMA',
  'ADITIVO',
  'EXTRUSADO',
  'MOIDO',
  'RECICLADO',
  'MISTURA',
] as const;
export type TipoProduto = (typeof TIPOS_PRODUTO)[number];
export const ROTULO_TIPO_PRODUTO: Record<TipoProduto, string> = {
  ACABADO: 'Acabado',
  SEMIACABADO: 'Semiacabado',
  MATERIA_PRIMA: 'Matéria-prima',
  ADITIVO: 'Aditivo',
  EXTRUSADO: 'Extrusado',
  MOIDO: 'Moído',
  RECICLADO: 'Reciclado',
  MISTURA: 'Mistura',
};
/** Tipos de produto que podem compor uma ficha técnica como material. */
export const TIPOS_MATERIAL: TipoProduto[] = [
  'MATERIA_PRIMA',
  'ADITIVO',
  'EXTRUSADO',
  'MOIDO',
  'RECICLADO',
  'MISTURA',
  'SEMIACABADO',
];

export const UNIDADES = ['PECA', 'KG'] as const;
export type Unidade = (typeof UNIDADES)[number];
export const ROTULO_UNIDADE: Record<Unidade, string> = { PECA: 'Peça', KG: 'kg' };

export const TIPOS_EMBALAGEM = ['PALLET', 'SACO', 'GAIOLA', 'CAIXOTE', 'PILHA', 'OUTRO'] as const;
export type TipoEmbalagem = (typeof TIPOS_EMBALAGEM)[number];
export const ROTULO_TIPO_EMBALAGEM: Record<TipoEmbalagem, string> = {
  PALLET: 'Pallet',
  SACO: 'Saco',
  GAIOLA: 'Gaiola',
  CAIXOTE: 'Caixote',
  PILHA: 'Pilha',
  OUTRO: 'Outro',
};

export const SITUACOES_FICHA = ['RASCUNHO', 'VIGENTE', 'OBSOLETA'] as const;
export type SituacaoFicha = (typeof SITUACOES_FICHA)[number];
export const ROTULO_SITUACAO_FICHA: Record<SituacaoFicha, string> = {
  RASCUNHO: 'Rascunho',
  VIGENTE: 'Vigente',
  OBSOLETA: 'Obsoleta',
};

export const TIPOS_LOCAL_ESTOQUE = ['PRODUTO_ACABADO', 'MATERIA_PRIMA'] as const;
export type TipoLocalEstoque = (typeof TIPOS_LOCAL_ESTOQUE)[number];
export const ROTULO_TIPO_LOCAL_ESTOQUE: Record<TipoLocalEstoque, string> = {
  PRODUTO_ACABADO: 'Produto acabado',
  MATERIA_PRIMA: 'Matéria-prima',
};

export const MODALIDADES_TURNO = ['CENTRAL', 'REVEZAMENTO'] as const;
export type ModalidadeTurno = (typeof MODALIDADES_TURNO)[number];
export const ROTULO_MODALIDADE_TURNO: Record<ModalidadeTurno, string> = {
  CENTRAL: 'Horário central',
  REVEZAMENTO: 'Revezamento (turnos de letra)',
};

export const TIPOS_ETIQUETA = [
  'PRODUTO',
  'EXTRUSAO',
  'MISTURA',
  'ENTRADA_MATERIA_PRIMA',
  'PERDA',
  'DEVOLUCAO_TRANSFERENCIA',
] as const;
export type TipoEtiqueta = (typeof TIPOS_ETIQUETA)[number];
export const ROTULO_TIPO_ETIQUETA: Record<TipoEtiqueta, string> = {
  PRODUTO: 'Produto acabado ou semiacabado',
  EXTRUSAO: 'Extrusão',
  MISTURA: 'Mistura',
  ENTRADA_MATERIA_PRIMA: 'Entrada de matéria-prima',
  PERDA: 'Perda',
  DEVOLUCAO_TRANSFERENCIA: 'Devolução e transferência',
};

export const TIPOS_PARAMETRO = ['INTEIRO', 'DECIMAL', 'TEXTO', 'BOOLEANO', 'LISTA'] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];

export const DIAS_SEMANA = [0, 1, 2, 3, 4, 5, 6] as const;
export const ROTULO_DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
