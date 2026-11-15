import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaParametroAtualizar } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { ParametrosService } from './parametros.service.js';

@ApiTags('Parâmetros do sistema')
@ApiBearerAuth()
@Controller('parametros')
export class ParametrosController {
  constructor(@Inject(ParametrosService) private readonly servico: ParametrosService) {}

  @Get()
  @Permissao('parametros.ler')
  listar() {
    return this.servico.listar();
  }

  @Put(':chave')
  @Permissao('parametros.escrever')
  atualizar(
    @Param('chave') chave: string,
    @Body(new ValidacaoZod(esquemaParametroAtualizar)) corpo: z.infer<typeof esquemaParametroAtualizar>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizar(chave, corpo.valor, usuario);
  }
}
