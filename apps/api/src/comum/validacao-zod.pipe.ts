import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ErroNegocio } from './erros.js';

/** Valida e transforma o corpo da requisição com um esquema Zod compartilhado. */
export class ValidacaoZod<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    const r = this.esquema.safeParse(valor);
    if (r.success) return r.data;
    throw new ErroNegocio(
      'Dados inválidos. Corrija os campos indicados.',
      r.error.issues.map((i) => ({ campo: i.path.join('.') || undefined, mensagem: i.message })),
      HttpStatus.BAD_REQUEST,
    );
  }
}
