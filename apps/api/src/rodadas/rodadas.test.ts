import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('RN-03 — rodadas', () => {
  let ctx: Contexto;
  let pcp: string;
  let apontador: string;
  const id: Record<string, string> = {};
  const novaOp = async (numeroErp: string, produto: string, tipo = 'PRODUCAO') =>
    (
      await ctx
        .http()
        .post('/api/ordens')
        .set(auth(pcp))
        .send({
          tipo,
          numeroErp: tipo === 'PRODUCAO' ? numeroErp : null,
          produtoId: id[produto],
          quantidade: 100,
        })
    ).body.id as string;

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    pcp = t.PCP;
    apontador = t.APONTADOR;
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const m of await ctx.prisma.molde.findMany()) id[m.codigo] = m.id;
    for (const p of await ctx.prisma.produto.findMany()) id[p.codigo] = p.id;
    // Libera as OPs do exemplo para os testes: encerra as rodadas carregadas.
    await ctx.prisma.rodada.updateMany({ data: { situacao: 'ENCERRADA' } });
  });
  afterAll(async () => ctx.app.close());

  it('cria rodada com 3 OPs no mesmo molde, cada uma com cavidades e ficha vigente congelada', async () => {
    const ops = [
      await novaOp('R-1', 'CAD-0031'),
      await novaOp('R-2', 'CAD-0032'),
      await novaOp('R-3', 'CAD-0033'),
    ];
    const r = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['INJ-01'],
        moldeId: id['MOL-CAD-3'],
        ops: ops.map((ordemId, i) => ({ ordemId, cavidades: [i + 1] })),
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({
      situacao: 'PLANEJADA',
      maquina: { codigo: 'INJ-01' },
      molde: { codigo: 'MOL-CAD-3' },
    });
    expect(
      r.body.ops.map((o: { cavidades: number[]; fichaTecnica: { versao: number } }) => [
        o.cavidades,
        o.fichaTecnica.versao,
      ]),
    ).toEqual([
      [[1], 1],
      [[2], 1],
      [[3], 1],
    ]);
    // A mesma OP não entra em outra rodada não encerrada.
    const dup = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['INJ-01'],
        moldeId: id['MOL-CAD-3'],
        ops: [{ ordemId: ops[0], cavidades: [1] }],
      });
    expect(dup.status).toBe(409);
  });

  it('recusa molde incompatível com o critério (RN-02)', async () => {
    const op = await novaOp('R-4', 'MES-0010');
    const r = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({ maquinaId: id['INJ-01'], moldeId: id['MOL-MES-1'], ops: [{ ordemId: op, cavidades: [1] }] });
    expect(r.status).toBe(422);
    expect(r.body.detalhes.map((d: { criterio: string }) => d.criterio)).toContain('FORCA_FECHAMENTO');
  });

  it('exige ficha técnica vigente para produto + molde + máquina', async () => {
    const op = await novaOp('R-5', 'BAL-0005');
    const r = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({ maquinaId: id['INJ-01'], moldeId: id['MOL-BAL-2'], ops: [{ ordemId: op, cavidades: [1, 2] }] });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(
      /Não há ficha técnica vigente para BAL-0005 no molde MOL-BAL-2 na máquina INJ-01/,
    );
  });

  it('valida cavidades: produto da cavidade, repetição e quantidade da ficha', async () => {
    const a = await novaOp('R-6', 'CAD-0031');
    const b = await novaOp('R-7', 'CAD-0032');
    const errado = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({ maquinaId: id['INJ-01'], moldeId: id['MOL-CAD-3'], ops: [{ ordemId: a, cavidades: [2] }] });
    expect(errado.status).toBe(422);
    expect(errado.body.detalhes[0].mensagem).toMatch(/cavidade 2 produz outro produto/);
    const repetida = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['INJ-01'],
        moldeId: id['MOL-CAD-3'],
        ops: [
          { ordemId: a, cavidades: [1] },
          { ordemId: b, cavidades: [1] },
        ],
      });
    expect(repetida.body.detalhes.map((d: { mensagem: string }) => d.mensagem).join(' ')).toMatch(
      /mais de uma OP/,
    );
    const quantidade = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['INJ-03'],
        moldeId: id['MOL-BAL-2'],
        ops: [{ ordemId: await novaOp('R-8', 'BAL-0005'), cavidades: [1] }],
      });
    expect(quantidade.body.detalhes[0].mensagem).toMatch(/prevê 2 cavidade/);
  });

  it('extrusora: rodada com uma única OP e sem molde', async () => {
    const e1 = await novaOp('', 'EXT-PP-REC', 'EXTRUSAO');
    const e2 = await novaOp('', 'EXT-PP-REC', 'EXTRUSAO');
    const duas = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({ maquinaId: id['EXT-01'], ops: [{ ordemId: e1 }, { ordemId: e2 }] });
    expect(duas.status).toBe(422);
    const ok = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({ maquinaId: id['EXT-01'], ops: [{ ordemId: e1 }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.molde).toBeNull();
  });

  it('só o PCP cria rodadas; rodada planejada pode ser alterada e encerrada', async () => {
    expect((await ctx.http().post('/api/rodadas').set(auth(apontador)).send({})).status).toBe(403);
    const op = await novaOp('R-9', 'FRA-0002');
    const r = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['SOP-01'],
        moldeId: id['MOL-FRA-4'],
        ops: [{ ordemId: op, cavidades: [1, 2, 3, 4] }],
      });
    const alt = await ctx
      .http()
      .put(`/api/rodadas/${r.body.id}`)
      .set(auth(pcp))
      .send({
        maquinaId: id['SOP-01'],
        moldeId: id['MOL-FRA-4'],
        ops: [{ ordemId: op, cavidades: [1, 2, 3, 4] }],
        observacao: 'Prioridade',
      });
    expect(alt.body.observacao).toBe('Prioridade');
    const enc = await ctx.http().post(`/api/rodadas/${r.body.id}/encerrar`).set(auth(pcp));
    expect(enc.body.situacao).toBe('ENCERRADA');
    expect(
      (
        await ctx
          .http()
          .put(`/api/rodadas/${r.body.id}`)
          .set(auth(pcp))
          .send({
            maquinaId: id['SOP-01'],
            moldeId: id['MOL-FRA-4'],
            ops: [{ ordemId: op, cavidades: [1, 2, 3, 4] }],
          })
      ).status,
    ).toBe(409);
  });
});
