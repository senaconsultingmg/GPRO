import { Inject, Injectable } from '@nestjs/common';
import { lerCodigoEtiqueta, preencherModeloZpl } from '@apontamento/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { INCLUIR_ETIQUETA, valoresImpressao, valoresTeste } from './conteudo.js';

/** Consulta, impressão e reimpressão de etiquetas (seção 8). */
@Injectable()
export class EtiquetasService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  listar(filtro: {
    busca?: string;
    situacao?: string;
    tipo?: string;
    pendentes?: boolean;
    turnoId?: string;
    eventoId?: string;
  }) {
    const where: Prisma.EtiquetaWhereInput = {};
    if (filtro.situacao)
      where.situacao = { in: filtro.situacao.split(',') as Prisma.EnumSituacaoEtiquetaFilter['in'] };
    if (filtro.tipo) where.tipo = filtro.tipo as Prisma.EnumTipoEtiquetaFilter['equals'];
    if (filtro.pendentes) where.impressaoPendente = true;
    if (filtro.turnoId) where.turnoId = filtro.turnoId;
    if (filtro.eventoId) where.eventoId = filtro.eventoId;
    if (filtro.busca?.trim()) {
      const codigo = lerCodigoEtiqueta(filtro.busca) ?? filtro.busca.trim();
      where.OR = [
        { codigo: { contains: codigo, mode: 'insensitive' } },
        { produto: { codigo: { contains: filtro.busca.trim(), mode: 'insensitive' } } },
        { lote: { numero: { contains: filtro.busca.trim(), mode: 'insensitive' } } },
        { divisao: { codigo: { contains: filtro.busca.trim(), mode: 'insensitive' } } },
      ];
    }
    return this.prisma.etiqueta.findMany({
      where,
      include: INCLUIR_ETIQUETA,
      orderBy: { emitidaEm: 'desc' },
      take: 300,
    });
  }

  /** Busca pela leitura do código de barras ou pela digitação do código legível. */
  async porLeitura(leitura: string) {
    const codigo = lerCodigoEtiqueta(leitura);
    if (!codigo)
      throw new ErroNegocio('Leitura inválida: não foi possível identificar o código da etiqueta.');
    const e = await this.prisma.etiqueta.findUnique({ where: { codigo }, include: INCLUIR_ETIQUETA });
    if (!e) throw naoEncontrado(`Etiqueta ${codigo}`);
    return e;
  }

  async obter(id: string) {
    const e = await this.prisma.etiqueta.findUnique({
      where: { id },
      include: {
        ...INCLUIR_ETIQUETA,
        impressoes: {
          orderBy: { criadoEm: 'desc' },
          include: { usuario: { select: { nome: true } }, impressora: { select: { nome: true } } },
        },
      },
    });
    if (!e) throw naoEncontrado('Etiqueta');
    return e;
  }

  private async escolherLayout(tipo: string, layoutId?: string | null) {
    const layout = layoutId
      ? await this.prisma.layoutEtiqueta.findUnique({ where: { id: layoutId } })
      : await this.prisma.layoutEtiqueta.findFirst({
          where: { tipoEtiqueta: tipo as Prisma.EnumTipoEtiquetaFilter['equals'], ativo: true },
          orderBy: { nome: 'asc' },
        });
    if (!layout)
      throw new ErroNegocio(
        'Não há layout de etiqueta ativo para este tipo. Cadastre um em "Layouts de etiqueta".',
      );
    if (layout.tipoEtiqueta !== tipo)
      throw new ErroNegocio('O layout escolhido é de outro tipo de etiqueta.');
    return layout;
  }

  private async escolherImpressora(impressoraId: string | null | undefined, padraoId: string | null) {
    const id = impressoraId ?? padraoId;
    if (!id) throw new ErroNegocio('O layout não tem impressora padrão. Escolha a impressora.');
    const impressora = await this.prisma.impressora.findUnique({ where: { id } });
    if (!impressora?.ativa) throw new ErroNegocio('Impressora inexistente ou inativa.');
    return impressora;
  }

  /**
   * Prepara o envio de uma etiqueta: monta o ZPL e registra a tentativa. O dispositivo envia o ZPL
   * ao agente de impressão e informa o resultado. Etiqueta já impressa sai como "2ª via".
   */
  async solicitarImpressao(
    id: string,
    opcoes: { layoutId?: string | null; impressoraId?: string | null },
    usuario: UsuarioAutenticado,
  ) {
    const etiqueta = await this.prisma.etiqueta.findUnique({ where: { id }, include: INCLUIR_ETIQUETA });
    if (!etiqueta) throw naoEncontrado('Etiqueta');
    if (etiqueta.situacao === 'CANCELADA') throw conflito('Etiqueta cancelada não é impressa.');
    const layout = await this.escolherLayout(etiqueta.tipo, opcoes.layoutId);
    const impressora = await this.escolherImpressora(opcoes.impressoraId, layout.impressoraPadraoId);
    const jaImpressa =
      (await this.prisma.impressaoEtiqueta.count({ where: { etiquetaId: id, sucesso: true } })) > 0;
    const zpl = preencherModeloZpl(
      layout.modeloZpl,
      valoresImpressao(etiqueta, {
        segundaVia: jaImpressa,
        larguraMm: layout.larguraMm,
        alturaMm: layout.alturaMm,
        dpi: impressora.resolucaoDpi,
      }),
    );
    const impressao = await this.prisma.impressaoEtiqueta.create({
      data: {
        etiquetaId: id,
        layoutId: layout.id,
        impressoraId: impressora.id,
        usuarioId: usuario.id,
        segundaVia: jaImpressa,
      },
    });
    return {
      impressaoId: impressao.id,
      etiqueta: { id: etiqueta.id, codigo: etiqueta.codigo },
      segundaVia: jaImpressa,
      zpl,
      impressora: {
        id: impressora.id,
        nome: impressora.nome,
        enderecoIp: impressora.enderecoIp,
        porta: impressora.porta,
      },
    };
  }

  /** Resultado informado pelo dispositivo. Falha mantém a etiqueta como "impressão pendente". */
  async registrarResultado(
    impressaoId: string,
    resultado: { sucesso: boolean; mensagem: string | null },
    usuario: UsuarioAutenticado,
  ) {
    const imp = await this.prisma.impressaoEtiqueta.findUnique({ where: { id: impressaoId } });
    if (!imp) throw naoEncontrado('Impressão');
    if (imp.sucesso !== null) throw conflito('Resultado desta impressão já foi registrado.');
    return this.prisma.$transaction(async (tx) => {
      await tx.impressaoEtiqueta.update({
        where: { id: impressaoId },
        data: { sucesso: resultado.sucesso, mensagem: resultado.mensagem, concluidoEm: new Date() },
      });
      if (imp.etiquetaId && resultado.sucesso) {
        await tx.etiqueta.update({
          where: { id: imp.etiquetaId },
          data: { impressaoPendente: false, ...(imp.segundaVia ? { reimpressoes: { increment: 1 } } : {}) },
        });
        if (imp.segundaVia) {
          await this.auditoria.registrar(tx, {
            usuario,
            entidade: 'Etiqueta',
            entidadeId: imp.etiquetaId,
            acao: 'REIMPRIMIR',
            novo: { impressaoId, segundaVia: true },
            completo: true,
          });
        }
      }
      return tx.impressaoEtiqueta.findUniqueOrThrow({ where: { id: impressaoId } });
    });
  }

  /** Impressão de teste de um layout, com dados fictícios. */
  async testeLayout(layoutId: string, impressoraId: string | null | undefined, usuario: UsuarioAutenticado) {
    const layout = await this.prisma.layoutEtiqueta.findUnique({ where: { id: layoutId } });
    if (!layout) throw naoEncontrado('Layout');
    const impressora = await this.escolherImpressora(impressoraId, layout.impressoraPadraoId);
    const zpl = preencherModeloZpl(
      layout.modeloZpl,
      valoresTeste({ larguraMm: layout.larguraMm, alturaMm: layout.alturaMm, dpi: impressora.resolucaoDpi }),
    );
    const impressao = await this.prisma.impressaoEtiqueta.create({
      data: { layoutId, impressoraId: impressora.id, usuarioId: usuario.id, teste: true },
    });
    return {
      impressaoId: impressao.id,
      zpl,
      impressora: {
        id: impressora.id,
        nome: impressora.nome,
        enderecoIp: impressora.enderecoIp,
        porta: impressora.porta,
      },
    };
  }
}
