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

/** Fase 7: sincronização do tablet offline (seção 11). */
describe('Offline e sincronização', () => {
  let ctx: Contexto;
  let t: Awaited<ReturnType<typeof tokensPorPerfil>>;
  const id: Record<string, string> = {};
  const T0 = Date.now() - 4 * H;
  const em = (h: number) => new Date(T0 + h * H).toISOString();
  const turno = randomUUID();
  const divisao = randomUUID();
  let bloco: { inicio: number; fim: number };
  const saida = { id: randomUUID() };

  /** Requisição como o tablet A envia da fila: aparelho, posto e hora do registro no relógio dele. */
  const doTablet = (
    metodo: 'post' | 'get',
    url: string,
    hora: string,
    aparelho = 'tablet-A',
    token = t.APONTADOR,
  ) =>
    (metodo === 'post' ? ctx.http().post(url) : ctx.http().get(url))
      .set(auth(token))
      .set('x-dispositivo', aparelho)
      .set('x-posto', id['posto:T1'])
      .set('x-hora-registro', hora)
      .set('x-hora-dispositivo', new Date().toISOString());

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    t = await tokensPorPerfil(ctx);
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const d of await ctx.prisma.dispositivo.findMany()) id[`posto:${d.prefixo}`] = d.id;
    for (const e of await ctx.prisma.equipe.findMany()) id[`equipe:${e.letra}`] = e.id;
    for (const h of await ctx.prisma.horarioTurno.findMany()) id[`horario:${h.nome}`] = h.id;
    await ctx.prisma.parametroSistema.update({
      where: { chave: 'tamanho_bloco_etiquetas' },
      data: { valor: '50' },
    });
    await ctx.prisma.impressora.updateMany({ data: { enderecoIp: '127.0.0.1', porta: 9 } });
  });
  afterAll(async () => ctx.app.close());

  it('pacote do aparelho traz o necessário para trabalhar sem servidor', async () => {
    expect((await ctx.http().get('/api/offline/pacote').set(auth(t.ESTOQUE))).status).toBe(403);
    const r = await doTablet('get', '/api/offline/pacote', new Date().toISOString());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const inj = r.body.maquinas.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01');
    expect(inj.rodadas[0].ops[0]).toMatchObject({
      ordem: { numeroErp: expect.any(String) },
      fichaTecnica: { phPadrao: expect.any(Number) },
    });
    expect(r.body.ordens.length).toBeGreaterThan(0);
    expect(r.body.motivos.length).toBeGreaterThan(0);
    expect(r.body.layouts.some((l: { tipoEtiqueta: string }) => l.tipoEtiqueta === 'PRODUTO')).toBe(true);
    expect(r.body.posto).toMatchObject({ prefixo: 'T1' });
    expect(r.body.numeracao).toEqual({ blocos: [], ultimaUsadaServidor: 0 });
    expect(r.body.parametros).toMatchObject({ tamanhoBloco: 50, toleranciaHorarioMin: 10 });
    expect(r.body.lotes.some((l: { material: { codigo: string } }) => l.material.codigo === 'PP-H103')).toBe(
      true,
    );
  });

  it('tablet reserva bloco de numeração; o servidor pula o bloco nas etiquetas que emite', async () => {
    const r = await doTablet('post', '/api/offline/blocos', new Date().toISOString());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    bloco = r.body.bloco;
    expect(bloco.fim - bloco.inicio + 1).toBe(50);
    expect(r.body.blocos).toHaveLength(1);
    const seq = await ctx.prisma.sequenciaDispositivo.findUniqueOrThrow({
      where: { dispositivoId: id['posto:T1'] },
    });
    expect(seq.ultimo).toBe(bloco.fim);
  });

  it('turno inteiro feito offline sobe na ordem, com as horas do tablet, sem duplicar no reenvio', async () => {
    const sug = await ctx.http().get('/api/turnos/sugestao').set(auth(t.APONTADOR));
    const abrir = {
      ...sug.body,
      equipeId: id['equipe:A'],
      horarioTurnoId: id['horario:Dia'],
      data: em(0).slice(0, 10),
      id: turno,
      abertoEm: em(0),
    };
    for (let i = 0; i < 2; i++) {
      const r = await doTablet('post', '/api/turnos', em(0)).send(abrir);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.id).toBe(turno);
    }
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: { inicioNominal: new Date(T0 - H), fimNominal: new Date(T0 + 11 * H) },
    });
    expect(await ctx.prisma.turnoApontamento.count({ where: { id: turno } })).toBe(1);
    expect(
      (await ctx.prisma.turnoApontamento.findUniqueOrThrow({ where: { id: turno } })).abertoEm.toISOString(),
    ).toBe(em(0));

    const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id['INJ-01'] } });
    const ligar = {
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: rodada.id,
      horaOcorrencia: em(0.1),
    };
    for (let i = 0; i < 2; i++)
      expect((await doTablet('post', `/api/turnos/${turno}/maquinas`, em(0.1)).send(ligar)).status).toBe(201);
    expect(await ctx.prisma.maquinaTurno.count({ where: { turnoId: turno } })).toBe(1);

    const op = await ctx.prisma.rodadaOp.findFirstOrThrow({
      where: { rodadaId: rodada.id, ordem: { produto: { codigo: 'CAD-0031' } } },
    });
    for (let i = 0; i < 2; i++) {
      const d = await doTablet('post', `/api/turnos/${turno}/divisoes`, em(0.2)).send({
        id: divisao,
        rodadaOpId: op.id,
        maquinaId: id['INJ-01'],
      });
      expect(d.status, JSON.stringify(d.body)).toBe(201);
      expect(d.body.id).toBe(divisao);
    }

    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produto: { codigo: 'CAD-0031' } },
    });
    const corpo = {
      id: saida.id,
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      divisaoId: divisao,
      horaOcorrencia: em(1),
      conjuntoPadraoId: conjunto.id,
      conjuntosPadrao: 2,
      pesoMedioG: 384,
      sequencias: [bloco.inicio, bloco.inicio + 1],
    };
    // Números que não conferem ou fora do bloco do tablet são recusados.
    expect(
      (
        await doTablet('post', `/api/turnos/${turno}/eventos`, em(1)).send({
          ...corpo,
          id: randomUUID(),
          sequencias: [bloco.inicio + 5],
        })
      ).status,
    ).toBe(422);
    const fora = await doTablet('post', `/api/turnos/${turno}/eventos`, em(1)).send({
      ...corpo,
      id: randomUUID(),
      sequencias: [bloco.fim + 1, bloco.fim + 2],
    });
    expect(fora.status).toBe(422);
    expect(fora.body.mensagem).toMatch(/não pertence a um bloco reservado/);
    const r1 = await doTablet('post', `/api/turnos/${turno}/eventos`, em(1)).send(corpo);
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    const codigos = [
      `T1-${String(bloco.inicio).padStart(7, '0')}`,
      `T1-${String(bloco.inicio + 1).padStart(7, '0')}`,
    ];
    expect(r1.body.etiquetas.map((e: { codigo: string }) => e.codigo)).toEqual(codigos);
    const r2 = await doTablet('post', `/api/turnos/${turno}/eventos`, em(1)).send(corpo);
    expect(r2.body).toMatchObject({ duplicado: true });
    expect(await ctx.prisma.etiqueta.count({ where: { eventoId: saida.id } })).toBe(2);
    const ev = await ctx.prisma.evento.findUniqueOrThrow({ where: { id: saida.id } });
    expect(ev.horaRegistro.toISOString()).toBe(em(1)); // hora do tablet
    expect(ev.marcaHorario).toBe('NO_MOMENTO');
    expect(ev.recebidoEm.getTime()).toBeGreaterThan(Date.now() - 60_000); // hora em que o servidor recebeu
    const etq = await ctx.prisma.etiqueta.findFirstOrThrow({ where: { codigo: codigos[0] } });
    expect(etq.emitidaEm.toISOString()).toBe(em(1));
    expect(etq.impressaoPendente).toBe(true);

    // Impressão feita offline é informada depois.
    const imp = await doTablet('post', '/api/offline/impressoes', em(1)).send({
      itens: codigos.map((codigo) => ({ codigo, sucesso: true, em: em(1) })),
    });
    expect(imp.body).toEqual({ registradas: 2 });
    expect(
      (await ctx.prisma.etiqueta.findFirstOrThrow({ where: { codigo: codigos[0] } })).impressaoPendente,
    ).toBe(false);
    expect(
      (
        await doTablet('post', '/api/offline/impressoes', em(1)).send({
          itens: [{ codigo: codigos[0], sucesso: true, em: em(1) }],
        })
      ).body,
    ).toEqual({ registradas: 0 });

    // Etiqueta emitida pelo servidor no mesmo posto fica fora do bloco.
    const perda = await ctx
      .http()
      .post(`/api/turnos/${turno}/eventos`)
      .set(auth(t.APONTADOR))
      .set('x-dispositivo', 'tablet-A')
      .set('x-posto', id['posto:T1'])
      .send({
        id: randomUUID(),
        tipo: 'PERDA',
        maquinaId: id['INJ-01'],
        divisaoId: divisao,
        horaOcorrencia: new Date().toISOString(),
        tipoPerdaId: (await ctx.prisma.tipoPerda.findFirstOrThrow()).id,
        pesoKg: 1,
      });
    expect(perda.status, JSON.stringify(perda.body)).toBe(201);
    expect(perda.body.etiquetas[0].codigo).toBe(`T1-${String(bloco.fim + 1).padStart(7, '0')}`);
  });

  it('um turno, um dispositivo: outro tablet só continua com a fila do anterior vazia ou liberação do líder', async () => {
    const estado = await doTablet('post', '/api/offline/estado-fila', new Date().toISOString()).send({
      pendentes: [{ turnoId: turno, quantidade: 3 }],
    });
    expect(estado.status).toBe(200);
    const reinicio = {
      id: randomUUID(),
      tipo: 'PARADA',
      maquinaId: id['INJ-01'],
      horaOcorrencia: em(2),
      motivoParadaId: (await ctx.prisma.motivoParada.findFirstOrThrow({ where: { codigo: 'REF' } })).id,
    };
    const b = await doTablet('post', `/api/turnos/${turno}/eventos`, em(2), 'tablet-B').send(reinicio);
    expect(b.status).toBe(409);
    expect(b.body.mensagem).toMatch(/3 lançamento\(s\) ainda não enviado/);
    expect(
      (
        await ctx
          .http()
          .post(`/api/turnos/${turno}/liberar-aparelho`)
          .set(auth(t.APONTADOR))
          .send({ justificativa: 'Tablet quebrou' })
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .http()
          .post(`/api/turnos/${turno}/liberar-aparelho`)
          .set(auth(t.LIDER))
          .send({ justificativa: 'Tablet A quebrou na linha' })
      ).status,
    ).toBe(200);
    expect(
      (await doTablet('post', `/api/turnos/${turno}/eventos`, em(2), 'tablet-B').send(reinicio)).status,
    ).toBe(201);
    const turnoAtual = await ctx.prisma.turnoApontamento.findUniqueOrThrow({ where: { id: turno } });
    expect(turnoAtual).toMatchObject({ dispositivo: 'tablet-B', trocaAparelhoLiberada: false });
    expect(
      await ctx.prisma.registroAuditoria.count({ where: { entidadeId: turno, acao: 'TROCAR_APARELHO' } }),
    ).toBe(1);
    // Tablet B informa fila vazia: A pode retomar sem liberação.
    await doTablet('post', '/api/offline/estado-fila', new Date().toISOString(), 'tablet-B').send({
      pendentes: [],
    });
    expect(
      (
        await doTablet('post', `/api/turnos/${turno}/eventos`, em(2.5)).send({
          id: randomUUID(),
          tipo: 'REINICIO',
          maquinaId: id['INJ-01'],
          horaOcorrencia: em(2.5),
        })
      ).status,
    ).toBe(201);
  });

  it('fechamento offline com a hora do tablet; relatório não aprova com fila pendente', async () => {
    const fechar = {
      maquinas: [{ maquinaId: id['INJ-01'], acao: 'DESLIGAR' }],
      saldos: [],
      horaFechamento: em(3),
    };
    const f = await doTablet('post', `/api/turnos/${turno}/fechar`, em(3)).send(fechar);
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    expect(f.body.fechadoEm).toBe(em(3));
    expect((await doTablet('post', `/api/turnos/${turno}/fechar`, em(3)).send(fechar)).status).toBe(200);
    expect(await ctx.prisma.evento.count({ where: { turnoId: turno, tipo: 'FIM_MAQUINA' } })).toBe(1);

    await doTablet('post', '/api/offline/estado-fila', new Date().toISOString()).send({
      pendentes: [{ turnoId: turno, quantidade: 1 }],
    });
    const bloqueado = await ctx.http().post(`/api/turnos/${turno}/aprovar`).set(auth(t.LIDER)).send({});
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.mensagem).toMatch(/aguardando envio no tablet/);
    await doTablet('post', '/api/offline/estado-fila', new Date().toISOString()).send({ pendentes: [] });
    for (const p of await ctx.prisma.aprovacao.findMany({
      where: { turnoId: turno, situacao: 'PENDENTE' },
    })) {
      await ctx.http().post(`/api/aprovacoes/${p.id}/aprovar`).set(auth(t.LIDER)).send({});
    }
    const ok = await ctx.http().post(`/api/turnos/${turno}/aprovar`).set(auth(t.LIDER)).send({});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it('evento recusado na sincronização vai para a lista de recusados; descarte exige justificativa e fica auditado', async () => {
    const recusa = {
      itemId: randomUUID(),
      turnoId: turno,
      tipo: 'EVENTO',
      rota: `/turnos/${turno}/eventos`,
      corpo: { tipo: 'PERDA', pesoKg: 2 },
      status: 422,
      mensagem: 'A OP 04508401001 está encerrada; lançamento recusado.',
      criadoEm: em(2.7),
    };
    const r = await doTablet('post', '/api/offline/recusados', em(2.7)).send(recusa);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await doTablet('post', '/api/offline/recusados', em(2.7)).send(recusa)).body.id).toBe(r.body.id);
    const minha = await ctx.http().get('/api/offline/recusados').set(auth(t.APONTADOR));
    expect(minha.body.map((x: { mensagem: string }) => x.mensagem)).toEqual([recusa.mensagem]);
    const outro = await entrar(ctx, 'apontador2@exemplo.com.br');
    expect((await ctx.http().get('/api/offline/recusados').set(auth(outro))).body).toEqual([]);
    expect((await ctx.http().get('/api/offline/recusados').set(auth(t.LIDER))).body).toHaveLength(1);
    expect(
      (
        await ctx
          .http()
          .post(`/api/offline/recusados/${r.body.id}/descartar`)
          .set(auth(outro))
          .send({ justificativa: 'não é meu' })
      ).status,
    ).toBe(403);
    expect(
      (await ctx.http().post(`/api/offline/recusados/${r.body.id}/descartar`).set(auth(t.LIDER)).send({}))
        .status,
    ).toBe(400);
    const d = await ctx
      .http()
      .post(`/api/offline/recusados/${r.body.id}/descartar`)
      .set(auth(t.LIDER))
      .send({ justificativa: 'Perda já lançada em outra OP' });
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ situacao: 'DESCARTADO', justificativa: 'Perda já lançada em outra OP' });
    expect(
      await ctx.prisma.registroAuditoria.count({ where: { entidadeId: r.body.id, acao: 'DESCARTAR' } }),
    ).toBe(1);
    expect(
      (await ctx.http().get('/api/offline/recusados?situacao=DESCARTADO').set(auth(t.APONTADOR))).body,
    ).toHaveLength(1);
  });

  it('relógio do tablet adiantado além do parâmetro gera alerta ao superusuário', async () => {
    await ctx
      .http()
      .post('/api/offline/estado-fila')
      .set(auth(t.APONTADOR))
      .set('x-dispositivo', 'tablet-relogio')
      .set('x-hora-dispositivo', new Date(Date.now() + 12 * 60_000).toISOString())
      .send({ pendentes: [] });
    await new Promise((ok) => setTimeout(ok, 200));
    expect((await ctx.http().get('/api/offline/alertas-relogio').set(auth(t.ESTOQUE))).status).toBe(403);
    const lista = await ctx.http().get('/api/offline/alertas-relogio').set(auth(t.SUPERUSUARIO));
    const alerta = lista.body.find((a: { aparelho: string }) => a.aparelho === 'tablet-relogio');
    expect(alerta).toMatchObject({
      resolvido: false,
      ocorrencias: 1,
      usuario: { login: 'apontador@exemplo.com.br' },
    });
    expect(alerta.diferencaSeg).toBeGreaterThan(11 * 60);
    expect(lista.body.some((a: { aparelho: string }) => a.aparelho === 'tablet-A')).toBe(false);
    const res = await ctx
      .http()
      .post(`/api/offline/alertas-relogio/${alerta.id}/resolver`)
      .set(auth(t.SUPERUSUARIO));
    expect(res.body.resolvido).toBe(true);
  });
});
