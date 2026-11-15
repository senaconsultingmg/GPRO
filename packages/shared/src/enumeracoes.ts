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

// ---------------- Fase 2: ordens, rodadas, turnos e eventos ----------------

export const TIPOS_ORDEM = ['PRODUCAO', 'EXTRUSAO'] as const;
export type TipoOrdem = (typeof TIPOS_ORDEM)[number];
export const ROTULO_TIPO_ORDEM: Record<TipoOrdem, string> = { PRODUCAO: 'Produção', EXTRUSAO: 'Extrusão' };

export const SITUACOES_ORDEM = ['ABERTA', 'EM_PRODUCAO', 'ENCERRADA', 'CANCELADA'] as const;
export type SituacaoOrdem = (typeof SITUACOES_ORDEM)[number];
export const ROTULO_SITUACAO_ORDEM: Record<SituacaoOrdem, string> = {
  ABERTA: 'Aberta',
  EM_PRODUCAO: 'Em produção',
  ENCERRADA: 'Encerrada',
  CANCELADA: 'Cancelada',
};

export const SITUACOES_RODADA = ['PLANEJADA', 'EM_ANDAMENTO', 'ENCERRADA'] as const;
export type SituacaoRodada = (typeof SITUACOES_RODADA)[number];
export const ROTULO_SITUACAO_RODADA: Record<SituacaoRodada, string> = {
  PLANEJADA: 'Planejada',
  EM_ANDAMENTO: 'Em andamento',
  ENCERRADA: 'Encerrada',
};

export const SITUACOES_TURNO = ['ABERTO', 'FECHADO', 'APROVADO', 'APURADO', 'EXPORTADO'] as const;
export type SituacaoTurno = (typeof SITUACOES_TURNO)[number];
export const ROTULO_SITUACAO_TURNO: Record<SituacaoTurno, string> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
  APROVADO: 'Aprovado',
  APURADO: 'Apurado',
  EXPORTADO: 'Exportado',
};

export const TIPOS_EVENTO = [
  'INICIO_MAQUINA',
  'FIM_MAQUINA',
  'PARADA',
  'REINICIO',
  'ENTRADA_MATERIA_PRIMA',
  'ENTRADA_SEMIACABADO',
  'SAIDA_PRODUCAO',
  'PERDA',
  'DEVOLUCAO_MATERIA_PRIMA',
  'TRANSFERENCIA',
  'BLOQUEIO_CAVIDADE',
  'DESBLOQUEIO_CAVIDADE',
  'SALDO_AVULSO_DEIXADO',
  'SALDO_AVULSO_RECEBIDO',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = {
  INICIO_MAQUINA: 'Início de máquina',
  FIM_MAQUINA: 'Fim de máquina',
  PARADA: 'Parada',
  REINICIO: 'Reinício',
  ENTRADA_MATERIA_PRIMA: 'Entrada de matéria-prima',
  ENTRADA_SEMIACABADO: 'Entrada de semiacabado',
  SAIDA_PRODUCAO: 'Saída de produção',
  PERDA: 'Perda',
  DEVOLUCAO_MATERIA_PRIMA: 'Devolução de matéria-prima',
  TRANSFERENCIA: 'Transferência',
  BLOQUEIO_CAVIDADE: 'Bloqueio de cavidade',
  DESBLOQUEIO_CAVIDADE: 'Desbloqueio de cavidade',
  SALDO_AVULSO_DEIXADO: 'Saldo solto deixado',
  SALDO_AVULSO_RECEBIDO: 'Saldo solto recebido',
};

export const MARCAS_HORARIO = ['NO_MOMENTO', 'RETROATIVO', 'ANTECIPADO'] as const;
export type MarcaHorario = (typeof MARCAS_HORARIO)[number];
export const ROTULO_MARCA_HORARIO: Record<MarcaHorario, string> = {
  NO_MOMENTO: 'No momento',
  RETROATIVO: 'Retroativo',
  ANTECIPADO: 'Antecipado',
};

export const SITUACOES_EVENTO = ['VALIDO', 'CORRECAO_PENDENTE', 'INCORRETO'] as const;
export type SituacaoEvento = (typeof SITUACOES_EVENTO)[number];

export const TIPOS_APROVACAO = ['CORRECAO', 'HORARIO', 'PESO', 'JUSTIFICATIVA', 'RELATORIO_TURNO'] as const;
export type TipoAprovacao = (typeof TIPOS_APROVACAO)[number];
export const ROTULO_TIPO_APROVACAO: Record<TipoAprovacao, string> = {
  CORRECAO: 'Correção',
  HORARIO: 'Lançamento fora de hora',
  PESO: 'Peso fora da tolerância',
  JUSTIFICATIVA: 'Justificativa',
  RELATORIO_TURNO: 'Relatório do turno',
};

export const TIPOS_VOLUME_EXTRUSAO = ['SACO', 'BOBINA', 'CAIXA', 'BAG', 'OUTRO'] as const;
export type TipoVolumeExtrusao = (typeof TIPOS_VOLUME_EXTRUSAO)[number];
export const ROTULO_TIPO_VOLUME: Record<TipoVolumeExtrusao, string> = {
  SACO: 'Saco',
  BOBINA: 'Bobina',
  CAIXA: 'Caixa',
  BAG: 'Big bag',
  OUTRO: 'Outro',
};

export const LAYOUTS_IMPORTACAO = ['IMPORTACAO_ORDENS', 'IMPORTACAO_PRODUTOS'] as const;
export type LayoutImportacao = (typeof LAYOUTS_IMPORTACAO)[number];

// ---------------- Fase 4: exportação, correções ----------------

export const LAYOUTS_EXPORTACAO = [
  'EXPORTACAO_PRODUCAO',
  'EXPORTACAO_CONSUMO',
  'EXPORTACAO_PERDAS',
  'EXPORTACAO_ETIQUETAS',
] as const;
export type LayoutExportacao = (typeof LAYOUTS_EXPORTACAO)[number];
export type LayoutExcel = LayoutImportacao | LayoutExportacao;

export const TIPOS_CORRECAO = ['CORRIGIR', 'ANULAR'] as const;
export type TipoCorrecao = (typeof TIPOS_CORRECAO)[number];
export const ROTULO_TIPO_CORRECAO: Record<TipoCorrecao, string> = {
  CORRIGIR: 'Corrigir valores',
  ANULAR: 'Anular lançamento',
};

// ---------------- Fase 3: etiquetas, lotes e estoque ----------------

export const SITUACOES_ETIQUETA = ['EMITIDA', 'RECEBIDA', 'CONSUMIDA', 'EXPORTADA', 'CANCELADA'] as const;
export type SituacaoEtiqueta = (typeof SITUACOES_ETIQUETA)[number];
export const ROTULO_SITUACAO_ETIQUETA: Record<SituacaoEtiqueta, string> = {
  EMITIDA: 'Emitida',
  RECEBIDA: 'Recebida',
  CONSUMIDA: 'Consumida',
  EXPORTADA: 'Exportada',
  CANCELADA: 'Cancelada',
};

export const ORIGENS_LOTE = ['COMPRA', 'EXTRUSAO', 'MISTURA', 'MOIDO', 'RECICLADO'] as const;
export type OrigemLote = (typeof ORIGENS_LOTE)[number];
export const ROTULO_ORIGEM_LOTE: Record<OrigemLote, string> = {
  COMPRA: 'Compra',
  EXTRUSAO: 'Extrusão',
  MISTURA: 'Mistura',
  MOIDO: 'Moído',
  RECICLADO: 'Reciclado',
};

export const TIPOS_MOVIMENTO = [
  'ENTRADA_COMPRA',
  'ENTRADA_RETORNO',
  'ENTRADA_EXTRUSAO',
  'ENTRADA_MISTURA',
  'SAIDA_MISTURA',
  'CONSUMO_PRODUCAO',
  'DEVOLUCAO_PRODUCAO',
  'TRANSFERENCIA_LOCAL',
  'RECEBIMENTO_PRODUTO',
  'CONSUMO_SEMIACABADO',
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];
export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_RETORNO: 'Entrada de moído/reciclado',
  ENTRADA_EXTRUSAO: 'Entrada de extrusado',
  ENTRADA_MISTURA: 'Entrada de mistura',
  SAIDA_MISTURA: 'Saída para mistura',
  CONSUMO_PRODUCAO: 'Consumo na produção',
  DEVOLUCAO_PRODUCAO: 'Devolução da produção',
  TRANSFERENCIA_LOCAL: 'Transferência entre locais',
  RECEBIMENTO_PRODUTO: 'Recebimento de produto',
  CONSUMO_SEMIACABADO: 'Consumo de semiacabado',
};

