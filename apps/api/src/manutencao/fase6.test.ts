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

/** Fase 6: manutenção (RN-14) com OS em etapas por especialidade. */
describe('Manutenção', () => {
  let ctx: Contexto;
  let t: Awaited<ReturnType<typeof tokensPorPerfil>>;
  const tec: Record<string, string> = {};
  const id: Record<string, string> = {};
  let turno: string;
  const T0 = Date.now() - 3 * H; // hora da parada
  const em = (h: number) => new Date(T0 + h * H).toISOString();
  let solicitacao: string;
  let duplicada: string;
  let os: {
    id: string;
    etapas: {
      id: string;
      ordem: number;
      descricao: string;
      especialidade: string;
      situacaoExibida: string;
    }[];
  };

  const post = (url: string, token: string, corpo: object = {}) =>
    ctx.http().post(url).set(auth(token)).send(corpo);
  const get = (url: string, token: string) => ctx.http().get(url).set(auth(token));
  const etapa = (descricao: string) => os.etapas.find((e) => e.descricao === descricao)!;
  const lancar = (corpo: Record<string, unknown>) =>
    post(`/api/turnos/${turno}/eventos`, t.APONTADOR, {
      id: randomUUID(),
      maquinaId: id['INJ-01'],
      ...corpo,
    });
  const executar = async (descricao: string, token: string, inicio: number, fim: number) => {
    const e = etapa(descricao);
    const i = await post(`/api/manutencao/etapas/${e.id}/iniciar`, token, { inicio: em(inicio) });
    expect(i.status, `${descricao}: ${JSON.stringify(i.body)}`).toBe(200);
    const c = await post(`/api/manutencao/etapas/${e.id}/concluir`, token, {
      fim: em(fim),
      servicoExecutado: `${descricao}: feito`,
    });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    os = c.body;
  };

  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    t = await tokensPorPerfil(ctx);
    for (const n of ['eletrica', 'mecanica', 'ferramentaria', 'setup'])
      tec[n] = await entrar(ctx, `${n}@exemplo.com.br`);
    for (const m of await ctx.prisma.maquina.findMany()) id[m.codigo] = m.id;
    for (const m of await ctx.prisma.motivoParada.findMany()) id[`motivo:${m.codigo}`] = m.id;
    for (const u of await ctx.prisma.usuario.findMany()) id[u.login] = u.id;
    const equipe = await ctx.prisma.equipe.findUniqueOrThrow({ where: { letra: 'A' } });
    const sug = await get('/api/turnos/sugestao', t.APONTADOR);
    turno = (await post('/api/turnos', t.APONTADOR, { ...sug.body, equipeId: equipe.id })).body.id;
    await ctx.prisma.turnoApontamento.update({
      where: { id: turno },
      data: { inicioNominal: new Date(Date.now() - 6 * H), fimNominal: new Date(Date.now() + 6 * H) },
    });
    const rodada = await ctx.prisma.rodada.findFirstOrThrow({ where: { maquinaId: id['INJ-01'] } });
    const lig = await post(`/api/turnos/${turno}/maquinas`, t.APONTADOR, {
      eventoId: randomUUID(),
      maquinaId: id['INJ-01'],
      rodadaId: rodada.id,
      horaOcorrencia: new Date(T0 - H).toISOString(),
    });
    expect(lig.status, JSON.stringify(lig.body)).toBe(201);
  });
  afterAll(async () => ctx.app.close());

  it('parada com motivo de manutenção cria a solicitação sem ação extra do apontador', async () => {
    const ref = await lancar({
      tipo: 'PARADA',
      horaOcorrencia: new Date(T0 - 0.5 * H).toISOString(),
      motivoParadaId: id['motivo:REF'],
      justificativa: 'Almoço',
    });
    expect(ref.status, JSON.stringify(ref.body)).toBe(201);
    expect(await ctx.prisma.solicitacaoManutencao.count()).toBe(0);
    await lancar({
      tipo: 'REINICIO',
      horaOcorrencia: new Date(T0 - 0.25 * H).toISOString(),
      justificativa: 'Retorno',
    });

    const p = await lancar({
      tipo: 'PARADA',
      horaOcorrencia: em(0),
      motivoParadaId: id['motivo:MEC'],
      justificativa: 'Vazamento na câmara quente',
    });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    const lista = await get('/api/manutencao/solicitacoes?situacao=ABERTAS', t.LIDER);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({
      situacao: 'ABERTA',
      maquina: { codigo: 'INJ-01' },
      eventoParadaId: p.body.evento.id,
      ocorridaEm: em(0),
      descricao: 'INJ-01: MEC — Quebra mecânica — Vazamento na câmara quente',
      outrasAbertasMaquina: 0,
    });
    solicitacao = lista.body[0].id;
    const painel = await get('/api/painel/acompanhamento', t.ESTOQUE);
    expect(
      painel.body.maquinas.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01'),
    ).toMatchObject({
      situacao: 'PARADA',
      manutencaoAberta: 1,
    });
  });

  it('solicitação manual com máquina ou local (predial); recusa com justificativa só pelo controlador', async () => {
    expect(
      (
        await post('/api/manutencao/solicitacoes', t.APONTADOR, {
          local: 'Galpão 2',
          descricao: 'Goteira no telhado',
        })
      ).status,
    ).toBe(403);
    expect(
      (await post('/api/manutencao/solicitacoes', t.LIDER, { descricao: 'Goteira no telhado' })).status,
    ).toBe(400);
    const predial = await post('/api/manutencao/solicitacoes', t.LIDER, {
      local: 'Galpão 2',
      descricao: 'Goteira no telhado',
    });
    expect(predial.status, JSON.stringify(predial.body)).toBe(201);
    expect(predial.body).toMatchObject({ maquinaId: null, local: 'Galpão 2', situacao: 'ABERTA' });

    const dup = await post('/api/manutencao/solicitacoes', t.LIDER, {
      maquinaId: id['INJ-01'],
      descricao: 'Vazamento na câmara quente (de novo)',
    });
    duplicada = dup.body.id;
    const lista = await get('/api/manutencao/solicitacoes?situacao=ABERTAS', t.MANUTENCAO);
    expect(lista.body.find((s: { id: string }) => s.id === duplicada).outrasAbertasMaquina).toBe(1);

    expect(
      (
        await post(`/api/manutencao/solicitacoes/${duplicada}/recusar`, tec.eletrica, {
          justificativa: 'Duplicada da anterior',
        })
      ).status,
    ).toBe(403);
    expect((await post(`/api/manutencao/solicitacoes/${duplicada}/recusar`, t.MANUTENCAO, {})).status).toBe(
      400,
    );
    expect(
      (await post(`/api/manutencao/solicitacoes/${duplicada}/triagem`, t.MANUTENCAO)).body.situacao,
    ).toBe('EM_TRIAGEM');
    const r = await post(`/api/manutencao/solicitacoes/${duplicada}/recusar`, t.MANUTENCAO, {
      justificativa: 'Duplicada da anterior',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ situacao: 'RECUSADA', justificativaRecusa: 'Duplicada da anterior' });
    expect(
      (
        await post(`/api/manutencao/solicitacoes/${duplicada}/recusar`, t.MANUTENCAO, {
          justificativa: 'De novo aqui',
        })
      ).status,
    ).toBe(409);
  });

  it('controlador converte em OS com etapas em sequência e em paralelo, a partir do modelo', async () => {
    const modelos = await get('/api/manutencao/modelos', t.MANUTENCAO);
    const modelo = modelos.body.find((m: { nome: string }) => m.nome === 'Troca de câmara quente');
    expect(modelo.etapas).toHaveLength(8);
    const etapas = modelo.etapas.map((e: { descricao: string }) =>
      e.descricao === 'Avaliar a câmara quente' ? { ...e, responsavelId: id['eletrica@exemplo.com.br'] } : e,
    );
    expect(
      (
        await post(`/api/manutencao/solicitacoes/${solicitacao}/converter`, tec.setup, {
          tipo: 'CORRETIVA',
          etapas,
        })
      ).status,
    ).toBe(403);
    const errado = etapas.map((e: { descricao: string }) =>
      e.descricao === 'Trocar a câmara quente'
        ? { ...e, responsavelId: id['ferramentaria@exemplo.com.br'] }
        : e,
    );
    const recusa = await post(`/api/manutencao/solicitacoes/${solicitacao}/converter`, t.MANUTENCAO, {
      tipo: 'CORRETIVA',
      etapas: errado,
    });
    expect(recusa.status).toBe(422);
    expect(recusa.body.mensagem).toMatch(/não tem a especialidade/);

    const r = await post(`/api/manutencao/solicitacoes/${solicitacao}/converter`, t.MANUTENCAO, {
      tipo: 'CORRETIVA',
      eletiva: false,
      etapas,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    os = r.body;
    expect(r.body).toMatchObject({
      situacao: 'ABERTA',
      tipo: 'CORRETIVA',
      eletiva: false,
      controlador: { nome: 'Manuel Manutenção' },
    });
    expect(os.etapas.map((e) => e.situacaoExibida)).toEqual(['LIBERADA', ...Array(7).fill('AGUARDANDO')]);
    expect(
      (await ctx.prisma.solicitacaoManutencao.findUniqueOrThrow({ where: { id: solicitacao } })).situacao,
    ).toBe('CONVERTIDA');
  });

  it('cada etapa só pela especialidade responsável e quando liberada; paralelas correm juntas', async () => {
    const abrir = etapa('Abrir o molde');
    expect((await post(`/api/manutencao/etapas/${abrir.id}/iniciar`, tec.ferramentaria)).status).toBe(409);
    expect(
      (await post(`/api/manutencao/etapas/${etapa('Retirar o molde da máquina').id}/iniciar`, tec.eletrica))
        .status,
    ).toBe(403);
    expect(
      (await get('/api/manutencao/minhas-etapas', tec.setup)).body.etapas.map(
        (e: { descricao: string }) => e.descricao,
      ),
    ).toEqual(['Retirar o molde da máquina']);
    expect((await get('/api/manutencao/minhas-etapas', tec.ferramentaria)).body.etapas).toEqual([]);

    await executar('Retirar o molde da máquina', tec.setup, 1, 1.25);
    expect((await ctx.prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).situacao).toBe(
      'EM_EXECUCAO',
    );
    await executar('Abrir o molde', tec.ferramentaria, 1.25, 1.5);
    // Etapa com responsável definido: só ele (ou o controlador).
    const avaliar = etapa('Avaliar a câmara quente');
    expect((await post(`/api/manutencao/etapas/${avaliar.id}/iniciar`, tec.mecanica)).status).toBe(403);
    await executar('Avaliar a câmara quente', tec.eletrica, 1.5, 1.75);

    // Ordem 4: óleo (mecânica) e câmara (elétrica) em paralelo.
    const oleo = etapa('Trocar o óleo da máquina');
    const camara = etapa('Trocar a câmara quente');
    expect(
      (await post(`/api/manutencao/etapas/${oleo.id}/iniciar`, tec.mecanica, { inicio: em(1.75) })).status,
    ).toBe(200);
    const c = await post(`/api/manutencao/etapas/${camara.id}/iniciar`, tec.eletrica, { inicio: em(1.75) });
    expect(c.status).toBe(200);
    os = c.body;
    expect(etapa('Trocar o óleo da máquina').situacaoExibida).toBe('EM_EXECUCAO');
    expect(etapa('Trocar a câmara quente').situacaoExibida).toBe('EM_EXECUCAO');
    expect(etapa('Limpar o molde').situacaoExibida).toBe('AGUARDANDO');
    // Fim antes do início é recusado.
    expect(
      (
        await post(`/api/manutencao/etapas/${camara.id}/concluir`, tec.eletrica, {
          fim: em(1.5),
          servicoExecutado: 'trocada',
        })
      ).status,
    ).toBe(422);
    expect(
      (await post(`/api/manutencao/etapas/${camara.id}/concluir`, tec.eletrica, { fim: em(2.25) })).status,
    ).toBe(400);
    os = (
      await post(`/api/manutencao/etapas/${camara.id}/concluir`, tec.eletrica, {
        fim: em(2.25),
        servicoExecutado: 'Câmara trocada',
      })
    ).body;
    expect(etapa('Limpar o molde').situacaoExibida).toBe('AGUARDANDO');
    os = (
      await post(`/api/manutencao/etapas/${oleo.id}/concluir`, tec.mecanica, {
        fim: em(2.5),
        servicoExecutado: 'Óleo trocado',
      })
    ).body;
    expect(etapa('Limpar o molde').situacaoExibida).toBe('LIBERADA');
    expect(
      (await get('/api/manutencao/minhas-etapas', tec.ferramentaria)).body.etapas.map(
        (e: { descricao: string }) => e.descricao,
      ),
    ).toEqual(['Limpar o molde']);
  });

  it('controlador inclui e cancela etapas; só encerra com tudo finalizado; encerrar não reinicia a máquina', async () => {
    expect(
      (
        await post(`/api/manutencao/ordens/${os.id}/encerrar`, t.MANUTENCAO, {
          servicoExecutado: 'Troca concluída',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(`/api/manutencao/ordens/${os.id}/etapas`, t.MANUTENCAO, {
          etapas: [{ ordem: 1, descricao: 'Tarde demais', especialidade: 'SETUP' }],
        })
      ).status,
    ).toBe(422);
    const inc = await post(`/api/manutencao/ordens/${os.id}/etapas`, t.MANUTENCAO, {
      etapas: [{ ordem: 8, descricao: 'Testar ciclo em vazio', especialidade: 'SETUP' }],
    });
    expect(inc.status, JSON.stringify(inc.body)).toBe(201);
    os = inc.body;
    const extra = etapa('Testar ciclo em vazio');
    expect(
      (
        await post(`/api/manutencao/etapas/${extra.id}/cancelar`, tec.setup, {
          justificativa: 'Não precisa mais',
        })
      ).status,
    ).toBe(403);
    os = (
      await post(`/api/manutencao/etapas/${extra.id}/cancelar`, t.MANUTENCAO, {
        justificativa: 'Teste feito pela produção',
      })
    ).body;
    expect(etapa('Testar ciclo em vazio').situacaoExibida).toBe('CANCELADA');

    await executar('Limpar o molde', tec.ferramentaria, 2.5, 2.6);
    await executar('Fechar o molde', tec.ferramentaria, 2.6, 2.7);
    await executar('Recolocar o molde na máquina', tec.setup, 2.7, 2.9);

    const eventosAntes = await ctx.prisma.evento.count({ where: { turnoId: turno } });
    expect(
      (
        await post(`/api/manutencao/ordens/${os.id}/encerrar`, tec.eletrica, {
          servicoExecutado: 'Troca concluída',
        })
      ).status,
    ).toBe(403);
    const enc = await post(`/api/manutencao/ordens/${os.id}/encerrar`, t.MANUTENCAO, {
      servicoExecutado: 'Câmara quente trocada e óleo renovado',
    });
    expect(enc.status, JSON.stringify(enc.body)).toBe(200);
    expect(enc.body).toMatchObject({
      situacao: 'ENCERRADA',
      inicio: em(1),
      fim: em(2.9),
      tempoAteAtendimentoH: 1,
      tempoReparoH: 1.9,
    });
    expect(
      (await ctx.prisma.solicitacaoManutencao.findUniqueOrThrow({ where: { id: solicitacao } })).situacao,
    ).toBe('ENCERRADA');
    expect(
      (
        await post(`/api/manutencao/etapas/${etapa('Fechar o molde').id}/cancelar`, t.MANUTENCAO, {
          justificativa: 'depois de encerrada',
        })
      ).status,
    ).toBe(409);

    // A máquina continua parada: nenhum evento foi lançado e o painel não mostra mais manutenção aberta.
    expect(await ctx.prisma.evento.count({ where: { turnoId: turno } })).toBe(eventosAntes);
    const painel = await get('/api/painel/acompanhamento', t.ESTOQUE);
    expect(
      painel.body.maquinas.find((m: { maquina: { codigo: string } }) => m.maquina.codigo === 'INJ-01'),
    ).toMatchObject({
      situacao: 'PARADA',
      manutencaoAberta: 0,
    });
    // O reinício é sempre do apontador.
    expect((await lancar({ tipo: 'REINICIO', horaOcorrencia: new Date().toISOString() })).status).toBe(201);
  });

  it('indicadores: tempo até o atendimento, tempo de reparo, solicitações por máquina e horas por especialidade', async () => {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const ontem = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(Date.now() - 86_400_000),
    );
    const r = await get(`/api/manutencao/indicadores?inicio=${ontem}&fim=${hoje}`, t.PCP);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.porMaquina.find((m: { maquina: string }) => m.maquina === 'INJ-01')).toMatchObject({
      solicitacoes: 2,
      abertas: 0,
      recusadas: 1,
      convertidas: 1,
      atendimentoMedioH: 1,
      reparoMedioH: 1.9,
      reparoMaximoH: 1.9,
    });
    expect(r.body.porMaquina.find((m: { maquina: string }) => m.maquina === 'Local: Galpão 2')).toMatchObject(
      { solicitacoes: 1, abertas: 1 },
    );
    expect(
      Object.fromEntries(
        r.body.porEspecialidade.map((e: { especialidade: string; horas: number }) => [
          e.especialidade,
          e.horas,
        ]),
      ),
    ).toEqual({
      ELETRICA: 0.75,
      MECANICA: 0.75,
      SETUP: 0.45,
      FERRAMENTARIA: 0.45,
    });
    expect((await get(`/api/manutencao/indicadores?inicio=${hoje}&fim=${hoje}`, t.ESTOQUE)).status).toBe(403);
  });

  it('usuário guarda especialidades e marca de controlador; tudo fica na auditoria', async () => {
    const u = await get(`/api/usuarios/${id['mecanica@exemplo.com.br']}`, t.SUPERUSUARIO);
    expect(u.body).toMatchObject({
      especialidades: ['MECANICA', 'HIDRAULICA'],
      controladorManutencao: false,
    });
    const acoes = await ctx.prisma.registroAuditoria.findMany({
      where: { entidade: { in: ['OrdemServico', 'EtapaOrdemServico', 'SolicitacaoManutencao'] } },
    });
    expect(new Set(acoes.map((a) => a.acao))).toEqual(
      new Set([
        'CRIAR',
        'INICIAR_TRIAGEM',
        'RECUSAR',
        'INICIAR',
        'CONCLUIR',
        'INCLUIR_ETAPAS',
        'CANCELAR',
        'ENCERRAR',
      ]),
    );
  });
});
