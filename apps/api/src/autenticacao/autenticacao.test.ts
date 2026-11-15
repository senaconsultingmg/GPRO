import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  limparBanco,
  prepararComDadosExemplo,
  SENHA_EXEMPLO,
  type Contexto,
} from '../testes/auxiliar.js';
import { hashSenha } from './autenticacao.service.js';

describe('Autenticação', () => {
  let ctx: Contexto;
  beforeAll(async () => (ctx = await criarContexto()));
  afterAll(async () => ctx.app.close());

  describe('usuário inicial admin@admin.com.br', () => {
    beforeEach(async () => limparBanco(ctx.prisma));

    it('com cadastro vazio, entra com a senha inicial e cria o superusuário', async () => {
      const r = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'admin@admin.com.br', senha: '12345678910' });
      expect(r.status).toBe(200);
      expect(r.body.usuario).toMatchObject({
        login: 'admin@admin.com.br',
        perfis: ['SUPERUSUARIO'],
        deveTrocarSenha: true,
      });
      expect(r.body.usuario.senhaHash).toBeUndefined();
      expect(await ctx.prisma.usuario.count()).toBe(1);
      const aud = await ctx.prisma.registroAuditoria.findFirst({ where: { acao: 'CRIAR_ADMIN_INICIAL' } });
      expect(aud).not.toBeNull();
    });

    it('com cadastro vazio, senha errada é recusada e nada é criado', async () => {
      const r = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'admin@admin.com.br', senha: 'errada' });
      expect(r.status).toBe(401);
      expect(r.body.mensagem).toBe('Login ou senha inválidos.');
      expect(await ctx.prisma.usuario.count()).toBe(0);
    });

    it('havendo outro usuário, a senha inicial não cria o admin (regra normal)', async () => {
      await ctx.prisma.usuario.create({
        data: {
          nome: 'Outro',
          login: 'outro@x.com',
          senhaHash: await hashSenha('qualquer123'),
          perfis: ['PCP'],
        },
      });
      const r = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'admin@admin.com.br', senha: '12345678910' });
      expect(r.status).toBe(401);
      expect(await ctx.prisma.usuario.count()).toBe(1);
    });
  });

  describe('sessão', () => {
    beforeAll(async () => prepararComDadosExemplo(ctx.prisma));

    it('login normal, /eu, renovação com rotação e saída', async () => {
      const login = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .set('x-dispositivo', 'tablet-1')
        .send({ login: 'PCP@exemplo.com.br', senha: SENHA_EXEMPLO });
      expect(login.status).toBe(200);
      const eu = await ctx.http().get('/api/autenticacao/eu').set(auth(login.body.tokenAcesso));
      expect(eu.body).toMatchObject({ login: 'pcp@exemplo.com.br', perfis: ['PCP'] });

      const renovado = await ctx
        .http()
        .post('/api/autenticacao/renovar')
        .send({ tokenRenovacao: login.body.tokenRenovacao });
      expect(renovado.status).toBe(200);
      expect(renovado.body.tokenRenovacao).not.toBe(login.body.tokenRenovacao);
      // O token antigo deixa de valer após a rotação.
      const reuso = await ctx
        .http()
        .post('/api/autenticacao/renovar')
        .send({ tokenRenovacao: login.body.tokenRenovacao });
      expect(reuso.status).toBe(401);

      await ctx
        .http()
        .post('/api/autenticacao/sair')
        .send({ tokenRenovacao: renovado.body.tokenRenovacao })
        .expect(204);
      const aposSair = await ctx
        .http()
        .post('/api/autenticacao/renovar')
        .send({ tokenRenovacao: renovado.body.tokenRenovacao });
      expect(aposSair.status).toBe(401);
    });

    it('novo login no mesmo dispositivo revoga a sessão anterior desse dispositivo', async () => {
      const a = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .set('x-dispositivo', 'tab-x')
        .send({ login: 'lider@exemplo.com.br', senha: SENHA_EXEMPLO });
      const b = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .set('x-dispositivo', 'tab-y')
        .send({ login: 'lider@exemplo.com.br', senha: SENHA_EXEMPLO });
      await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .set('x-dispositivo', 'tab-x')
        .send({ login: 'lider@exemplo.com.br', senha: SENHA_EXEMPLO });
      expect(
        (await ctx.http().post('/api/autenticacao/renovar').send({ tokenRenovacao: a.body.tokenRenovacao }))
          .status,
      ).toBe(401);
      expect(
        (await ctx.http().post('/api/autenticacao/renovar').send({ tokenRenovacao: b.body.tokenRenovacao }))
          .status,
      ).toBe(200);
    });

    it('sem token ou com token inválido retorna 401', async () => {
      expect((await ctx.http().get('/api/maquinas')).status).toBe(401);
      expect((await ctx.http().get('/api/maquinas').set(auth('invalido'))).status).toBe(401);
    });

    it('usuário inativo não entra e perde o acesso imediatamente', async () => {
      const r = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'estoque@exemplo.com.br', senha: SENHA_EXEMPLO });
      await ctx.prisma.usuario.update({ where: { login: 'estoque@exemplo.com.br' }, data: { ativo: false } });
      expect((await ctx.http().get('/api/maquinas').set(auth(r.body.tokenAcesso))).status).toBe(401);
      const novo = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'estoque@exemplo.com.br', senha: SENHA_EXEMPLO });
      expect(novo.status).toBe(401);
      await ctx.prisma.usuario.update({ where: { login: 'estoque@exemplo.com.br' }, data: { ativo: true } });
    });

    it('troca de senha exige a senha atual e é auditada', async () => {
      const r = await ctx
        .http()
        .post('/api/autenticacao/entrar')
        .send({ login: 'admin@admin.com.br', senha: '12345678910' });
      const t = r.body.tokenAcesso;
      const errada = await ctx
        .http()
        .post('/api/autenticacao/trocar-senha')
        .set(auth(t))
        .send({ senhaAtual: 'x', novaSenha: 'NovaSenha#2026' });
      expect(errada.status).toBe(422);
      await ctx
        .http()
        .post('/api/autenticacao/trocar-senha')
        .set(auth(t))
        .send({ senhaAtual: '12345678910', novaSenha: 'NovaSenha#2026' })
        .expect(204);
      const eu = await ctx.http().get('/api/autenticacao/eu').set(auth(t));
      expect(eu.body.deveTrocarSenha).toBe(false);
      expect(
        (
          await ctx
            .http()
            .post('/api/autenticacao/entrar')
            .send({ login: 'admin@admin.com.br', senha: 'NovaSenha#2026' })
        ).status,
      ).toBe(200);
      const aud = await ctx.prisma.registroAuditoria.findFirst({ where: { acao: 'TROCAR_SENHA' } });
      expect(JSON.stringify(aud?.valorNovo)).not.toContain('NovaSenha');
    });
  });
});
