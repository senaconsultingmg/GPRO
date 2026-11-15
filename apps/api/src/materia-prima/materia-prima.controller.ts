import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  esquemaLeituraLocal,
  esquemaLoteCompra,
  esquemaLoteRetorno,
  esquemaMistura,
  esquemaTransferirLote,
  type LoteCompra,
  type LoteRetorno,
  type MisturaEntrada,
} from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { MateriaPrimaService } from './materia-prima.service.js';

@ApiTags('Matéria-prima')
@ApiBearerAuth()
@Controller('materia-prima')
export class MateriaPrimaController {
  constructor(@Inject(MateriaPrimaService) private readonly servico: MateriaPrimaService) {}

  @Get('lotes')
  @Permissao('materiaprima.ler')
  lotes(
    @Query('materialId') materialId?: string,
    @Query('comSaldo') comSaldo?: string,
    @Query('busca') busca?: string,
  ) {
    return this.servico.listarLotes({ materialId, comSaldo: comSaldo === 'true', busca });
  }

  @Get('pendentes')
  @Permissao('materiaprima.ler')
  pendentes() {
    return this.servico.pendentesRecebimento();
  }

  @Post('lotes/compra')
  @Permissao('materiaprima.escrever')
  compra(
    @Body(new ValidacaoZod(esquemaLoteCompra)) dados: LoteCompra,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
  ) {
    return this.servico.entradaCompra(dados, usuario, posto ?? null);
  }

  @Post('lotes/retorno')
  @Permissao('materiaprima.escrever')
  retorno(
    @Body(new ValidacaoZod(esquemaLoteRetorno)) dados: LoteRetorno,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
  ) {
    return this.servico.entradaRetorno(dados, usuario, posto ?? null);
  }

  @Post('misturas')
  @Permissao('materiaprima.escrever')
  mistura(
    @Body(new ValidacaoZod(esquemaMistura)) dados: MisturaEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
  ) {
    return this.servico.mistura(dados, usuario, posto ?? null);
  }

  @Post('receber')
  @Permissao('materiaprima.escrever')
  @HttpCode(200)
  receber(
    @Body(new ValidacaoZod(esquemaLeituraLocal)) dados: z.infer<typeof esquemaLeituraLocal>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.receber(dados.leitura, dados.localEstoqueId, usuario);
  }

  @Post('lotes/:id/transferir')
  @Permissao('materiaprima.escrever')
  transferir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaTransferirLote)) dados: z.infer<typeof esquemaTransferirLote>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.transferir(id, dados, usuario);
  }
}
