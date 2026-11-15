import { randomUUID } from 'node:crypto';
import { esquemaEvento, type EventoEntrada, type Perfil } from '@apontamento/shared';
import type { Evento, TurnoApontamento } from '../generated/prisma/client.js';
import type { Transacao } from '../prisma/prisma.service.js';
import { ErroNegocio } from '../comum/erros.js';
import type { EventosService, EventoSaldo } from '../turnos/eventos.service.js';

/** Monta o lançamento corretivo a partir dos valores propostos (mesmo tipo e máquina do original). */
export function montarCorretivo(
  original: Evento,
  valores: Record<string, unknown>,
): EventoEntrada | EventoSaldo {
  const hora = (valores.horaOcorrencia as string | undefined) ?? original.horaOcorrencia.toISOString();
  if (original.tipo === 'SALDO_AVULSO_DEIXADO' || original.tipo === 'SALDO_AVULSO_RECEBIDO') {
    const q = Number(valores.quantidade);
    if (!Number.isFinite(q) || q < 0) throw new ErroNegocio('Informe a quantidade correta do saldo solto.');
    return {
      id: randomUUID(),
      tipo: original.tipo,
      maquinaId: original.maquinaId,
      divisaoId: original.divisaoId!,
      horaOcorrencia: hora,
      quantidade: q,
      dados: (original.dados ?? {}) as Record<string, unknown>,
    };
  }
  const r = esquemaEvento.safeParse({
    ...valores,
    id: randomUUID(),
    tipo: original.tipo,
    maquinaId: original.maquinaId,
    horaOcorrencia: hora,
  });
  if (!r.success) {
    throw new ErroNegocio(
      'Valores da correção inválidos.',
      r.error.issues.map((i) => ({ campo: i.path.join('.') || undefined, mensagem: i.message })),
      400,
    );
  }
  return r.data;
}

export interface ResultadoCorrecao {
  corretivo: Evento | null;
  etiquetasCanceladas: string[];
  etiquetasNovas: { id: string; codigo: string }[];
}

/**
 * Aplica a correção (RN-09) dentro da transação: o original passa a "incorreto" e sai dos cálculos;
 * estoque e etiquetas do original são revertidos; no "corrigir", o lançamento corretivo passa a valer,
 * ligado ao original. Etiqueta já recebida no estoque exige estorno do recebimento antes.
 */
