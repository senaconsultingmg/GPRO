import { codigoEtiqueta, type TipoEtiqueta } from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService, Transacao } from '../prisma/prisma.service.js';
import { ErroNegocio } from '../comum/erros.js';

/** Posto (dispositivo) que emite a etiqueta; o prefixo dele compõe o código (seção 8). */
export async function obterPosto(tx: Transacao | PrismaService, postoId: string | null | undefined) {
  if (!postoId) {
    throw new ErroNegocio(
      'Este posto não está configurado. Em "Configurar este posto", escolha o dispositivo antes de emitir etiquetas.',
    );
  }
  const d = await tx.dispositivo.findUnique({ where: { id: postoId } }).catch(() => null);
  if (!d?.ativo)
    throw new ErroNegocio('Dispositivo (posto) inexistente ou inativo. Configure este posto novamente.');
  return d;
}

export interface NovaEtiqueta {
  tipo: TipoEtiqueta;
  produtoId: string;
  quantidade: number;
  unidade: 'PECA' | 'KG';
  pesoKg?: number | null;
  loteId?: string | null;
  eventoId?: string | null;
  divisaoId?: string | null;
  turnoId?: string | null;
  avulso?: boolean;
  numeroNoLancamento?: number | null;
  totalNoLancamento?: number | null;
  dados?: Record<string, unknown>;
}

/**
 * Emite etiquetas com códigos sequenciais do posto. O contador é por dispositivo e nunca volta:
 * códigos não são reutilizados, nem após cancelamento. Offline (seção 11), o tablet informa os
 * números que já usou de um bloco reservado por ele; o servidor confere e grava os mesmos.
 */
export async function emitirEtiquetas(
  tx: Transacao,
  postoId: string | null | undefined,
  responsavelId: string,
  itens: NovaEtiqueta[],
  opcoes: { sequencias?: number[] | null; aparelho?: string | null; emitidaEm?: Date | null } = {},
) {
  if (itens.length === 0) return [];
  const posto = await obterPosto(tx, postoId);
  let sequencias: number[];
  if (opcoes.sequencias?.length) {
    if (opcoes.sequencias.length !== itens.length) {
      throw new ErroNegocio(
        `As etiquetas impressas no tablet (${opcoes.sequencias.length}) não conferem com as do lançamento (${itens.length}).`,
      );
    }
    const blocos = await tx.blocoEtiqueta.findMany({ where: { dispositivoId: posto.id } });
    for (const s of opcoes.sequencias) {
      const bloco = blocos.find((b) => s >= b.inicio && s <= b.fim);
      if (!bloco || (opcoes.aparelho && bloco.aparelho !== opcoes.aparelho)) {
        throw new ErroNegocio(
          `O número ${codigoEtiqueta(posto.prefixo, s)} não pertence a um bloco reservado por este tablet.`,
        );
      }
    }
    const usadas = await tx.etiqueta.findMany({
      where: { dispositivoId: posto.id, sequencia: { in: opcoes.sequencias } },
      select: { codigo: true },
    });
    if (usadas.length) throw new ErroNegocio(`Etiqueta ${usadas[0].codigo} já foi usada.`);
    sequencias = opcoes.sequencias;
  } else {
    const seq = await tx.sequenciaDispositivo.upsert({
      where: { dispositivoId: posto.id },
      create: { dispositivoId: posto.id, ultimo: itens.length },
      update: { ultimo: { increment: itens.length } },
    });
    const primeira = seq.ultimo - itens.length + 1;
    sequencias = itens.map((_, i) => primeira + i);
  }
  const criadas = [];
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const sequencia = sequencias[i];
    criadas.push(
      await tx.etiqueta.create({
        data: {
          codigo: codigoEtiqueta(posto.prefixo, sequencia),
          sequencia,
          dispositivoId: posto.id,
          tipo: it.tipo,
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          unidade: it.unidade,
          pesoKg: it.pesoKg ?? null,
          loteId: it.loteId ?? null,
          eventoId: it.eventoId ?? null,
          divisaoId: it.divisaoId ?? null,
          turnoId: it.turnoId ?? null,
          responsavelId,
          avulso: it.avulso ?? false,
          numeroNoLancamento: it.numeroNoLancamento ?? null,
          totalNoLancamento: it.totalNoLancamento ?? null,
          dados: (it.dados ?? {}) as Prisma.InputJsonValue,
          ...(opcoes.emitidaEm ? { emitidaEm: opcoes.emitidaEm } : {}),
        },
      }),
    );
  }
  return criadas;
}

