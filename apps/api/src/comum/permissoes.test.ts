import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERFIS, type Perfil } from '@apontamento/shared';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';
import { GuardaAcesso } from './guarda-acesso.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('Permissões por perfil (seção 5)', () => {
  let ctx: Contexto;
  let tokens: Record<Perfil, string>;
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    tokens = await tokensPorPerfil(ctx);
  });
  afterAll(async () => ctx.app.close());

  const leituraCadastros = [
    '/api/maquinas',
    '/api/moldes',
    '/api/produtos',
    '/api/conjuntos-padrao',
    '/api/motivos-parada',
    '/api/tipos-perda',
    '/api/locais-estoque',
    '/api/impressoras',
    '/api/layouts-etiqueta',
    '/api/horarios-turno',
    '/api/equipes',
    '/api/dispositivos',
    '/api/fichas-tecnicas',
    '/api/escalas?de=2026-01-01&ate=2026-01-31',
  ];

  it('todos os perfis consultam cadastros, fichas e escala', async () => {
    for (const perfil of PERFIS) {
      for (const rota of leituraCadastros) {
        const r = await ctx.http().get(rota).set(auth(tokens[perfil]));
        expect(r.status, `${perfil} GET ${rota}`).toBe(200);
      }
    }
  });

  const restritas: { metodo: 'get' | 'post' | 'put'; rota: string; permitidos: Perfil[]; corpo?: object }[] =
    [
      { metodo: 'post', rota: '/api/maquinas', permitidos: ['SUPERUSUARIO'], corpo: {} },
      { metodo: 'post', rota: '/api/produtos', permitidos: ['SUPERUSUARIO'], corpo: {} },
      { metodo: 'post', rota: '/api/motivos-parada', permitidos: ['SUPERUSUARIO'], corpo: {} },
      { metodo: 'get', rota: '/api/usuarios', permitidos: ['SUPERUSUARIO'] },
      { metodo: 'post', rota: '/api/usuarios', permitidos: ['SUPERUSUARIO'], corpo: {} },
      { metodo: 'get', rota: '/api/parametros', permitidos: ['SUPERUSUARIO'] },
      { metodo: 'get', rota: '/api/auditoria', permitidos: ['SUPERUSUARIO'] },
      { metodo: 'post', rota: '/api/escalas/gerar', permitidos: ['SUPERUSUARIO'], corpo: {} },
      { metodo: 'post', rota: '/api/fichas-tecnicas', permitidos: ['PCP'], corpo: {} },
      {
        metodo: 'post',
        rota: '/api/fichas-tecnicas/00000000-0000-4000-8000-000000000000/aprovar',
        permitidos: ['SUPERUSUARIO'],
      },
    ];

  it('rotas restritas: perfil sem permissão recebe 403; perfil permitido passa da guarda', async () => {
    for (const r of restritas) {
      for (const perfil of PERFIS) {
        const cliente = ctx.http();
        const resp = await cliente[r.metodo](r.rota)
          .set(auth(tokens[perfil]))
          .send(r.corpo ?? {});
        if (r.permitidos.includes(perfil)) {
          expect(resp.status, `${perfil} ${r.metodo} ${r.rota}`).not.toBe(403);
        } else {
          expect(resp.status, `${perfil} ${r.metodo} ${r.rota}`).toBe(403);
          expect(resp.body.mensagem).toBe('Você não tem permissão para esta ação.');
        }
      }
    }
  });

  it('perfis acumulados somam permissões', async () => {
    await ctx.prisma.usuario.update({
      where: { login: 'apontador2@exemplo.com.br' },
      data: { perfis: ['APONTADOR', 'PCP'] },
    });
    const r = await ctx
      .http()
      .post('/api/autenticacao/entrar')
      .send({ login: 'apontador2@exemplo.com.br', senha: 'Senha@123' });
    const resp = await ctx.http().post('/api/fichas-tecnicas').set(auth(r.body.tokenAcesso)).send({});
    expect(resp.status).toBe(400); // passou da guarda; falhou na validação
  });
});

describe('Negar por padrão', () => {
  @Controller('sem-permissao')
  class ControladorSemPermissao {
    @Get()
    rota() {
      return 'não deveria responder';
    }
  }

  it('rota sem permissão declarada retorna 403 mesmo para superusuário', async () => {
    const prismaFalso = {
      usuario: {
        findUnique: async () => ({
          id: 'u1',
          login: 'admin',
          nome: 'Admin',
          perfis: ['SUPERUSUARIO'],
          ativo: true,
        }),
      },
    };
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'x' })],
      controllers: [ControladorSemPermissao],
      providers: [
        { provide: PrismaService, useValue: prismaFalso },
        { provide: APP_GUARD, useClass: GuardaAcesso },
      ],
    }).compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    const token = await app.get(JwtService).signAsync({ sub: 'u1' });
    const r = await request(app.getHttpServer())
      .get('/sem-permissao')
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(403);
    await app.close();
  });
});
