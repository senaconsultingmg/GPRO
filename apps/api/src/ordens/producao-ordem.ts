import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService, Transacao } from '../prisma/prisma.service.js';

/**
 * Produção acumulada por OP (RN-06): soma, em todos os turnos, das saídas de produção
 * + saldo solto deixado − saldo solto recebido. Lançamentos incorretos não contam.
 */
export async function producaoPorOrdem(
  prisma: PrismaService | Transacao,
  ordemIds?: string[],
): Promise<Map<string, number>> {
  if (ordemIds && ordemIds.length === 0) return new Map();
  const filtro = ordemIds
    ? Prisma.sql`AND d.ordem_id IN (${Prisma.join(ordemIds.map((i) => Prisma.sql`${i}::uuid`))})`
    : Prisma.empty;
  const linhas = await prisma.$queryRaw<{ ordem_id: string; total: number | null }[]>`
    SELECT d.ordem_id, SUM(CASE e.tipo
        WHEN 'SAIDA_PRODUCAO' THEN e.quantidade
        WHEN 'SALDO_AVULSO_DEIXADO' THEN e.quantidade
        WHEN 'SALDO_AVULSO_RECEBIDO' THEN -e.quantidade
        ELSE 0 END)::float8 AS total
    FROM evento e
    JOIN divisao_op d ON d.id = e.divisao_id
    WHERE e.situacao <> 'INCORRETO' ${filtro}
    GROUP BY d.ordem_id`;
  return new Map(linhas.map((l) => [l.ordem_id, Math.round((l.total ?? 0) * 1000) / 1000]));
}
