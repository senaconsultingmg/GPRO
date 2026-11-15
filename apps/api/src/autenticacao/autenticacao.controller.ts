import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaLogin, esquemaRenovacao, esquemaTrocaSenha } from '@apontamento/shared';
import { z } from 'zod';
import { ApenasAutenticado, Publico, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { AutenticacaoService } from './autenticacao.service.js';

@ApiTags('Autenticação')
@Controller('autenticacao')
export class AutenticacaoController {
  constructor(@Inject(AutenticacaoService) private readonly servico: AutenticacaoService) {}

  @Post('entrar')
  @Publico()
  @HttpCode(200)
  entrar(
    @Body(new ValidacaoZod(esquemaLogin)) corpo: z.infer<typeof esquemaLogin>,
    @Headers('x-dispositivo') dispositivo?: string,
  ) {
    return this.servico.entrar(corpo.login, corpo.senha, (dispositivo || 'desconhecido').slice(0, 100));
  }

  @Post('renovar')
  @Publico()
  @HttpCode(200)
  renovar(@Body(new ValidacaoZod(esquemaRenovacao)) corpo: z.infer<typeof esquemaRenovacao>) {
    return this.servico.renovar(corpo.tokenRenovacao);
  }

  @Post('sair')
  @Publico()
  @HttpCode(204)
  async sair(@Body(new ValidacaoZod(esquemaRenovacao)) corpo: z.infer<typeof esquemaRenovacao>) {
    await this.servico.sair(corpo.tokenRenovacao);
  }

  @Get('eu')
  @ApiBearerAuth()
  @ApenasAutenticado()
  eu(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.eu(usuario.id);
  }

  @Post('trocar-senha')
  @ApiBearerAuth()
  @ApenasAutenticado()
  @HttpCode(204)
  async trocarSenha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ValidacaoZod(esquemaTrocaSenha)) corpo: z.infer<typeof esquemaTrocaSenha>,
  ) {
    await this.servico.trocarSenha(usuario, corpo.senhaAtual, corpo.novaSenha);
  }
}
