import { z } from 'zod';
import {
  MODALIDADES_TURNO,
  PERFIS,
  TIPOS_EMBALAGEM,
  TIPOS_ETIQUETA,
  TIPOS_LOCAL_ESTOQUE,
  TIPOS_MAQUINA,
  TIPOS_PRODUTO,
  UNIDADES,
  usaMolde,
} from './enumeracoes.js';

z.config(z.locales.ptBR());

const texto = (max = 120) =>
  z.string().trim().min(1, 'Campo obrigatório.').max(max, `Máximo de ${max} caracteres.`);
const textoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const positivo = (rotulo: string) =>
  z.number({ error: `${rotulo}: informe um número.` }).positive(`${rotulo} deve ser maior que zero.`);
const positivoOpcional = (rotulo: string) =>
  positivo(rotulo)
    .nullish()
    .transform((v) => v ?? null);
const id = z.string().uuid('Identificador inválido.');
const idOpcional = id.nullish().transform((v) => v ?? null);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato HH:MM (24 h).');
const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

export const esquemaParametroLivre = z.object({
  nome: texto(80),
  valor: z.string().trim().max(120),
  unidade: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => v || null),
});
export type ParametroLivre = z.infer<typeof esquemaParametroLivre>;

// ---------- Autenticação ----------
export const esquemaLogin = z.object({
  login: z.string().trim().min(1, 'Informe o login.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
export const esquemaTrocaSenha = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual.'),
  novaSenha: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres.').max(200),
});
export const esquemaRenovacao = z.object({ tokenRenovacao: z.string().min(10) });

// ---------- Usuários ----------
const baseUsuario = {
  nome: texto(120),
  login: texto(120).transform((v) => v.toLowerCase()),
  perfis: z.array(z.enum(PERFIS)).min(1, 'Selecione ao menos um perfil.'),
  equipeId: idOpcional,
  ativo: z.boolean().default(true),
};
export const esquemaUsuarioCriar = z.object({
  ...baseUsuario,
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(200),
});
export const esquemaUsuarioAtualizar = z.object({
  ...baseUsuario,
  /** Opcional: quando informada, redefine a senha do usuário. */
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(200).nullish(),
});
export type UsuarioCriar = z.infer<typeof esquemaUsuarioCriar>;

// ---------- Turnos, equipes e escala ----------
export const esquemaHorarioTurno = z
  .object({
    nome: texto(60),
    modalidade: z.enum(MODALIDADES_TURNO),
    horaInicio: hora,
    horaFim: hora,
    diasSemana: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia da semana.'),
    ativo: z.boolean().default(true),
  })
  .refine((v) => v.horaInicio !== v.horaFim, {
    message: 'Hora de início e fim não podem ser iguais.',
    path: ['horaFim'],
  });

export const esquemaEquipe = z.object({
  letra: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, 'Use de 1 a 5 letras ou números (ex.: A, B, ADM).'),
  descricao: textoOpcional(120),
  ativo: z.boolean().default(true),
});

export const esquemaGerarEscala = z.discriminatedUnion('modalidade', [
  z.object({
    modalidade: z.literal('REVEZAMENTO'),
    dataInicial: dataCivil,
    dataFinal: dataCivil,
    /** Cada item é um dia do ciclo com as atribuições horário → equipe. */
    ciclo: z
      .array(
        z
          .array(z.object({ horarioTurnoId: id, equipeId: id }))
          .min(1, 'Cada dia do ciclo precisa de ao menos um turno.'),
      )
      .min(1, 'Informe ao menos um dia no ciclo.')
      .max(28),
    substituir: z.boolean().default(true),
  }),
  z.object({
    modalidade: z.literal('CENTRAL'),
    dataInicial: dataCivil,
    dataFinal: dataCivil,
    horarioTurnoId: id,
    equipeId: id,
    substituir: z.boolean().default(true),
  }),
]);
export type GerarEscala = z.infer<typeof esquemaGerarEscala>;

export const esquemaEscalaAtualizar = z.object({ equipeId: id });