/**
 * Reserva um bloco de números do posto para o tablet usar offline. O contador do servidor pula
 * para depois do bloco, então etiquetas emitidas online nunca caem dentro dele.
 */
export async function reservarBloco(
  tx: Transacao,
  postoId: string | null | undefined,
  aparelho: string,
  usuarioId: string,
  tamanho: number,
) {
  const posto = await obterPosto(tx, postoId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sequencia|${posto.id}`}))`;
  const seq = await tx.sequenciaDispositivo.upsert({
    where: { dispositivoId: posto.id },
    create: { dispositivoId: posto.id, ultimo: 0 },
    update: {},
  });
  const inicio = seq.ultimo + 1;
  const fim = inicio + tamanho - 1;
  await tx.sequenciaDispositivo.update({ where: { dispositivoId: posto.id }, data: { ultimo: fim } });
  return tx.blocoEtiqueta.create({ data: { dispositivoId: posto.id, aparelho, inicio, fim, usuarioId } });
}

/** Próximo número de lote interno: L + AAMMDD + "-" + sequência do dia (ex.: L261115-003). */
export async function proximoNumeroLote(tx: Transacao, agora = new Date()): Promise<string> {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  const prefixo = `L${p.year}${p.month}${p.day}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lote|${prefixo}`}))`;
  const ultimo = await tx.loteMaterial.findFirst({
    where: { numero: { startsWith: prefixo } },
    orderBy: { numero: 'desc' },
  });
  const n = ultimo ? Number(ultimo.numero.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(n).padStart(3, '0')}`;
}

/** Saldo por lote e local (soma dos movimentos). */
export async function saldosLote(tx: Transacao | PrismaService, loteIds?: string[]) {
  if (loteIds && loteIds.length === 0) return [];
  const filtro = loteIds
    ? Prisma.sql`AND m.lote_id IN (${Prisma.join(loteIds.map((i) => Prisma.sql`${i}::uuid`))})`
    : Prisma.empty;
  return tx.$queryRaw<{ lote_id: string; local_id: string; saldo: number }[]>`
    SELECT x.lote_id, x.local_id, ROUND(SUM(x.q)::numeric, 3)::float8 AS saldo FROM (
      SELECT m.lote_id, m.local_destino_id AS local_id, m.quantidade AS q FROM movimento_estoque m
        WHERE m.local_destino_id IS NOT NULL AND m.lote_id IS NOT NULL ${filtro}
      UNION ALL
      SELECT m.lote_id, m.local_origem_id, -m.quantidade FROM movimento_estoque m
        WHERE m.local_origem_id IS NOT NULL AND m.lote_id IS NOT NULL ${filtro}
    ) x GROUP BY x.lote_id, x.local_id HAVING ROUND(SUM(x.q)::numeric, 3) <> 0`;
}

/** Saldo de produto acabado/semiacabado por local e produto (recebimentos − saídas). */
export async function saldosProduto(tx: Transacao | PrismaService) {
  return tx.$queryRaw<{ produto_id: string; local_id: string; saldo: number; etiquetas: number }[]>`
    SELECT x.produto_id, x.local_id, ROUND(SUM(x.q)::numeric, 3)::float8 AS saldo, SUM(x.n)::int AS etiquetas FROM (
      SELECT m.produto_id, m.local_destino_id AS local_id, m.quantidade AS q, 1 AS n FROM movimento_estoque m
        WHERE m.local_destino_id IS NOT NULL AND m.lote_id IS NULL
      UNION ALL
      SELECT m.produto_id, m.local_origem_id, -m.quantidade, -1 FROM movimento_estoque m
        WHERE m.local_origem_id IS NOT NULL AND m.lote_id IS NULL
    ) x GROUP BY x.produto_id, x.local_id HAVING ROUND(SUM(x.q)::numeric, 3) <> 0`;
}
