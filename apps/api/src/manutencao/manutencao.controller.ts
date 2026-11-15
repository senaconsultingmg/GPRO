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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  esquemaAjustarEtapa,
  esquemaCancelarEtapa,
  esquemaConcluirEtapa,
  esquemaConverterOs,
  esquemaEncerrarOs,
  esquemaFiltroManutencao,
  esquemaIncluirEtapas,
  esquemaIniciarEtapa,
  esquemaModeloSequencia,
  esquemaRecusaSolicitacao,
  esquemaSolicitacaoManual,
} from '@apontamento/shared';
import type { z } from 'zod';
import { AvisarAlteracao } from '../comum/barramento.js';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { ManutencaoService } from './manutencao.service.js';

type Z<T extends z.ZodType> = z.infer<T>;

@ApiTags('Manutenção')
@ApiBearerAuth()
@UseInterceptors(AvisarAlteracao)
@Controller('manutencao')
export class ManutencaoController {
  constructor(@Inject(ManutencaoService) private readonly servico: ManutencaoService) {}

  @Get('solicitacoes')
  @Permissao('manutencao.ler')
  solicitacoes(@Query('situacao') situacao?: string, @Query('maquinaId') maquinaId?: string) {
    return this.servico.listarSolicitacoes({ situacao, maquinaId });
  }

  @Post('solicitacoes')
  @Permissao('manutencao.solicitar')
  criar(
    @Body(new ValidacaoZod(esquemaSolicitacaoManual)) d: Z<typeof esquemaSolicitacaoManual>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.criarManual(d, u);
  }

  @Post('solicitacoes/:id/triagem')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  triagem(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() u: UsuarioAutenticado) {
    return this.servico.iniciarTriagem(id, u);
  }

  @Post('solicitacoes/:id/recusar')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  recusar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaRecusaSolicitacao)) d: Z<typeof esquemaRecusaSolicitacao>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.recusar(id, d.justificativa, u);
  }

  @Post('solicitacoes/:id/converter')
  @Permissao('manutencao.executar')
  converter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaConverterOs)) d: Z<typeof esquemaConverterOs>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.converter(id, d, u);
  }

  @Get('ordens')
  @Permissao('manutencao.ler')
  ordens(@Query('situacao') situacao?: string) {
    return this.servico.listarOs({ situacao });
  }

  @Get('ordens/:id')
  @Permissao('manutencao.ler')
  ordem(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.obterOs(id);
  }

  @Post('ordens/:id/etapas')
  @Permissao('manutencao.executar')
  incluirEtapas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaIncluirEtapas)) d: Z<typeof esquemaIncluirEtapas>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.incluirEtapas(id, d.etapas, u);
  }

  @Post('ordens/:id/encerrar')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  encerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaEncerrarOs)) d: Z<typeof esquemaEncerrarOs>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.encerrarOs(id, d.servicoExecutado, u);
  }

  @Put('etapas/:id')
  @Permissao('manutencao.executar')
  ajustarEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaAjustarEtapa)) d: Z<typeof esquemaAjustarEtapa>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.ajustarEtapa(id, d, u);
  }

  @Post('etapas/:id/cancelar')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  cancelarEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaCancelarEtapa)) d: Z<typeof esquemaCancelarEtapa>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.cancelarEtapa(id, d.justificativa, u);
  }

  @Post('etapas/:id/iniciar')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  iniciarEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaIniciarEtapa)) d: Z<typeof esquemaIniciarEtapa>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.iniciarEtapa(id, d.inicio, u);
  }

  @Post('etapas/:id/concluir')
  @Permissao('manutencao.executar')
  @HttpCode(200)
  concluirEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaConcluirEtapa)) d: Z<typeof esquemaConcluirEtapa>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.concluirEtapa(id, d, u);
  }

  @Get('minhas-etapas')
  @Permissao('manutencao.executar')
  minhasEtapas(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.servico.minhasEtapas(u);
  }

  @Get('eu')
  @Permissao('manutencao.ler')
  eu(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.servico.usuario(u);
  }

  @Get('tecnicos')
  @Permissao('manutencao.ler')
  tecnicos() {
    return this.servico.tecnicos();
  }

  @Get('modelos')
  @Permissao('manutencao.ler')
  modelos() {
    return this.servico.listarModelos();
  }

  @Post('modelos')
  @Permissao('manutencao.executar')
  criarModelo(
    @Body(new ValidacaoZod(esquemaModeloSequencia)) d: Z<typeof esquemaModeloSequencia>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.salvarModelo(null, d, u);
  }

  @Put('modelos/:id')
  @Permissao('manutencao.executar')
  atualizarModelo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaModeloSequencia)) d: Z<typeof esquemaModeloSequencia>,
    @UsuarioAtual() u: UsuarioAutenticado,
  ) {
    return this.servico.salvarModelo(id, d, u);
  }

  @Get('indicadores')
  @Permissao('manutencao.ler')
  indicadores(@Query(new ValidacaoZod(esquemaFiltroManutencao)) f: Z<typeof esquemaFiltroManutencao>) {
    return this.servico.indicadores(f);
  }
}
