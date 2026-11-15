import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  entrar,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

const H = 3_600_000;

/**
 * Fluxo completo de dois turnos com a rodada de 3 OPs no MOL-CAD-3 (INJ-01).
 * RN-04, RN-05, RN-06, RN-07, RN-08, RN-11 e RN-13 (fechamento e relatório).
 */
describe('Turno de apontamento — fluxo completo', () => {
  let ctx: Contexto;
  let apontador: string;
  let apontador2: string;
  let pcp: string;
  const id: Record<string, string> = {};
  const base = Date.now();
  const em = (horas: number) => new Date(base + horas * H).toISOString();
  let turno1: string;
  let turno2: string;
  const div: Record<string, string> = {};
  let conjuntoCad1: string;

  /** Os testes rodam a qualquer hora: a janela nominal do turno é fixada em base ± 6 h. */
  const ajustarJanela = (turnoId: string) =>
    ctx.prisma.turnoApontamento.update({
      where: { id: turnoId },
      data: { inicioNominal: new Date(base - 6 * H), fimNominal: new Date(base + 6 * H) },
    });

  /** Sugestão de abertura; sem escala carregada no teste, usa a equipe A. */
  const corpoAbertura = async (token: string) => {
    const s = await ctx.http().get('/api/turnos/sugestao').set(auth(token));
    return { ...s.body, equipeId: s.body.equipeId ?? id['equipe:A'] };
  };

  const lancar = (turnoId: string, token: string, corpo: Record<string, unknown>) =>
    ctx
      .http()
      .post(`/api/turnos/${turnoId}/eventos`)
      .set(auth(token))
      .set('x-posto', id['posto:T1'])
      .send({ id: randomUUID(), ...corpo });

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    apontador = t.APONTADOR;
    pcp = t.PCP;
    apontador2 = await entrar(ctx, 'apontador2@exemplo.com.br');
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const p of await ctx.prisma.produto.findMany()) id[p.codigo] = p.id;
    for (const m of await ctx.prisma.motivoParada.findMany()) id[`motivo:${m.codigo}`] = m.id;
    for (const tp of await ctx.prisma.tipoPerda.findMany()) id[`perda:${tp.descricao}`] = tp.id;
    for (const o of await ctx.prisma.ordemProducao.findMany()) id[o.numeroErp ?? 'EXT'] = o.id;
    for (const r of await ctx.prisma.rodada.findMany()) id[`rodada:${r.maquinaId}`] = r.id;
    id['posto:T1'] = (await ctx.prisma.dispositivo.findUniqueOrThrow({ where: { prefixo: 'T1' } })).id;
    for (const l of await ctx.prisma.loteMaterial.findMany({ include: { material: true } }))
      id[`lote:${l.material.codigo}`] = l.numero;
    id['equipe:A'] = (await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: 'A' } })).id;
    conjuntoCad1 = (
      await ctx.prisma.conjuntoPadrao.findFirstOrThrow({ where: { produtoId: id['CAD-0031'] } })
    ).id;
  });
  afterAll(async () => ctx.app.close());

  it('RN-04: abre o turno com horário e equipe sugeridos pela escala; só apontador abre', async () => {
    // Com escala carregada, a equipe sugerida é a do dia.
    const hoje = await ctx.http().get('/api/turnos/sugestao').set(auth(apontador));
    await ctx.prisma.escala.create({
      data: {
        data: new Date(`${hoje.body.data}T00:00:00Z`),
        horarioTurnoId: hoje.body.horarioTurnoId,
        equipeId: id['equipe:A'],
      },
    });
    const sug = await ctx.http().get('/api/turnos/sugestao').set(auth(apontador));
    expect(sug.status).toBe(200);
    expect(sug.body).toMatchObject({ horarioTurnoId: hoje.body.horarioTurnoId, equipeId: id['equipe:A'] });
    expect((await ctx.http().post('/api/turnos').set(auth(pcp)).send(sug.body)).status).toBe(403);
    const r = await ctx.http().post('/api/turnos').set(auth(apontador)).send(sug.body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.situacao).toBe('ABERTO');
    turno1 = r.body.id;
    await ajustarJanela(turno1);
    expect((await ctx.http().post('/api/turnos').set(auth(apontador)).send(sug.body)).status).toBe(409);
  });

  it('RN-04: liga a máquina (evento de início) e propõe a divisão com código e meta', async () => {
    const disp = await ctx.http().get(`/api/turnos/${turno1}/maquinas-disponiveis`).set(auth(apontador));
    const inj = disp.body.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01');
    expect(inj.rodadas).toHaveLength(1);
    expect(inj.rodadas[0].ops).toHaveLength(3);
    const rodadaId = inj.rodadas[0].id;

    const r = await ctx
      .http()
      .post(`/api/turnos/${turno1}/maquinas`)
      .set(auth(apontador))
      .send({ eventoId: randomUUID(), maquinaId: id['INJ-01'], rodadaId, horaOcorrencia: em(-5) });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const maquina = r.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01',
    );
    expect(maquina.estado.situacao).toBe('LIGADA');
    expect((await ctx.prisma.rodada.findUniqueOrThrow({ where: { id: rodadaId } })).situacao).toBe(
      'EM_ANDAMENTO',
    );

    for (const op of maquina.rodada.ops) {
      const p = await ctx
        .http()
        .get(`/api/turnos/${turno1}/divisoes/proposta?rodadaOpId=${op.id}&maquinaId=${id['INJ-01']}`)
        .set(auth(apontador));
      expect(p.status).toBe(200);
      // 11 h de máquina até o fim nominal − 60 min de parada programada prevista = 10 h × PH 60.
      expect(p.body).toMatchObject({
        sequencial: 1,
        codigo: `${op.ordem.numeroErp}-01`,
        horasDisponiveis: 10,
        phReferencia: 60,
      });
      expect(p.body.meta).toBe(Math.min(600, op.ordem.quantidade));
      const d = await ctx
        .http()
        .post(`/api/turnos/${turno1}/divisoes`)
        .set(auth(apontador))
        .send({ rodadaOpId: op.id, maquinaId: id['INJ-01'] });
      expect(d.status, JSON.stringify(d.body)).toBe(201);
      div[op.ordem.numeroErp] = d.body.id;
    }
    // Ajuste de horas recalcula a meta.
    const aj = await ctx
      .http()
      .put(`/api/turnos/${turno1}/divisoes/${div['04508401003']}`)
      .set(auth(apontador))
      .send({ horasDisponiveis: 5 });
    expect(aj.body).toMatchObject({ horasDisponiveis: 5, meta: 300 });
  });

  it('separação de funções: outro apontador não lança no turno alheio', async () => {
    const r = await lancar(turno1, apontador2, {
      tipo: 'REINICIO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-1),
    });
    expect(r.status).toBe(403);
  });

  it('RN-06: 3 conjuntos de 30 registram 90 peças e 3 conjuntos numerados', async () => {
    const r = await lancar(turno1, apontador, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-4),
      divisaoId: div['04508401001'],
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 3,
      pesoMedioG: 385,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.evento.quantidade).toBe(90);
    expect(r.body.evento.dados.conjuntos.map((c: { numero: number }) => c.numero)).toEqual([1, 2, 3]);
    expect(r.body.evento.pesoNaoConforme).toBe(false);
  });

  it('RN-06: conjunto avulso exige confirmação e fica marcado', async () => {
    const corpo = {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-3.9),
      divisaoId: div['04508401001'],
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 1,
      avulsos: [18],
      pesoMedioG: 383,
    };
    const sem = await lancar(turno1, apontador, corpo);
    expect(sem.status).toBe(422);
    expect(sem.body.mensagem).toMatch(/exige confirmação/);
    const com = await lancar(turno1, apontador, { ...corpo, confirmarAvulso: true });
    expect(com.status).toBe(201);
    expect(com.body.evento.quantidade).toBe(48);
    expect(com.body.evento.dados.conjuntos[1]).toEqual({ numero: 2, quantidade: 18, avulso: true });
  });

  it('RN-07: peso fora da tolerância marca NC, exige justificativa e gera pendência', async () => {
    const corpo = {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-3.8),
      divisaoId: div['04508401001'],
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 1,
      pesoMedioG: 400,
    };
    const sem = await lancar(turno1, apontador, corpo);
    expect(sem.status).toBe(422);
    expect(sem.body.detalhes[0].campo).toBe('justificativa');
    const com = await lancar(turno1, apontador, {
      ...corpo,
      justificativa: 'Molde com rebarba, ajuste solicitado.',
    });
    expect(com.status).toBe(201);
    expect(com.body.evento.pesoNaoConforme).toBe(true);
    expect(com.body.evento.dados.desvioPct).toBe(4.35);
    const pend = await ctx.prisma.aprovacao.findFirst({
      where: { eventoId: com.body.evento.id, tipo: 'PESO', situacao: 'PENDENTE' },
    });
    expect(pend).not.toBeNull();
  });

  it('RN-05: parada exige motivo; saída dentro do intervalo parado e paradas sobrepostas são recusadas', async () => {
    expect(
      (await lancar(turno1, apontador, { tipo: 'PARADA', maquinaId: id['INJ-01'], horaOcorrencia: em(-3) }))
        .status,
    ).toBe(400);
    const p = await lancar(turno1, apontador, {
      tipo: 'PARADA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-3),
      motivoParadaId: id['motivo:MEC'],
    });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    const saida = await lancar(turno1, apontador, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-2.5),
      divisaoId: div['04508401001'],
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 1,
      pesoMedioG: 383,
    });
    expect(saida.status).toBe(422);
    expect(saida.body.mensagem).toMatch(/parada/);
    const sobreposta = await lancar(turno1, apontador, {
      tipo: 'PARADA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-2.75),
      motivoParadaId: id['motivo:SET'],
    });
    expect(sobreposta.status).toBe(422);
    expect(sobreposta.body.mensagem).toMatch(/sobrepor/);
    const reinicio = await lancar(turno1, apontador, {
      tipo: 'REINICIO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-2),
    });
    expect(reinicio.status).toBe(201);
    // Parada retroativa que engoliria uma saída já lançada também é recusada.
    const engole = await lancar(turno1, apontador, {
      tipo: 'PARADA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-4.5),
      motivoParadaId: id['motivo:SET'],
    });
    expect(engole.status).toBe(422);
    const det = await ctx.http().get(`/api/turnos/${turno1}`).set(auth(apontador));
    expect(det.body.maquinas[0].estado.situacao).toBe('LIGADA');
  });

  it('RN-05: bloqueio de cavidade pertence à rodada e não pode ser duplicado', async () => {
    const b = await lancar(turno1, apontador, {
      tipo: 'BLOQUEIO_CAVIDADE',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-1.5),
      cavidade: 2,
      motivo: 'Ponteira entupida',
    });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'BLOQUEIO_CAVIDADE',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-1.4),
          cavidade: 2,
          motivo: 'x',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'BLOQUEIO_CAVIDADE',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-1.4),
          cavidade: 9,
          motivo: 'x',
        })
      ).status,
    ).toBe(422);
    const det = await ctx.http().get(`/api/turnos/${turno1}`).set(auth(apontador));
    expect(det.body.maquinas[0].cavidadesBloqueadas).toEqual([{ cavidade: 2, motivo: 'Ponteira entupida' }]);
  });

  it('RN-11: perda exige peso ou quantidade; RN-10: entradas e devoluções de material', async () => {
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'PERDA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-1),
          divisaoId: div['04508401001'],
          tipoPerdaId: id['perda:Borra'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'PERDA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-1),
          divisaoId: div['04508401001'],
          tipoPerdaId: id['perda:Peça refugada'],
          quantidadePecas: 5,
          pesoKg: 1.9,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'PERDA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-1),
          divisaoId: div['04508401001'],
          tipoPerdaId: id['perda:Borra'],
          pesoKg: 2.5,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'ENTRADA_MATERIA_PRIMA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-0.9),
          divisaoId: div['04508401001'],
          leitura: id['lote:PP-H103'],
          quantidadeKg: 50,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'DEVOLUCAO_MATERIA_PRIMA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-0.8),
          divisaoId: div['04508401001'],
          leitura: id['lote:PP-H103'],
          quantidadeKg: 5,
        })
      ).status,
    ).toBe(201);
    // Produto acabado não é material.
    expect(
      (
        await lancar(turno1, apontador, {
          tipo: 'ENTRADA_MATERIA_PRIMA',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(-0.8),
          divisaoId: div['04508401001'],
          leitura: 'CAD-0032',
          quantidadeKg: 1,
        })
      ).status,
    ).toBe(422);
  });

  it('RN-08: hora divergente marca retroativo/antecipado e gera pendência; fora do período é recusada', async () => {
    const agora = await lancar(turno1, apontador, {
      tipo: 'ENTRADA_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date().toISOString(),
      divisaoId: div['04508401002'],
      leitura: id['lote:PP-H103'],
      quantidadeKg: 10,
    });
    expect(agora.body.evento.marcaHorario).toBe('NO_MOMENTO');
    const antecipado = await lancar(turno1, apontador, {
      tipo: 'ENTRADA_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(0.5),
      divisaoId: div['04508401002'],
      leitura: id['lote:MB-AZ01'],
      quantidadeKg: 1,
    });
    expect(antecipado.body.evento.marcaHorario).toBe('ANTECIPADO');
    const inicio = await ctx.prisma.evento.findFirstOrThrow({
      where: { turnoId: turno1, tipo: 'INICIO_MAQUINA' },
    });
    expect(inicio.marcaHorario).toBe('RETROATIVO');
    expect(await ctx.prisma.aprovacao.count({ where: { turnoId: turno1, tipo: 'HORARIO' } })).toBeGreaterThan(
      5,
    );
    expect(await ctx.prisma.aprovacao.count({ where: { eventoId: agora.body.evento.id } })).toBe(0);
    const fora = await lancar(turno1, apontador, {
      tipo: 'REINICIO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-7),
    });
    expect(fora.status).toBe(422);
    expect(fora.body.mensagem).toMatch(/fora do período do turno/);
  });

  it('sem duplicidade: reenviar o mesmo identificador não cria outro registro', async () => {
    const corpo = {
      id: randomUUID(),
      tipo: 'PERDA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(-0.5),
      divisaoId: div['04508401002'],
      tipoPerdaId: id['perda:Canal'],
      pesoKg: 0.7,
    };
    const a = await ctx
      .http()
      .post(`/api/turnos/${turno1}/eventos`)
      .set(auth(apontador))
      .set('x-posto', id['posto:T1'])
      .send(corpo);
    const b = await ctx
      .http()
      .post(`/api/turnos/${turno1}/eventos`)
      .set(auth(apontador))
      .set('x-posto', id['posto:T1'])
      .send(corpo);
    expect(a.body.duplicado).toBe(false);
    expect(b.body.duplicado).toBe(true);
    expect(await ctx.prisma.evento.count({ where: { id: corpo.id } })).toBe(1);
  });

  it('RN-13: fechamento exige decisão por máquina, grava saldo solto e bloqueia novos lançamentos', async () => {
    const semDecisao = await ctx.http().post(`/api/turnos/${turno1}/fechar`).set(auth(apontador)).send({});
    expect(semDecisao.status).toBe(422);
    expect(semDecisao.body.mensagem).toMatch(/INJ-01/);
    const r = await ctx
      .http()
      .post(`/api/turnos/${turno1}/fechar`)
      .set(auth(apontador))
      .send({
        maquinas: [{ maquinaId: id['INJ-01'], acao: 'SEGUE_RODANDO' }],
        saldos: [{ divisaoId: div['04508401001'], quantidade: 12 }],
      });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.situacao).toBe('FECHADO');
    const depois = await lancar(turno1, apontador, {
      tipo: 'REINICIO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date().toISOString(),
    });
    expect(depois.status).toBe(409);
  });

  it('RN-13: relatório do turno com produção, meta, perdas, consumo, paradas, cavidades, OEE, PH e pendências', async () => {
    const r = await ctx.http().get(`/api/turnos/${turno1}/relatorio`).set(auth(pcp));
    expect(r.status).toBe(200);
    const m = r.body.maquinas[0];
    expect(m.maquina.codigo).toBe('INJ-01');
    const op1 = m.ops.find((o: { divisao: { codigo: string } }) => o.divisao.codigo === '04508401001-01');
    const op2 = m.ops.find((o: { divisao: { codigo: string } }) => o.divisao.codigo === '04508401002-01');
    // 90 + 48 + 30 etiquetadas + 12 de saldo solto deixado.
    expect(op1).toMatchObject({
      etiquetado: 168,
      saldoDeixado: 12,
      saldoRecebido: 0,
      producao: 180,
      refugadas: 5,
      producaoTotal: 185,
      numeroConjuntos: 6,
      quantidadeAvulsos: 18,
      pesoNaoConforme: 1,
    });
    expect(op1.conjuntosAvulsos).toHaveLength(1);
    expect(op1.divisao.meta).toBe(600);
    expect(op1.perdas.map((p: { tipo: string }) => p.tipo).sort()).toEqual(['Borra', 'Peça refugada']);
    const pp = op1.consumo.find((c: { material: { codigo: string } }) => c.material.codigo === 'PP-H103');
    expect(pp).toMatchObject({ entrada: 50, devolucao: 5, liquido: 45, teorico: 69.375 });
    // Cavidade bloqueada reduz a produção esperada da OP correspondente (≈ 1,5 h × 60 pç/h).
    expect(op1.producaoEsperada - op2.producaoEsperada).toBeCloseTo(90, 0);
    expect(m.paradas).toEqual([
      expect.objectContaining({ motivo: 'MEC — Quebra mecânica', programada: false, minutos: 60 }),
    ]);
    expect(m.cavidadesBloqueadas[0]).toMatchObject({ cavidade: 2, fim: null });
    expect(m.tempos.paradasNaoProgramadasMin).toBe(60);
    expect(m.oee.disponibilidade).toBeGreaterThan(0.8);
    expect(m.oee.qualidade).toBeCloseTo(m.boas / (m.boas + m.refugadas), 6);
    expect(op1.phReal).toBeGreaterThan(0);
    expect(r.body.pendencias.map((p: { tipo: string }) => p.tipo)).toEqual(
      expect.arrayContaining(['HORARIO', 'PESO']),
    );
  });

  it('RN-06: saldo solto deixado é oferecido na abertura seguinte e a produção do turno fecha pela fórmula', async () => {
    const t = await ctx
      .http()
      .post('/api/turnos')
      .set(auth(apontador2))
      .send(await corpoAbertura(apontador2));
    turno2 = t.body.id;
    await ajustarJanela(turno2);
    const disp = await ctx.http().get(`/api/turnos/${turno2}/maquinas-disponiveis`).set(auth(apontador2));
    const inj = disp.body.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01');
    const fechado = await ctx.prisma.turnoApontamento.findUniqueOrThrow({ where: { id: turno1 } });
    // Máquina que seguiu rodando: sugere a hora de fechamento do turno anterior.
    expect(new Date(inj.sugestaoInicio).getTime()).toBe(fechado.fechadoEm!.getTime());
    const ligada = await ctx.http().post(`/api/turnos/${turno2}/maquinas`).set(auth(apontador2)).send({
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: inj.rodadaAnteriorId,
      horaOcorrencia: inj.sugestaoInicio,
    });
    expect(ligada.status, JSON.stringify(ligada.body)).toBe(201);
    const rodadaOp = ligada.body.maquinas[0].rodada.ops.find(
      (o: { ordem: { numeroErp: string } }) => o.ordem.numeroErp === '04508401001',
    );

    const prop = await ctx
      .http()
      .get(`/api/turnos/${turno2}/divisoes/proposta?rodadaOpId=${rodadaOp.id}&maquinaId=${id['INJ-01']}`)
      .set(auth(apontador2));
    expect(prop.body).toMatchObject({
      codigo: '04508401001-02',
      sequencial: 2,
      saldoSoltoPendente: 12,
      produzidoOp: 180,
      saldoOp: 2820,
    });
    const semConfirmar = await ctx
      .http()
      .post(`/api/turnos/${turno2}/divisoes`)
      .set(auth(apontador2))
      .send({ rodadaOpId: rodadaOp.id, maquinaId: id['INJ-01'] });
    expect(semConfirmar.status).toBe(422);
    const d = await ctx
      .http()
      .post(`/api/turnos/${turno2}/divisoes`)
      .set(auth(apontador2))
      .send({ rodadaOpId: rodadaOp.id, maquinaId: id['INJ-01'], saldoRecebido: 12 });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    div['T2-OP1'] = d.body.id;
    const s = await lancar(turno2, apontador2, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date(Date.now() + 1000).toISOString(),
      divisaoId: d.body.id,
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 1,
      pesoMedioG: 383,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    const rel = await ctx.http().get(`/api/turnos/${turno2}/relatorio`).set(auth(apontador2));
    // 30 etiquetadas (completaram o conjunto com as 12 recebidas) + 0 deixado − 12 recebido = 18.
    expect(rel.body.maquinas[0].ops[0]).toMatchObject({ etiquetado: 30, saldoRecebido: 12, producao: 18 });
    // Acumulado da OP: 180 + 18 = 198 (= 168 + 30 etiquetadas).
    const op = await ctx.http().get(`/api/ordens/${id['04508401001']}`).set(auth(pcp));
    expect(op.body.produzido).toBe(198);
    expect(op.body.divisoes.map((x: { codigo: string }) => x.codigo)).toEqual([
      '04508401001-01',
      '04508401001-02',
    ]);
  });

  it('extrusão: volumes com peso digitado e operador; transferência entra no consumo da OP de destino', async () => {
    const disp = await ctx.http().get(`/api/turnos/${turno2}/maquinas-disponiveis`).set(auth(apontador2));
    const ext = disp.body.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'EXT-01');
    const lig = await ctx
      .http()
      .post(`/api/turnos/${turno2}/maquinas`)
      .set(auth(apontador2))
      .send({
        eventoId: randomUUID(),
        maquinaId: id['EXT-01'],
        rodadaId: ext.rodadas[0].id,
        horaOcorrencia: em(-1),
      });
    expect(lig.status).toBe(201);
    const extMaquina = lig.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'EXT-01',
    );
    const d = await ctx
      .http()
      .post(`/api/turnos/${turno2}/divisoes`)
      .set(auth(apontador2))
      .send({ rodadaOpId: extMaquina.rodada.ops[0].id, maquinaId: id['EXT-01'] });
    expect(d.status).toBe(201);
    expect(d.body.codigo).toMatch(/^\d+-01$/); // OP de extrusão sem ERP usa o número interno
    const semOperador = await lancar(turno2, apontador2, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['EXT-01'],
      horaOcorrencia: em(-0.5),
      divisaoId: d.body.id,
      volumes: [{ tipoVolume: 'SACO', pesoKg: 25 }],
    });
    expect(semOperador.status).toBe(422);
    const s = await lancar(turno2, apontador2, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['EXT-01'],
      horaOcorrencia: em(-0.5),
      divisaoId: d.body.id,
      volumes: [
        { tipoVolume: 'SACO', pesoKg: 25 },
        { tipoVolume: 'SACO', pesoKg: 24.6 },
      ],
      operador: 'Carlos',
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.evento.quantidade).toBe(49.6);
    const t = await lancar(turno2, apontador2, {
      tipo: 'TRANSFERENCIA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date().toISOString(),
      divisaoId: div['T2-OP1'],
      leitura: id['lote:PP-H103'],
      quantidadeKg: 10,
      divisaoDestinoId: d.body.id,
    });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const rel = await ctx.http().get(`/api/turnos/${turno2}/relatorio`).set(auth(apontador2));
    const extRel = rel.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'EXT-01',
    );
    expect(extRel.ops[0].producao).toBe(49.6);
    expect(
      extRel.ops[0].consumo.find((c: { material: { codigo: string } }) => c.material.codigo === 'PP-H103'),
    ).toMatchObject({ transferenciaEntrada: 10, liquido: 10 });
    const injRel = rel.body.maquinas.find(
      (m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01',
    );
    expect(
      injRel.ops[0].consumo.find((c: { material: { codigo: string } }) => c.material.codigo === 'PP-H103'),
    ).toMatchObject({ transferenciaSaida: 10, liquido: -10 });
  });

  it('máquina em turno aberto de outro apontador não pode ser ligada', async () => {
    const t3 = await ctx
      .http()
      .post('/api/turnos')
      .set(auth(apontador))
      .send(await corpoAbertura(apontador));
    await ajustarJanela(t3.body.id);
    const r = await ctx
      .http()
      .post(`/api/turnos/${t3.body.id}/maquinas`)
      .set(auth(apontador))
      .send({
        eventoId: randomUUID(),
        maquinaId: id['INJ-01'],
        rodadaId: id[`rodada:${id['INJ-01']}`],
        horaOcorrencia: new Date().toISOString(),
      });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/turno aberto de Marina/);
  });

  it('RN-03: uma máquina tem no máximo uma rodada em andamento', async () => {
    const turno3 = (
      await ctx.prisma.turnoApontamento.findFirstOrThrow({
        where: { situacao: 'ABERTO', apontador: { login: 'apontador@exemplo.com.br' } },
      })
    ).id;
    await ctx.prisma.rodada.update({
      where: { id: id[`rodada:${id['INJ-03']}`] },
      data: { situacao: 'EM_ANDAMENTO' },
    });
    const nova = await ctx
      .http()
      .post('/api/ordens')
      .set(auth(pcp))
      .send({ tipo: 'PRODUCAO', numeroErp: '09999999001', produtoId: id['BAL-0005'], quantidade: 100 });
    const molde = await ctx.prisma.molde.findUniqueOrThrow({ where: { codigo: 'MOL-BAL-2' } });
    const r5 = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(pcp))
      .send({
        maquinaId: id['INJ-03'],
        moldeId: molde.id,
        ops: [{ ordemId: nova.body.id, cavidades: [1, 2] }],
      });
    expect(r5.status, JSON.stringify(r5.body)).toBe(201);
    const ligar = await ctx.http().post(`/api/turnos/${turno3}/maquinas`).set(auth(apontador)).send({
      eventoId: randomUUID(),
      maquinaId: id['INJ-03'],
      rodadaId: r5.body.id,
      horaOcorrencia: new Date().toISOString(),
    });
    expect(ligar.status).toBe(409);
    expect(ligar.body.mensagem).toMatch(/em andamento/);
  });

  it('RN-01: OP com apontamentos não pode ser alterada nem cancelada; OP encerrada recusa lançamentos', async () => {
    const op = await ctx.prisma.ordemProducao.findUniqueOrThrow({ where: { id: id['04508401002'] } });
    const corpo = { tipo: 'PRODUCAO', numeroErp: op.numeroErp, produtoId: op.produtoId, quantidade: 10 };
    expect((await ctx.http().put(`/api/ordens/${op.id}`).set(auth(pcp)).send(corpo)).status).toBe(409);
    expect((await ctx.http().post(`/api/ordens/${op.id}/cancelar`).set(auth(pcp))).status).toBe(409);
    expect((await ctx.http().post(`/api/ordens/${id['04508401001']}/encerrar`).set(auth(pcp))).status).toBe(
      200,
    );
    const r = await lancar(turno2, apontador2, {
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date().toISOString(),
      divisaoId: div['T2-OP1'],
      conjuntoPadraoId: conjuntoCad1,
      conjuntosPadrao: 1,
      pesoMedioG: 383,
    });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/encerrada/);
  });
});
