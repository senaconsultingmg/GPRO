import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agregarFatos } from '@apontamento/shared';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

const H = 3_600_000;
const iso = (d: string, hora: number) => new Date(Date.parse(`${d}T00:00:00Z`) + hora * H).toISOString();

/** Fase 5: painel de acompanhamento em tempo real e painel de indicadores (seção 10). */
describe('Painéis e indicadores', () => {
  let ctx: Contexto;
  let t: Awaited<ReturnType<typeof tokensPorPerfil>>;
  const id: Record<string, string> = {};
  let ph = 0;
  let porConjunto = 0;
  const turnos: Record<string, string> = {};

  const post = (url: string, corpo: object, token = t.APONTADOR) =>
    ctx.http().post(url).set(auth(token)).set('x-posto', id['posto:T1']).send(corpo);
  const get = (url: string, token = t.PCP) => ctx.http().get(url).set(auth(token));

  /** Abre um turno numa data passada fixa, liga a INJ-01 e cria a divisão da OP do CAD-0031. */
  async function abrirTurno(data: string, equipe: string, inicio: number, fim: number) {
    const eq = await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: equipe } });
    const sug = await get('/api/turnos/sugestao', t.APONTADOR);
    const r = await post('/api/turnos', { ...sug.body, equipeId: eq.id });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const turno = r.body.id as string;
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: {
        data: new Date(`${data}T00:00:00Z`),
        inicioNominal: new Date(iso(data, inicio)),
        fimNominal: new Date(iso(data, fim)),
        abertoEm: new Date(iso(data, inicio)),
      },
    });
    const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id['INJ-01'] } });
    const lig = await post(`/api/turnos/${turno}/maquinas`, {
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: rodada.id,
      horaOcorrencia: iso(data, inicio),
    });
    expect(lig.status, JSON.stringify(lig.body)).toBe(201);
    const op = await ctx.prisma.rodadaOp.findFirstOrThrow({
      where: { rodadaId: rodada.id, ordem: { produto: { codigo: 'CAD-0031' } } },
      include: { fichaTecnica: true },
    });
    ph = op.fichaTecnica.phPadrao;
    const d = await post(`/api/turnos/${turno}/divisoes`, { rodadaOpId: op.id, maquinaId: id['INJ-01'] });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    return { turno, divisao: d.body.id as string };
  }

  const lancar = async (turno: string, corpo: Record<string, unknown>) => {
    const r = await post(`/api/turnos/${turno}/eventos`, {
      id: randomUUID(),
      maquinaId: id['INJ-01'],
      justificativa: 'Lançamento do teste em data passada',
      ...corpo,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body;
  };

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    t = await tokensPorPerfil(ctx);
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const d of await ctx.prisma.dispositivo.findMany()) id[`posto:${d.prefixo}`] = d.id;
    for (const h of await ctx.prisma.horarioTurno.findMany()) id[`horario:${h.nome}`] = h.id;
    for (const e of await ctx.prisma.equipe.findMany()) id[`equipe:${e.letra}`] = e.id;
    const programada = await ctx.prisma.motivoParada.findFirstOrThrow({
      where: { programada: true, geraSolicitacaoManutencao: false },
    });
    const naoProgramada = await ctx.prisma.motivoParada.findFirstOrThrow({ where: { programada: false } });
    id.programada = programada.id;
    id.naoProgramada = naoProgramada.id;
    await ctx.prisma.impressora.updateMany({ data: { enderecoIp: '127.0.0.1', porta: 9 } });
    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produto: { codigo: 'CAD-0031' } },
    });
    id.conjunto = conjunto.id;
    porConjunto = conjunto.quantidade;

    // Dia 1 (equipe A): ligada 10 h–22 h, refeição programada 14 h–15 h → planejado 11 h, produzindo 11 h.
    const a = await abrirTurno('2026-10-05', 'A', 10, 22);
    await lancar(a.turno, {
      tipo: 'SAIDA_PRODUCAO',
      horaOcorrencia: iso('2026-10-05', 12),
      divisaoId: a.divisao,
      conjuntoPadraoId: id.conjunto,
      conjuntosPadrao: 20,
      pesoMedioG: 384,
    });
    await lancar(a.turno, {
      tipo: 'PARADA',
      horaOcorrencia: iso('2026-10-05', 14),
      motivoParadaId: id.programada,
    });
    await lancar(a.turno, { tipo: 'REINICIO', horaOcorrencia: iso('2026-10-05', 15) });
    await lancar(a.turno, { tipo: 'FIM_MAQUINA', horaOcorrencia: iso('2026-10-05', 22) });
    expect((await post(`/api/turnos/${a.turno}/fechar`, { maquinas: [], saldos: [] })).status).toBe(200);
    turnos.a = a.turno;

    // Dia 2 (equipe B, horário Noite): ligada 10 h–12 h, quebra 10h30–11h30 → produzindo 1 h.
    const b = await abrirTurno('2026-10-06', 'B', 10, 22);
    await ctx.prisma.turnoApontamento.update({
      where: { id: b.turno },
      data: { horarioTurnoId: id['horario:Noite'] },
    });
    await lancar(b.turno, {
      tipo: 'PARADA',
      horaOcorrencia: iso('2026-10-06', 10.5),
      motivoParadaId: id.naoProgramada,
    });
    await lancar(b.turno, { tipo: 'REINICIO', horaOcorrencia: iso('2026-10-06', 11.5) });
    await lancar(b.turno, {
      tipo: 'SAIDA_PRODUCAO',
      horaOcorrencia: iso('2026-10-06', 11.75),
      divisaoId: b.divisao,
      conjuntoPadraoId: id.conjunto,
      conjuntosPadrao: 1,
      pesoMedioG: 384,
    });
    await lancar(b.turno, { tipo: 'FIM_MAQUINA', horaOcorrencia: iso('2026-10-06', 12) });
    expect((await post(`/api/turnos/${b.turno}/fechar`, { maquinas: [], saldos: [] })).status).toBe(200);
    turnos.b = b.turno;
  });
  afterAll(async () => ctx.app.close());

  const indicadores = async (q: string) => {
    const r = await get(`/api/indicadores?${q}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body;
  };

  it('fatores do dia conferem com valores conhecidos', async () => {
    const d1 = await indicadores('inicio=2026-10-05&fim=2026-10-05');
    const inj = d1.oeeMaquinas.find((m: { maquina: string }) => m.maquina === 'INJ-01');
    expect(inj).toMatchObject({
      horasLigado: 12,
      horasPlanejado: 11,
      horasProduzindo: 11,
      boas: 20 * porConjunto,
      refugadas: 0,
    });
    expect(inj.producaoEsperada).toBeCloseTo(11 * ph, 3);
    expect(inj.disponibilidade).toBe(1);
    expect(inj.performance).toBeCloseTo((20 * porConjunto) / (11 * ph), 4);
    expect(inj.qualidade).toBe(1);
    const d2 = await indicadores('inicio=2026-10-06&fim=2026-10-06');
    expect(d2.oeeMaquinas[0]).toMatchObject({
      horasLigado: 2,
      horasPlanejado: 2,
      horasProduzindo: 1,
      disponibilidade: 0.5,
    });
    expect(d2.paradas).toEqual([expect.objectContaining({ programada: false, minutos: 60, ocorrencias: 1 })]);
  });

  it('OEE do mês é calculado sobre tempos e quantidades somados, não como média dos dias', async () => {
    const mes = await indicadores('inicio=2026-10-01&fim=2026-10-31');
    expect(mes.filtros.granularidade).toBe('DIA');
    const inj = mes.oeeMaquinas.find((m: { maquina: string }) => m.maquina === 'INJ-01');
    expect(inj.turnos).toBe(2);
    expect(inj).toMatchObject({ horasLigado: 14, horasPlanejado: 13, horasProduzindo: 12 });
    const esperado = agregarFatos([
      {
        ligadoMs: 12 * H,
        planejadoMs: 11 * H,
        produzindoMs: 11 * H,
        producaoEsperada: 11 * ph,
        boas: 20 * porConjunto,
        refugadas: 0,
      },
      {
        ligadoMs: 2 * H,
        planejadoMs: 2 * H,
        produzindoMs: 1 * H,
        producaoEsperada: 1 * ph,
        boas: porConjunto,
        refugadas: 0,
      },
    ]);
    expect(inj.oee).toBeCloseTo(esperado.oee!, 4);
    expect(inj.disponibilidade).toBeCloseTo(12 / 13, 4);
    const [dia1, dia2] = mes.evolucao;
    expect([dia1.periodo, dia2.periodo]).toEqual(['2026-10-05', '2026-10-06']);
    expect(inj.oee).not.toBeCloseTo((dia1.oee + dia2.oee) / 2, 3);
    // Por mês: um ponto só, com o mesmo valor somado.
    const porMes = await indicadores('inicio=2026-10-01&fim=2026-10-31&granularidade=MES');
    expect(porMes.evolucao).toHaveLength(1);
    expect(porMes.evolucao[0]).toMatchObject({ periodo: '2026-10', oee: inj.oee });
    // Ano inteiro: granularidade automática por mês.
    expect((await indicadores('inicio=2026-01-01&fim=2026-12-31')).filtros.granularidade).toBe('MES');
  });

  it('filtros por equipe e por horário de turno; comparação entre equipes e horários', async () => {
    const mes = await indicadores('inicio=2026-10-01&fim=2026-10-31');
    expect(mes.equipes.map((e: { nome: string; turnos: number }) => [e.nome, e.turnos])).toEqual([
      ['A', 1],
      ['B', 1],
    ]);
    expect(mes.horarios.map((e: { nome: string }) => e.nome).sort()).toEqual(['Dia', 'Noite']);
    const soB = await indicadores(`inicio=2026-10-01&fim=2026-10-31&equipeId=${id['equipe:B']}`);
    expect(soB.turnos).toBe(1);
    expect(soB.oeeMaquinas[0]).toMatchObject({ horasLigado: 2, boas: porConjunto });
    const soNoite = await indicadores(
      `inicio=2026-10-01&fim=2026-10-31&horarioTurnoId=${id['horario:Noite']}`,
    );
    expect(soNoite.turnos).toBe(1);
    expect(soNoite.equipes.map((e: { nome: string }) => e.nome)).toEqual(['B']);
    const soDia = await indicadores(`inicio=2026-10-01&fim=2026-10-31&horarioTurnoId=${id['horario:Dia']}`);
    expect(soDia.oeeMaquinas[0].horasLigado).toBe(12);
    const outraMaquina = await indicadores(`inicio=2026-10-01&fim=2026-10-31&maquinaId=${id['EXT-01']}`);
    expect(outraMaquina.turnos).toBe(0);
    // Produção, PH e paradas.
    expect(mes.producaoProduto).toEqual([
      expect.objectContaining({ produto: 'CAD-0031', total: 21 * porConjunto }),
    ]);
    expect(mes.ph[0]).toMatchObject({
      maquina: 'INJ-01',
      produto: 'CAD-0031',
      phPadrao: ph,
      horasProduzindo: 12,
    });
    expect(
      mes.paradas.map((p: { programada: boolean; minutos: number }) => [p.programada, p.minutos]),
    ).toEqual([
      [true, 60],
      [false, 60],
    ]);
    // Validação dos filtros.
    expect((await get('/api/indicadores?inicio=2026-10-31&fim=2026-10-01')).status).toBe(400);
    expect((await get('/api/indicadores?inicio=2026-10-01&fim=2026-10-31', t.MANUTENCAO)).status).toBe(200);
  });

  it('tabela exporta para Excel com cabeçalhos e percentuais', async () => {
    const r = await ctx
      .http()
      .post('/api/indicadores/exportar')
      .set(auth(t.ESTOQUE))
      .send({
        titulo: 'OEE por máquina',
        colunas: [
          { chave: 'maquina', rotulo: 'Máquina' },
          { chave: 'oee', rotulo: 'OEE', formato: 'percentual' },
        ],
        linhas: [{ maquina: 'INJ-01', oee: 0.8123 }],
      })
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('oee-por-maquina.xlsx');
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(r.body as never);
    const p = livro.worksheets[0];
    expect((p.getRow(1).values as unknown[]).slice(1)).toEqual(['Máquina', 'OEE']);
    expect(p.getCell('B2').value).toBe(0.8123);
    expect(p.getCell('B2').numFmt).toBe('0.0%');
  });

  it('parada vira aviso em tempo real e o cartão da máquina fica parado com motivo e hora', async () => {
    await ctx.app.listen(0);
    const porta = (ctx.app.getHttpServer().address() as AddressInfo).port;
    const controle = new AbortController();
    const resposta = await fetch(`http://127.0.0.1:${porta}/api/painel/fluxo`, {
      headers: auth(t.MANUTENCAO),
      signal: controle.signal,
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toContain('text/event-stream');
    const leitor = resposta.body!.getReader();

    const eq = await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: 'A' } });
    const sug = await get('/api/turnos/sugestao', t.APONTADOR);
    const turno = (await post('/api/turnos', { ...sug.body, equipeId: eq.id })).body.id as string;
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: { inicioNominal: new Date(Date.now() - 6 * H), fimNominal: new Date(Date.now() + 6 * H) },
    });
    const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id['INJ-01'] } });
    await post(`/api/turnos/${turno}/maquinas`, {
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: rodada.id,
      horaOcorrencia: new Date(Date.now() - H).toISOString(),
    });
    const op = await ctx.prisma.rodadaOp.findFirstOrThrow({
      where: { rodadaId: rodada.id, ordem: { produto: { codigo: 'CAD-0031' } } },
    });
    expect(
      (await post(`/api/turnos/${turno}/divisoes`, { rodadaOpId: op.id, maquinaId: id['INJ-01'] })).status,
    ).toBe(201);
    const antes = await get('/api/painel/acompanhamento', t.ESTOQUE);
    expect(
      antes.body.maquinas.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01')
        .situacao,
    ).toBe('LIGADA');

    const hora = new Date(Date.now() - 60_000).toISOString();
    await post(`/api/turnos/${turno}/eventos`, {
      id: randomUUID(),
      tipo: 'PARADA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: hora,
      motivoParadaId: id.naoProgramada,
    });

    // O fluxo entrega o aviso da alteração daquele turno.
    const decodificador = new TextDecoder();
    let texto = '';
    const limite = Date.now() + 5000;
    while (!texto.includes(`"turnoId":"${turno}"`) && Date.now() < limite) {
      const { value, done } = await Promise.race([
        leitor.read(),
        new Promise<{ value: undefined; done: true }>((ok) =>
          setTimeout(() => ok({ value: undefined, done: true }), 5000),
        ),
      ]);
      if (value) texto += decodificador.decode(value);
      if (done) break;
    }
    controle.abort();
    expect(texto).toContain('event: alteracao');
    expect(texto).toContain(`"turnoId":"${turno}"`);

    const depois = await get('/api/painel/acompanhamento', t.ESTOQUE);
    const cartao = depois.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01',
    );
    const motivo = await ctx.prisma.motivoParada.findUniqueOrThrow({ where: { id: id.naoProgramada } });
    expect(cartao).toMatchObject({
      situacao: 'PARADA',
      desde: hora,
      parada: { motivo: `${motivo.codigo} — ${motivo.descricao}`, programada: false },
      turno: { equipe: 'A' },
    });
    expect(cartao.ops[0]).toMatchObject({
      divisao: expect.stringMatching(/-\d{2}$/),
      produto: { codigo: 'CAD-0031' },
      produzidoOp: 21 * porConjunto,
    });
    expect(cartao.ops[0].percentual).toBeGreaterThan(0);
    const outra = depois.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'EXT-01',
    );
    expect(outra.situacao).toBe('DESLIGADA');
  });
});
