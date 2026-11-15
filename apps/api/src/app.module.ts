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
    { provide: APP_GUARD, useClass: GuardaAcesso },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class AppModule {}
