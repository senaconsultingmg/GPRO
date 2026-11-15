import { z } from 'zod';
import { TIPOS_MAQUINA } from './enumeracoes.js';

const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const idOpcional = z
  .string()
  .uuid()
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Filtros do painel de indicadores (seção 10). Datas são as datas dos turnos. */
export const esquemaFiltroIndicadores = z
  .object({
    inicio: dataCivil,
    fim: dataCivil,
    maquinaId: idOpcional,
    tipoMaquina: z
      .enum(TIPOS_MAQUINA)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    moldeId: idOpcional,
    produtoId: idOpcional,
    horarioTurnoId: idOpcional,
    equipeId: idOpcional,
    granularidade: z
      .enum(['DIA', 'MES'])
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((f) => f.inicio <= f.fim, { message: 'A data inicial deve ser anterior à final.', path: ['fim'] })
  .refine((f) => Date.parse(f.fim) - Date.parse(f.inicio) <= 3 * 366 * 86_400_000, {
    message: 'Período máximo de 3 anos.',
    path: ['fim'],
  });
export type FiltroIndicadores = z.infer<typeof esquemaFiltroIndicadores>;

/** Tabela do painel enviada para exportação em Excel. */
export const esquemaTabelaExportacao = z.object({
  titulo: z.string().trim().min(1).max(80),
  colunas: z
    .array(
      z.object({
        chave: z.string().min(1).max(60),
        rotulo: z.string().min(1).max(80),
        formato: z.enum(['texto', 'numero', 'percentual']).default('texto'),
      }),
    )
    .min(1)
    .max(40),
  linhas: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(20_000),
});
export type TabelaExportacao = z.infer<typeof esquemaTabelaExportacao>;
