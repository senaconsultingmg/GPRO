import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

/** Padroniza todas as respostas de erro: { statusCode, mensagem, detalhes }. */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly log = new Logger('Erros');

  catch(erro: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse();
    const { status, corpo } = this.traduzir(erro);
    resposta.status(status).json({ statusCode: status, ...corpo });
  }

  private traduzir(erro: unknown): { status: number; corpo: { mensagem: string; detalhes: unknown[] } } {
    if (erro instanceof HttpException) {
      const r = erro.getResponse();
      if (typeof r === 'object' && r !== null && 'mensagem' in r) {
        return { status: erro.getStatus(), corpo: r as { mensagem: string; detalhes: unknown[] } };
      }
      const status = erro.getStatus();
      const mensagens: Record<number, string> = {
        404: 'Recurso não encontrado.',
        400: 'Requisição inválida.',
        401: 'Não autenticado.',
        403: 'Acesso negado.',
        413: 'Requisição muito grande.',
      };
      return { status, corpo: { mensagem: mensagens[status] ?? erro.message, detalhes: [] } };
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === 'P2002') {
        const alvo = (erro.meta as { target?: string[] | string } | undefined)?.target;
        const campos = Array.isArray(alvo) ? alvo.join(', ') : (alvo ?? '');
        return {
          status: HttpStatus.CONFLICT,
          corpo: {
            mensagem: `Já existe um registro com este valor${campos ? ` (${campos})` : ''}.`,
            detalhes: [],
          },
        };
      }
      if (erro.code === 'P2003') {
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          corpo: { mensagem: 'Registro relacionado não encontrado ou em uso.', detalhes: [] },
        };
      }
      if (erro.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          corpo: { mensagem: 'Registro não encontrado.', detalhes: [] },
        };
      }
    }
    this.log.error(erro instanceof Error ? (erro.stack ?? erro.message) : String(erro));
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      corpo: { mensagem: 'Erro interno no servidor.', detalhes: [] },
    };
  }
}