// ---------- Fase 6: manutenção (RN-14) ----------
export const ESPECIALIDADES_MANUTENCAO = [
  'ELETRICA',
  'MECANICA',
  'HIDRAULICA',
  'FERRAMENTARIA',
  'SETUP',
  'PREDIAL',
] as const;
export type EspecialidadeManutencao = (typeof ESPECIALIDADES_MANUTENCAO)[number];
export const ROTULO_ESPECIALIDADE: Record<EspecialidadeManutencao, string> = {
  ELETRICA: 'Elétrica',
  MECANICA: 'Mecânica',
  HIDRAULICA: 'Hidráulica',
  FERRAMENTARIA: 'Ferramentaria',
  SETUP: 'Setup',
  PREDIAL: 'Predial',
};

export const SITUACOES_SOLICITACAO = ['ABERTA', 'EM_TRIAGEM', 'CONVERTIDA', 'RECUSADA', 'ENCERRADA'] as const;
export type SituacaoSolicitacao = (typeof SITUACOES_SOLICITACAO)[number];
export const ROTULO_SITUACAO_SOLICITACAO: Record<SituacaoSolicitacao, string> = {
  ABERTA: 'Aberta',
  EM_TRIAGEM: 'Em triagem',
  CONVERTIDA: 'Convertida em OS',
  RECUSADA: 'Recusada',
  ENCERRADA: 'Encerrada',
};

export const TIPOS_ORDEM_SERVICO = ['CORRETIVA', 'PREVENTIVA'] as const;
export type TipoOrdemServico = (typeof TIPOS_ORDEM_SERVICO)[number];
export const ROTULO_TIPO_ORDEM_SERVICO: Record<TipoOrdemServico, string> = {
  CORRETIVA: 'Corretiva',
  PREVENTIVA: 'Preventiva',
};

export const SITUACOES_ORDEM_SERVICO = ['ABERTA', 'EM_EXECUCAO', 'ENCERRADA'] as const;
export type SituacaoOrdemServico = (typeof SITUACOES_ORDEM_SERVICO)[number];
export const ROTULO_SITUACAO_ORDEM_SERVICO: Record<SituacaoOrdemServico, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em execução',
  ENCERRADA: 'Encerrada',
};

export const SITUACOES_ETAPA = ['PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA'] as const;
export type SituacaoEtapa = (typeof SITUACOES_ETAPA)[number];
/** Rótulos de exibição; "Aguardando" e "Liberada" vêm da regra de sequência (etapa pendente). */
export const ROTULO_SITUACAO_ETAPA: Record<SituacaoEtapa | 'AGUARDANDO' | 'LIBERADA', string> = {
  AGUARDANDO: 'Aguardando',
  LIBERADA: 'Liberada',
  PENDENTE: 'Pendente',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};
