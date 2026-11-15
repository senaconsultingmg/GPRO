import { Controller, Get, Header, Inject, Sse, type MessageEvent } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, of, type Observable } from 'rxjs';
import { Permissao } from '../comum/decoradores.js';
import { Barramento } from '../comum/barramento.js';
import { PainelService } from './painel.service.js';

@ApiTags('Painéis')
@ApiBearerAuth()
@Controller('painel')
export class PainelController {
  constructor(
    @Inject(PainelService) private readonly servico: PainelService,
    @Inject(Barramento) private readonly barramento: Barramento,
  ) {}

  @Get('acompanhamento')
  @Permissao('paineis.ler')
  acompanhamento() {
    return this.servico.acompanhamento();
  }

  /**
   * Tempo real (Server-Sent Events): avisa a cada alteração de turno; o painel busca o estado
   * de novo. Um "pulso" a cada 25 s mantém a conexão aberta através de proxies.
   */
  @Sse('fluxo')
  @Header('X-Accel-Buffering', 'no')
  @Permissao('paineis.ler')
  fluxo(): Observable<MessageEvent> {
    return merge(
      // Confirma a conexão de imediato (o painel mostra "Ao vivo").
      of({ type: 'conectado', data: { em: new Date().toISOString() } }),
      this.barramento.avisos$.pipe(map((a) => ({ type: 'alteracao', data: a }))),
      interval(25_000).pipe(map(() => ({ type: 'pulso', data: { em: new Date().toISOString() } }))),
    );
  }
}
