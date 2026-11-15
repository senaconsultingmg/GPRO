import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { esquemaUsuarioAtualizar, esquemaUsuarioCriar } from '@apontamento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { hashSenha } from '../autenticacao/autenticacao.service.js';
import { ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

const SELECAO = {
  id: true,
  nome: true,
  login: true,
  perfis: true,
  equipeId: true,
  ativo: true,
  especialidades: true,
  controladorManutencao: true,
  deveTrocarSenha: true,
  criadoEm: true,
  atualizadoEm: true,
  equipe: { select: { id: true, letra: true } },
} as const;

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  listar(busca?: string) {
    return this.prisma.usuario.findMany({
      where: busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { login: { contains: busca, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: SELECAO,
      orderBy: { nome: 'asc' },
    });
  }

  async obter(id: string) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: SELECAO });
    if (!u) throw naoEncontrado('Usuário');
    return u;
  }

  async criar(dados: z.infer<typeof esquemaUsuarioCriar>, autor: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const { senha, ...resto } = dados;
      const novo = await tx.usuario.create({
        data: { ...resto, senhaHash: await hashSenha(senha), deveTrocarSenha: true },
        select: SELECAO,
      });
      const { equipe: _e, ...registro } = novo;
      await this.auditoria.registrar(tx, {
        usuario: autor,
        entidade: 'Usuario',
        entidadeId: novo.id,
        acao: 'CRIAR',
        novo: { ...registro, senha: '***' },
      });
      return novo;
    });
  }

  async atualizar(id: string, dados: z.infer<typeof esquemaUsuarioAtualizar>, autor: UsuarioAutenticado) {
    const anterior = await this.prisma.usuario.findUnique({ where: { id } });
    if (!anterior) throw naoEncontrado('Usuário');
    if (id === autor.id) {
      if (!dados.ativo) throw new ErroNegocio('Você não pode inativar o seu próprio usuário.');
      if (!dados.perfis.includes('SUPERUSUARIO')) {
        throw new ErroNegocio('Você não pode remover o perfil de superusuário de si mesmo.');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const { senha, ...resto } = dados;
      const atualizado = await tx.usuario.update({
        where: { id },
        data: { ...resto, ...(senha ? { senhaHash: await hashSenha(senha), deveTrocarSenha: true } : {}) },
      });
      if (!dados.ativo) {
        await tx.sessaoDispositivo.updateMany({
          where: { usuarioId: id, revogadaEm: null },
          data: { revogadaEm: new Date() },
        });
      }
      await this.auditoria.registrar(tx, {
        usuario: autor,
        entidade: 'Usuario',
        entidadeId: id,
        acao: senha ? 'ATUALIZAR_E_REDEFINIR_SENHA' : 'ATUALIZAR',
        anterior,
        novo: atualizado,
      });
      return tx.usuario.findUniqueOrThrow({ where: { id }, select: SELECAO });
    });
  }
}