// ---------- Máquinas ----------
export const esquemaMaquina = z
  .object({
    codigo: texto(30),
    descricao: texto(120),
    tipo: z.enum(TIPOS_MAQUINA),
    ativa: z.boolean().default(true),
    forcaFechamentoT: positivoOpcional('Força de fechamento'),
    distanciaColunasHorizontalMm: positivoOpcional('Distância horizontal entre colunas'),
    distanciaColunasVerticalMm: positivoOpcional('Distância vertical entre colunas'),
    alturaMoldeMinMm: positivoOpcional('Altura mínima de molde'),
    alturaMoldeMaxMm: positivoOpcional('Altura máxima de molde'),
    pesoMaxMoldeKg: positivoOpcional('Peso máximo de molde'),
    pressaoInjecaoBar: positivoOpcional('Pressão de injeção'),
    capacidadeInjecaoG: positivoOpcional('Capacidade de injeção'),
    capacidadeKgH: positivoOpcional('Capacidade'),
    parametrosAdicionais: z.array(esquemaParametroLivre).default([]),
  })
  .superRefine((m, ctx) => {
    if (usaMolde(m.tipo)) {
      const obrigatorios = [
        ['forcaFechamentoT', 'Força de fechamento'],
        ['distanciaColunasHorizontalMm', 'Distância horizontal entre colunas'],
        ['distanciaColunasVerticalMm', 'Distância vertical entre colunas'],
        ['alturaMoldeMinMm', 'Altura mínima de molde'],
        ['alturaMoldeMaxMm', 'Altura máxima de molde'],
        ['pesoMaxMoldeKg', 'Peso máximo de molde'],
        ['pressaoInjecaoBar', 'Pressão de injeção'],
        ['capacidadeInjecaoG', 'Capacidade de injeção'],
      ] as const;
      for (const [campo, rotulo] of obrigatorios) {
        if (m[campo] == null)
          ctx.addIssue({
            code: 'custom',
            path: [campo],
            message: `${rotulo} é obrigatório para injetora e sopradora.`,
          });
      }
      if (
        m.alturaMoldeMinMm != null &&
        m.alturaMoldeMaxMm != null &&
        m.alturaMoldeMinMm > m.alturaMoldeMaxMm
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['alturaMoldeMaxMm'],
          message: 'A altura máxima deve ser maior ou igual à mínima.',
        });
      }
    } else if (m.capacidadeKgH == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['capacidadeKgH'],
        message: 'Capacidade (kg/h) é obrigatória para extrusora.',
      });
    }
  });
export type Maquina = z.infer<typeof esquemaMaquina>;

// ---------- Moldes ----------
export const esquemaMolde = z.object({
  codigo: texto(30),
  descricao: texto(120),
  larguraMm: positivo('Largura'),
  comprimentoMm: positivo('Comprimento'),
  alturaMm: positivo('Altura'),
  pesoKg: positivo('Peso'),
  numeroCavidades: z.number().int('Número de cavidades deve ser inteiro.').min(1).max(512),
  forcaFechamentoT: positivo('Força de fechamento exigida'),
  pressaoBar: positivo('Pressão exigida'),
  pesoInjetadoG: positivo('Peso injetado por ciclo'),
  podeGirar: z.boolean().default(false),
  ativo: z.boolean().default(true),
});
export type Molde = z.infer<typeof esquemaMolde>;

export const esquemaCavidadesMolde = z.object({
  cavidades: z
    .array(z.object({ numero: z.number().int().min(1), produtoId: idOpcional }))
    .min(1)
    .refine((l) => new Set(l.map((c) => c.numero)).size === l.length, 'Número de cavidade repetido.'),
});

// ---------- Produtos e conjuntos ----------
export const esquemaProduto = z.object({
  codigo: texto(40),
  descricao: texto(160),
  tipo: z.enum(TIPOS_PRODUTO),
  unidade: z.enum(UNIDADES),
  cor: textoOpcional(40),
  ativo: z.boolean().default(true),
});

