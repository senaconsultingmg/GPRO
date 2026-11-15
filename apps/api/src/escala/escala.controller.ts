import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaEscalaAtualizar, esquemaGerarEscala, type GerarEscala } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { EscalaService } from './escala.service.js';

@ApiTags('Escala')
@ApiBearerAuth()
@Controller('escalas')
export class EscalaController {
  constructor(@Inject(EscalaService) private readonly servico: EscalaService) {}

  @Get()
  @Permissao('escala.ler')
  listar(@Query('de') de: string, @Query('ate') ate: string) {
    return this.servico.listar(de, ate);
  }

  @Post('gerar')
  @Permissao('escala.escrever')
  gerar(
    @Body(new ValidacaoZod(esquemaGerarEscala)) corpo: GerarEscala,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.gerar(corpo, usuario);
  }

  @Put(':id')
  @Permissao('escala.escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaEscalaAtualizar)) corpo: z.infer<typeof esquemaEscalaAtualizar>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizarEquipe(id, corpo.equipeId, usuario);
  }
}
