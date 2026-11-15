import { lerCodigoEtiqueta } from '@apontamento/shared';
import type { PrismaService, Transacao } from '../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { saldosLote } from '../etiquetas/emissao.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';

/**
 * Estorna o recebimento de uma etiqueta (produto no estoque ou devolução/extrusão na matéria-prima):
 * o recebimento fica marcado como estornado (não some), o saldo volta e a etiqueta retorna a "emitida".
 * Usado antes de aprovar a correção de um lançamento cuja etiqueta já foi recebida.
 */
export async function estornarRecebimento(
  prisma: PrismaService,
  auditoria: AuditoriaService,
  p: { leitura: string; motivo: string; usuario: UsuarioAutenticado; setor: 'ESTOQUE' | 'MATERIA_PRIMA' },
) {
  const codigo = lerCodigoEtiqueta(p.leitura);
  if (!codigo) throw new ErroNegocio('Leitura inválida: não foi possível identificar o código da etiqueta.');
  const e = await prisma.etiqueta.findUnique({ where: { codigo } });
  if (!e) throw naoEncontrado(`Etiqueta ${codigo}`);
  const doSetor =
    p.setor === 'ESTOQUE'
      ? e.tipo === 'PRODUTO'
      : e.tipo === 'EXTRUSAO' || e.tipo === 'DEVOLUCAO_TRANSFERENCIA';
  if (!doSetor) {
    throw new ErroNegocio(
      p.setor === 'ESTOQUE'
        ? `A etiqueta ${codigo} não é de produto; o estorno é feito pelo setor de matéria-prima.`
        : `A etiqueta ${codigo} não é de devolução ou extrusão.`,
    );
  }
  if (e.situacao === 'EXPORTADA')
    throw conflito(`A etiqueta ${codigo} já foi exportada ao ERP; o recebimento não pode ser estornado.`);
  if (e.situacao !== 'RECEBIDA') throw conflito(`A etiqueta ${codigo} não está recebida.`);

  return prisma.$transaction(async (tx: Transacao) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`etiqueta|${e.id}`}))`;
    const rec = await tx.recebimento.findFirst({
      where: { etiquetaId: e.id, estornadoEm: null },
      orderBy: { recebidoEm: 'desc' },
    });
    if (!rec) throw conflito(`A etiqueta ${codigo} não está recebida.`);
    const quantidade = p.setor === 'ESTOQUE' ? e.quantidade : (e.pesoKg ?? e.quantidade);
    if (p.setor === 'MATERIA_PRIMA' && e.loteId) {
      // O material devolvido/extrusado não pode ter sido consumido ou movido além do saldo do local.
      const saldo =
        (await saldosLote(tx, [e.loteId])).find((l) => l.local_id === e.localEstoqueId)?.saldo ?? 0;
      if (saldo + 1e-9 < quantidade) {
        throw conflito(
          `O lote já foi usado: saldo no local (${saldo.toLocaleString('pt-BR')} kg) menor que o da etiqueta.`,
        );
      }
    }
    const agora = new Date();
    await tx.recebimento.update({
      where: { id: rec.id },
      data: { estornadoEm: agora, estornadoPorId: p.usuario.id, motivoEstorno: p.motivo },
    });
    await tx.movimentoEstoque.create({
      data: {
        tipo: 'ESTORNO_RECEBIMENTO',
        produtoId: e.produtoId,
        loteId: p.setor === 'MATERIA_PRIMA' ? e.loteId : null,
        etiquetaId: e.id,
        localOrigemId: rec.localEstoqueId,
        quantidade,
        usuarioId: p.usuario.id,
        observacao: p.motivo,
      },
    });
    const atualizada = await tx.etiqueta.update({
      where: { id: e.id },
      data: { situacao: 'EMITIDA', localEstoqueId: null },
    });
    await auditoria.registrar(tx, {
      usuario: p.usuario,
      entidade: 'Etiqueta',
      entidadeId: e.id,
      acao: 'ESTORNAR_RECEBIMENTO',
      anterior: { situacao: 'RECEBIDA', localEstoqueId: rec.localEstoqueId },
      novo: { situacao: 'EMITIDA', localEstoqueId: null, motivo: p.motivo },
      completo: true,
    });
    return atualizada;
  });
}
