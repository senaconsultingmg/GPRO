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
import { esquemaOrdem, type OrdemEntrada } from '@apontamento/shared';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { OrdensService } from './ordens.service.js';

@ApiTags('Ordens de produção')
@ApiBearerAuth()
@Controller('ordens')
export class OrdensController {
  constructor(@Inject(OrdensService) private readonly servico: OrdensService) {}

  @Get()
  @Permissao('ordens.ler')
  listar(
    @Query('situacao') situacao?: string,
    @Query('busca') busca?: string,
    @Query('tipo') tipo?: string,
    @Query('produtoId') produtoId?: string,
  ) {
    return this.servico.listar({ situacao, busca, tipo, produtoId });
  }

  @Get(':id')
  @Permissao('ordens.ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Post()
  @Permissao('ordens.escrever')
  criar(
    @Body(new ValidacaoZod(esquemaOrdem)) dados: OrdemEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.criar(dados, usuario);
  }

  @Put(':id')
  @Permissao('ordens.escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaOrdem)) dados: OrdemEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizar(id, dados, usuario);
  }

  @Post(':id/encerrar')
  @Permissao('ordens.escrever')
  @HttpCode(200)
  encerrar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.encerrar(id, usuario);
  }

  @Post(':id/cancelar')
  @Permissao('ordens.escrever')
  @HttpCode(200)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.cancelar(id, usuario);
  }
}
