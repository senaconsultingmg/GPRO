import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('Escala de turnos', () => {
  let ctx: Contexto;
  let su: string;
  let apontador: string;
  const h: Record<string, string> = {};
  const e: Record<string, string> = {};
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    su = t.SUPERUSUARIO;
    apontador = t.APONTADOR;
    for (const x of await ctx.prisma.horarioTurno.findMany()) h[x.nome] = x.id;
    for (const x of await ctx.prisma.equipe.findMany()) e[x.letra] = x.id;
  });
  afterAll(async () => ctx.app.close());

  const cicloPadrao = () => [
    [
      { horarioTurnoId: h.Dia, equipeId: e.A },
      { horarioTurnoId: h.Noite, equipeId: e.B },
    ],
    [
      { horarioTurnoId: h.Dia, equipeId: e.C },
      { horarioTurnoId: h.Noite, equipeId: e.D },
    ],
  ];

  it('gera a escala 12x36 automaticamente a partir de uma data inicial', async () => {
    const r = await ctx.http().post('/api/escalas/gerar').set(auth(su)).send({
      modalidade: 'REVEZAMENTO',
      dataInicial: '2026-12-01',
      dataFinal: '2026-12-04',
      ciclo: cicloPadrao(),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toEqual({ geradas: 8, substituidas: 0, ignoradas: 0 });
    const lista = await ctx.http().get('/api/escalas?de=2026-12-01&ate=2026-12-04').set(auth(apontador));
    expect(
      lista.body.map(
        (l: { data: string; horarioTurno: { nome: string }; equipe: { letra: string } }) =>
          `${l.data.slice(8)} ${l.horarioTurno.nome} ${l.equipe.letra}`,
      ),
    ).toEqual([
      '01 Dia A',
      '01 Noite B',
      '02 Dia C',
      '02 Noite D',
      '03 Dia A',
      '03 Noite B',
      '04 Dia C',
      '04 Noite D',
    ]);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'Escala', acao: 'GERAR' },
    });
    expect(aud?.valorNovo).toMatchObject({ geradas: 8, ciclo: ['Dia=A, Noite=B', 'Dia=C, Noite=D'] });
  });

  it('gerar novamente substitui o período; sem substituir, mantém o existente', async () => {
    const ciclo = [
      [
        { horarioTurnoId: h.Dia, equipeId: e.B },
        { horarioTurnoId: h.Noite, equipeId: e.A },
      ],
    ];
    const semSubstituir = await ctx.http().post('/api/escalas/gerar').set(auth(su)).send({
      modalidade: 'REVEZAMENTO',
      dataInicial: '2026-12-01',
      dataFinal: '2026-12-02',
      ciclo,
      substituir: false,
    });
    expect(semSubstituir.body).toEqual({ geradas: 0, substituidas: 0, ignoradas: 4 });
    const substituindo = await ctx
      .http()
      .post('/api/escalas/gerar')
      .set(auth(su))
      .send({ modalidade: 'REVEZAMENTO', dataInicial: '2026-12-01', dataFinal: '2026-12-02', ciclo });
    expect(substituindo.body).toEqual({ geradas: 4, substituidas: 4, ignoradas: 0 });
  });

  it('horário central: só nos dias da semana do horário (08:00–17:48, seg a sex)', async () => {
    const r = await ctx.http().post('/api/escalas/gerar').set(auth(su)).send({
      modalidade: 'CENTRAL',
      dataInicial: '2026-12-04',
      dataFinal: '2026-12-08',
      horarioTurnoId: h.Central,
      equipeId: e.ADM,
    });
    expect(r.body.geradas).toBe(3); // sex 04, seg 07, ter 08
  });

  it('recusa horário de outra modalidade', async () => {
    const r = await ctx.http().post('/api/escalas/gerar').set(auth(su)).send({
      modalidade: 'CENTRAL',
      dataInicial: '2026-12-04',
      dataFinal: '2026-12-08',
      horarioTurnoId: h.Dia,
      equipeId: e.ADM,
    });
    expect(r.status).toBe(422);
  });

  it('troca a equipe de um dia, com auditoria; apontador não altera', async () => {
    const lista = await ctx.http().get('/api/escalas?de=2026-12-03&ate=2026-12-03').set(auth(su));
    const dia = lista.body.find((l: { horarioTurno: { nome: string } }) => l.horarioTurno.nome === 'Dia');
    expect(
      (await ctx.http().put(`/api/escalas/${dia.id}`).set(auth(apontador)).send({ equipeId: e.D })).status,
    ).toBe(403);
    const r = await ctx.http().put(`/api/escalas/${dia.id}`).set(auth(su)).send({ equipeId: e.D });
    expect(r.status).toBe(200);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'Escala', entidadeId: dia.id },
    });
    expect(aud).toMatchObject({
      acao: 'ATUALIZAR',
      valorAnterior: { equipeId: e.A },
      valorNovo: { equipeId: e.D },
    });
  });
});
