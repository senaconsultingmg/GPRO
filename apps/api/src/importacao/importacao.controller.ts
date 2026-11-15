import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { esquemaMapeamento } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { ImportacaoService } from './importacao.service.js';

type ArquivoEnviado = { buffer: Buffer; originalname: string };
const LIMITE = { limits: { fileSize: 5 * 1024 * 1024 } };
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Importação de Excel')
@ApiBearerAuth()
@Controller('importacoes')
export class ImportacaoController {
  constructor(@Inject(ImportacaoService) private readonly servico: ImportacaoService) {}

  @Get()
  @Permissao('importacoes.ler')
  listar() {
    return this.servico.listar();
  }

  @Get('layouts')
  @Permissao('importacoes.ler')
  layouts() {
    return this.servico.layouts();
  }

  @Put('layouts/:layout')
  @Permissao('excel.mapear')
  mapear(
    @Param('layout') layout: string,
    @Body(new ValidacaoZod(esquemaMapeamento)) corpo: z.infer<typeof esquemaMapeamento>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.salvarMapeamento(layout, corpo.colunas, usuario);
  }

  @Get('layouts/:layout/modelo')
  @Permissao('importacoes.ler')
  async modelo(@Param('layout') layout: string, @Res() res: Response) {
    const arquivo = await this.servico.modelo(layout);
    res.setHeader('content-type', TIPO_XLSX);
    res.setHeader('content-disposition', `attachment; filename="modelo-${layout.toLowerCase()}.xlsx"`);
    res.send(arquivo);
  }

  @Post('ordens')
  @Permissao('ordens.escrever')
  @UseInterceptors(FileInterceptor('arquivo', LIMITE))
  importarOrdens(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @Query('simular') simular: string | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.importar('IMPORTACAO_ORDENS', arquivo, usuario, simular === 'true');
  }

  @Post('produtos')
  @Permissao('produtos.importar')
  @UseInterceptors(FileInterceptor('arquivo', LIMITE))
  importarProdutos(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @Query('simular') simular: string | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.importar('IMPORTACAO_PRODUTOS', arquivo, usuario, simular === 'true');
  }

  @Get(':id/arquivo')
  @Permissao('importacoes.ler')
  async arquivo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.servico.arquivo(id);
    res.setHeader('content-type', TIPO_XLSX);
    res.setHeader('content-disposition', `attachment; filename="${encodeURIComponent(r.arquivoNome)}"`);
    res.send(Buffer.from(r.arquivo));
  }
}
