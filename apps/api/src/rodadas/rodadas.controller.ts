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
import { esquemaRodada, type RodadaEntrada } from '@apontamento/shared';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { RodadasService } from './rodadas.service.js';

@ApiTags('Rodadas')
@ApiBearerAuth()
@Controller('rodadas')
export class RodadasController {
  constructor(@Inject(RodadasService) private readonly servico: RodadasService) {}

  @Get()
  @Permissao('rodadas.ler')
  listar(@Query('situacao') situacao?: string, @Query('maquinaId') maquinaId?: string) {
    return this.servico.listar({ situacao, maquinaId });
  }

  @Get(':id')
  @Permissao('rodadas.ler')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obter(id);
  }

  @Post()
  @Permissao('rodadas.escrever')
  criar(
    @Body(new ValidacaoZod(esquemaRodada)) dados: RodadaEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.criar(dados, usuario);
  }

  @Put(':id')
  @Permissao('rodadas.escrever')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaRodada)) dados: RodadaEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.atualizar(id, dados, usuario);
  }

  @Post(':id/encerrar')
  @Permissao('rodadas.escrever')
  @HttpCode(200)
  encerrar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.encerrar(id, usuario);
  }
}
