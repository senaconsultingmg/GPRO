import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  esquemaDescarteRecusado,
  esquemaEstadoFila,
  esquemaImpressoesOffline,
  esquemaRecusado,
  esquemaRelancado,
} from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { OfflineService } from './offline.service.js';

const aparelho = (d?: string) => (d || 'desconhecido').slice(0, 100);
type Z<T extends z.ZodType> = z.infer<T>;

@ApiTags('Offline e sincronização')
@ApiBearerAuth()
@Controller('offline')
export class OfflineController {
  constructor(@Inject(OfflineService) private readonly servico: OfflineService) {}

  @Get('pacote')
  @Permissao('offline.sincronizar')
  pacote(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
    @Headers('x-dispositivo') disp?: string,
  ) {
    return this.servico.pacote(u, posto || null, aparelho(disp));
  }

  @Post('blocos')
  @Permissao('offline.sincronizar')
  reservar(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
    @Headers('x-dispositivo') disp?: string,
  ) {
    return this.servico.reservar(posto || null, aparelho(disp), u);
  }

  @Post('estado-fila')
  @Permissao('offline.sincronizar')
  @HttpCode(200)
  estadoFila(
    @Body(new ValidacaoZod(esquemaEstadoFila)) d: Z<typeof esquemaEstadoFila>,
    @UsuarioAtual() u: UsuarioAutenticado,
    @Headers('x-dispositivo') disp?: string,
  ) {
    return this.servico.estadoFila(d, aparelho(disp), u);
  }

  @Post('recusados')
  @Permissao('offline.sincronizar')
  registrarRecusa(
    @Body(new ValidacaoZod(esquemaRecusado)) d: Z<typeof esquemaRecusado>,
    @UsuarioAtual() u: UsuarioAutenticado,
    @Headers('x-dispositivo') disp?: string,
  ) {
    return this.servico.registrarRecusa(d, aparelho(disp), u);
  }

  @Get('recusados')
  @Permissao('recusados.ler')
  recusados(@UsuarioAtual() u: UsuarioAutenticado, @Query('situacao') situacao?: string) {
    return this.servico.listarRecusas(u, situacao);
  }

  @Post('recusados/:id/descartar')
  @Permissao('recusados.decidir')
  @HttpCode(200)
  descartar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaDescarteRecusado)) d: Z<typeof esquemaDescarteRecusado>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.descartar(id, d.justificativa, u);
  }

  @Post('recusados/:id/relancado')
  @Permissao('recusados.decidir')
  @HttpCode(200)
  relancado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaRelancado)) d: Z<typeof esquemaRelancado>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.relancado(id, d.eventoId, u);
  }

  @Post('impressoes')
  @Permissao('offline.sincronizar')
  @HttpCode(200)
  impressoes(
    @Body(new ValidacaoZod(esquemaImpressoesOffline)) d: Z<typeof esquemaImpressoesOffline>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.impressoes(d, u);
  }

  @Get('alertas-relogio')
  @Permissao('alertas.relogio')
  alertas() {
    return this.servico.listarAlertas();
  }

  @Post('alertas-relogio/:id/resolver')
  @Permissao('alertas.relogio')
  @HttpCode(200)
  resolver(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.servico.resolverAlerta(id, u);
  }
}