export const esquemaConjuntoPadrao = z.object({
  produtoId: id,
  tipoEmbalagem: z.enum(TIPOS_EMBALAGEM),
  quantidade: positivo('Quantidade por conjunto'),
  ativo: z.boolean().default(true),
});

// ---------- Ficha técnica ----------
export const esquemaComponenteFicha = z
  .object({
    materialId: id,
    /** Consumo por peça, em gramas (injetora/sopradora). */
    consumoGPorPeca: positivoOpcional('Consumo por peça'),
    /** Participação percentual na composição (extrusão ou mistura). */
    percentual: z
      .number()
      .positive()
      .max(100)
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((c) => c.consumoGPorPeca != null || c.percentual != null, {
    message: 'Informe o consumo por peça (g) ou o percentual.',
    path: ['consumoGPorPeca'],
  });

export const esquemaFichaTecnica = z
  .object({
    produtoId: id,
    moldeId: idOpcional,
    maquinaId: id,
    cicloS: positivoOpcional('Ciclo'),
    cavidades: z.number().int().min(1, 'Informe as cavidades do produto.'),
    /** Quando vazio e houver ciclo, o PH é calculado: 3600 ÷ ciclo × cavidades. */
    phPadrao: positivoOpcional('PH padrão'),
    pesoPadraoG: positivoOpcional('Peso padrão da peça'),
    toleranciaPesoPct: z
      .number()
      .min(0)
      .max(100)
      .nullish()
      .transform((v) => v ?? null),
    parametrosProcesso: z.array(esquemaParametroLivre).default([]),
    composicao: z.array(esquemaComponenteFicha).default([]),
    observacao: textoOpcional(1000),
  })
  .refine((f) => f.phPadrao != null || f.cicloS != null, {
    message: 'Informe o PH padrão ou o ciclo para calculá-lo.',
    path: ['phPadrao'],
  })
  .refine((f) => new Set(f.composicao.map((c) => c.materialId)).size === f.composicao.length, {
    message: 'Material repetido na composição.',
    path: ['composicao'],
  });
export type FichaTecnicaEntrada = z.infer<typeof esquemaFichaTecnica>;

export const esquemaParecer = z.object({ parecer: texto(1000) });

// ---------- Paradas, perdas, locais ----------
export const esquemaMotivoParada = z.object({
  codigo: texto(20),
  descricao: texto(120),
  programada: z.boolean(),
  geraSolicitacaoManutencao: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const esquemaTipoPerda = z.object({
  descricao: texto(60),
  contaComoRefugo: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const esquemaLocalEstoque = z.object({
  nome: texto(80),
  tipo: z.enum(TIPOS_LOCAL_ESTOQUE),
  ativo: z.boolean().default(true),
});

// ---------- Impressão ----------
export const esquemaImpressora = z.object({
  nome: texto(80),
  enderecoIp: z
    .string()
    .trim()
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$|^[a-zA-Z0-9.-]+$/,
      'Endereço IP ou nome de host inválido.',
    ),
  porta: z.number().int().min(1).max(65535).default(9100),
  resolucaoDpi: z.union([z.literal(152), z.literal(203), z.literal(300), z.literal(600)], {
    error: 'Resolução deve ser 152, 203, 300 ou 600 dpi.',
  }),
  ativa: z.boolean().default(true),
});

export const esquemaLayoutEtiqueta = z.object({
  nome: texto(80),
  tipoEtiqueta: z.enum(TIPOS_ETIQUETA),
  larguraMm: positivo('Largura'),
  alturaMm: positivo('Altura'),
  modeloZpl: z.string().min(1, 'Informe o modelo ZPL.').max(20000),
  impressoraPadraoId: idOpcional,
  ativo: z.boolean().default(true),
});

export const esquemaDispositivo = z.object({
  nome: texto(80),
  prefixo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}$/, 'O prefixo deve ter exatamente 2 letras ou números (ex.: T3).'),
  descricao: textoOpcional(200),
  ativo: z.boolean().default(true),
});

// ---------- Parâmetros ----------
export const esquemaParametroAtualizar = z.object({ valor: z.string().trim().max(500) });
