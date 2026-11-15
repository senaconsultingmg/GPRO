import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

const CAMPOS_IGNORADOS = new Set(['atualizadoEm', 'criadoEm']);
const CAMPOS_SENSIVEIS = new Set(['senhaHash', 'senha', 'tokenRenovacaoHash']);

type Registro = Record<string, unknown> | null | undefined;

function normalizar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  return v;
}

/**
 * Calcula os campos alterados entre dois registros, mascarando dados sensíveis.
 * Retorna { anterior, novo } apenas com os campos que mudaram.
 */
export function diferenca(
  anterior: Registro,
  novo: Registro,
): { anterior: Record<string, unknown> | null; novo: Record<string, unknown> | null } {
  const chaves = new Set([...Object.keys(anterior ?? {}), ...Object.keys(novo ?? {})]);
  const a: Record<string, unknown> = {};
  const n: Record<string, unknown> = {};
  for (const chave of chaves) {
    if (CAMPOS_IGNORADOS.has(chave)) continue;
    const va = normalizar(anterior?.[chave]);
    const vn = normalizar(novo?.[chave]);
    if (JSON.stringify(va) === JSON.stringify(vn)) continue;
    if (anterior) a[chave] = CAMPOS_SENSIVEIS.has(chave) ? '***' : (va ?? null);
    if (novo) n[chave] = CAMPOS_SENSIVEIS.has(chave) ? '***' : (vn ?? null);
  }
  return { anterior: anterior ? a : null, novo: novo ? n : null };
}

export interface EntradaAuditoria {
  usuario: Pick<UsuarioAutenticado, 'id' | 'login'> | null;
  entidade: string;
  entidadeId?: string | null;
  acao: string;
  anterior?: Registro;
  novo?: Registro;
  /** Quando verdadeiro grava os objetos inteiros em vez da diferença. */
  completo?: boolean;
}

@Injectable()
export class AuditoriaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async registrar(tx: Transacao | null, e: EntradaAuditoria): Promise<void> {
    const { anterior, novo } = e.completo
      ? { anterior: e.anterior ?? null, novo: e.novo ?? null }
      : diferenca(e.anterior, e.novo);
    await (tx ?? this.prisma).registroAuditoria.create({
      data: {
        usuarioId: e.usuario?.id ?? null,
        usuarioLogin: e.usuario?.login ?? null,
        entidade: e.entidade,
        entidadeId: e.entidadeId ?? null,
        acao: e.acao,
        valorAnterior:
          anterior === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(anterior)) as Prisma.InputJsonValue),
        valorNovo:
          novo === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(novo)) as Prisma.InputJsonValue),
      },
    });
  }

  async listar(filtro: {
    entidade?: string;
    entidadeId?: string;
    usuario?: string;
    acao?: string;
    de?: string;
    ate?: string;
    pagina?: number;
    tamanho?: number;
  }) {
    const tamanho = Math.min(Math.max(filtro.tamanho ?? 50, 1), 200);
    const pagina = Math.max(filtro.pagina ?? 1, 1);
    const where: Prisma.RegistroAuditoriaWhereInput = {};
    if (filtro.entidade) where.entidade = filtro.entidade;
    if (filtro.entidadeId) where.entidadeId = filtro.entidadeId;
    if (filtro.acao) where.acao = filtro.acao;
    if (filtro.usuario) where.usuarioLogin = { contains: filtro.usuario, mode: 'insensitive' };
    if (filtro.de || filtro.ate) {
      where.dataHora = {};
      if (filtro.de) where.dataHora.gte = new Date(filtro.de);
      if (filtro.ate) where.dataHora.lte = new Date(filtro.ate);
    }
    const [total, itens] = await Promise.all([
      this.prisma.registroAuditoria.count({ where }),
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (pagina - 1) * tamanho,
        take: tamanho,
      }),
    ]);
    return { total, pagina, tamanho, itens: itens.map((i) => ({ ...i, id: i.id.toString() })) };
  }

  async entidades(): Promise<string[]> {
    const r = await this.prisma.registroAuditoria.findMany({
      distinct: ['entidade'],
      select: { entidade: true },
      orderBy: { entidade: 'asc' },
    });
    return r.map((x) => x.entidade);
  }
}
