import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Perfil, Permissao as NomePermissao } from '@apontamento/shared';

export const CHAVE_PUBLICO = 'rota:publica';
export const CHAVE_PERMISSAO = 'rota:permissao';
export const CHAVE_AUTENTICADO = 'rota:autenticado';

/** Rota acessível sem login. */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);
/** Rota que exige a permissão indicada (seção 5). */
export const Permissao = (permissao: NomePermissao) => SetMetadata(CHAVE_PERMISSAO, permissao);
/** Rota que exige apenas estar autenticado (ex.: dados do próprio usuário). */
export const ApenasAutenticado = () => SetMetadata(CHAVE_AUTENTICADO, true);

export interface UsuarioAutenticado {
  id: string;
  login: string;
  nome: string;
  perfis: Perfil[];
}

export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
  return ctx.switchToHttp().getRequest().usuario;
});
