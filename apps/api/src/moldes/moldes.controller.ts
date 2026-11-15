import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaCavidadesMolde } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { MoldesService } from './moldes.service.js';

@ApiTags('Molde')
@ApiBearerAuth()
@Controller('moldes')
export class MoldesController {
  constructor(@Inject(MoldesService) private readonly servico: MoldesService) {}

  @Get(':id/compatibilidade')
  @Permissao('cadastros.ler')
  compatibilidade(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.compatibilidadeComMaquinas(id);
  }

  @Put(':id/cavidades')
  @Permissao('cadastros.escrever')
  cavidades(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaCavidadesMolde)) corpo: z.infer<typeof esquemaCavidadesMolde>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizarCavidades(id, corpo.cavidades, usuario);
  }
}
