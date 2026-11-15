import { HttpException, HttpStatus } from '@nestjs/common';

export interface DetalheErro {
  campo?: string;
  criterio?: string;
  mensagem: string;
}

/** Erro de negócio com mensagem em português e detalhes opcionais. */
export class ErroNegocio extends HttpException {
  constructor(mensagem: string, detalhes: DetalheErro[] = [], status = HttpStatus.UNPROCESSABLE_ENTITY) {
    super({ mensagem, detalhes }, status);
  }
}

export const naoEncontrado = (o = 'Registro') =>
  new ErroNegocio(`${o} não encontrado.`, [], HttpStatus.NOT_FOUND);
export const conflito = (mensagem: string) => new ErroNegocio(mensagem, [], HttpStatus.CONFLICT);
export const proibido = (mensagem = 'Você não tem permissão para esta ação.') =>
  new ErroNegocio(mensagem, [], HttpStatus.FORBIDDEN);
export const naoAutenticado = (mensagem = 'Sessão inválida ou expirada. Entre novamente.') =>
  new ErroNegocio(mensagem, [], HttpStatus.UNAUTHORIZED);
