import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaUsuarioAtualizar, esquemaUsuarioCriar } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { UsuariosService } from './usuarios.service.js';

@ApiTags('Usuários')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(@Inject(UsuariosService) private readonly servico: UsuariosService) {}

  @Get()
  @Permissao('usuarios.ler')
  listar(@Query('busca') busca?: string) {
    return this.servico.listar(busca);
  }

  @Get(':id')
  @Permissao('usuarios.ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Post()
  @Permissao('usuarios.escrever')
  criar(
    @Body(new ValidacaoZod(esquemaUsuarioCriar)) dados: z.infer<typeof esquemaUsuarioCriar>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.criar(dados, usuario);
  }

  @Put(':id')
  @Permissao('usuarios.escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaUsuarioAtualizar)) dados: z.infer<typeof esquemaUsuarioAtualizar>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizar(id, dados, usuario);
  }
}
