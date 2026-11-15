import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  interpretarData,
  interpretarEnum,
  interpretarNumero,
  interpretarUnidade,
  LAYOUTS_EXCEL,
  LAYOUTS_IMPORTACAO,
  ROTULO_TIPO_EMBALAGEM,
  ROTULO_TIPO_PRODUTO,
  type LayoutImportacao,
  type TipoEmbalagem,
  type TipoProduto,
} from '@apontamento/shared';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

export interface ErroLinha {
  linha: number | null;
  campo?: string;
  mensagem: string;
}

type Linha = { numero: number; valores: Record<string, unknown> };

/** Normaliza o valor de uma célula do exceljs (fórmula, texto rico, hyperlink). */
function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return valorCelula(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return v;
}

const texto = (v: unknown): string =>
  v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v).trim();
const chaveColuna = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

interface OrdemImportada {
  linha: number;
  numeroErp: string;
  produtoId: string;
  quantidade: number;
  unidade: 'PECA' | 'KG';
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacao: string | null;
  existenteId: string | null;
}

interface ProdutoImportado {
  linha: number;
  codigo: string;
  descricao: string;
  tipo: TipoProduto;
  unidade: 'PECA' | 'KG';
  cor: string | null;
  quantidadeConjunto: number | null;
  tipoEmbalagem: TipoEmbalagem | null;
  existenteId: string | null;
}

