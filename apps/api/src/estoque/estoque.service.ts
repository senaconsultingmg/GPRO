import { Inject, Injectable } from '@nestjs/common';
import { formatarDataHora, lerCodigoEtiqueta } from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { INCLUIR_ETIQUETA } from '../etiquetas/conteudo.js';
import { saldosLote, saldosProduto } from '../etiquetas/emissao.js';

/** Recebimento no estoque por leitura de etiqueta, locais e saldo (RN-12). */
@Injectable()
export class EstoqueService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  /** Lê a etiqueta e mostra produto, quantidade, OP e turno; recusa com mensagem clara (RN-12). */
  async consultar(leitura: string) {
    const codigo = lerCodigoEtiqueta(leitura);
    if (!codigo)
      throw new ErroNegocio('Leitura inválida: não foi possível identificar o código da etiqueta.');
    const e = await this.prisma.etiqueta.findUnique({ where: { codigo }, include: INCLUIR_ETIQUETA });
    if (!e) throw naoEncontrado(`Etiqueta ${codigo}`);
    if (e.tipo !== 'PRODUTO')
      throw new ErroNegocio(`A etiqueta ${codigo} não é de produto acabado ou semiacabado.`);
    if (e.situacao === 'CANCELADA')
      throw conflito(`A etiqueta ${codigo} está cancelada e não pode ser recebida.`);
    if (e.situacao !== 'EMITIDA' || e.recebimento) {
      const r = e.recebimento;
      throw conflito(
        r
          ? `A etiqueta ${codigo} já foi recebida em ${formatarDataHora(r.recebidoEm)} por ${r.recebidoPor.nome} (${r.localEstoque.nome}).`
          : `A etiqueta ${codigo} não está disponível para recebimento (${e.situacao.toLowerCase()}).`,
      );
    }
    return e;
  }

  async receber(leitura: string, localEstoqueId: string, usuario: UsuarioAutenticado) {
    const local = await this.prisma.localEstoque.findUnique({ where: { id: localEstoqueId } });
    if (!local?.ativo) throw new ErroNegocio('Local de estoque inexistente ou inativo.');
    if (local.tipo !== 'PRODUTO_ACABADO') throw new ErroNegocio('Escolha um local de produto acabado.');
    const e = await this.consultar(leitura);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`etiqueta|${e.id}`}))`;
      const atual = await tx.etiqueta.findUniqueOrThrow({ where: { id: e.id } });
      if (atual.situacao !== 'EMITIDA') throw conflito(`A etiqueta ${e.codigo} já foi recebida.`);
      await tx.recebimento.create({ data: { etiquetaId: e.id, localEstoqueId, recebidoPorId: usuario.id } });
      await tx.movimentoEstoque.create({
        data: {
          tipo: 'RECEBIMENTO_PRODUTO',
          produtoId: e.produtoId,
          etiquetaId: e.id,
          localDestinoId: localEstoqueId,
          quantidade: e.quantidade,
          usuarioId: usuario.id,
        },
      });
      await tx.etiqueta.update({ where: { id: e.id }, data: { situacao: 'RECEBIDA', localEstoqueId } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Etiqueta',
        entidadeId: e.id,
        acao: 'RECEBER',
        anterior: { situacao: 'EMITIDA' },
        novo: { situacao: 'RECEBIDA', localEstoqueId },
      });
      return tx.etiqueta.findUniqueOrThrow({ where: { id: e.id }, include: INCLUIR_ETIQUETA });
    });
  }

  /** Lista da tela de recebimento conforme o parâmetro `visao_recebimento` (pendentes, recebidas ou ambas). */
  async listaRecebimento() {
    const visao = await this.parametros.valor('visao_recebimento');
    const situacoes: Prisma.EtiquetaWhereInput['situacao'] =
      visao === 'PENDENTES'
        ? 'EMITIDA'
        : visao === 'RECEBIDAS'
          ? 'RECEBIDA'
          : { in: ['EMITIDA', 'RECEBIDA'] };
    const etiquetas = await this.prisma.etiqueta.findMany({
      where: {
        tipo: 'PRODUTO',
        situacao: situacoes,
        emitidaEm: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      include: INCLUIR_ETIQUETA,
      orderBy: { emitidaEm: 'desc' },
      take: 300,
    });
    return { visao, etiquetas };
  }

  /** Saldo por local: produto acabado/semiacabado (por produto) e matéria-prima (por lote). */
  async saldos() {
    const [produtos, lotes, locais, prods, lotesInfo] = await Promise.all([
      saldosProduto(this.prisma),
      saldosLote(this.prisma),
      this.prisma.localEstoque.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.produto.findMany({ select: { id: true, codigo: true, descricao: true, unidade: true } }),
      this.prisma.loteMaterial.findMany({
        select: { id: true, numero: true, material: { select: { codigo: true, descricao: true } } },
      }),
    ]);
    const prod = new Map(prods.map((p) => [p.id, p]));
    const lote = new Map(lotesInfo.map((l) => [l.id, l]));
    return locais.map((l) => ({
      local: l,
      produtos: produtos
        .filter((s) => s.local_id === l.id)
        .map((s) => ({ produto: prod.get(s.produto_id), saldo: s.saldo, etiquetas: s.etiquetas })),
      lotes: lotes
        .filter((s) => s.local_id === l.id)
        .map((s) => ({ lote: lote.get(s.lote_id), saldo: s.saldo })),
    }));
  }
}
