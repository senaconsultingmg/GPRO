import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaLeituraLocal } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { EstoqueService } from './estoque.service.js';

@ApiTags('Estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(@Inject(EstoqueService) private readonly servico: EstoqueService) {}

  @Get('leitura')
  @Permissao('estoque.ler')
  consultar(@Query('codigo') codigo: string) {
    return this.servico.consultar(codigo ?? '');
  }

  @Post('receber')
  @Permissao('estoque.receber')
  @HttpCode(200)
  receber(
    @Body(new ValidacaoZod(esquemaLeituraLocal)) dados: z.infer<typeof esquemaLeituraLocal>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.receber(dados.leitura, dados.localEstoqueId, usuario);
  }

  @Get('recebimento')
  @Permissao('estoque.ler')
  recebimento() {
    return this.servico.listaRecebimento();
  }

  @Get('saldos')
  @Permissao('estoque.ler')
  saldos() {
    return this.servico.saldos();
  }
}
