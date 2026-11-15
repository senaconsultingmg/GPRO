import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { esquemaFichaTecnica, esquemaParecer, type FichaTecnicaEntrada } from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { FichasService } from './fichas.service.js';

@ApiTags('Ficha técnica')
@ApiBearerAuth()
@Controller('fichas-tecnicas')
export class FichasController {
  constructor(@Inject(FichasService) private readonly servico: FichasService) {}

  @Get()
  @Permissao('fichas.ler')
  listar(
    @Query('produtoId') produtoId?: string,
    @Query('moldeId') moldeId?: string,
    @Query('maquinaId') maquinaId?: string,
    @Query('situacao') situacao?: string,
  ) {
    return this.servico.listar({ produtoId, moldeId, maquinaId, situacao });
  }

  @Get(':id')
  @Permissao('fichas.ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Get(':id/historico')
  @Permissao('fichas.ler')
  historico(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.historico(id);
  }

  @Post()
  @Permissao('fichas.escrever')
  criar(
    @Body(new ValidacaoZod(esquemaFichaTecnica)) dados: FichaTecnicaEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.criar(dados, usuario);
  }

  @Put(':id')
  @Permissao('fichas.escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaFichaTecnica)) dados: FichaTecnicaEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizar(id, dados, usuario);
  }

  @Post(':id/nova-versao')
  @Permissao('fichas.escrever')
  novaVersao(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.novaVersao(id, usuario);
  }

  @Post(':id/aprovar')
  @Permissao('fichas.aprovar')
  @HttpCode(200)
  aprovar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.aprovar(id, usuario);
  }

  @Post(':id/reprovar')
  @Permissao('fichas.aprovar')
  @HttpCode(200)
  reprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaParecer)) corpo: z.infer<typeof esquemaParecer>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.reprovar(id, corpo.parecer, usuario);
  }
}
