import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('RN-01 — ordens de produção', () => {
  let ctx: Contexto;
  let pcp: string;
  let apontador: string;
  const p: Record<string, string> = {};
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    pcp = t.PCP;
    apontador = t.APONTADOR;
    for (const x of await ctx.prisma.produto.findMany()) p[x.codigo] = x.id;
  });
  afterAll(async () => ctx.app.close());

  it('gera número interno sequencial e guarda o número do ERP; mostra os dois', async () => {
    const a = await ctx.http().post('/api/ordens').set(auth(pcp)).send({
      tipo: 'PRODUCAO',
      numeroErp: '1000001',
      produtoId: p['CAD-0031'],
      quantidade: 500,
      dataInicioPrevista: '2026-11-20',
      dataFimPrevista: '2026-11-22',
    });
    const b = await ctx
      .http()
      .post('/api/ordens')
      .set(auth(pcp))
      .send({ tipo: 'PRODUCAO', numeroErp: '1000002', produtoId: p['CAD-0031'], quantidade: 500 });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(b.body.numeroInterno).toBe(a.body.numeroInterno + 1);
    expect(a.body).toMatchObject({
      numeroErp: '1000001',
      unidade: 'PECA',
      situacao: 'ABERTA',
      produzido: 0,
      saldo: 500,
      dataInicioPrevista: '2026-11-20',
    });
    const lista = await ctx.http().get('/api/ordens?busca=1000001').set(auth(apontador));
    expect(lista.body.map((o: { numeroErp: string }) => o.numeroErp)).toEqual(['1000001']);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'OrdemProducao', entidadeId: a.body.id },
    });
    expect(aud?.acao).toBe('CRIAR');
  });

  it('número do ERP é obrigatório na produção e único', async () => {
    const sem = await ctx
      .http()
      .post('/api/ordens')
      .set(auth(pcp))
      .send({ tipo: 'PRODUCAO', produtoId: p['CAD-0031'], quantidade: 10 });
    expect(sem.status).toBe(400);
    expect(sem.body.detalhes[0]).toMatchObject({ campo: 'numeroErp' });
    const dup = await ctx
      .http()
      .post('/api/ordens')
      .set(auth(pcp))
      .send({ tipo: 'PRODUCAO', numeroErp: '1000001', produtoId: p['CAD-0031'], quantidade: 10 });
    expect(dup.status).toBe(409);
  });

  it('OP de extrusão não precisa de número do ERP (P10) e é em kg', async () => {
    const r = await ctx
      .http()
      .post('/api/ordens')
      .set(auth(pcp))
      .send({ tipo: 'EXTRUSAO', produtoId: p['EXT-PP-REC'], quantidade: 300 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ numeroErp: null, unidade: 'KG' });
    expect(
      (
        await ctx
          .http()
          .post('/api/ordens')
          .set(auth(pcp))
          .send({ tipo: 'EXTRUSAO', produtoId: p['CAD-0031'], quantidade: 3 })
      ).status,
    ).toBe(422);
  });

  it('só o PCP digita OP; OP sem apontamento pode ser alterada e cancelada', async () => {
    expect((await ctx.http().post('/api/ordens').set(auth(apontador)).send({})).status).toBe(403);
    const o = await ctx.prisma.ordemProducao.findUniqueOrThrow({ where: { numeroErp: '1000002' } });
    const alt = await ctx
      .http()
      .put(`/api/ordens/${o.id}`)
      .set(auth(pcp))
      .send({ tipo: 'PRODUCAO', numeroErp: '1000002', produtoId: p['CAD-0032'], quantidade: 700 });
    expect(alt.body).toMatchObject({ quantidade: 700, produto: { codigo: 'CAD-0032' } });
    expect((await ctx.http().post(`/api/ordens/${o.id}/cancelar`).set(auth(pcp))).body.situacao).toBe(
      'CANCELADA',
    );
  });
});
