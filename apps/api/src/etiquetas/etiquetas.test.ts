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

/** Fase 3: etiquetas, impressão, matéria-prima, extrusão, misturas e recebimento no estoque. */
describe('Etiquetas, matéria-prima e estoque', () => {
  let ctx: Contexto;
  let t: Awaited<ReturnType<typeof tokensPorPerfil>>;
  const id: Record<string, string> = {};
  const base = Date.now();
  let turno: string;
  const div: Record<string, string> = {};
  const etq: Record<string, { id: string; codigo: string }[]> = {};

  const lancar = (corpo: Record<string, unknown>, posto = id['posto:T1']) => {
    const r = ctx.http().post(`/api/turnos/${turno}/eventos`).set(auth(t.APONTADOR));
    return (posto ? r.set('x-posto', posto) : r).send({
      id: randomUUID(),
      horaOcorrencia: new Date().toISOString(),
      ...corpo,
    });
  };

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    t = await tokensPorPerfil(ctx);
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const p of await ctx.prisma.produto.findMany()) id[p.codigo] = p.id;
    for (const d of await ctx.prisma.dispositivo.findMany()) id[`posto:${d.prefixo}`] = d.id;
    for (const l of await ctx.prisma.localEstoque.findMany()) id[`local:${l.nome}`] = l.id;
    for (const l of await ctx.prisma.loteMaterial.findMany({ include: { material: true } }))
      id[`lote:${l.material.codigo}`] = l.numero;
    for (const tp of await ctx.prisma.tipoPerda.findMany()) id[`perda:${tp.descricao}`] = tp.id;
    // Impressoras apontam para uma porta local fechada (sem impressora física no teste).
    await ctx.prisma.impressora.updateMany({ data: { enderecoIp: '127.0.0.1', porta: 9 } });

    const equipe = await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: 'A' } });
    const sug = await ctx.http().get('/api/turnos/sugestao').set(auth(t.APONTADOR));
    const r = await ctx
      .http()
      .post('/api/turnos')
      .set(auth(t.APONTADOR))
      .send({ ...sug.body, equipeId: equipe.id });
    turno = r.body.id;
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: { inicioNominal: new Date(base - 6 * H), fimNominal: new Date(base + 6 * H) },
    });
    for (const codigo of ['INJ-01', 'EXT-01']) {
      const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id[codigo] } });
      const lig = await ctx
        .http()
        .post(`/api/turnos/${turno}/maquinas`)
        .set(auth(t.APONTADOR))
        .send({
          eventoId: randomUUID(),
          maquinaId: id[codigo],
          rodadaId: rodada.id,
          horaOcorrencia: new Date(base - 3 * H).toISOString(),
        });
      expect(lig.status, JSON.stringify(lig.body)).toBe(201);
      const ops = await ctx.prisma.rodadaOp.findMany({
        where: { rodadaId: rodada.id },
        include: { ordem: { include: { produto: true } } },
      });
      for (const op of ops) {
        const d = await ctx
          .http()
          .post(`/api/turnos/${turno}/divisoes`)
          .set(auth(t.APONTADOR))
          .send({ rodadaOpId: op.id, maquinaId: id[codigo] });
        div[op.ordem.produto.codigo] = d.body.id;
      }
    }
  });
  afterAll(async () => ctx.app.close());

  it('3 conjuntos geram 3 etiquetas com códigos distintos do posto; reenviar não duplica', async () => {
    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produtoId: id['CAD-0031'] },
    });
    const corpo = {
      id: randomUUID(),
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['INJ-01'],
      horaOcorrencia: new Date().toISOString(),
      divisaoId: div['CAD-0031'],
      conjuntoPadraoId: conjunto.id,
      conjuntosPadrao: 3,
      pesoMedioG: 384,
    };
    const r = await ctx
      .http()
      .post(`/api/turnos/${turno}/eventos`)
      .set(auth(t.APONTADOR))
      .set('x-posto', id['posto:T1'])
      .send(corpo);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.etiquetas).toHaveLength(3);
    const codigos = r.body.etiquetas.map((e: { codigo: string }) => e.codigo);
    expect(new Set(codigos).size).toBe(3);
    expect(codigos).toEqual(['T1-0000001', 'T1-0000002', 'T1-0000003']);
    etq.saida = r.body.etiquetas;
    const deNovo = await ctx
      .http()
      .post(`/api/turnos/${turno}/eventos`)
      .set(auth(t.APONTADOR))
      .set('x-posto', id['posto:T1'])
      .send(corpo);
    expect(deNovo.body).toMatchObject({ duplicado: true });
    expect(deNovo.body.etiquetas.map((e: { codigo: string }) => e.codigo)).toEqual(codigos);
    const etiquetas = await ctx.prisma.etiqueta.findMany({
      where: { eventoId: corpo.id },
      orderBy: { sequencia: 'asc' },
    });
    expect(
      etiquetas.map((e) => [e.quantidade, e.numeroNoLancamento, e.totalNoLancamento, e.impressaoPendente]),
    ).toEqual([
      [30, 1, 3, true],
      [30, 2, 3, true],
      [30, 3, 3, true],
    ]);
  });

  it('sem posto configurado a etiqueta não é emitida', async () => {
    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produtoId: id['CAD-0031'] },
    });
    const r = await lancar(
      {
        tipo: 'SAIDA_PRODUCAO',
        maquinaId: id['INJ-01'],
        divisaoId: div['CAD-0031'],
        conjuntoPadraoId: conjunto.id,
        conjuntosPadrao: 1,
        pesoMedioG: 384,
      },
      '',
    );
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/posto não está configurado/);
  });

  it('impressão: ZPL com GS1-128; falha deixa pendente e reenviável; reimpressão sai como 2ª via', async () => {
    const etiquetaId = etq.saida[0].id;
    const s1 = await ctx
      .http()
      .post(`/api/etiquetas/${etiquetaId}/impressao`)
      .set(auth(t.APONTADOR))
      .send({});
    expect(s1.status, JSON.stringify(s1.body)).toBe(201);
    expect(s1.body.zpl).toContain('^PW799');
    expect(s1.body.zpl).toMatch(/\^FD\(21\)T1-0000001\(240\)CAD-0031\(37\)30\(11\)\d{6}\^FS/);
    expect(s1.body.zpl).toContain('1 de 3');
    expect(s1.body.zpl).not.toContain('2ª VIA');
    expect(s1.body.impressora).toMatchObject({ enderecoIp: '127.0.0.1', porta: 9 });
    // O agente informou falha de conexão com a impressora.
    await ctx
      .http()
      .put(`/api/impressoes/${s1.body.impressaoId}`)
      .set(auth(t.APONTADOR))
      .send({ sucesso: false, mensagem: 'ECONNREFUSED' })
      .expect(200);
    expect(
      (await ctx.prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } })).impressaoPendente,
    ).toBe(true);
    const pendentes = await ctx.http().get('/api/etiquetas?pendentes=true').set(auth(t.APONTADOR));
    expect(pendentes.body.map((e: { codigo: string }) => e.codigo)).toContain('T1-0000001');
    // Reenvio com sucesso.
    const s2 = await ctx
      .http()
      .post(`/api/etiquetas/${etiquetaId}/impressao`)
      .set(auth(t.APONTADOR))
      .send({});
    expect(s2.body.segundaVia).toBe(false);
    await ctx
      .http()
      .put(`/api/impressoes/${s2.body.impressaoId}`)
      .set(auth(t.APONTADOR))
      .send({ sucesso: true })
      .expect(200);
    expect(
      (await ctx.prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } })).impressaoPendente,
    ).toBe(false);
    // Reimpressão: "2ª via", registrada com usuário e hora.
    const s3 = await ctx
      .http()
      .post(`/api/etiquetas/${etiquetaId}/impressao`)
      .set(auth(t.APONTADOR))
      .send({});
    expect(s3.body.segundaVia).toBe(true);
    expect(s3.body.zpl).toContain('2ª VIA');
    await ctx
      .http()
      .put(`/api/impressoes/${s3.body.impressaoId}`)
      .set(auth(t.APONTADOR))
      .send({ sucesso: true })
      .expect(200);
    expect((await ctx.prisma.etiqueta.findUniqueOrThrow({ where: { id: etiquetaId } })).reimpressoes).toBe(1);
    const aud = await ctx.prisma.registroAuditoria.findFirst({
      where: { entidade: 'Etiqueta', entidadeId: etiquetaId, acao: 'REIMPRIMIR' },
    });
    expect(aud?.usuarioLogin).toBe('apontador@exemplo.com.br');
    expect(
      (
        await ctx
          .http()
          .put(`/api/impressoes/${s3.body.impressaoId}`)
          .set(auth(t.APONTADOR))
          .send({ sucesso: true })
      ).status,
    ).toBe(409);
  });

  it('superusuário altera tamanho e modelo do layout e imprime um teste', async () => {
    const layout = await ctx.prisma.layoutEtiqueta.findFirstOrThrow({
      where: { tipoEtiqueta: 'PRODUTO', alturaMm: 50 },
    });
    const { id: layoutId, criadoEm: _c, atualizadoEm: _a, ...dados } = layout;
    const alterado = await ctx
      .http()
      .put(`/api/layouts-etiqueta/${layoutId}`)
      .set(auth(t.SUPERUSUARIO))
      .send({
        ...dados,
        larguraMm: 60,
        alturaMm: 40,
        modeloZpl: '^XA^PW{{larguraPontos}}^LL{{alturaPontos}}^FO10,10^FDTESTE {{codigo}}^FS^XZ',
      });
    expect(alterado.status, JSON.stringify(alterado.body)).toBe(200);
    expect(
      (await ctx.http().post(`/api/layouts-etiqueta/${layoutId}/teste`).set(auth(t.APONTADOR)).send({}))
        .status,
    ).toBe(403);
    const teste = await ctx
      .http()
      .post(`/api/layouts-etiqueta/${layoutId}/teste`)
      .set(auth(t.SUPERUSUARIO))
      .send({});
    expect(teste.status).toBe(201);
    expect(teste.body.zpl).toBe('^XA^PW480^LL320^FO10,10^FDTESTE TS-0000000^FS^XZ');
    expect(await ctx.prisma.impressaoEtiqueta.count({ where: { layoutId, teste: true } })).toBe(1);
  });

  it('mistura dá baixa nos lotes, gera novo lote e etiqueta, e é lida na entrada de matéria-prima da OP', async () => {
    const compra = await ctx
      .http()
      .post('/api/materia-prima/lotes/compra')
      .set(auth(t.MATERIA_PRIMA))
      .set('x-posto', id['posto:MP'])
      .send({
        materialId: id['PP-H103'],
        fornecedor: 'Fornecedor X',
        notaFiscal: '9988',
        loteFornecedor: 'F-77',
        quantidadeKg: 100,
        localEstoqueId: id['local:Silos'],
        indiceFluidez: 3.2,
      });
    expect(compra.status, JSON.stringify(compra.body)).toBe(201);
    expect(compra.body.lote.numero).toMatch(/^L\d{6}-\d{3}$/);
    expect(compra.body.etiquetas[0].codigo).toMatch(/^MP-\d{7}$/);
    const lotePp = compra.body.lote;
    const loteMb = await ctx.prisma.loteMaterial.findFirstOrThrow({
      where: { material: { codigo: 'MB-AZ01' } },
    });
    const mistura = await ctx.prisma.produto.create({
      data: { codigo: 'MIS-AZ', descricao: 'Mistura PP + azul', tipo: 'MISTURA', unidade: 'KG' },
    });

    const semSaldo = await ctx
      .http()
      .post('/api/materia-prima/misturas')
      .set(auth(t.MATERIA_PRIMA))
      .set('x-posto', id['posto:MP'])
      .send({
        materialId: mistura.id,
        localEstoqueId: id['local:Silos'],
        componentes: [
          { loteId: lotePp.id, localEstoqueId: id['local:Silos'], quantidadeKg: 500 },
          { loteId: loteMb.id, localEstoqueId: id['local:Almoxarifado de matéria-prima'], quantidadeKg: 2 },
        ],
      });
    expect(semSaldo.status).toBe(422);
    expect(semSaldo.body.mensagem).toMatch(/Saldo insuficiente/);

    const r = await ctx
      .http()
      .post('/api/materia-prima/misturas')
      .set(auth(t.MATERIA_PRIMA))
      .set('x-posto', id['posto:MP'])
      .send({
        materialId: mistura.id,
        localEstoqueId: id['local:Silos'],
        produtosDestino: [id['CAD-0032']],
        componentes: [
          { loteId: lotePp.id, localEstoqueId: id['local:Silos'], quantidadeKg: 40 },
          { loteId: loteMb.id, localEstoqueId: id['local:Almoxarifado de matéria-prima'], quantidadeKg: 2 },
        ],
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.mistura.componentes.map((c: { percentual: number }) => c.percentual)).toEqual([
      95.24, 4.76,
    ]);
    const lotes = await ctx.http().get('/api/materia-prima/lotes').set(auth(t.MATERIA_PRIMA));
    const saldo = (numero: string) => lotes.body.find((l: { numero: string }) => l.numero === numero).saldo;
    expect(saldo(lotePp.numero)).toBe(60);
    expect(saldo(loteMb.numero)).toBe(48);
    expect(saldo(r.body.lote.numero)).toBe(42);
    const etiquetaMistura = r.body.etiquetas[0];
    const imp = await ctx
      .http()
      .post(`/api/etiquetas/${etiquetaMistura.id}/impressao`)
      .set(auth(t.MATERIA_PRIMA))
      .send({});
    expect(imp.body.zpl).toContain('PP-H103 95,24%, MB-AZ01 4,76%');
    expect(imp.body.zpl).toContain('CAD-0032');

    // A mistura é lida (código de barras completo) na entrada de matéria-prima da OP.
    const entrada = await lancar({
      tipo: 'ENTRADA_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0032'],
      leitura: `(21)${etiquetaMistura.codigo}(3103)042000`,
      quantidadeKg: 30,
    });
    expect(entrada.status, JSON.stringify(entrada.body)).toBe(201);
    expect(entrada.body.evento.dados).toMatchObject({
      lote: r.body.lote.numero,
      materialId: mistura.id,
      quantidadeKg: 30,
    });
    const depois = await ctx.http().get('/api/materia-prima/lotes').set(auth(t.APONTADOR));
    expect(depois.body.find((l: { numero: string }) => l.numero === r.body.lote.numero).saldo).toBe(12);
    const demais = await lancar({
      tipo: 'ENTRADA_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0032'],
      leitura: r.body.lote.numero,
      quantidadeKg: 20,
    });
    expect(demais.status).toBe(422);
    expect(demais.body.mensagem).toMatch(/disponível 12 kg/);
  });

  it('devolução gera etiqueta e volta ao lote quando o setor de matéria-prima recebe; não devolve mais que o consumido', async () => {
    const pp = id['lote:PP-H103'];
    expect(
      (
        await lancar({
          tipo: 'ENTRADA_MATERIA_PRIMA',
          maquinaId: id['INJ-01'],
          divisaoId: div['CAD-0031'],
          leitura: pp,
          quantidadeKg: 25,
        })
      ).status,
    ).toBe(201);
    const demais = await lancar({
      tipo: 'DEVOLUCAO_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0031'],
      leitura: pp,
      quantidadeKg: 30,
    });
    expect(demais.status).toBe(422);
    const dev = await lancar({
      tipo: 'DEVOLUCAO_MATERIA_PRIMA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0031'],
      leitura: pp,
      quantidadeKg: 5,
    });
    expect(dev.status).toBe(201);
    expect(dev.body.etiquetas).toHaveLength(1);
    const saldoAntes = (
      await ctx.http().get('/api/materia-prima/lotes').set(auth(t.MATERIA_PRIMA))
    ).body.find((l: { numero: string }) => l.numero === pp).saldo;
    const rec = await ctx.http().post('/api/materia-prima/receber').set(auth(t.MATERIA_PRIMA)).send({
      leitura: dev.body.etiquetas[0].codigo,
      localEstoqueId: id['local:Almoxarifado de matéria-prima'],
    });
    expect(rec.status, JSON.stringify(rec.body)).toBe(200);
    const saldoDepois = (
      await ctx.http().get('/api/materia-prima/lotes').set(auth(t.MATERIA_PRIMA))
    ).body.find((l: { numero: string }) => l.numero === pp).saldo;
    expect(saldoDepois).toBe(saldoAntes + 5);
    expect(
      (
        await ctx.http().post('/api/materia-prima/receber').set(auth(t.MATERIA_PRIMA)).send({
          leitura: dev.body.etiquetas[0].codigo,
          localEstoqueId: id['local:Almoxarifado de matéria-prima'],
        })
      ).status,
    ).toBe(409);
  });

  it('extrusão: setor de matéria-prima cria a ordem; etiqueta de volume traz todos os campos da seção 8', async () => {
    const op = await ctx
      .http()
      .post('/api/ordens/extrusao')
      .set(auth(t.MATERIA_PRIMA))
      .send({ produtoId: id['EXT-PP-REC'], quantidade: 500 });
    expect(op.status, JSON.stringify(op.body)).toBe(201);
    expect(op.body).toMatchObject({ tipo: 'EXTRUSAO', numeroErp: null });
    expect((await ctx.http().post('/api/ordens').set(auth(t.MATERIA_PRIMA)).send({})).status).toBe(403);
    const molde = await ctx.prisma.molde.findUniqueOrThrow({ where: { codigo: 'MOL-CAD-3' } });
    const proibida = await ctx
      .http()
      .post('/api/rodadas')
      .set(auth(t.MATERIA_PRIMA))
      .send({ maquinaId: id['INJ-01'], moldeId: molde.id, ops: [{ ordemId: op.body.id, cavidades: [1] }] });
    expect(proibida.status).toBe(403);

    const s = await lancar({
      tipo: 'SAIDA_PRODUCAO',
      maquinaId: id['EXT-01'],
      divisaoId: div['EXT-PP-REC'],
      volumes: [
        { tipoVolume: 'SACO', pesoKg: 25.5 },
        { tipoVolume: 'SACO', pesoKg: 24.5 },
      ],
      operador: 'Carlos Silva',
      indiceFluidez: 7.8,
      produtosDestino: [id['BAL-0005']],
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.etiquetas).toHaveLength(2);
    const etiqueta = await ctx.prisma.etiqueta.findUniqueOrThrow({
      where: { id: s.body.etiquetas[0].id },
      include: { lote: true },
    });
    expect(etiqueta).toMatchObject({ tipo: 'EXTRUSAO', quantidade: 25.5, unidade: 'KG' });
    expect(etiqueta.lote).toMatchObject({ origem: 'EXTRUSAO', quantidadeInicial: 50, indiceFluidez: 7.8 });
    const imp = await ctx
      .http()
      .post(`/api/etiquetas/${etiqueta.id}/impressao`)
      .set(auth(t.APONTADOR))
      .send({});
    const z: string = imp.body.zpl;
    // Material, peso, data de fabricação, lote, OP de extrusão, operador, turno, fluidez, cor, destinos.
    for (const esperado of [
      'EXT-PP-REC',
      '25,5 kg',
      etiqueta.lote!.numero,
      'Carlos Silva',
      '7,8',
      'Preta',
      'BAL-0005',
      '(3103)025500',
    ]) {
      expect(z, esperado).toContain(esperado);
    }
    expect(z).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(z).toMatch(/A-(Dia|Noite)/);
    const ordem = await ctx.prisma.ordemProducao.findFirstOrThrow({
      where: { tipo: 'EXTRUSAO', origem: 'EXEMPLO' },
    });
    expect(z).toContain(`nº ${ordem.numeroInterno}`);
    // O extrusado entra no estoque de matéria-prima quando o setor recebe o volume.
    const rec = await ctx
      .http()
      .post('/api/materia-prima/receber')
      .set(auth(t.MATERIA_PRIMA))
      .send({ leitura: etiqueta.codigo, localEstoqueId: id['local:Silos'] });
    expect(rec.status).toBe(200);
    const lote = (await ctx.http().get('/api/materia-prima/lotes').set(auth(t.MATERIA_PRIMA))).body.find(
      (l: { id: string }) => l.id === etiqueta.loteId,
    );
    expect(lote.saldo).toBe(25.5);
  });

  it('RN-12: etiqueta lida no estoque muda para recebida e soma no saldo do local; segunda leitura é recusada', async () => {
    const codigo = etq.saida[1].codigo;
    const consulta = await ctx
      .http()
      .get(`/api/estoque/leitura?codigo=${encodeURIComponent(`(21)${codigo}(240)CAD-0031(37)30`)}`)
      .set(auth(t.ESTOQUE));
    expect(consulta.status).toBe(200);
    expect(consulta.body).toMatchObject({
      codigo,
      quantidade: 30,
      produto: { codigo: 'CAD-0031' },
      divisao: { codigo: expect.stringMatching(/^04508401001-/) },
    });
    expect(consulta.body.turno).toBeTruthy();
    expect(
      (
        await ctx
          .http()
          .post('/api/estoque/receber')
          .set(auth(t.APONTADOR))
          .send({ leitura: codigo, localEstoqueId: id['local:Expedição'] })
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx
          .http()
          .post('/api/estoque/receber')
          .set(auth(t.ESTOQUE))
          .send({ leitura: codigo, localEstoqueId: id['local:Silos'] })
      ).status,
    ).toBe(422);
    const r = await ctx
      .http()
      .post('/api/estoque/receber')
      .set(auth(t.ESTOQUE))
      .send({ leitura: codigo.toLowerCase(), localEstoqueId: id['local:Expedição'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ situacao: 'RECEBIDA', localEstoque: { nome: 'Expedição' } });
    const segunda = await ctx
      .http()
      .post('/api/estoque/receber')
      .set(auth(t.ESTOQUE))
      .send({ leitura: codigo, localEstoqueId: id['local:Expedição'] });
    expect(segunda.status).toBe(409);
    expect(segunda.body.mensagem).toMatch(/já foi recebida em .* por Ester Estoque \(Expedição\)/);
    const saldos = await ctx.http().get('/api/estoque/saldos').set(auth(t.ESTOQUE));
    const expedicao = saldos.body.find((s: { local: { nome: string } }) => s.local.nome === 'Expedição');
    expect(expedicao.produtos).toEqual([
      expect.objectContaining({ produto: expect.objectContaining({ codigo: 'CAD-0031' }), saldo: 30 }),
    ]);
  });

  it('RN-12: etiqueta inexistente, cancelada ou de outro tipo é recusada com mensagem clara', async () => {
    const inexistente = await ctx.http().get('/api/estoque/leitura?codigo=T1-0999999').set(auth(t.ESTOQUE));
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.mensagem).toBe('Etiqueta T1-0999999 não encontrado.');
    await ctx.prisma.etiqueta.update({ where: { id: etq.saida[2].id }, data: { situacao: 'CANCELADA' } });
    const cancelada = await ctx
      .http()
      .get(`/api/estoque/leitura?codigo=${etq.saida[2].codigo}`)
      .set(auth(t.ESTOQUE));
    expect(cancelada.status).toBe(409);
    expect(cancelada.body.mensagem).toMatch(/cancelada/);
    const mp = await ctx.http().get('/api/estoque/leitura?codigo=MP-0000001').set(auth(t.ESTOQUE));
    expect(mp.status).toBe(422);
  });

  it('RN-12: o parâmetro de visão do recebimento alterna entre pendentes, recebidas e ambas', async () => {
    const lista = async () => (await ctx.http().get('/api/estoque/recebimento').set(auth(t.ESTOQUE))).body;
    const ambas = await lista();
    expect(ambas.visao).toBe('AMBAS');
    expect(new Set(ambas.etiquetas.map((e: { situacao: string }) => e.situacao))).toEqual(
      new Set(['EMITIDA', 'RECEBIDA']),
    );
    await ctx
      .http()
      .put('/api/parametros/visao_recebimento')
      .set(auth(t.SUPERUSUARIO))
      .send({ valor: 'PENDENTES' })
      .expect(200);
    const pend = await lista();
    expect(pend.etiquetas.every((e: { situacao: string }) => e.situacao === 'EMITIDA')).toBe(true);
    expect(pend.etiquetas.length).toBeGreaterThan(0);
    await ctx
      .http()
      .put('/api/parametros/visao_recebimento')
      .set(auth(t.SUPERUSUARIO))
      .send({ valor: 'RECEBIDAS' })
      .expect(200);
    const rec = await lista();
    expect(rec.etiquetas.map((e: { codigo: string }) => e.codigo)).toEqual([etq.saida[1].codigo]);
  });

  it('perda gera etiqueta; transferência gera etiqueta com origem e destino', async () => {
    const p = await lancar({
      tipo: 'PERDA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0031'],
      tipoPerdaId: id['perda:Borra'],
      pesoKg: 1.25,
    });
    expect(p.body.etiquetas).toHaveLength(1);
    const z = (
      await ctx
        .http()
        .post(`/api/etiquetas/${p.body.etiquetas[0].id}/impressao`)
        .set(auth(t.APONTADOR))
        .send({})
    ).body.zpl;
    expect(z).toContain('PERDA Borra');
    expect(z).toContain('1,25 kg');
    const tr = await lancar({
      tipo: 'TRANSFERENCIA',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0031'],
      leitura: id['lote:PP-H103'],
      quantidadeKg: 3,
      divisaoDestinoId: div['EXT-PP-REC'],
    });
    expect(tr.status, JSON.stringify(tr.body)).toBe(201);
    const zt = (
      await ctx
        .http()
        .post(`/api/etiquetas/${tr.body.etiquetas[0].id}/impressao`)
        .set(auth(t.APONTADOR))
        .send({})
    ).body.zpl;
    expect(zt).toContain('TRANSFERÊNCIA');
    expect(zt).toMatch(/INJ-01 · 04508401001-\d\d/);
    expect(zt).toContain('EXT-01 ·');
  });

  it('entrada de semiacabado lê a etiqueta, consome do estoque e não aceita a mesma etiqueta duas vezes', async () => {
    const posto = await ctx.prisma.dispositivo.findUniqueOrThrow({ where: { prefixo: 'T2' } });
    const usuario = await ctx.prisma.usuario.findUniqueOrThrow({
      where: { login: 'apontador@exemplo.com.br' },
    });
    const semi = await ctx.prisma.etiqueta.create({
      data: {
        codigo: 'T2-0000500',
        sequencia: 500,
        dispositivoId: posto.id,
        tipo: 'PRODUTO',
        produtoId: id['MES-0010'],
        quantidade: 20,
        unidade: 'PECA',
        responsavelId: usuario.id,
      },
    });
    await ctx
      .http()
      .post('/api/estoque/receber')
      .set(auth(t.ESTOQUE))
      .send({ leitura: semi.codigo, localEstoqueId: id['local:Depósito de produto acabado'] })
      .expect(200);
    const r = await lancar({
      tipo: 'ENTRADA_SEMIACABADO',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0033'],
      leitura: 'T2-500',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.evento.quantidade).toBe(20);
    expect((await ctx.prisma.etiqueta.findUniqueOrThrow({ where: { id: semi.id } })).situacao).toBe(
      'CONSUMIDA',
    );
    const saldos = await ctx.http().get('/api/estoque/saldos').set(auth(t.ESTOQUE));
    const deposito = saldos.body.find(
      (s: { local: { nome: string } }) => s.local.nome === 'Depósito de produto acabado',
    );
    expect(deposito.produtos).toEqual([]);
    const deNovo = await lancar({
      tipo: 'ENTRADA_SEMIACABADO',
      maquinaId: id['INJ-01'],
      divisaoId: div['CAD-0033'],
      leitura: 'T2-0000500',
    });
    expect(deNovo.status).toBe(422);
    expect(deNovo.body.mensagem).toMatch(/consumida/);
  });

  it('código único: sequência por posto nunca reutilizada', async () => {
    const t3 = await entrar(ctx, 'apontador@exemplo.com.br');
    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produtoId: id['CAD-0031'] },
    });
    const r = await ctx
      .http()
      .post(`/api/turnos/${turno}/eventos`)
      .set(auth(t3))
      .set('x-posto', id['posto:T1'])
      .send({
        id: randomUUID(),
        tipo: 'SAIDA_PRODUCAO',
        maquinaId: id['INJ-01'],
        horaOcorrencia: new Date().toISOString(),
        divisaoId: div['CAD-0031'],
        conjuntoPadraoId: conjunto.id,
        conjuntosPadrao: 1,
        pesoMedioG: 384,
      });
    expect(r.body.etiquetas[0].codigo > etq.saida[2].codigo).toBe(true);
    const todos = await ctx.prisma.etiqueta.findMany({ select: { codigo: true } });
    expect(new Set(todos.map((e) => e.codigo)).size).toBe(todos.length);
  });
});
