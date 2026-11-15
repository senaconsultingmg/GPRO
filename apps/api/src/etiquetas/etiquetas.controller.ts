import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaResultadoImpressao, esquemaSolicitarImpressao } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { EtiquetasService } from './etiquetas.service.js';

@ApiTags('Etiquetas')
@ApiBearerAuth()
@Controller()
export class EtiquetasController {
  constructor(@Inject(EtiquetasService) private readonly servico: EtiquetasService) {}

  @Get('etiquetas')
  @Permissao('etiquetas.ler')
  listar(
    @Query('busca') busca?: string,
    @Query('situacao') situacao?: string,
    @Query('tipo') tipo?: string,
    @Query('pendentes') pendentes?: string,
    @Query('turnoId') turnoId?: string,
    @Query('eventoId') eventoId?: string,
  ) {
    return this.servico.listar({ busca, situacao, tipo, pendentes: pendentes === 'true', turnoId, eventoId });
  }

  @Get('etiquetas/leitura')
  @Permissao('etiquetas.ler')
  porLeitura(@Query('codigo') codigo: string) {
    return this.servico.porLeitura(codigo ?? '');
  }

  @Get('etiquetas/:id')
  @Permissao('etiquetas.ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Post('etiquetas/:id/impressao')
  @Permissao('etiquetas.imprimir')
  imprimir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaSolicitarImpressao)) corpo: z.infer<typeof esquemaSolicitarImpressao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.solicitarImpressao(id, corpo, usuario);
  }

  @Put('impressoes/:id')
  @Permissao('etiquetas.imprimir')
  resultado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaResultadoImpressao)) corpo: z.infer<typeof esquemaResultadoImpressao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.registrarResultado(id, { sucesso: corpo.sucesso, mensagem: corpo.mensagem }, usuario);
  }

  /** Impressão de teste do layout (superusuário). */
  @Post('layouts-etiqueta/:id/teste')
  @Permissao('cadastros.escrever')
  teste(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaSolicitarImpressao)) corpo: z.infer<typeof esquemaSolicitarImpressao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.testeLayout(id, corpo.impressoraId, usuario);
  }
}
