import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissao } from '../comum/decoradores.js';
import { AuditoriaService } from './auditoria.service.js';

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditoriaController {
  constructor(@Inject(AuditoriaService) private readonly servico: AuditoriaService) {}

  @Get()
  @Permissao('auditoria.ler')
  listar(
    @Query('entidade') entidade?: string,
    @Query('entidadeId') entidadeId?: string,
    @Query('usuario') usuario?: string,
    @Query('acao') acao?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('pagina') pagina?: string,
    @Query('tamanho') tamanho?: string,
  ) {
    return this.servico.listar({
      entidade,
      entidadeId,
      usuario,
      acao,
      de,
      ate,
      pagina: pagina ? Number(pagina) : undefined,
      tamanho: tamanho ? Number(tamanho) : undefined,
    });
  }

  @Get('entidades')
  @Permissao('auditoria.ler')
  entidades() {
    return this.servico.entidades();
  }
}
