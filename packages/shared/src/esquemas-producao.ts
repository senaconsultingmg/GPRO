import { z } from 'zod';
import { TIPOS_ORDEM, TIPOS_VOLUME_EXTRUSAO } from './enumeracoes.js';

const id = z.string().uuid('Identificador inválido.');
const idOpcional = id.nullish().transform((v) => v ?? null);
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const instante = z.iso.datetime({ offset: true, error: 'Data e hora inválidas.' });
const textoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const kg = (rotulo: string) =>
  z.number({ error: `${rotulo}: informe um número.` }).positive(`${rotulo} deve ser maior que zero.`);

// ---------- Ordens de produção (RN-01) ----------
export const esquemaOrdem = z
  .object({
    tipo: z.enum(TIPOS_ORDEM),
    numeroErp: z
      .string()
      .trim()
      .max(40)
      .nullish()
      .transform((v) => (v ? v : null)),
    produtoId: id,
    quantidade: kg('Quantidade'),
    dataInicioPrevista: dataCivil.nullish().transform((v) => v ?? null),
    dataFimPrevista: dataCivil.nullish().transform((v) => v ?? null),
    observacao: textoOpcional(1000),
  })
  .refine((o) => o.tipo !== 'PRODUCAO' || !!o.numeroErp, {
    message: 'O número da OP no ERP é obrigatório para OP de produção.',
    path: ['numeroErp'],
  })
  .refine((o) => !o.dataInicioPrevista || !o.dataFimPrevista || o.dataInicioPrevista <= o.dataFimPrevista, {
    message: 'A data de término deve ser igual ou posterior à de início.',
    path: ['dataFimPrevista'],
  });
export type OrdemEntrada = z.infer<typeof esquemaOrdem>;

// ---------- Rodadas (RN-03) ----------
export const esquemaRodada = z.object({
  maquinaId: id,
  moldeId: idOpcional,
  ops: z
    .array(
      z.object({
        ordemId: id,
        cavidades: z.array(z.number().int().min(1)).default([]),
      }),
    )
    .min(1, 'Vincule ao menos uma OP.'),
  observacao: textoOpcional(1000),
});
export type RodadaEntrada = z.infer<typeof esquemaRodada>;

// ---------- Turno (RN-04) ----------
export const esquemaAbrirTurno = z.object({ data: dataCivil, horarioTurnoId: id, equipeId: id });

export const esquemaLigarMaquina = z.object({
  eventoId: id,
  maquinaId: id,
  rodadaId: id,
  horaOcorrencia: instante,
  /** Inicia já parada com este motivo (máquina que ficou parada no turno anterior). */
  iniciarParadaMotivoId: idOpcional,
});

export const esquemaCriarDivisao = z.object({
  rodadaOpId: id,
  maquinaId: id,
  horasDisponiveis: z.number().min(0).max(24).nullish(),
  /** Saldo solto recebido do turno anterior, confirmado pelo apontador. */
  saldoRecebido: z.number().min(0).nullish(),
});

export const esquemaAjustarDivisao = z.object({ horasDisponiveis: z.number().min(0).max(24) });

// ---------- Eventos (RN-05 a RN-08, RN-11) ----------
const baseEvento = {
  id,
  maquinaId: id,
  horaOcorrencia: instante,
  justificativa: textoOpcional(1000),
};

/** Fase 3: o material é identificado pela leitura da etiqueta do lote/mistura ou pelo número do lote. */
const material = {
  divisaoId: id,
  leitura: z.string().trim().min(1, 'Leia a etiqueta ou digite o número do lote.').max(200),
  quantidadeKg: kg('Quantidade'),
};

export const esquemaEvento = z.discriminatedUnion('tipo', [
  z.object({ ...baseEvento, tipo: z.literal('INICIO_MAQUINA') }),
  z.object({ ...baseEvento, tipo: z.literal('FIM_MAQUINA') }),
  z.object({ ...baseEvento, tipo: z.literal('PARADA'), motivoParadaId: id }),
  z.object({ ...baseEvento, tipo: z.literal('REINICIO') }),
  z.object({
    ...baseEvento,
    tipo: z.literal('SAIDA_PRODUCAO'),
    divisaoId: id,
    // Injetora/sopradora: conjuntos padrão + conjuntos avulsos.
    conjuntoPadraoId: idOpcional,
    conjuntosPadrao: z.number().int().min(0).default(0),
    avulsos: z.array(z.number().positive()).default([]),
    confirmarAvulso: z.boolean().default(false),
    pesoMedioG: z.number().positive('O peso médio deve ser maior que zero.').nullish(),
    // Extrusora: volumes com peso digitado.
    volumes: z
      .array(z.object({ tipoVolume: z.enum(TIPOS_VOLUME_EXTRUSAO), pesoKg: kg('Peso do volume') }))
      .default([]),
    operador: textoOpcional(80),
    indiceFluidez: z.number().positive().nullish(),
    produtosDestino: z.array(id).default([]),
  }),
  z
    .object({
      ...baseEvento,
      tipo: z.literal('PERDA'),
      divisaoId: id,
      tipoPerdaId: id,
      pesoKg: z.number().positive().nullish(),
      quantidadePecas: z.number().int().positive().nullish(),
    })
    .refine((p) => p.pesoKg != null || p.quantidadePecas != null, {
      message: 'Informe o peso (kg) ou a quantidade (peças).',
      path: ['pesoKg'],
    }),
  z.object({ ...baseEvento, tipo: z.literal('ENTRADA_MATERIA_PRIMA'), ...material }),
  z.object({
    ...baseEvento,
    tipo: z.literal('ENTRADA_SEMIACABADO'),
    divisaoId: id,
    /** Leitura da etiqueta do semiacabado (ou digitação do código). */
    leitura: z.string().trim().min(1, 'Leia a etiqueta do semiacabado.').max(200),
  }),
  z.object({ ...baseEvento, tipo: z.literal('DEVOLUCAO_MATERIA_PRIMA'), ...material }),
  z.object({ ...baseEvento, tipo: z.literal('TRANSFERENCIA'), ...material, divisaoDestinoId: id }),
  z.object({
    ...baseEvento,
    tipo: z.literal('BLOQUEIO_CAVIDADE'),
    cavidade: z.number().int().min(1),
    motivo: z.string().trim().min(1, 'Informe o motivo do bloqueio.').max(200),
  }),
  z.object({ ...baseEvento, tipo: z.literal('DESBLOQUEIO_CAVIDADE'), cavidade: z.number().int().min(1) }),
]);
export type EventoEntrada = z.infer<typeof esquemaEvento>;

