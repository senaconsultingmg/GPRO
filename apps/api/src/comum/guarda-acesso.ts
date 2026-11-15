import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { temPermissao, type Perfil, type Permissao } from '@apontamento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAVE_AUTENTICADO, CHAVE_PERMISSAO, CHAVE_PUBLICO, type UsuarioAutenticado } from './decoradores.js';
import { naoAutenticado, proibido } from './erros.js';

/**
 * Guarda global: autentica pelo token de acesso e verifica a permissão da rota.
 * Nega por padrão: rota sem @Publico, @ApenasAutenticado ou @Permissao retorna 403.
 */
@Injectable()
export class GuardaAcesso implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.refletor.getAllAndOverride<boolean>(CHAVE_PUBLICO, alvos)) return true;

    const requisicao = ctx.switchToHttp().getRequest();
    const cabecalho: string | undefined = requisicao.headers['authorization'];
    if (!cabecalho?.startsWith('Bearer ')) throw naoAutenticado('Faça login para continuar.');

    let idUsuario: string;
    try {
      const carga = await this.jwt.verifyAsync<{ sub: string }>(cabecalho.slice(7));
      idUsuario = carga.sub;
    } catch {
      throw naoAutenticado();
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: idUsuario },
      select: { id: true, login: true, nome: true, perfis: true, ativo: true },
    });
    if (!usuario || !usuario.ativo) throw naoAutenticado('Usuário inativo ou inexistente.');
    const autenticado: UsuarioAutenticado = {
      id: usuario.id,
      login: usuario.login,
      nome: usuario.nome,
      perfis: usuario.perfis as Perfil[],
    };
    requisicao.usuario = autenticado;

    const permissao = this.refletor.getAllAndOverride<Permissao | undefined>(CHAVE_PERMISSAO, alvos);
    if (permissao) {
      if (!temPermissao(autenticado.perfis, permissao)) throw proibido();
      return true;
    }
    if (this.refletor.getAllAndOverride<boolean>(CHAVE_AUTENTICADO, alvos)) return true;
    throw proibido('Rota sem permissão definida.');
  }
}
