import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  criarContexto,
  prepararComDadosExemplo,
  tokensPorPerfil,
  type Contexto,
} from '../testes/auxiliar.js';

async function planilha(cabecalho: string[], linhas: unknown[][]): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  const ws = livro.addWorksheet('Dados');
  ws.addRow(cabecalho);
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const CAB_OPS = [
  'Número da OP',
  'Código do produto',
  'Quantidade',
  'Unidade',
  'Início previsto',
  'Término previsto',
  'Observação',
];

describe('Importação de Excel com mapeamento de colunas (seção 9)', () => {
  let ctx: Contexto;
  let pcp: string;
  let su: string;
  let apontador: string;
  beforeAll(async () => {
    ctx = await criarContexto();
    await prepararComDadosExemplo(ctx.prisma);
    const t = await tokensPorPerfil(ctx);
    pcp = t.PCP;
    su = t.SUPERUSUARIO;
    apontador = t.APONTADOR;
  });
  afterAll(async () => ctx.app.close());

  const enviar = (rota: string, token: string, arquivo: Buffer, simular = false) =>
    ctx
      .http()
      .post(`/api/importacoes/${rota}${simular ? '?simular=true' : ''}`)
      .set(auth(token))
      .attach('arquivo', arquivo, 'ops.xlsx');

  it('baixa o arquivo-modelo com as colunas do layout', async () => {
    const r = await ctx
      .http()
      .get('/api/importacoes/layouts/IMPORTACAO_ORDENS/modelo')
      .set(auth(pcp))
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(r.status).toBe(200);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(r.body as unknown as ArrayBuffer);
    expect(livro.worksheets[0].getRow(1).values).toEqual([undefined, ...CAB_OPS]);
  });

  it('valida o arquivo inteiro antes de gravar e mostra os erros por linha: tudo ou nada', async () => {
    const arquivo = await planilha(CAB_OPS, [
      ['2000001', 'CAD-0031', 1000, 'PC', '17/11/2026', '20/11/2026', ''],
      ['2000002', 'NAO-EXISTE', 50, 'PC', '', '', ''],
      ['2000003', 'CAD-0032', -5, 'KG', '31/02/2026', '', ''],
      ['2000001', 'CAD-0031', 10, 'PC', '', '', ''],
    ]);
    const r = await enviar('ordens', pcp, arquivo);
    expect(r.status).toBe(201);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.erros, JSON.stringify(r.body.erros)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ linha: 3, campo: 'codigoProduto' }),
        expect.objectContaining({ linha: 4, campo: 'quantidade' }),
        expect.objectContaining({ linha: 4, campo: 'unidade' }),
        expect.objectContaining({ linha: 4, campo: 'dataInicioPrevista' }),
        expect.objectContaining({ linha: 5, campo: 'numeroErp' }),
      ]),
    );
    expect(await ctx.prisma.ordemProducao.count({ where: { numeroErp: { startsWith: '20000' } } })).toBe(0);
    const reg = await ctx.prisma.importacao.findUniqueOrThrow({ where: { id: r.body.importacaoId } });
    expect(reg).toMatchObject({ sucesso: false, linhas: 4, arquivoNome: 'ops.xlsx' });
  });

  it('simula, importa e registra; linha repetida atualiza OP sem apontamentos', async () => {
    const arquivo = await planilha(CAB_OPS, [
      ['2000001', 'CAD-0031', 1000, 'PC', '17/11/2026', '20/11/2026', 'urgente'],
      ['2000002', 'cad-0032', '1.500,5', 'pç', '', '', ''],
    ]);
    const sim = await enviar('ordens', pcp, arquivo, true);
    expect(sim.body).toMatchObject({ sucesso: true, novos: 2, simulacao: true });
    expect(await ctx.prisma.ordemProducao.count({ where: { numeroErp: { startsWith: '20000' } } })).toBe(0);
    const r = await enviar('ordens', pcp, arquivo);
    expect(r.body).toMatchObject({ sucesso: true, criados: 2, atualizados: 0 });
    const op = await ctx.prisma.ordemProducao.findUniqueOrThrow({ where: { numeroErp: '2000002' } });
    expect(op).toMatchObject({ quantidade: 1500.5, unidade: 'PECA', origem: 'IMPORTACAO' });
    const deNovo = await enviar(
      'ordens',
      pcp,
      await planilha(CAB_OPS, [['2000001', 'CAD-0031', 1200, 'PC', '', '', '']]),
    );
    expect(deNovo.body).toMatchObject({ criados: 0, atualizados: 1 });
    expect(
      (await ctx.prisma.ordemProducao.findUniqueOrThrow({ where: { numeroErp: '2000001' } })).quantidade,
    ).toBe(1200);
    const lista = await ctx.http().get('/api/importacoes').set(auth(pcp));
    expect(lista.body.length).toBe(3);
    expect(lista.body[0].arquivo).toBeUndefined();
  });

  it('linha repetida de OP com apontamentos é recusada', async () => {
    const op = await ctx.prisma.ordemProducao.findUniqueOrThrow({ where: { numeroErp: '2000001' } });
    await ctx.prisma.ordemProducao.update({ where: { id: op.id }, data: { situacao: 'EM_PRODUCAO' } });
    const r = await enviar(
      'ordens',
      pcp,
      await planilha(CAB_OPS, [['2000001', 'CAD-0031', 1, 'PC', '', '', '']]),
    );
    expect(r.body.sucesso).toBe(false);
    expect(r.body.erros[0].mensagem).toMatch(/já possui apontamentos/);
  });

  it('superusuário mapeia o nome das colunas; a importação passa a usar o novo nome', async () => {
    expect(
      (
        await ctx
          .http()
          .put('/api/importacoes/layouts/IMPORTACAO_ORDENS')
          .set(auth(pcp))
          .send({ colunas: { numeroErp: 'OP' } })
      ).status,
    ).toBe(403);
    const m = await ctx
      .http()
      .put('/api/importacoes/layouts/IMPORTACAO_ORDENS')
      .set(auth(su))
      .send({ colunas: { numeroErp: 'Ordem ERP', quantidade: 'Qtde' } });
    expect(m.status).toBe(200);
    expect(m.body.campos.find((c: { campo: string }) => c.campo === 'numeroErp').coluna).toBe('Ordem ERP');
    const antigo = await enviar(
      'ordens',
      pcp,
      await planilha(CAB_OPS, [['3000001', 'CAD-0031', 1, 'PC', '', '', '']]),
    );
    expect(antigo.body.erros[0].mensagem).toMatch(/Coluna "Ordem ERP" não encontrada/);
    const novo = await enviar(
      'ordens',
      pcp,
      await planilha(
        ['Ordem ERP', 'Código do produto', 'Qtde', 'Unidade'],
        [['3000001', 'CAD-0031', 10, 'PC']],
      ),
    );
    expect(novo.body).toMatchObject({ sucesso: true, criados: 1 });
    const aud = await ctx.prisma.registroAuditoria.findFirst({ where: { entidade: 'MapeamentoColuna' } });
    expect(aud?.valorNovo).toMatchObject({ numeroErp: 'Ordem ERP' });
  });

  it('importa produtos com conjunto padrão; apontador não importa', async () => {
    const arquivo = await planilha(
      ['Código', 'Descrição', 'Tipo', 'Unidade', 'Cor', 'Qtd por conjunto', 'Embalagem'],
      [
        ['CAD-0040', 'Cadeira com braço', 'Acabado', 'PC', 'Branca', 25, 'Pilha'],
        ['MP-NOVA', 'PP copolímero', 'Matéria-prima', 'KG', '', '', ''],
      ],
    );
    expect((await enviar('produtos', apontador, arquivo)).status).toBe(403);
    const r = await enviar('produtos', pcp, arquivo);
    expect(r.body).toMatchObject({ sucesso: true, criados: 2 });
    const prod = await ctx.prisma.produto.findUniqueOrThrow({
      where: { codigo: 'CAD-0040' },
      include: { conjuntos: true },
    });
    expect(prod).toMatchObject({ tipo: 'ACABADO', unidade: 'PECA' });
    expect(prod.conjuntos[0]).toMatchObject({ tipoEmbalagem: 'PILHA', quantidade: 25 });
    expect((await ctx.prisma.produto.findUniqueOrThrow({ where: { codigo: 'MP-NOVA' } })).tipo).toBe(
      'MATERIA_PRIMA',
    );
  });
});