// ---------- Fechamento (RN-13) ----------
export const esquemaFecharTurno = z.object({
  maquinas: z.array(z.object({ maquinaId: id, acao: z.enum(['DESLIGAR', 'SEGUE_RODANDO']) })).default([]),
  saldos: z.array(z.object({ divisaoId: id, quantidade: z.number().min(0) })).default([]),
});
export type FecharTurno = z.infer<typeof esquemaFecharTurno>;

// ---------- Mapeamento de colunas do Excel ----------
export const esquemaMapeamento = z.object({
  colunas: z.record(z.string(), z.string().trim().min(1, 'Informe o nome da coluna.').max(80)),
});

// ---------- Fase 3: matéria-prima, estoque e impressão ----------
const leitura = z.string().trim().min(1, 'Leia a etiqueta ou digite o código.').max(200);

export const esquemaLoteCompra = z.object({
  materialId: id,
  fornecedor: z.string().trim().min(1, 'Informe o fornecedor.').max(120),
  notaFiscal: z.string().trim().min(1, 'Informe a nota fiscal.').max(40),
  loteFornecedor: textoOpcional(60),
  quantidadeKg: kg('Quantidade'),
  localEstoqueId: id,
  indiceFluidez: z
    .number()
    .positive()
    .nullish()
    .transform((v) => v ?? null),
  cor: textoOpcional(40),
  observacao: textoOpcional(500),
});
export type LoteCompra = z.infer<typeof esquemaLoteCompra>;

export const esquemaLoteRetorno = z.object({
  materialId: id,
  origem: z.enum(['MOIDO', 'RECICLADO']),
  quantidadeKg: kg('Quantidade'),
  localEstoqueId: id,
  /** Etiqueta da perda que originou o material (opcional, para rastreio). */
  leituraPerda: textoOpcional(200),
  observacao: textoOpcional(500),
});
export type LoteRetorno = z.infer<typeof esquemaLoteRetorno>;

export const esquemaMistura = z.object({
  materialId: id,
  componentes: z
    .array(z.object({ loteId: id, localEstoqueId: id, quantidadeKg: kg('Quantidade do componente') }))
    .min(2, 'Uma mistura tem ao menos dois componentes.'),
  produtosDestino: z.array(id).default([]),
  localEstoqueId: id,
  observacao: textoOpcional(500),
});
export type MisturaEntrada = z.infer<typeof esquemaMistura>;

export const esquemaTransferirLote = z
  .object({ localOrigemId: id, localDestinoId: id, quantidadeKg: kg('Quantidade') })
  .refine((t) => t.localOrigemId !== t.localDestinoId, {
    message: 'Origem e destino devem ser diferentes.',
    path: ['localDestinoId'],
  });

export const esquemaLeituraLocal = z.object({ leitura, localEstoqueId: id });

export const esquemaSolicitarImpressao = z.object({ layoutId: idOpcional, impressoraId: idOpcional });
export const esquemaResultadoImpressao = z.object({ sucesso: z.boolean(), mensagem: textoOpcional(500) });

export const esquemaOrdemExtrusao = z.object({
  produtoId: id,
  quantidade: kg('Quantidade'),
  dataInicioPrevista: dataCivil.nullish().transform((v) => v ?? null),
  dataFimPrevista: dataCivil.nullish().transform((v) => v ?? null),
  observacao: textoOpcional(1000),
});

// ---------- Fase 4: correções, aprovações, apuração ----------
const parecerOpcional = textoOpcional(1000);

/**
 * Solicitação de correção (RN-09): "CORRIGIR" traz os valores corretos (mesmo tipo de lançamento,
 * sem identificador); "ANULAR" marca o lançamento como incorreto sem substituto.
 */
export const esquemaSolicitarCorrecao = z
  .object({
    eventoId: id,
    tipo: z.enum(['CORRIGIR', 'ANULAR']),
    justificativa: z.string().trim().min(5, 'Explique o motivo da correção.').max(1000),
    /** Valores corretos (formato de lançamento, sem "id"); saldo solto: { quantidade }. */
    valores: z.record(z.string(), z.unknown()).nullish(),
  })
  .refine((c) => c.tipo === 'ANULAR' || !!c.valores, {
    message: 'Informe os valores corretos.',
    path: ['valores'],
  });
export type SolicitarCorrecao = z.infer<typeof esquemaSolicitarCorrecao>;

export const esquemaDecisao = z.object({ parecer: parecerOpcional });
export const esquemaRejeicao = z.object({
  parecer: z.string().trim().min(3, 'Informe o parecer.').max(1000),
});
export const esquemaEstorno = z.object({
  leitura: z.string().trim().min(1, 'Leia a etiqueta.').max(200),
  motivo: z.string().trim().min(5, 'Informe o motivo do estorno.').max(500),
});
