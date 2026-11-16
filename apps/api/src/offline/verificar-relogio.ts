import {
  Inject,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { OfflineService } from './offline.service.js';

/**
 * Seção 11 — o tablet envia o próprio relógio (x-hora-dispositivo) em cada envio. Diferença maior
 * que o parâmetro gera alerta ao superusuário. Não bloqueia a requisição.
 */
@Injectable()
export class VerificarRelogio implements NestInterceptor {
  private readonly log = new Logger('VerificarRelogio');
  constructor(@Inject(OfflineService) private readonly offline: OfflineService) {}

  intercept(ctx: ExecutionContext, proximo: CallHandler): Observable<unknown> {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; usuario?: { id: string } }>();
    const hora = req.headers['x-hora-dispositivo'];
    const aparelho = req.headers['x-dispositivo'];
    if (hora && aparelho) {
      const d = new Date(hora);
      if (!Number.isNaN(d.getTime())) {
        this.offline
          .verificarRelogio(aparelho.slice(0, 100), d, req.usuario?.id ?? null)
          .catch((e: Error) => this.log.warn(`Falha ao verificar relógio: ${e.message}`));
      }
    }
    return proximo.handle();
  }
}
