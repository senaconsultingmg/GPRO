import { Body, Controller, Get, HttpCode, Inject, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  esquemaFiltroIndicadores,
  esquemaTabelaExportacao,
  type FiltroIndicadores,
  type TabelaExportacao,
} from '@apontamento/shared';
import { Permissao } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { IndicadoresService } from './indicadores.service.js';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Painéis')
@ApiBearerAuth()
@Controller('indicadores')
export class IndicadoresController {
  constructor(@Inject(IndicadoresService) private readonly servico: IndicadoresService) {}

  @Get()
  @Permissao('paineis.ler')
  consultar(@Query(new ValidacaoZod(esquemaFiltroIndicadores)) filtros: FiltroIndicadores) {
    return this.servico.consultar(filtros);
  }

  @Post('exportar')
  @Permissao('paineis.ler')
  @HttpCode(200)
  async exportar(
    @Body(new ValidacaoZod(esquemaTabelaExportacao)) tabela: TabelaExportacao,
    @Res() res: Response,
  ) {
    const arquivo = await this.servico.exportar(tabela);
    const nome = tabela.titulo
      .normalize('NFD')
      .replace(/[^\w -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    res.setHeader('content-type', TIPO_XLSX);
    res.setHeader('content-disposition', `attachment; filename="${nome || 'tabela'}.xlsx"`);
    res.send(arquivo);
  }
}
