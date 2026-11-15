import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  Inject,
} from '@nestjs/common';
import { Subject, tap, type Observable } from 'rxjs';

export interface AvisoAlteracao {
  turnoId: string;
  em: string;
}

/**
 * Aviso interno de que os números de um turno mudaram (lançamento, abertura, fechamento,
 * correção aprovada). Alimenta o painel em tempo real e invalida o cache dos indicadores.
 */
@Injectable()
export class Barramento {
  private readonly assunto = new Subject<AvisoAlteracao>();
  readonly avisos$ = this.assunto.asObservable();

  emitir(turnoId: string | null | undefined): void {
    if (turnoId) this.assunto.next({ turnoId, em: new Date().toISOString() });
  }
}

/**
 * Depois de uma alteração bem-sucedida, avisa o barramento com o turno afetado
 * (parâmetro `:id` da rota de turno, ou `turnoId`/`id` da resposta).
 */
@Injectable()
export class AvisarAlteracao implements NestInterceptor {
  constructor(@Inject(Barramento) private readonly barramento: Barramento) {}

  intercept(ctx: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; params: Record<string, string> }>();
    if (req.method === 'GET') return proximo.handle();
    return proximo.handle().pipe(
      tap((resposta) => {
        const r = (resposta ?? {}) as { turnoId?: string; id?: string };
        this.barramento.emitir(r.turnoId ?? req.params.id ?? r.id);
      }),
    );
  }
}
