import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('Usuários', () => {
  let ctx: Contexto;
  let su: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    su = (await tokensPorPerfil(ctx)).SUPERUSUARIO;
  });
  afterAll(async () => ctx.app.close());

  it('cria usuário com vários perfis, sem expor a senha, e ele consegue entrar', async () => {
    const r = await ctx
      .http()
      .post('/api/usuarios')
      .set(auth(su))
      .send({ nome: 'Ana', login: 'Ana@Fabrica.com', senha: 'senhaForte1', perfis: ['APONTADOR', 'LIDER'] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      login: 'ana@fabrica.com',
      perfis: ['APONTADOR', 'LIDER'],
      deveTrocarSenha: true,
    });
    expect(r.body.senhaHash).toBeUndefined();
    const lista = await ctx.http().get('/api/usuarios').set(auth(su));
    expect(JSON.stringify(lista.body)).not.toContain('senhaHash');
    expect(
      (
        await ctx
          .http()
          .post('/api/autenticacao/entrar')
          .send({ login: 'ana@fabrica.com', senha: 'senhaForte1' })
      ).status,
    ).toBe(200);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'Usuario', entidadeId: r.body.id, acao: 'CRIAR' },
    });
    expect((aud?.valorNovo as Record<string, unknown>).senha).toBe('***');
  });

  it('redefinir senha é auditado com valor mascarado', async () => {
    const u = await ctx.prisma.usuario.findUniqueOrThrow({ where: { login: 'ana@fabrica.com' } });
    const r = await ctx
      .http()
      .put(`/api/usuarios/${u.id}`)
      .set(auth(su))
      .send({ nome: 'Ana Souza', login: u.login, perfis: u.perfis, senha: 'outraSenha2', ativo: true });
    expect(r.status).toBe(200);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'Usuario', entidadeId: u.id },
      orderBy: { id: 'desc' },
    });
    expect(aud?.acao).toBe('ATUALIZAR_E_REDEFINIR_SENHA');
    expect(aud?.valorNovo).toMatchObject({ nome: 'Ana Souza', senhaHash: '***' });
  });

  it('superusuário não pode se inativar nem remover o próprio perfil', async () => {
    const eu = await ctx.prisma.usuario.findUniqueOrThrow({ where: { login: 'admin@admin.com.br' } });
    const base = { nome: eu.nome, login: eu.login, perfis: eu.perfis, ativo: true };
    expect(
      (
        await ctx
          .http()
          .put(`/api/usuarios/${eu.id}`)
          .set(auth(su))
          .send({ ...base, ativo: false })
      ).status,
    ).toBe(422);
    expect(
      (
        await ctx
          .http()
          .put(`/api/usuarios/${eu.id}`)
          .set(auth(su))
          .send({ ...base, perfis: ['PCP'] })
      ).status,
    ).toBe(422);
  });
});
