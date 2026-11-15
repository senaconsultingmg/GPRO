import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { configuracao } from './configuracao.js';
import { PrismaService } from './prisma/prisma.service.js';
import { GuardaAcesso } from './comum/guarda-acesso.js';
import { FiltroErros } from './comum/filtro-erros.js';
import { AuditoriaService } from './auditoria/auditoria.service.js';
import { AuditoriaController } from './auditoria/auditoria.controller.js';
import { AutenticacaoService } from './autenticacao/autenticacao.service.js';
import { AutenticacaoController } from './autenticacao/autenticacao.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { ParametrosService } from './parametros/parametros.service.js';
import { ParametrosController } from './parametros/parametros.controller.js';
import { CadastroService, criarControladorCadastro } from './cadastros/cadastro-generico.js';
import { DEFINICOES_CADASTRO } from './cadastros/definicoes.js';
import { MoldesService } from './moldes/moldes.service.js';
import { MoldesController } from './moldes/moldes.controller.js';
import { EscalaService } from './escala/escala.service.js';
import { EscalaController } from './escala/escala.controller.js';
import { FichasService } from './fichas/fichas.service.js';
import { FichasController } from './fichas/fichas.controller.js';
import { SaudeController } from './saude.controller.js';
import { OrdensService } from './ordens/ordens.service.js';
import { OrdensController } from './ordens/ordens.controller.js';
import { ImportacaoService } from './importacao/importacao.service.js';
import { ImportacaoController } from './importacao/importacao.controller.js';
import { RodadasService } from './rodadas/rodadas.service.js';
import { RodadasController } from './rodadas/rodadas.controller.js';
import { TurnosService } from './turnos/turnos.service.js';
import { EventosService } from './turnos/eventos.service.js';
import { RelatorioService } from './turnos/relatorio.service.js';
import { TurnosController } from './turnos/turnos.controller.js';
import { EtiquetasService } from './etiquetas/etiquetas.service.js';
import { EtiquetasController } from './etiquetas/etiquetas.controller.js';
import { MateriaPrimaService } from './materia-prima/materia-prima.service.js';
import { MateriaPrimaController } from './materia-prima/materia-prima.controller.js';
import { EstoqueService } from './estoque/estoque.service.js';
import { EstoqueController } from './estoque/estoque.controller.js';

@Module({
  imports: [
    JwtModule.register({
      secret: configuracao.jwtSegredo,
      signOptions: { expiresIn: configuracao.jwtAcessoMinutos * 60 },
    }),
  ],
  controllers: [
    SaudeController,
    AutenticacaoController,
    UsuariosController,
    ParametrosController,
    AuditoriaController,
    // Rotas específicas de molde antes do CRUD genérico.
    MoldesController,
    ...DEFINICOES_CADASTRO.map(criarControladorCadastro),
    EscalaController,
    FichasController,
    OrdensController,
    ImportacaoController,
    RodadasController,
    TurnosController,
    EtiquetasController,
    MateriaPrimaController,
    EstoqueController,
  ],
  providers: [
    PrismaService,
    AuditoriaService,
    AutenticacaoService,
    UsuariosService,
    ParametrosService,
    CadastroService,
    MoldesService,
    EscalaService,
    FichasService,
    OrdensService,
    ImportacaoService,
    RodadasService,
    TurnosService,
    EventosService,
    RelatorioService,
    EtiquetasService,
    MateriaPrimaService,
    EstoqueService,
    { provide: APP_GUARD, useClass: GuardaAcesso },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class AppModule {}
