import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('Parâmetros do sistema', () => {
  let ctx: Contexto;
  let su: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    su = (await tokensPorPerfil(ctx)).SUPERUSUARIO;
  });
  afterAll(async () => ctx.app.close());

  it('lista os parâmetros iniciais (tolerância de horário 10 min, visão do recebimento "ambas")', async () => {
    const r = await ctx.http().get('/api/parametros').set(auth(su));
    const mapa = Object.fromEntries(r.body.map((p: { chave: string; valor: string }) => [p.chave, p.valor]));
    expect(mapa).toMatchObject({ tolerancia_horario_min: '10', visao_recebimento: 'AMBAS' });
  });

  it('valida o valor pelo tipo e audita a alteração', async () => {
    expect(
      (await ctx.http().put('/api/parametros/tolerancia_horario_min').set(auth(su)).send({ valor: 'dez' }))
        .status,
    ).toBe(422);
    expect(
      (await ctx.http().put('/api/parametros/visao_recebimento').set(auth(su)).send({ valor: 'TODAS' }))
        .status,
    ).toBe(422);
    const ok = await ctx
      .http()
      .put('/api/parametros/tolerancia_horario_min')
      .set(auth(su))
      .send({ valor: '15' });
    expect(ok.status).toBe(200);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'ParametroSistema', entidadeId: 'tolerancia_horario_min' },
    });
    expect(aud).toMatchObject({ valorAnterior: { valor: '10' }, valorNovo: { valor: '15' } });
  });

  it('parâmetro inexistente retorna 404', async () => {
    expect(
      (await ctx.http().put('/api/parametros/nao_existe').set(auth(su)).send({ valor: '1' })).status,
    ).toBe(404);
  });
});
