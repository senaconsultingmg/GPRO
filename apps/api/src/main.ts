import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configuracao } from './configuracao.js';
import { configurarApp } from './configurar-app.js';

async function iniciar() {
  const app = await NestFactory.create(AppModule, { cors: !configuracao.producao });
  configurarApp(app);
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('App de Apontamento de Produção — API')
      .setDescription('API REST do sistema de apontamento de produção.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, documento);
  await app.listen(configuracao.porta, '0.0.0.0');
  Logger.log(`API ouvindo na porta ${configuracao.porta} — documentação em /api/docs`, 'Inicio');
}

void iniciar();
