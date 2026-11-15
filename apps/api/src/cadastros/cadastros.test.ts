import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

describe('Cadastros e auditoria', () => {
  let ctx: Contexto;
  let su: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    su = (await tokensPorPerfil(ctx)).SUPERUSUARIO;
  });
  afterAll(async () => ctx.app.close());

  const ultimaAuditoria = (entidade: string, entidadeId: string) =>
    ctx.prisma.registroAuditoria.findFirst({ where: { entidade, entidadeId }, orderBy: { id: 'desc' } });

  /** Para cada cadastro: cria, altera e confere a auditoria com valores anterior e novo. */
  const casos: {
    rota: string;
    entidade: string;
    criar: () => Promise<object> | object;
    campo: string;
    novoValor: unknown;
  }[] = [
    {
      rota: 'horarios-turno',
      entidade: 'HorarioTurno',
      criar: () => ({
        nome: 'Madrugada',
        modalidade: 'REVEZAMENTO',
        horaInicio: '23:00',
        horaFim: '05:00',
        diasSemana: [1, 2, 3],
      }),
      campo: 'horaFim',
      novoValor: '06:00',
    },
    {
      rota: 'equipes',
      entidade: 'Equipe',
      criar: () => ({ letra: 'e', descricao: 'Equipe E' }),
      campo: 'descricao',
      novoValor: 'Equipe Extra',
    },
    {
      rota: 'maquinas',
      entidade: 'Maquina',
      criar: () => ({
        codigo: 'EXT-02',
        descricao: 'Extrusora nova',
        tipo: 'EXTRUSORA',
        capacidadeKgH: 60,
        parametrosAdicionais: [{ nome: 'Diâmetro da rosca', valor: '60', unidade: 'mm' }],
      }),
      campo: 'capacidadeKgH',
      novoValor: 75,
    },
    {
      rota: 'moldes',
      entidade: 'Molde',
      criar: () => ({
        codigo: 'MOL-TESTE',
        descricao: 'Molde teste',
        larguraMm: 300,
        comprimentoMm: 300,
        alturaMm: 300,
        pesoKg: 200,
        numeroCavidades: 2,
        forcaFechamentoT: 100,
        pressaoBar: 1000,
        pesoInjetadoG: 100,
      }),
      campo: 'pesoKg',
      novoValor: 250,
    },
    {
      rota: 'produtos',
      entidade: 'Produto',
      criar: () => ({ codigo: 'TES-001', descricao: 'Produto teste', tipo: 'ACABADO', unidade: 'PECA' }),
      campo: 'descricao',
      novoValor: 'Produto teste alterado',
    },
    {
      rota: 'conjuntos-padrao',
      entidade: 'ConjuntoPadrao',
      criar: async () => ({
        produtoId: (await ctx.prisma.produto.findUniqueOrThrow({ where: { codigo: 'CAD-0031' } })).id,
        tipoEmbalagem: 'PALLET',
        quantidade: 120,
      }),
      campo: 'quantidade',
      novoValor: 150,
    },
    {
      rota: 'motivos-parada',
      entidade: 'MotivoParada',
      criar: () => ({
        codigo: 'TST',
        descricao: 'Teste',
        programada: false,
        geraSolicitacaoManutencao: true,
      }),
      campo: 'programada',
      novoValor: true,
    },
    {
      rota: 'tipos-perda',
      entidade: 'TipoPerda',
      criar: () => ({ descricao: 'Bolha', contaComoRefugo: false }),
      campo: 'contaComoRefugo',
      novoValor: true,
    },
    {
      rota: 'locais-estoque',
      entidade: 'LocalEstoque',
      criar: () => ({ nome: 'Doca 2', tipo: 'PRODUTO_ACABADO' }),
      campo: 'nome',
      novoValor: 'Doca 3',
    },
    {
      rota: 'impressoras',
      entidade: 'Impressora',
      criar: () => ({ nome: 'Zebra Teste', enderecoIp: '10.0.0.9', porta: 9100, resolucaoDpi: 203 }),
      campo: 'resolucaoDpi',
      novoValor: 300,
    },
    {
      rota: 'layouts-etiqueta',
      entidade: 'LayoutEtiqueta',
      criar: () => ({
        nome: 'Produto 100x50',
        tipoEtiqueta: 'PRODUTO',
        larguraMm: 100,
        alturaMm: 50,
        modeloZpl: '^XA^FO20,20^FD{{codigo}}^FS^XZ',
      }),
      campo: 'alturaMm',
      novoValor: 60,
    },
    {
      rota: 'dispositivos',
      entidade: 'Dispositivo',
      criar: () => ({ nome: 'Tablet teste', prefixo: 't9' }),
      campo: 'nome',
      novoValor: 'Tablet teste 2',
    },
  ];

  for (const caso of casos) {
    it(`${caso.rota}: criar e alterar gravam auditoria com valor anterior e novo`, async () => {
      const dados = await caso.criar();
      const criado = await ctx.http().post(`/api/${caso.rota}`).set(auth(su)).send(dados);
      expect(criado.status, JSON.stringify(criado.body)).toBe(201);
      const audCriar = await ultimaAuditoria(caso.entidade, criado.body.id);
      expect(audCriar).toMatchObject({ acao: 'CRIAR', usuarioLogin: 'admin@admin.com.br' });

      const {
        id: _id,
        criadoEm: _c,
        atualizadoEm: _a,
        cavidades: _cv,
        produto: _p,
        impressoraPadrao: _i,
        ...atual
      } = criado.body;
      const alterado = await ctx
        .http()
        .put(`/api/${caso.rota}/${criado.body.id}`)
        .set(auth(su))
        .send({ ...atual, [caso.campo]: caso.novoValor });
      expect(alterado.status, JSON.stringify(alterado.body)).toBe(200);
      expect(alterado.body[caso.campo]).toEqual(caso.novoValor);

      const aud = await ultimaAuditoria(caso.entidade, criado.body.id);
      expect(aud?.acao).toBe('ATUALIZAR');
      expect(aud?.valorAnterior).toEqual({ [caso.campo]: criado.body[caso.campo] });
      expect(aud?.valorNovo).toEqual({ [caso.campo]: caso.novoValor });

      // A consulta de auditoria pela API também mostra a alteração.
      const lista = await ctx
        .http()
        .get(`/api/auditoria?entidade=${caso.entidade}&entidadeId=${criado.body.id}`)
        .set(auth(su));
      expect(lista.body.itens.map((i: { acao: string }) => i.acao)).toEqual(['ATUALIZAR', 'CRIAR']);
    });
  }

  it('validação retorna 400 com mensagens em português por campo', async () => {
    const r = await ctx
      .http()
      .post('/api/maquinas')
      .set(auth(su))
      .send({ codigo: 'INJ-09', descricao: 'Nova', tipo: 'INJETORA' });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toBe('Dados inválidos. Corrija os campos indicados.');
    expect(r.body.detalhes).toContainEqual({
      campo: 'forcaFechamentoT',
      mensagem: 'Força de fechamento é obrigatório para injetora e sopradora.',
    });
  });

  it('código duplicado retorna 409', async () => {
    const r = await ctx
      .http()
      .post('/api/produtos')
      .set(auth(su))
      .send({ codigo: 'CAD-0031', descricao: 'Dup', tipo: 'ACABADO', unidade: 'PECA' });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/Já existe/);
  });

  it('filtro de ativos e busca', async () => {
    const r = await ctx.http().get('/api/maquinas?busca=inj&ativos=true').set(auth(su));
    expect(r.body.map((m: { codigo: string }) => m.codigo)).toEqual(['INJ-01', 'INJ-02', 'INJ-03']);
  });

  it('molde: cavidades acompanham o número de cavidades e o produto de cada cavidade é auditado', async () => {
    const r = await ctx.http().post('/api/moldes').set(auth(su)).send({
      codigo: 'MOL-CAV',
      descricao: 'x',
      larguraMm: 300,
      comprimentoMm: 300,
      alturaMm: 300,
      pesoKg: 200,
      numeroCavidades: 4,
      forcaFechamentoT: 100,
      pressaoBar: 1000,
      pesoInjetadoG: 100,
    });
    expect(r.body.cavidades.map((c: { numero: number }) => c.numero)).toEqual([1, 2, 3, 4]);
    const { id, cavidades: _c, criadoEm: _a, atualizadoEm: _b, ...molde } = r.body;
    const menor = await ctx
      .http()
      .put(`/api/moldes/${id}`)
      .set(auth(su))
      .send({ ...molde, numeroCavidades: 2 });
    expect(menor.body.cavidades).toHaveLength(2);

    const produto = await ctx.prisma.produto.findUniqueOrThrow({ where: { codigo: 'BAL-0005' } });
    const cav = await ctx
      .http()
      .put(`/api/moldes/${id}/cavidades`)
      .set(auth(su))
      .send({ cavidades: [{ numero: 1, produtoId: produto.id }] });
    expect(cav.status).toBe(200);
    expect(cav.body[0].produto.codigo).toBe('BAL-0005');
    const aud = await ultimaAuditoria('Molde', id);
    expect(aud).toMatchObject({ acao: 'ATUALIZAR_CAVIDADES', valorNovo: { cavidade_1: produto.id } });

    const mp = await ctx.prisma.produto.findUniqueOrThrow({ where: { codigo: 'PP-H103' } });
    const kg = await ctx
      .http()
      .put(`/api/moldes/${id}/cavidades`)
      .set(auth(su))
      .send({ cavidades: [{ numero: 2, produtoId: mp.id }] });
    expect(kg.status).toBe(422);
  });

  it('molde: não reduz cavidades abaixo do usado por ficha vigente', async () => {
    const molde = await ctx.prisma.molde.findUniqueOrThrow({ where: { codigo: 'MOL-FRA-4' } });
    const { id, criadoEm: _a, atualizadoEm: _b, ...dados } = molde;
    const r = await ctx
      .http()
      .put(`/api/moldes/${id}`)
      .set(auth(su))
      .send({ ...dados, numeroCavidades: 2 });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/4 cavidades/);
  });
});
