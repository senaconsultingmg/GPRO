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

const material = {
  divisaoId: id,
  materialId: id,
  lote: z.string().trim().min(1, 'Informe o lote.').max(60),
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
    produtoId: id,
    quantidade: kg('Quantidade'),
    lote: textoOpcional(60),
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
