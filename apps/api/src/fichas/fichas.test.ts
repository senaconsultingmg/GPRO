import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('RN-02 — compatibilidade e fichas técnicas versionadas', () => {
  let ctx: Contexto;
  let su: string;
  let pcp: string;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    su = t.SUPERUSUARIO;
    pcp = t.PCP;
    for (const m of await ctx.prisma.maquina.findMany()) ids[m.codigo] = m.id;
    for (const m of await ctx.prisma.molde.findMany()) ids[m.codigo] = m.id;
    for (const p of await ctx.prisma.produto.findMany()) ids[p.codigo] = p.id;
  });
  afterAll(async () => ctx.app.close());

  it('tela do molde: lista máquinas compatíveis e o critério que falhou nas incompatíveis', async () => {
    const r = await ctx.http().get(`/api/moldes/${ids['MOL-MES-1']}/compatibilidade`).set(auth(pcp));
    expect(r.status).toBe(200);
    const porCodigo = Object.fromEntries(
      r.body.map((x: { maquina: { codigo: string } }) => [x.maquina.codigo, x]),
    );
    expect(porCodigo['INJ-02'].compativel).toBe(true);
    expect(porCodigo['INJ-03'].compativel).toBe(false);
    expect(porCodigo['INJ-03'].falhas.map((f: { criterio: string }) => f.criterio)).toContain(
      'FORCA_FECHAMENTO',
    );
    expect(porCodigo['EXT-01']).toBeUndefined();
  });

  it('alocar molde em máquina incompatível é recusado com os critérios que falharam', async () => {
    const r = await ctx.http().post('/api/fichas-tecnicas').set(auth(pcp)).send({
      produtoId: ids['MES-0010'],
      moldeId: ids['MOL-MES-1'],
      maquinaId: ids['INJ-01'],
      cicloS: 90,
      cavidades: 1,
    });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toBe('O molde MOL-MES-1 não é compatível com a máquina INJ-01.');
    expect(r.body.detalhes.map((d: { criterio: string }) => d.criterio)).toEqual(
      expect.arrayContaining([
        'COLUNAS',
        'ALTURA_MOLDE',
        'PESO_MOLDE',
        'FORCA_FECHAMENTO',
        'CAPACIDADE_INJECAO',
      ]),
    );
  });

  it('cria ficha em rascunho com PH calculado (3600 ÷ ciclo × cavidades)', async () => {
    const r = await ctx
      .http()
      .post('/api/fichas-tecnicas')
      .set(auth(pcp))
      .send({
        produtoId: ids['BAL-0005'],
        moldeId: ids['MOL-BAL-2'],
        maquinaId: ids['INJ-01'],
        cicloS: 32,
        cavidades: 2,
        pesoPadraoG: 210,
        toleranciaPesoPct: 3,
        parametrosProcesso: [{ nome: 'Temperatura zona 1', valor: '215', unidade: '°C' }],
        composicao: [{ materialId: ids['EXT-PP-REC'], consumoGPorPeca: 205 }],
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ situacao: 'RASCUNHO', versao: 1, phPadrao: 225, phCalculado: true });
    expect(r.body.composicao).toHaveLength(1);
  });

  it('extrusão: ficha por produto + máquina, sem molde, PH em kg/h obrigatório', async () => {
    const comMolde = await ctx.http().post('/api/fichas-tecnicas').set(auth(pcp)).send({
      produtoId: ids['EXT-PP-REC'],
      moldeId: ids['MOL-BAL-2'],
      maquinaId: ids['EXT-01'],
      phPadrao: 90,
      cavidades: 1,
    });
    expect(comMolde.status).toBe(422);
    const semPh = await ctx
      .http()
      .post('/api/fichas-tecnicas')
      .set(auth(pcp))
      .send({ produtoId: ids['EXT-PP-REC'], maquinaId: ids['EXT-01'], cicloS: 10, cavidades: 1 });
    expect(semPh.status).toBe(422);
  });

  it('ficha vigente não é editada: alteração cria nova versão; ao aprovar, a anterior vira obsoleta e segue consultável', async () => {
    const v1 = await ctx.prisma.fichaTecnica.findFirstOrThrow({
      where: { produtoId: ids['CAD-0031'], situacao: 'VIGENTE' },
    });
    const corpo = {
      produtoId: v1.produtoId,
      moldeId: v1.moldeId,
      maquinaId: v1.maquinaId,
      cicloS: 55,
      cavidades: 1,
      pesoPadraoG: 380,
      toleranciaPesoPct: 3,
      composicao: [{ materialId: ids['PP-H103'], consumoGPorPeca: 372 }],
    };
    // Edição direta da vigente é recusada.
    const direta = await ctx.http().put(`/api/fichas-tecnicas/${v1.id}`).set(auth(pcp)).send(corpo);
    expect(direta.status).toBe(409);
    expect(direta.body.mensagem).toMatch(/nova versão/);

    // Nova versão em rascunho (cópia da vigente), editável pelo PCP.
    const nova = await ctx.http().post(`/api/fichas-tecnicas/${v1.id}/nova-versao`).set(auth(pcp));
    expect(nova.status).toBe(201);
    expect(nova.body).toMatchObject({ versao: 2, situacao: 'RASCUNHO', cicloS: 60 });
    const segundoRascunho = await ctx.http().post(`/api/fichas-tecnicas/${v1.id}/nova-versao`).set(auth(pcp));
    expect(segundoRascunho.status).toBe(409);

    const editada = await ctx.http().put(`/api/fichas-tecnicas/${nova.body.id}`).set(auth(pcp)).send(corpo);
    expect(editada.status, JSON.stringify(editada.body)).toBe(200);
    expect(editada.body).toMatchObject({ cicloS: 55, phPadrao: 65.45 });

    // PCP não aprova; superusuário aprova (P9).
    expect(
      (await ctx.http().post(`/api/fichas-tecnicas/${nova.body.id}/aprovar`).set(auth(pcp))).status,
    ).toBe(403);
    const aprovada = await ctx.http().post(`/api/fichas-tecnicas/${nova.body.id}/aprovar`).set(auth(su));
    expect(aprovada.status).toBe(200);
    expect(aprovada.body).toMatchObject({ situacao: 'VIGENTE', aprovador: { nome: 'Administrador' } });

    const antiga = await ctx.http().get(`/api/fichas-tecnicas/${v1.id}`).set(auth(pcp));
    expect(antiga.body).toMatchObject({ situacao: 'OBSOLETA', cicloS: 60, versao: 1 });
    expect(antiga.body.obsoletaEm).toBeTruthy();

    const historico = await ctx.http().get(`/api/fichas-tecnicas/${nova.body.id}/historico`).set(auth(pcp));
    expect(
      historico.body.map((f: { versao: number; situacao: string }) => `${f.versao}:${f.situacao}`),
    ).toEqual(['2:VIGENTE', '1:OBSOLETA']);

    // Obsoleta também não é editada.
    expect((await ctx.http().put(`/api/fichas-tecnicas/${v1.id}`).set(auth(pcp)).send(corpo)).status).toBe(
      409,
    );

    const acoes = await ctx.prisma.registroAuditoria.findMany({
      where: { entidade: 'FichaTecnica', entidadeId: { in: [v1.id, nova.body.id] } },
      orderBy: { id: 'asc' },
    });
    expect(acoes.map((a) => a.acao)).toEqual(['NOVA_VERSAO', 'ATUALIZAR', 'OBSOLETAR', 'APROVAR']);
  });

  it('reprovação mantém o rascunho com parecer', async () => {
    const v = await ctx.prisma.fichaTecnica.findFirstOrThrow({
      where: { produtoId: ids['FRA-0002'], situacao: 'VIGENTE' },
    });
    const nova = await ctx.http().post(`/api/fichas-tecnicas/${v.id}/nova-versao`).set(auth(pcp));
    const r = await ctx
      .http()
      .post(`/api/fichas-tecnicas/${nova.body.id}/reprovar`)
      .set(auth(su))
      .send({ parecer: 'Ciclo incoerente com o teste de máquina.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      situacao: 'RASCUNHO',
      parecerReprovacao: 'Ciclo incoerente com o teste de máquina.',
    });
    const vigente = await ctx.http().get(`/api/fichas-tecnicas/${v.id}`).set(auth(pcp));
    expect(vigente.body.situacao).toBe('VIGENTE');
  });

  it('não permite mudar produto/molde/máquina de um rascunho', async () => {
    const rasc = await ctx.prisma.fichaTecnica.findFirstOrThrow({
      where: { produtoId: ids['FRA-0002'], situacao: 'RASCUNHO' },
    });
    const r = await ctx.http().put(`/api/fichas-tecnicas/${rasc.id}`).set(auth(pcp)).send({
      produtoId: ids['BAL-0005'],
      moldeId: rasc.moldeId,
      maquinaId: rasc.maquinaId,
      cicloS: 20,
      cavidades: 4,
    });
    expect(r.status).toBe(422);
  });
});
