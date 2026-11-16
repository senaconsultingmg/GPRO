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
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { AvisarAlteracao } from '../comum/barramento.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  esquemaAbrirTurno,
  esquemaAjustarDivisao,
  esquemaCriarDivisao,
  esquemaDescarteRecusado,
  esquemaEvento,
  esquemaFecharTurno,
  esquemaLigarMaquina,
  type EventoEntrada,
  type FecharTurno,
} from '@apontamento/shared';
import type { z } from 'zod';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { TurnosService } from './turnos.service.js';
import { RelatorioService } from './relatorio.service.js';

const disp = (d?: string) => (d || 'desconhecido').slice(0, 100);

/**
 * Seção 11 — hora do registro no relógio do tablet (lançamento feito offline e enviado depois).
 * Aceita até 30 dias para trás e 1 dia para frente; fora disso, usa a hora do servidor.
 */
function horaRegistro(valor?: string): Date | undefined {
  if (!valor) return undefined;
  const d = new Date(valor);
  const t = d.getTime();
  if (Number.isNaN(t) || t < Date.now() - 30 * 86_400_000 || t > Date.now() + 86_400_000) return undefined;
  return d;
}

@ApiTags('Turnos e apontamento')
@ApiBearerAuth()
@UseInterceptors(AvisarAlteracao)
@Controller('turnos')
export class TurnosController {
  constructor(
    @Inject(TurnosService) private readonly servico: TurnosService,
    @Inject(RelatorioService) private readonly relatorio: RelatorioService,
  ) {}

  @Get('sugestao')
  @Permissao('apontamento.lancar')
  sugestao() {
    return this.servico.sugestao();
  }

  @Get('meu-aberto')
  @Permissao('apontamento.lancar')
  async meuAberto(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return (await this.servico.meuAberto(usuario)) ?? { id: null };
  }

  @Get('divisoes-abertas')
  @Permissao('apontamento.lancar')
  divisoesAbertas() {
    return this.servico.divisoesAbertas();
  }

  @Get()
  @Permissao('turnos.ler')
  listar(
    @Query('situacao') situacao?: string,
    @Query('data') data?: string,
    @Query('apontadorId') apontadorId?: string,
    @UsuarioAtual() usuario?: UsuarioAutenticado,
  ) {
    return this.servico.listar({ situacao, data, apontadorId }, usuario);
  }

  @Post()
  @Permissao('apontamento.lancar')
  abrir(
    @Body(new ValidacaoZod(esquemaAbrirTurno)) dados: z.infer<typeof esquemaAbrirTurno>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-dispositivo') dispositivo?: string,
    @Headers('x-hora-registro') hora?: string,
  ) {
    return this.servico.abrir(dados, usuario, disp(dispositivo), horaRegistro(hora));
  }

  @Get(':id')
  @Permissao('turnos.ler')
  async detalhe(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    await this.servico.exigirVisivel(id, usuario);
    return this.servico.detalhe(id);
  }

  @Get(':id/relatorio')
  @Permissao('turnos.ler')
  async gerarRelatorio(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    await this.servico.exigirVisivel(id, usuario);
    return this.relatorio.gerar(id);
  }

  @Get(':id/maquinas-disponiveis')
  @Permissao('apontamento.lancar')
  maquinasDisponiveis(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.servico.maquinasDisponiveis(id, usuario);
  }

  @Post(':id/maquinas')
  @Permissao('apontamento.lancar')
  ligar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaLigarMaquina)) dados: z.infer<typeof esquemaLigarMaquina>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-dispositivo') dispositivo?: string,
    @Headers('x-hora-registro') hora?: string,
  ) {
    return this.servico.ligarMaquina(id, dados, usuario, disp(dispositivo), horaRegistro(hora));
  }

  @Get(':id/divisoes/proposta')
  @Permissao('apontamento.lancar')
  proposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('rodadaOpId', ParseUUIDPipe) rodadaOpId: string,
    @Query('maquinaId', ParseUUIDPipe) maquinaId: string,
    @Query('horas') horas: string | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.propostaDivisao(id, rodadaOpId, maquinaId, usuario, horas ? Number(horas) : null);
  }

  @Post(':id/divisoes')
  @Permissao('apontamento.lancar')
  criarDivisao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaCriarDivisao)) dados: z.infer<typeof esquemaCriarDivisao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-dispositivo') dispositivo?: string,
    @Headers('x-hora-registro') hora?: string,
  ) {
    return this.servico.criarDivisao(id, dados, usuario, disp(dispositivo), horaRegistro(hora));
  }

  @Put(':id/divisoes/:divisaoId')
  @Permissao('apontamento.lancar')
  ajustarDivisao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisaoId', ParseUUIDPipe) divisaoId: string,
    @Body(new ValidacaoZod(esquemaAjustarDivisao)) dados: z.infer<typeof esquemaAjustarDivisao>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.ajustarDivisao(id, divisaoId, dados.horasDisponiveis, usuario);
  }

  @Post(':id/eventos')
  @Permissao('apontamento.lancar')
  lancar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaEvento)) entrada: EventoEntrada,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-dispositivo') dispositivo?: string,
    @Headers('x-posto') posto?: string,
    @Headers('x-hora-registro') hora?: string,
  ) {
    return this.servico.lancar(id, entrada, usuario, disp(dispositivo), posto ?? null, horaRegistro(hora));
  }

  @Post(':id/fechar')
  @Permissao('apontamento.lancar')
  @HttpCode(200)
  fechar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaFecharTurno)) dados: FecharTurno,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('x-dispositivo') dispositivo?: string,
    @Headers('x-hora-registro') hora?: string,
  ) {
    return this.servico.fechar(id, dados, usuario, disp(dispositivo), horaRegistro(hora));
  }

  @Post(':id/liberar-aparelho')
  @Permissao('aprovacoes.decidir')
  @HttpCode(200)
  liberarAparelho(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidacaoZod(esquemaDescarteRecusado)) dados: z.infer<typeof esquemaDescarteRecusado>,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.servico.liberarAparelho(id, dados.justificativa, usuario);
  }
}
