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
  UseInterceptors,
} from '@nestjs/common';
import { AvisarAlteracao } from '../comum/barramento.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  esquemaDecisao,
  esquemaRejeicao,
  esquemaSolicitarCorrecao,
  type SolicitarCorrecao,
} from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { AprovacoesService } from './aprovacoes.service.js';

@ApiTags('Correções e aprovações')
@ApiBearerAuth()
@UseInterceptors(AvisarAlteracao)
@Controller()
export class AprovacoesController {
  constructor(@Inject(AprovacoesService) private readonly servico: AprovacoesService) {}

  @Post('correcoes')
  @Permissao('correcoes.solicitar')
  solicitar(
    @Body(new ValidacaoZod(esquemaSolicitarCorrecao)) dados: SolicitarCorrecao,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
  ) {
    return this.servico.solicitarCorrecao(dados, usuario, posto || null);
  }

  @Get('aprovacoes')
  @Permissao('aprovacoes.ler')
  listar(@Query('turnoId') turnoId?: string, @Query('situacao') situacao?: string) {
    return this.servico.listar({ turnoId, situacao });
  }

  @Post('aprovacoes/:id/aprovar')
  @Permissao('aprovacoes.decidir')
  @HttpCode(200)
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaDecisao)) corpo: z.infer<typeof esquemaDecisao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-posto') posto?: string,
  ) {
    return this.servico.aprovar(id, corpo.parecer, usuario, posto || null);
  }

  @Post('aprovacoes/:id/rejeitar')
  @Permissao('aprovacoes.decidir')
  @HttpCode(200)
  rejeitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaRejeicao)) corpo: z.infer<typeof esquemaRejeicao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.rejeitar(id, corpo.parecer, usuario);
  }

  @Post('turnos/:id/aprovar')
  @Permissao('aprovacoes.decidir')
  @HttpCode(200)
  aprovarRelatorio(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaDecisao)) corpo: z.infer<typeof esquemaDecisao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.aprovarRelatorio(id, corpo.parecer, usuario);
  }
}
