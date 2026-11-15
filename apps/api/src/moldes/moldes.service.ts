import { Inject, Injectable } from '@nestjs/common';
import { avaliarCompatibilidade, type TipoMaquina } from '@apontamento/shared';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import type { Maquina, Molde } from '../generated/prisma/client.js';

/** Mantém as cavidades 1..N do molde de acordo com o número de cavidades. */
export async function sincronizarCavidades(tx: Transacao, registro: Record<string, unknown>): Promise<void> {
  const moldeId = registro.id as string;
  const total = registro.numeroCavidades as number;
  await tx.cavidadeMolde.deleteMany({ where: { moldeId, numero: { gt: total } } });
  await tx.cavidadeMolde.createMany({
    data: Array.from({ length: total }, (_, i) => ({ moldeId, numero: i + 1 })),
    skipDuplicates: true,
  });
}

export function compatibilidade(molde: Molde, maquina: Maquina) {
  return avaliarCompatibilidade(molde, { ...maquina, tipo: maquina.tipo as TipoMaquina });
}

@Injectable()
export class MoldesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Lista as máquinas compatíveis e, para as incompatíveis, os critérios que falharam (RN-02). */
  async compatibilidadeComMaquinas(moldeId: string) {
    const molde = await this.prisma.molde.findUnique({ where: { id: moldeId } });
    if (!molde) throw naoEncontrado('Molde');
    const maquinas = await this.prisma.maquina.findMany({
      where: { ativa: true, tipo: { in: ['INJETORA', 'SOPRADORA'] } },
      orderBy: { codigo: 'asc' },
    });
    return maquinas.map((m) => ({
      maquina: { id: m.id, codigo: m.codigo, descricao: m.descricao, tipo: m.tipo },
      ...compatibilidade(molde, m),
    }));
  }

  async atualizarCavidades(
    moldeId: string,
    cavidades: { numero: number; produtoId: string | null }[],
    usuario: UsuarioAutenticado,
  ) {
    const molde = await this.prisma.molde.findUnique({
      where: { id: moldeId },
      include: { cavidades: true },
    });
    if (!molde) throw naoEncontrado('Molde');
    const invalida = cavidades.find((c) => c.numero > molde.numeroCavidades);
    if (invalida) {
      throw new ErroNegocio(
        `O molde tem ${molde.numeroCavidades} cavidades; a cavidade ${invalida.numero} não existe.`,
      );
    }
    const ids = [...new Set(cavidades.map((c) => c.produtoId).filter((x): x is string => !!x))];
    const produtos = await this.prisma.produto.findMany({
      where: { id: { in: ids } },
      select: { id: true, unidade: true },
    });
    if (produtos.length !== ids.length)
      throw new ErroNegocio('Produto informado em uma cavidade não existe.');
    if (produtos.some((p) => p.unidade !== 'PECA'))
      throw new ErroNegocio('Cavidade só pode produzir produto medido em peças.');

    await this.prisma.$transaction(async (tx) => {
      for (const c of cavidades) {
        await tx.cavidadeMolde.update({
          where: { moldeId_numero: { moldeId, numero: c.numero } },
          data: { produtoId: c.produtoId },
        });
      }
      const mapa = (l: { numero: number; produtoId: string | null }[]) =>
        Object.fromEntries(l.map((c) => [`cavidade_${c.numero}`, c.produtoId]));
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Molde',
        entidadeId: moldeId,
        acao: 'ATUALIZAR_CAVIDADES',
        anterior: mapa(molde.cavidades.filter((c) => cavidades.some((n) => n.numero === c.numero))),
        novo: mapa(cavidades),
      });
    });
    return this.prisma.cavidadeMolde.findMany({
      where: { moldeId },
      orderBy: { numero: 'asc' },
      include: { produto: { select: { id: true, codigo: true, descricao: true } } },
    });
  }
}
