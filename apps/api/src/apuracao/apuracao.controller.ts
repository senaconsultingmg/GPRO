import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { esquemaRejeicao } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { ApuracaoService } from './apuracao.service.js';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Apuração e exportação')
@ApiBearerAuth()
@Controller()
export class ApuracaoController {
  constructor(@Inject(ApuracaoService) private readonly servico: ApuracaoService) {}

  @Get('apuracao/turnos')
  @Permissao('exportacao.ler')
  turnos(@Query('situacao') situacao?: string) {
    return this.servico.listarTurnos(situacao);
  }

  @Post('turnos/:id/apurar')
  @Permissao('apuracao.executar')
  @HttpCode(200)
  apurar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.apurar(id, usuario);
  }

  @Post('turnos/:id/devolver')
  @Permissao('apuracao.executar')
  @HttpCode(200)
  devolver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaRejeicao)) corpo: z.infer<typeof esquemaRejeicao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.devolver(id, corpo.parecer, usuario);
  }

  @Get('exportacoes/previa')
  @Permissao('exportacao.ler')
  previa() {
    return this.servico.previa();
  }

  @Post('exportacoes')
  @Permissao('exportacao.executar')
  exportar(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.exportar(usuario);
  }

  @Get('exportacoes')
  @Permissao('exportacao.ler')
  listar() {
    return this.servico.listar();
  }

  @Get('exportacoes/:numero/arquivos/:layout')
  @Permissao('exportacao.ler')
  async arquivo(
    @Param('numero', ParseIntPipe) numero: number,
    @Param('layout') layout: string,
    @Res() res: Response,
  ) {
    const a = await this.servico.arquivo(numero, layout);
    res.setHeader('content-type', TIPO_XLSX);
    res.setHeader('content-disposition', `attachment; filename="${a.nome}"`);
    res.send(a.conteudo);
  }
}
