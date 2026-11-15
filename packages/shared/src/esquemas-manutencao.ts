import { z } from 'zod';
import { ESPECIALIDADES_MANUTENCAO, TIPOS_ORDEM_SERVICO } from './enumeracoes.js';

const id = z.string().uuid();
const texto = (max: number, min = 1, msg = 'Campo obrigatório.') => z.string().trim().min(min, msg).max(max);
const instante = z.string().datetime({ offset: true, message: 'Data e hora inválidas.' });

/** Uma etapa da sequência: mesma ordem = em paralelo. */
export const esquemaEtapaEntrada = z.object({
  ordem: z.number().int().min(1, 'A ordem começa em 1.').max(99),
  descricao: texto(200, 3, 'Descreva a etapa.'),
  especialidade: z.enum(ESPECIALIDADES_MANUTENCAO, { message: 'Escolha a especialidade.' }),
  responsavelId: id.nullish(),
});
export type EtapaEntrada = z.infer<typeof esquemaEtapaEntrada>;

/** Solicitação manual (líder/manutenção): com máquina ou com local (predial). */
export const esquemaSolicitacaoManual = z
  .object({
    maquinaId: id.nullish(),
    local: z.string().trim().max(120).nullish(),
    descricao: texto(1000, 5, 'Descreva o problema.'),
  })
  .refine((v) => !!v.maquinaId || !!v.local, { message: 'Informe a máquina ou o local.', path: ['local'] });

export const esquemaRecusaSolicitacao = z.object({
  justificativa: texto(1000, 5, 'Informe a justificativa da recusa.'),
});

/** Aprovação pelo controlador: converte a solicitação em OS com a sequência de etapas. */
export const esquemaConverterOs = z.object({
  tipo: z.enum(TIPOS_ORDEM_SERVICO),
  eletiva: z.boolean().default(false),
  etapas: z.array(esquemaEtapaEntrada).min(1, 'Inclua ao menos uma etapa.').max(60),
});
export type ConverterOs = z.infer<typeof esquemaConverterOs>;

export const esquemaIncluirEtapas = z.object({ etapas: z.array(esquemaEtapaEntrada).min(1).max(60) });

/** Ajuste de etapa ainda não iniciada: ordem, descrição, especialidade e responsável. */
export const esquemaAjustarEtapa = esquemaEtapaEntrada.partial();

export const esquemaCancelarEtapa = z.object({
  justificativa: texto(500, 5, 'Informe a justificativa do cancelamento.'),
});

export const esquemaIniciarEtapa = z.object({ inicio: instante.nullish() });

export const esquemaConcluirEtapa = z.object({
  fim: instante.nullish(),
  servicoExecutado: texto(2000, 3, 'Descreva o serviço executado.'),
});

export const esquemaEncerrarOs = z.object({
  servicoExecutado: texto(4000, 5, 'Descreva o serviço executado.'),
});

export const esquemaModeloSequencia = z.object({
  nome: texto(80),
  descricao: z.string().trim().max(300).nullish(),
  etapas: z
    .array(esquemaEtapaEntrada.omit({ responsavelId: true }))
    .min(1)
    .max(60),
  ativo: z.boolean().default(true),
});

export const esquemaFiltroManutencao = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
