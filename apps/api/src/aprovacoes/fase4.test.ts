import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
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

/** Fase 4: correções, aprovações, apuração e exportação (RN-09, RN-13, seção 9). */
describe('Correções, aprovações, apuração e exportação', () => {
  let ctx: Contexto;
  let t: Awaited<ReturnType<typeof tokensPorPerfil>>;
  let lider2: string;
  const id: Record<string, string> = {};
  const base = Date.now();
  let turno: string;
  let divisao: string;
  let saida: { eventoId: string; etiquetas: { codigo: string }[] };
  let novas: string[] = [];
  let perdaBorra: string;
  let entradaMp: string;
  let devolucao: string;

  const post = (url: string, token: string, corpo: object = {}) =>
    ctx.http().post(url).set(auth(token)).send(corpo);
  const get = (url: string, token: string) => ctx.http().get(url).set(auth(token));
  const lancar = (corpo: Record<string, unknown>) =>
    ctx
      .http()
      .post(`/api/turnos/${turno}/eventos`)
      .set(auth(t.APONTADOR))
      .set('x-posto', id['posto:T1'])
      .send({
        id: randomUUID(),
        horaOcorrencia: new Date().toISOString(),
        maquinaId: id['INJ-01'],
        divisaoId: divisao,
        ...corpo,
      });
  const pendencias = async (filtro = '') =>
    (await get(`/api/aprovacoes?turnoId=${turno}${filtro}`, t.LIDER)).body as {
      id: string;
      tipo: string;
      eventoId: string;
    }[];
  const receber = (codigo: string) =>
    post('/api/estoque/receber', t.ESTOQUE, { leitura: codigo, localEstoqueId: id['local:Expedição'] });

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    t = await tokensPorPerfil(ctx);
    lider2 = await entrar(ctx, 'lider2@exemplo.com.br');
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const p of await ctx.prisma.produto.findMany()) id[p.codigo] = p.id;
    for (const d of await ctx.prisma.dispositivo.findMany()) id[`posto:${d.prefixo}`] = d.id;
    for (const l of await ctx.prisma.localEstoque.findMany()) id[`local:${l.nome}`] = l.id;
    for (const l of await ctx.prisma.loteMaterial.findMany({ include: { material: true } }))
      id[`lote:${l.material.codigo}`] = l.numero;
    for (const tp of await ctx.prisma.tipoPerda.findMany()) id[`perda:${tp.descricao}`] = tp.id;
    await ctx.prisma.impressora.updateMany({ data: { enderecoIp: '127.0.0.1', porta: 9 } });

    const equipe = await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: 'A' } });
    const sug = await get('/api/turnos/sugestao', t.APONTADOR);
    turno = (await post('/api/turnos', t.APONTADOR, { ...sug.body, equipeId: equipe.id })).body.id;
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: { inicioNominal: new Date(base - 6 * H), fimNominal: new Date(base + 6 * H) },
    });
    const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id['INJ-01'] } });
    const lig = await post(`/api/turnos/${turno}/maquinas`, t.APONTADOR, {
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: rodada.id,
      horaOcorrencia: new Date(base - 3 * H).toISOString(),
    });
    expect(lig.status, JSON.stringify(lig.body)).toBe(201);
    const op = await ctx.prisma.rodadaOp.findFirstOrThrow({
      where: { rodadaId: rodada.id, ordem: { produto: { codigo: 'CAD-0031' } } },
    });
    divisao = (
      await post(`/api/turnos/${turno}/divisoes`, t.APONTADOR, { rodadaOpId: op.id, maquinaId: id['INJ-01'] })
    ).body.id;

    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produtoId: id['CAD-0031'] },
    });
    const s = await lancar({
      tipo: 'SAIDA_PRODUCAO',
      conjuntoPadraoId: conjunto.id,
      conjuntosPadrao: 3,
      pesoMedioG: 384,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    saida = { eventoId: s.body.evento.id, etiquetas: s.body.etiquetas };
    const ref = await lancar({ tipo: 'PERDA', tipoPerdaId: id['perda:Peça refugada'], quantidadePecas: 5 });
    expect(ref.status, JSON.stringify(ref.body)).toBe(201);
    const borra = await lancar({ tipo: 'PERDA', tipoPerdaId: id['perda:Borra'], pesoKg: 2 });
    perdaBorra = borra.body.evento.id;
    const mp = await lancar({ tipo: 'ENTRADA_MATERIA_PRIMA', leitura: id['lote:PP-H103'], quantidadeKg: 25 });
    expect(mp.status, JSON.stringify(mp.body)).toBe(201);
    entradaMp = mp.body.evento.id;
    const dev = await lancar({
      tipo: 'DEVOLUCAO_MATERIA_PRIMA',
      leitura: id['lote:PP-H103'],
      quantidadeKg: 5,
    });
    expect(dev.status, JSON.stringify(dev.body)).toBe(201);
    devolucao = dev.body.etiquetas[0].codigo;
  });
  afterAll(async () => ctx.app.close());

  it('matéria-prima estorna o recebimento da devolução; recebimento fica no histórico', async () => {
    const rec = await post('/api/materia-prima/receber', t.MATERIA_PRIMA, {
      leitura: devolucao,
      localEstoqueId: id['local:Silos'],
    });
    expect(rec.status, JSON.stringify(rec.body)).toBe(200);
    expect(
      (await post('/api/estoque/estornar', t.ESTOQUE, { leitura: devolucao, motivo: 'setor errado aqui' }))
        .status,
    ).toBe(422);
    const est = await post('/api/materia-prima/estornar', t.MATERIA_PRIMA, {
      leitura: devolucao,
      motivo: 'Quantidade devolvida errada',
    });
    expect(est.status, JSON.stringify(est.body)).toBe(200);
    expect(est.body.situacao).toBe('EMITIDA');
    const movs = await ctx.prisma.movimentoEstoque.findMany({
      where: { etiqueta: { codigo: devolucao } },
      orderBy: { criadoEm: 'asc' },
    });
    expect(movs.map((m) => m.tipo)).toEqual(['DEVOLUCAO_PRODUCAO', 'ESTORNO_RECEBIMENTO']);
    expect(
      (
        await post('/api/materia-prima/estornar', t.MATERIA_PRIMA, {
          leitura: devolucao,
          motivo: 'de novo o estorno',
        })
      ).status,
    ).toBe(409);
  });

  it('apontador solicita correção; perfis sem permissão e outros turnos são recusados', async () => {
    expect(
      (
        await post('/api/correcoes', t.ESTOQUE, {
          eventoId: saida.eventoId,
          tipo: 'ANULAR',
          justificativa: 'teste qualquer',
        })
      ).status,
    ).toBe(403);
    const semValores = await post('/api/correcoes', t.APONTADOR, {
      eventoId: saida.eventoId,
      tipo: 'CORRIGIR',
      justificativa: 'Eram só dois conjuntos',
    });
    expect(semValores.status).toBe(400);
    const outro = await entrar(ctx, 'apontador2@exemplo.com.br');
    expect(
      (
        await post('/api/correcoes', outro, {
          eventoId: saida.eventoId,
          tipo: 'ANULAR',
          justificativa: 'não é meu turno',
        })
      ).status,
    ).toBe(403);

    const conjunto = await ctx.prisma.conjuntoPadrao.findFirstOrThrow({
      where: { produtoId: id['CAD-0031'] },
    });
    const r = await post('/api/correcoes', t.APONTADOR, {
      eventoId: saida.eventoId,
      tipo: 'CORRIGIR',
      justificativa: 'Eram só dois conjuntos',
      valores: { divisaoId: divisao, conjuntoPadraoId: conjunto.id, conjuntosPadrao: 2, pesoMedioG: 384 },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'CORRECAO', situacao: 'PENDENTE', correcaoTipo: 'CORRIGIR' });
    expect((await ctx.prisma.evento.findUniqueOrThrow({ where: { id: saida.eventoId } })).situacao).toBe(
      'CORRECAO_PENDENTE',
    );
    const dup = await post('/api/correcoes', t.APONTADOR, {
      eventoId: saida.eventoId,
      tipo: 'ANULAR',
      justificativa: 'de novo aqui',
    });
    expect(dup.status).toBe(409);
  });

  it('quem solicitou não aprova; outro líder aprova', async () => {
    const r = await post('/api/correcoes', t.LIDER, {
      eventoId: perdaBorra,
      tipo: 'ANULAR',
      justificativa: 'Borra lançada em duplicidade',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const proprio = await post(`/api/aprovacoes/${r.body.id}/aprovar`, t.LIDER);
    expect(proprio.status).toBe(403);
    expect(proprio.body.mensagem).toBe('Quem solicitou a correção não pode aprová-la.');
    expect((await post(`/api/aprovacoes/${r.body.id}/aprovar`, t.APONTADOR)).status).toBe(403);
    const ok = await post(`/api/aprovacoes/${r.body.id}/aprovar`, lider2, { parecer: 'Confere' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const original = await ctx.prisma.evento.findUniqueOrThrow({
      where: { id: perdaBorra },
      include: { etiquetas: true },
    });
    expect(original.situacao).toBe('INCORRETO');
    expect(original.etiquetas.every((e) => e.situacao === 'CANCELADA')).toBe(true);
  });

  it('etiqueta já recebida exige estorno antes; depois a correção aplica com vínculo e nada some', async () => {
    const [primeira] = saida.etiquetas;
    expect((await receber(primeira.codigo)).status).toBe(200);
    const pend = (await pendencias()).find((p) => p.eventoId === saida.eventoId && p.tipo === 'CORRECAO')!;
    const bloqueada = await post(`/api/aprovacoes/${pend.id}/aprovar`, t.LIDER);
    expect(bloqueada.status, JSON.stringify(bloqueada.body)).toBe(422);
    expect(bloqueada.body.mensagem).toMatch(/já foi recebida \(Expedição\). Estorne o recebimento/);

    expect(
      (await post('/api/estoque/estornar', t.ESTOQUE, { leitura: primeira.codigo, motivo: 'abc' })).status,
    ).toBe(400);
    const est = await post('/api/estoque/estornar', t.ESTOQUE, {
      leitura: primeira.codigo,
      motivo: 'Correção da saída de produção',
    });
    expect(est.status, JSON.stringify(est.body)).toBe(200);
    expect(est.body).toMatchObject({ situacao: 'EMITIDA', localEstoqueId: null });
    const recs = await ctx.prisma.recebimento.findMany({ where: { etiqueta: { codigo: primeira.codigo } } });
    expect(recs).toHaveLength(1);
    expect(recs[0].estornadoEm).not.toBeNull();

    const ok = await post(`/api/aprovacoes/${pend.id}/aprovar`, t.LIDER);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.etiquetasCanceladas).toEqual(saida.etiquetas.map((e) => e.codigo));
    expect(ok.body.etiquetasNovas).toHaveLength(2);
    expect(ok.body.etiquetasNovas.every((c: string) => c.startsWith('T1-'))).toBe(true);
    novas = ok.body.etiquetasNovas;

    const original = await ctx.prisma.evento.findUniqueOrThrow({ where: { id: saida.eventoId } });
    expect(original.situacao).toBe('INCORRETO');
    const corretivo = await ctx.prisma.evento.findUniqueOrThrow({ where: { id: ok.body.eventoCorretivoId } });
    expect(corretivo).toMatchObject({ corrigeEventoId: saida.eventoId, quantidade: 60, situacao: 'VALIDO' });
    // O original continua no detalhe do turno (em vermelho na tela), fora dos cálculos.
    const det = await get(`/api/turnos/${turno}`, t.APONTADOR);
    expect(
      det.body.eventos.some(
        (e: { id: string; situacao: string }) => e.id === saida.eventoId && e.situacao === 'INCORRETO',
      ),
    ).toBe(true);
    const rel = await get(`/api/turnos/${turno}/relatorio`, t.LIDER);
    const opRel = rel.body.maquinas[0].ops[0];
    expect(opRel.producao).toBe(60);
    const canceladas = await ctx.prisma.etiqueta.findMany({
      where: { codigo: { in: saida.etiquetas.map((e) => e.codigo) } },
    });
    expect(canceladas.every((e) => e.situacao === 'CANCELADA' && e.canceladaEm)).toBe(true);
    // Saldo do estoque voltou a zero após o estorno.
    const saldos = await get('/api/estoque/saldos', t.ESTOQUE);
    expect(
      saldos.body.find((s: { local: { nome: string } }) => s.local.nome === 'Expedição')?.produtos ?? [],
    ).toEqual([]);
  });

  it('relatório não aprova com pendência aberta e o PCP não enxerga turno não aprovado', async () => {
    const f = await post(`/api/turnos/${turno}/fechar`, t.APONTADOR, {
      maquinas: [{ maquinaId: id['INJ-01'], acao: 'DESLIGAR' }],
      saldos: [],
    });
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    const pcp1 = await get('/api/apuracao/turnos', t.PCP);
    expect(pcp1.body.some((x: { id: string }) => x.id === turno)).toBe(false);
    const lista = await get('/api/turnos', t.PCP);
    expect(lista.body.some((x: { id: string }) => x.id === turno)).toBe(false);
    expect((await get(`/api/turnos/${turno}/relatorio`, t.PCP)).status).toBe(403);
    expect((await get(`/api/turnos/${turno}`, t.PCP)).status).toBe(403);
    expect((await post(`/api/turnos/${turno}/apurar`, t.PCP)).status).toBe(409);

    const r = await post('/api/correcoes', t.APONTADOR, {
      eventoId: entradaMp,
      tipo: 'ANULAR',
      justificativa: 'Lote errado na leitura',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const bloqueado = await post(`/api/turnos/${turno}/aprovar`, t.LIDER);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.mensagem).toMatch(/pendência/);
    expect((await post(`/api/aprovacoes/${r.body.id}/rejeitar`, t.LIDER, {})).status).toBe(400);
    const rej = await post(`/api/aprovacoes/${r.body.id}/rejeitar`, t.LIDER, {
      parecer: 'O lote está certo',
    });
    expect(rej.status).toBe(200);
    expect((await ctx.prisma.evento.findUniqueOrThrow({ where: { id: entradaMp } })).situacao).toBe('VALIDO');

    // A ligação retroativa da máquina gerou pendência de horário: o líder decide antes de aprovar.
    for (const p of await pendencias())
      expect((await post(`/api/aprovacoes/${p.id}/aprovar`, t.LIDER)).status).toBe(200);
    expect((await post(`/api/turnos/${turno}/aprovar`, t.APONTADOR)).status).toBe(403);
    const ap = await post(`/api/turnos/${turno}/aprovar`, t.LIDER, { parecer: 'Turno conferido' });
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body.situacao).toBe('APROVADO');
    const pcp2 = await get('/api/apuracao/turnos', t.PCP);
    expect(pcp2.body.some((x: { id: string }) => x.id === turno)).toBe(true);
    expect((await get(`/api/turnos/${turno}/relatorio`, t.PCP)).status).toBe(200);
  });

  it('PCP devolve ao líder com parecer; após nova aprovação, apura', async () => {
    const dev = await post(`/api/turnos/${turno}/devolver`, t.PCP, {
      parecer: 'Refugo divergente do relatório',
    });
    expect(dev.status, JSON.stringify(dev.body)).toBe(200);
    expect(dev.body).toMatchObject({
      situacao: 'FECHADO',
      parecerDevolucao: 'Refugo divergente do relatório',
    });
    expect((await post(`/api/turnos/${turno}/aprovar`, t.LIDER)).status).toBe(409);
    const p = (await pendencias()).find((x) => x.tipo === 'JUSTIFICATIVA')!;
    expect(
      (await post(`/api/aprovacoes/${p.id}/aprovar`, t.LIDER, { parecer: 'Refugo conferido' })).status,
    ).toBe(200);
    expect((await post(`/api/turnos/${turno}/aprovar`, t.LIDER)).status).toBe(200);
    expect((await post(`/api/turnos/${turno}/apurar`, t.APONTADOR)).status).toBe(403);
    const ap = await post(`/api/turnos/${turno}/apurar`, t.PCP);
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body.situacao).toBe('APURADO');
  });

  it('exportação gera os arquivos no layout mapeado, dá baixa e não exporta o mesmo item duas vezes', async () => {
    expect((await receber(novas[0])).status).toBe(200);
    const previa = await get('/api/exportacoes/previa', t.PCP);
    expect(previa.body.naoRecebidas.map((e: { codigo: string }) => e.codigo)).toEqual([novas[1]]);
    expect(previa.body.turnos).toBe(1);

    expect((await post('/api/exportacoes', t.LIDER)).status).toBe(403);
    const e1 = await post('/api/exportacoes', t.PCP);
    expect(e1.status, JSON.stringify(e1.body)).toBe(201);
    expect(e1.body.resumo).toMatchObject({
      EXPORTACAO_PRODUCAO: 1,
      EXPORTACAO_CONSUMO: 1,
      EXPORTACAO_PERDAS: 1,
      EXPORTACAO_ETIQUETAS: 1,
      naoRecebidas: 1,
    });
    const itens = await ctx.prisma.itemExportacao.findMany({ where: { loteId: e1.body.id } });
    const prod = itens.find((i) => i.layout === 'EXPORTACAO_PRODUCAO')!.dados;
    expect(prod).toMatchObject({
      codigoProduto: 'CAD-0031',
      quantidade: 30,
      conjuntos: 1,
      quantidadeAvulsos: 0,
      pecasRefugadas: 5,
      loteExportacao: e1.body.numero,
    });
    expect(itens.find((i) => i.layout === 'EXPORTACAO_CONSUMO')!.dados).toMatchObject({
      entradaKg: 25,
      devolucaoKg: 5,
      consumoLiquidoKg: 20,
    });
    expect(itens.find((i) => i.layout === 'EXPORTACAO_PERDAS')!.dados).toMatchObject({
      tipoPerda: 'Peça refugada',
      quantidadePecas: 5,
    });

    // Baixa no estoque e situação exportada.
    const etq = await ctx.prisma.etiqueta.findUniqueOrThrow({ where: { codigo: novas[0] } });
    expect(etq).toMatchObject({ situacao: 'EXPORTADA', exportacaoId: e1.body.id });
    const saldos = await get('/api/estoque/saldos', t.ESTOQUE);
    expect(
      saldos.body.find((s: { local: { nome: string } }) => s.local.nome === 'Expedição')?.produtos ?? [],
    ).toEqual([]);
    expect((await ctx.prisma.turnoApontamento.findUniqueOrThrow({ where: { id: turno } })).situacao).toBe(
      'EXPORTADO',
    );

    // Nada novo: não exporta de novo.
    const vazio = await post('/api/exportacoes', t.PCP);
    expect(vazio.status).toBe(422);

    // A etiqueta recebida depois sai no lote seguinte, sem repetir consumo, perdas e refugo.
    expect((await receber(novas[1])).status).toBe(200);
    const e2 = await post('/api/exportacoes', t.PCP);
    expect(e2.status).toBe(201);
    expect(e2.body.resumo).toMatchObject({
      EXPORTACAO_PRODUCAO: 1,
      EXPORTACAO_CONSUMO: 0,
      EXPORTACAO_PERDAS: 0,
      EXPORTACAO_ETIQUETAS: 1,
    });
    const prod2 = (
      await ctx.prisma.itemExportacao.findFirstOrThrow({
        where: { loteId: e2.body.id, layout: 'EXPORTACAO_PRODUCAO' },
      })
    ).dados;
    expect(prod2).toMatchObject({ quantidade: 30, pecasRefugadas: 0 });
    const todas = await ctx.prisma.itemExportacao.findMany({ where: { layout: 'EXPORTACAO_ETIQUETAS' } });
    const codigos = todas.map((i) => (i.dados as { codigoEtiqueta: string }).codigoEtiqueta);
    expect(new Set(codigos).size).toBe(codigos.length);

    // Arquivo com os nomes de coluna mapeados; regerado com o novo mapeamento.
    const baixar = async (numero: number) => {
      const r = await ctx
        .http()
        .get(`/api/exportacoes/${numero}/arquivos/EXPORTACAO_PRODUCAO`)
        .set(auth(t.PCP))
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (c: Buffer) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(r.status).toBe(200);
      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(r.body as never);
      const planilha = livro.worksheets[0];
      return {
        cabecalho: (planilha.getRow(1).values as unknown[]).slice(1),
        linha: (planilha.getRow(2).values as unknown[]).slice(1),
        linhas: planilha.rowCount,
      };
    };
    const a = await baixar(e1.body.numero);
    expect(a.cabecalho[1]).toBe('Número da OP no ERP');
    expect(a.linhas).toBe(2);
    const map = await ctx
      .http()
      .put('/api/importacoes/layouts/EXPORTACAO_PRODUCAO')
      .set(auth(t.SUPERUSUARIO))
      .send({ colunas: { numeroErp: 'OP', quantidade: 'QTDE' } });
    expect(map.status, JSON.stringify(map.body)).toBe(200);
    const b = await baixar(e1.body.numero);
    expect(b.cabecalho[1]).toBe('OP');
    expect(b.cabecalho).toContain('QTDE');
    expect(b.linha[b.cabecalho.indexOf('QTDE')]).toBe(30);
    const lista = await get('/api/exportacoes', t.PCP);
    expect(lista.body.map((l: { numero: number }) => l.numero)).toEqual([e2.body.numero, e1.body.numero]);
  });

  it('turno exportado não aceita nenhuma alteração', async () => {
    const corretivo = await ctx.prisma.evento.findFirstOrThrow({
      where: { corrigeEventoId: saida.eventoId },
    });
    const c = await post('/api/correcoes', t.LIDER, {
      eventoId: corretivo.id,
      tipo: 'ANULAR',
      justificativa: 'tentativa após exportar',
    });
    expect(c.status).toBe(409);
    expect(c.body.mensagem).toBe('Turno exportado não aceita nenhuma alteração.');
    expect((await lancar({ tipo: 'PERDA', tipoPerdaId: id['perda:Borra'], pesoKg: 1 })).status).toBe(409);
    expect((await post(`/api/turnos/${turno}/aprovar`, t.LIDER)).status).toBe(409);
    expect((await post(`/api/turnos/${turno}/devolver`, t.PCP, { parecer: 'tentativa tardia' })).status).toBe(
      409,
    );
    expect((await post(`/api/turnos/${turno}/apurar`, t.PCP)).status).toBe(409);
    const est = await post('/api/estoque/estornar', t.ESTOQUE, {
      leitura: novas[0],
      motivo: 'tentativa após exportar',
    });
    expect(est.status).toBe(409);
    const fechar = await post(`/api/turnos/${turno}/fechar`, t.APONTADOR, { maquinas: [], saldos: [] });
    expect(fechar.status).toBe(409);
  });
});