export async function aplicarCorrecao(
  tx: Transacao,
  eventos: EventosService,
  p: {
    original: Evento;
    turno: TurnoApontamento;
    tipo: 'CORRIGIR' | 'ANULAR';
    valores: Record<string, unknown> | null;
    solicitante: { id: string; login: string; nome: string; perfis: Perfil[] };
    usuarioId: string;
    verificarRecebidas: boolean;
    /** Posto de quem está agindo (cabeçalho x-posto), usado se o turno não tiver etiqueta anterior. */
    postoPadrao?: string | null;
  },
): Promise<ResultadoCorrecao> {
  const { original } = p;
  await tx.evento.update({ where: { id: original.id }, data: { situacao: 'INCORRETO' } });

  // Etiquetas do lançamento original.
  const etiquetas = await tx.etiqueta.findMany({
    where: { eventoId: original.id },
    orderBy: { sequencia: 'asc' },
    include: { recebimentos: { where: { estornadoEm: null }, include: { localEstoque: true } } },
  });
  for (const e of etiquetas) {
    if (e.situacao === 'RECEBIDA') {
      if (!p.verificarRecebidas) continue;
      const local = e.recebimentos[0]?.localEstoque.nome ?? 'estoque';
      throw new ErroNegocio(
        `A etiqueta ${e.codigo} já foi recebida (${local}). Estorne o recebimento antes de aprovar a correção.`,
      );
    }
    if (e.situacao === 'CONSUMIDA' || e.situacao === 'EXPORTADA') {
      throw new ErroNegocio(
        `A etiqueta ${e.codigo} já foi ${e.situacao === 'CONSUMIDA' ? 'consumida' : 'exportada'} e não pode ser cancelada.`,
      );
    }
  }
  const canceladas = etiquetas.filter((e) => e.situacao === 'EMITIDA');
  for (const e of canceladas) {
    await tx.etiqueta.update({
      where: { id: e.id },
      data: {
        situacao: 'CANCELADA',
        canceladaEm: new Date(),
        motivoCancelamento: `Correção do lançamento (${p.tipo === 'ANULAR' ? 'anulado' : 'corrigido'})`,
      },
    });
  }

  // Estorno dos movimentos de estoque do original (consumo de lote, semiacabado).
  const movimentos = await tx.movimentoEstoque.findMany({
    where: { eventoId: original.id, tipo: { not: 'ESTORNO_CORRECAO' } },
  });
  for (const m of movimentos) {
    await tx.movimentoEstoque.create({
      data: {
        tipo: 'ESTORNO_CORRECAO',
        produtoId: m.produtoId,
        loteId: m.loteId,
        etiquetaId: m.etiquetaId,
        localOrigemId: m.localDestinoId,
        localDestinoId: m.localOrigemId,
        quantidade: m.quantidade,
        eventoId: original.id,
        usuarioId: p.usuarioId,
        observacao: 'Estorno por correção',
      },
    });
  }
  if (original.tipo === 'ENTRADA_SEMIACABADO') {
    const etiquetaId = (original.dados as { etiquetaId?: string }).etiquetaId;
    if (etiquetaId) {
      const consumiuEstoque = movimentos.some((m) => m.tipo === 'CONSUMO_SEMIACABADO');
      await tx.etiqueta.update({
        where: { id: etiquetaId },
        data: { situacao: consumiuEstoque ? 'RECEBIDA' : 'EMITIDA' },
      });
    }
  }
  if (
    original.tipo === 'SAIDA_PRODUCAO' &&
    Array.isArray((original.dados as { volumes?: unknown[] }).volumes)
  ) {
    const lote = await tx.loteMaterial.findFirst({ where: { divisaoId: original.divisaoId } });
    if (lote)
      await tx.loteMaterial.update({
        where: { id: lote.id },
        data: { quantidadeInicial: { decrement: original.quantidade ?? 0 } },
      });
  }

  // Pendências do lançamento original deixam de valer.
  await tx.aprovacao.updateMany({
    where: {
      eventoId: original.id,
      situacao: 'PENDENTE',
      tipo: { in: ['HORARIO', 'PESO', 'JUSTIFICATIVA'] },
    },
    data: {
      situacao: 'APROVADA',
      parecer: 'Encerrada automaticamente: lançamento corrigido/anulado.',
      decididoEm: new Date(),
      aprovadorId: p.usuarioId,
    },
  });

  if (p.tipo === 'ANULAR')
    return { corretivo: null, etiquetasCanceladas: canceladas.map((e) => e.codigo), etiquetasNovas: [] };

  // Etiquetas novas saem com o prefixo do mesmo posto do original (ou de outra etiqueta do turno).
  const posto =
    etiquetas[0]?.dispositivoId ??
    (await tx.etiqueta.findFirst({ where: { turnoId: p.turno.id }, select: { dispositivoId: true } }))
      ?.dispositivoId ??
    p.postoPadrao ??
    null;
  const entrada = montarCorretivo(original, p.valores ?? {});
  const r = await eventos.registrar(
    tx,
    {
      turno: p.turno,
      usuario: p.solicitante,
      dispositivo: 'correcao',
      agora: new Date(),
      postoId: posto,
      corrigeEventoId: original.id,
    },
    entrada,
  );
  return {
    corretivo: r.evento,
    etiquetasCanceladas: canceladas.map((e) => e.codigo),
    etiquetasNovas: r.etiquetas,
  };
}