/** Importação de OPs e produtos por Excel, com mapeamento de colunas (seção 9). */
@Injectable()
export class ImportacaoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private validarLayout(layout: string): LayoutImportacao {
    if (!LAYOUTS_IMPORTACAO.includes(layout as LayoutImportacao)) throw naoEncontrado('Layout');
    return layout as LayoutImportacao;
  }

  /** Nome da coluna de cada campo: o mapeado pelo superusuário ou o padrão. */
  async colunas(layout: LayoutImportacao): Promise<Record<string, string>> {
    const mapeados = await this.prisma.mapeamentoColuna.findMany({ where: { layout } });
    const mapa = new Map(mapeados.map((m) => [m.campo, m.coluna]));
    return Object.fromEntries(
      LAYOUTS_EXCEL[layout].campos.map((c) => [c.campo, mapa.get(c.campo) ?? c.colunaPadrao]),
    );
  }

  async layouts() {
    const r = [];
    for (const layout of LAYOUTS_IMPORTACAO) {
      const colunas = await this.colunas(layout);
      r.push({
        layout,
        titulo: LAYOUTS_EXCEL[layout].titulo,
        campos: LAYOUTS_EXCEL[layout].campos.map((c) => ({ ...c, coluna: colunas[c.campo] })),
      });
    }
    return r;
  }

  async salvarMapeamento(layoutTexto: string, colunas: Record<string, string>, usuario: UsuarioAutenticado) {
    const layout = this.validarLayout(layoutTexto);
    const campos = new Set(LAYOUTS_EXCEL[layout].campos.map((c) => c.campo));
    const desconhecido = Object.keys(colunas).find((c) => !campos.has(c));
    if (desconhecido) throw new ErroNegocio(`Campo desconhecido no layout: ${desconhecido}.`);
    const anteriores = await this.colunas(layout);
    const finais = { ...anteriores, ...colunas };
    const nomes = Object.values(finais).map(chaveColuna);
    if (new Set(nomes).size !== nomes.length)
      throw new ErroNegocio('Duas colunas não podem ter o mesmo nome.');
    await this.prisma.$transaction(async (tx) => {
      for (const [campo, coluna] of Object.entries(colunas)) {
        await tx.mapeamentoColuna.upsert({
          where: { layout_campo: { layout, campo } },
          create: { layout, campo, coluna },
          update: { coluna },
        });
      }
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'MapeamentoColuna',
        entidadeId: layout,
        acao: 'ATUALIZAR',
        anterior: anteriores,
        novo: finais,
      });
    });
    return (await this.layouts()).find((l) => l.layout === layout);
  }

  /** Arquivo-modelo do layout: cabeçalho com os nomes mapeados e uma linha de exemplo. */
  async modelo(layoutTexto: string): Promise<Buffer> {
    const layout = this.validarLayout(layoutTexto);
    const colunas = await this.colunas(layout);
    const livro = new ExcelJS.Workbook();
    const planilha = livro.addWorksheet(LAYOUTS_EXCEL[layout].titulo);
    const campos = LAYOUTS_EXCEL[layout].campos;
    planilha.columns = campos.map((c) => ({
      header: colunas[c.campo],
      key: c.campo,
      width: Math.max(16, colunas[c.campo].length + 4),
    }));
    planilha.addRow(Object.fromEntries(campos.map((c) => [c.campo, c.exemplo])));
    planilha.getRow(1).font = { bold: true };
    // Colunas de código como texto, para não perder zeros à esquerda.
    for (const campo of ['numeroErp', 'codigoProduto', 'codigo']) {
      if (campos.some((c) => c.campo === campo)) planilha.getColumn(campo).numFmt = '@';
    }
    return Buffer.from(await livro.xlsx.writeBuffer());
  }

  private async lerArquivo(
    layout: LayoutImportacao,
    arquivo: Buffer,
  ): Promise<{ linhas: Linha[]; erros: ErroLinha[] }> {
    const livro = new ExcelJS.Workbook();
    try {
      await livro.xlsx.load(arquivo as unknown as ArrayBuffer);
    } catch {
      return {
        linhas: [],
        erros: [{ linha: null, mensagem: 'Arquivo inválido: envie uma planilha .xlsx.' }],
      };
    }
    const planilha = livro.worksheets[0];
    if (!planilha) return { linhas: [], erros: [{ linha: null, mensagem: 'A planilha está vazia.' }] };
    const colunas = await this.colunas(layout);
    const cabecalho = new Map<string, number>();
    planilha
      .getRow(1)
      .eachCell((celula, n) => cabecalho.set(chaveColuna(texto(valorCelula(celula.value))), n));
    const erros: ErroLinha[] = [];
    const posicao: Record<string, number> = {};
    for (const c of LAYOUTS_EXCEL[layout].campos) {
      const n = cabecalho.get(chaveColuna(colunas[c.campo]));
      if (n) posicao[c.campo] = n;
      else if (c.obrigatorio)
        erros.push({
          linha: 1,
          campo: c.campo,
          mensagem: `Coluna "${colunas[c.campo]}" não encontrada no cabeçalho.`,
        });
    }
    if (erros.length) return { linhas: [], erros };
    const linhas: Linha[] = [];
    for (let i = 2; i <= planilha.rowCount; i++) {
      const row = planilha.getRow(i);
      const valores: Record<string, unknown> = {};
      let vazia = true;
      for (const [campo, n] of Object.entries(posicao)) {
        const v = valorCelula(row.getCell(n).value);
        valores[campo] = v;
        if (texto(v) !== '') vazia = false;
      }
      if (!vazia) linhas.push({ numero: i, valores });
    }
    if (linhas.length === 0) erros.push({ linha: null, mensagem: 'Nenhuma linha de dados encontrada.' });
    return { linhas, erros };
  }

  // ---------- Ordens ----------
  private async validarOrdens(linhas: Linha[], erros: ErroLinha[]): Promise<OrdemImportada[]> {
    const produtos = new Map((await this.prisma.produto.findMany()).map((p) => [p.codigo.toUpperCase(), p]));
    const numeros = linhas.map((l) => texto(l.valores.numeroErp)).filter(Boolean);
    const existentes = new Map(
      (
        await this.prisma.ordemProducao.findMany({
          where: { numeroErp: { in: numeros } },
          include: { _count: { select: { divisoes: true } } },
        })
      ).map((o) => [o.numeroErp!, o]),
    );
    const vistos = new Set<string>();
    const r: OrdemImportada[] = [];
    for (const l of linhas) {
      const erro = (campo: string, mensagem: string) => erros.push({ linha: l.numero, campo, mensagem });
      const antes = erros.length;
      const numeroErp = texto(l.valores.numeroErp);
      if (!numeroErp) erro('numeroErp', 'Número da OP obrigatório.');
      else if (vistos.has(numeroErp)) erro('numeroErp', `OP ${numeroErp} repetida no arquivo.`);
      vistos.add(numeroErp);
      const produto = produtos.get(texto(l.valores.codigoProduto).toUpperCase());
      if (!produto) erro('codigoProduto', `Produto "${texto(l.valores.codigoProduto)}" não cadastrado.`);
      else if (!produto.ativo) erro('codigoProduto', `Produto ${produto.codigo} inativo.`);
      else if (!['ACABADO', 'SEMIACABADO'].includes(produto.tipo))
        erro('codigoProduto', `Produto ${produto.codigo} não é acabado nem semiacabado.`);
      const quantidade = interpretarNumero(l.valores.quantidade);
      if (quantidade === null || quantidade <= 0)
        erro('quantidade', 'Quantidade deve ser um número maior que zero.');
      const unidade = interpretarUnidade(texto(l.valores.unidade));
      if (!unidade) erro('unidade', `Unidade "${texto(l.valores.unidade)}" não reconhecida (use PC ou KG).`);
      else if (produto && produto.unidade !== unidade)
        erro('unidade', `Unidade diferente da do produto (${produto.unidade === 'PECA' ? 'PC' : 'KG'}).`);
      const ini = texto(l.valores.dataInicioPrevista) ? interpretarData(l.valores.dataInicioPrevista) : null;
      const fim = texto(l.valores.dataFimPrevista) ? interpretarData(l.valores.dataFimPrevista) : null;
      if (texto(l.valores.dataInicioPrevista) && !ini)
        erro('dataInicioPrevista', 'Data de início inválida (use dd/mm/aaaa).');
      if (texto(l.valores.dataFimPrevista) && !fim)
        erro('dataFimPrevista', 'Data de término inválida (use dd/mm/aaaa).');
      if (ini && fim && ini > fim) erro('dataFimPrevista', 'Término anterior ao início.');
      const existente = existentes.get(numeroErp);
      if (existente && (existente._count.divisoes > 0 || existente.situacao !== 'ABERTA')) {
        erro('numeroErp', `OP ${numeroErp} já possui apontamentos e não pode ser atualizada.`);
      }
      if (erros.length === antes) {
        r.push({
          linha: l.numero,
          numeroErp,
          produtoId: produto!.id,
          quantidade: quantidade!,
          unidade: unidade!,
          dataInicioPrevista: ini,
          dataFimPrevista: fim,
          observacao: texto(l.valores.observacao) || null,
          existenteId: existente?.id ?? null,
        });
      }
    }
    return r;
  }

  private async gravarOrdens(tx: Transacao, ordens: OrdemImportada[], usuario: UsuarioAutenticado) {
    let criados = 0;
    let atualizados = 0;
    for (const o of ordens) {
      const dados = {
        numeroErp: o.numeroErp,
        tipo: 'PRODUCAO' as const,
        produtoId: o.produtoId,
        quantidade: o.quantidade,
        unidade: o.unidade,
        dataInicioPrevista: o.dataInicioPrevista ? new Date(`${o.dataInicioPrevista}T00:00:00Z`) : null,
        dataFimPrevista: o.dataFimPrevista ? new Date(`${o.dataFimPrevista}T00:00:00Z`) : null,
        observacao: o.observacao,
      };
      if (o.existenteId) {
        const anterior = await tx.ordemProducao.findUniqueOrThrow({ where: { id: o.existenteId } });
        const novo = await tx.ordemProducao.update({ where: { id: o.existenteId }, data: dados });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'OrdemProducao',
          entidadeId: novo.id,
          acao: 'ATUALIZAR_POR_IMPORTACAO',
          anterior,
          novo,
        });
        atualizados++;
      } else {
        const novo = await tx.ordemProducao.create({
          data: { ...dados, origem: 'IMPORTACAO', criadoPorId: usuario.id },
        });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'OrdemProducao',
          entidadeId: novo.id,
          acao: 'CRIAR_POR_IMPORTACAO',
          novo,
        });
        criados++;
      }
    }
    return { criados, atualizados };
  }

  // ---------- Produtos ----------
  private async validarProdutos(linhas: Linha[], erros: ErroLinha[]): Promise<ProdutoImportado[]> {
    const codigos = linhas.map((l) => texto(l.valores.codigo).toUpperCase()).filter(Boolean);
    const existentes = new Map(
      (await this.prisma.produto.findMany({ where: { codigo: { in: codigos, mode: 'insensitive' } } })).map(
        (p) => [p.codigo.toUpperCase(), p],
      ),
    );
    const comApontamento = new Set(
      (
        await this.prisma.divisaoOp.findMany({
          where: { ordem: { produtoId: { in: [...existentes.values()].map((p) => p.id) } } },
          select: { ordem: { select: { produtoId: true } } },
        })
      ).map((d) => d.ordem.produtoId),
    );
    const vistos = new Set<string>();
    const r: ProdutoImportado[] = [];
    for (const l of linhas) {
      const erro = (campo: string, mensagem: string) => erros.push({ linha: l.numero, campo, mensagem });
      const antes = erros.length;
      const codigo = texto(l.valores.codigo);
      if (!codigo) erro('codigo', 'Código obrigatório.');
      else if (vistos.has(codigo.toUpperCase())) erro('codigo', `Produto ${codigo} repetido no arquivo.`);
      vistos.add(codigo.toUpperCase());
      const descricao = texto(l.valores.descricao);
      if (!descricao) erro('descricao', 'Descrição obrigatória.');
      const tipo = interpretarEnum(texto(l.valores.tipo), ROTULO_TIPO_PRODUTO);
      if (!tipo) erro('tipo', `Tipo "${texto(l.valores.tipo)}" não reconhecido.`);
      const unidade = interpretarUnidade(texto(l.valores.unidade));
      if (!unidade) erro('unidade', `Unidade "${texto(l.valores.unidade)}" não reconhecida (use PC ou KG).`);
      const qtdTexto = texto(l.valores.quantidadeConjunto);
      const quantidadeConjunto = qtdTexto ? interpretarNumero(l.valores.quantidadeConjunto) : null;
      if (qtdTexto && (quantidadeConjunto === null || quantidadeConjunto <= 0))
        erro('quantidadeConjunto', 'Quantidade por conjunto inválida.');
      const embTexto = texto(l.valores.tipoEmbalagem);
      const tipoEmbalagem = embTexto ? interpretarEnum(embTexto, ROTULO_TIPO_EMBALAGEM) : null;
      if (embTexto && !tipoEmbalagem) erro('tipoEmbalagem', `Embalagem "${embTexto}" não reconhecida.`);
      if (quantidadeConjunto && !tipoEmbalagem)
        erro('tipoEmbalagem', 'Informe o tipo de embalagem do conjunto padrão.');
      const existente = existentes.get(codigo.toUpperCase());
      if (existente && comApontamento.has(existente.id))
        erro('codigo', `Produto ${codigo} já possui apontamentos e não pode ser atualizado.`);
      if (erros.length === antes) {
        r.push({
          linha: l.numero,
          codigo: existente?.codigo ?? codigo,
          descricao,
          tipo: tipo!,
          unidade: unidade!,
          cor: texto(l.valores.cor) || null,
          quantidadeConjunto,
          tipoEmbalagem,
          existenteId: existente?.id ?? null,
        });
      }
    }
    return r;
  }

  private async gravarProdutos(tx: Transacao, produtos: ProdutoImportado[], usuario: UsuarioAutenticado) {
    let criados = 0;
    let atualizados = 0;
    for (const p of produtos) {
      const dados = {
        codigo: p.codigo,
        descricao: p.descricao,
        tipo: p.tipo,
        unidade: p.unidade,
        cor: p.cor,
      };
      let id: string;
      if (p.existenteId) {
        const anterior = await tx.produto.findUniqueOrThrow({ where: { id: p.existenteId } });
        const novo = await tx.produto.update({ where: { id: p.existenteId }, data: dados });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'Produto',
          entidadeId: novo.id,
          acao: 'ATUALIZAR_POR_IMPORTACAO',
          anterior,
          novo,
        });
        id = novo.id;
        atualizados++;
      } else {
        const novo = await tx.produto.create({ data: dados });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'Produto',
          entidadeId: novo.id,
          acao: 'CRIAR_POR_IMPORTACAO',
          novo,
        });
        id = novo.id;
        criados++;
      }
      if (p.quantidadeConjunto && p.tipoEmbalagem) {
        const anterior = await tx.conjuntoPadrao.findUnique({
          where: { produtoId_tipoEmbalagem: { produtoId: id, tipoEmbalagem: p.tipoEmbalagem } },
        });
        const novo = await tx.conjuntoPadrao.upsert({
          where: { produtoId_tipoEmbalagem: { produtoId: id, tipoEmbalagem: p.tipoEmbalagem } },
          create: { produtoId: id, tipoEmbalagem: p.tipoEmbalagem, quantidade: p.quantidadeConjunto },
          update: { quantidade: p.quantidadeConjunto, ativo: true },
        });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'ConjuntoPadrao',
          entidadeId: novo.id,
          acao: anterior ? 'ATUALIZAR_POR_IMPORTACAO' : 'CRIAR_POR_IMPORTACAO',
          anterior,
          novo,
        });
      }
    }
    return { criados, atualizados };
  }

  /**
   * Valida o arquivo inteiro antes de gravar: ou importa tudo, ou nada (seção 9).
   * Com `simular`, só valida. Toda importação efetiva (com ou sem erro) fica registrada.
   */
  async importar(
    layoutTexto: string,
    arquivo: { buffer: Buffer; originalname: string } | undefined,
    usuario: UsuarioAutenticado,
    simular: boolean,
  ) {
    const layout = this.validarLayout(layoutTexto);
    if (!arquivo?.buffer?.length) throw new ErroNegocio('Envie o arquivo .xlsx no campo "arquivo".');
    const { linhas, erros } = await this.lerArquivo(layout, arquivo.buffer);
    let validas: OrdemImportada[] | ProdutoImportado[] = [];
    if (erros.length === 0) {
      validas =
        layout === 'IMPORTACAO_ORDENS'
          ? await this.validarOrdens(linhas, erros)
          : await this.validarProdutos(linhas, erros);
    }
    const resumo = {
      layout,
      arquivo: arquivo.originalname,
      linhas: linhas.length,
      sucesso: erros.length === 0,
      erros,
      novos: validas.filter((v) => !v.existenteId).length,
      atualizacoes: validas.filter((v) => v.existenteId).length,
      simulacao: simular,
    };
    if (simular) return resumo;

    if (erros.length > 0) {
      const reg = await this.prisma.importacao.create({
        data: {
          layout,
          arquivoNome: arquivo.originalname,
          arquivo: new Uint8Array(arquivo.buffer),
          usuarioId: usuario.id,
          sucesso: false,
          linhas: linhas.length,
          erros: erros as object[],
        },
      });
      return { ...resumo, importacaoId: reg.id, criados: 0, atualizados: 0 };
    }
    return this.prisma.$transaction(
      async (tx) => {
        const r =
          layout === 'IMPORTACAO_ORDENS'
            ? await this.gravarOrdens(tx, validas as OrdemImportada[], usuario)
            : await this.gravarProdutos(tx, validas as ProdutoImportado[], usuario);
        const reg = await tx.importacao.create({
          data: {
            layout,
            arquivoNome: arquivo.originalname,
            arquivo: new Uint8Array(arquivo.buffer),
            usuarioId: usuario.id,
            sucesso: true,
            linhas: linhas.length,
            criados: r.criados,
            atualizados: r.atualizados,
          },
        });
        await this.auditoria.registrar(tx, {
          usuario,
          entidade: 'Importacao',
          entidadeId: reg.id,
          acao: 'IMPORTAR',
          novo: { layout, arquivo: arquivo.originalname, linhas: linhas.length, ...r },
          completo: true,
        });
        return { ...resumo, importacaoId: reg.id, ...r };
      },
      { timeout: 60_000 },
    );
  }

  listar() {
    return this.prisma.importacao.findMany({
      omit: { arquivo: true },
      include: { usuario: { select: { nome: true, login: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });
  }

  async arquivo(id: string) {
    const r = await this.prisma.importacao.findUnique({
      where: { id },
      select: { arquivo: true, arquivoNome: true },
    });
    if (!r) throw naoEncontrado('Importação');
    return r;
  }
}
