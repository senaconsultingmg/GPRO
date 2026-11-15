import type { LayoutImportacao } from './enumeracoes.js';

export interface CampoLayout {
  campo: string;
  rotulo: string;
  /** Nome padrão da coluna no arquivo (pode ser alterado no mapeamento). */
  colunaPadrao: string;
  obrigatorio: boolean;
  exemplo: string | number;
}

/** Layouts de importação (seção 9). Os nomes das colunas são configuráveis pelo superusuário. */
export const LAYOUTS_EXCEL: Record<LayoutImportacao, { titulo: string; campos: CampoLayout[] }> = {
  IMPORTACAO_ORDENS: {
    titulo: 'Ordens de produção',
    campos: [
      {
        campo: 'numeroErp',
        rotulo: 'Número da OP no ERP',
        colunaPadrao: 'Número da OP',
        obrigatorio: true,
        exemplo: '04508401001',
      },
      {
        campo: 'codigoProduto',
        rotulo: 'Código do produto',
        colunaPadrao: 'Código do produto',
        obrigatorio: true,
        exemplo: 'CAD-0031',
      },
      {
        campo: 'quantidade',
        rotulo: 'Quantidade',
        colunaPadrao: 'Quantidade',
        obrigatorio: true,
        exemplo: 3000,
      },
      { campo: 'unidade', rotulo: 'Unidade', colunaPadrao: 'Unidade', obrigatorio: true, exemplo: 'PC' },
      {
        campo: 'dataInicioPrevista',
        rotulo: 'Data prevista de início',
        colunaPadrao: 'Início previsto',
        obrigatorio: false,
        exemplo: '17/11/2026',
      },
      {
        campo: 'dataFimPrevista',
        rotulo: 'Data prevista de término',
        colunaPadrao: 'Término previsto',
        obrigatorio: false,
        exemplo: '20/11/2026',
      },
      {
        campo: 'observacao',
        rotulo: 'Observação',
        colunaPadrao: 'Observação',
        obrigatorio: false,
        exemplo: '',
      },
    ],
  },
  IMPORTACAO_PRODUTOS: {
    titulo: 'Produtos',
    campos: [
      { campo: 'codigo', rotulo: 'Código', colunaPadrao: 'Código', obrigatorio: true, exemplo: 'CAD-0040' },
      {
        campo: 'descricao',
        rotulo: 'Descrição',
        colunaPadrao: 'Descrição',
        obrigatorio: true,
        exemplo: 'Cadeira com braço branca',
      },
      { campo: 'tipo', rotulo: 'Tipo', colunaPadrao: 'Tipo', obrigatorio: true, exemplo: 'Acabado' },
      { campo: 'unidade', rotulo: 'Unidade', colunaPadrao: 'Unidade', obrigatorio: true, exemplo: 'PC' },
      { campo: 'cor', rotulo: 'Cor', colunaPadrao: 'Cor', obrigatorio: false, exemplo: 'Branca' },
      {
        campo: 'quantidadeConjunto',
        rotulo: 'Quantidade por conjunto padrão',
        colunaPadrao: 'Qtd por conjunto',
        obrigatorio: false,
        exemplo: 25,
      },
      {
        campo: 'tipoEmbalagem',
        rotulo: 'Tipo de embalagem',
        colunaPadrao: 'Embalagem',
        obrigatorio: false,
        exemplo: 'Pilha',
      },
    ],
  },
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/** Converte a unidade escrita no arquivo (PC, PÇ, UN, PEÇA, KG...) no código do sistema. */
export function interpretarUnidade(v: string): 'PECA' | 'KG' | null {
  const u = semAcento(v);
  if (['PC', 'PCS', 'PC.', 'PECA', 'PECAS', 'UN', 'UND', 'UNID', 'UNIDADE'].includes(u)) return 'PECA';
  if (['KG', 'KGS', 'QUILO', 'QUILOS', 'QUILOGRAMA'].includes(u)) return 'KG';
  return null;
}

/** Aceita o código (ACABADO) ou o rótulo (Acabado, Matéria-prima...) de uma enumeração. */
export function interpretarEnum<T extends string>(v: string, rotulos: Record<T, string>): T | null {
  const alvo = semAcento(v).replace(/[\s-]+/g, '_');
  for (const [codigo, rotulo] of Object.entries(rotulos) as [T, string][]) {
    if (alvo === codigo || alvo === semAcento(rotulo).replace(/[\s-]+/g, '_')) return codigo;
  }
  return null;
}

/** Data civil válida (rejeita, por exemplo, 31/02). */
function dataValida(a: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

/** Converte "dd/mm/aaaa", "aaaa-mm-dd" ou data do Excel em "AAAA-MM-DD". */
export function interpretarData(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return dataValida(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? dataValida(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** Converte número escrito em pt-BR ("1.234,5") ou numérico. */
export function interpretarNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = v.trim();
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
