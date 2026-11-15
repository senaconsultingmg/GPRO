import type { LayoutExcel } from './enumeracoes.js';

export interface CampoLayout {
  campo: string;
  rotulo: string;
  /** Nome padrão da coluna no arquivo (pode ser alterado no mapeamento). */
  colunaPadrao: string;
  obrigatorio: boolean;
  exemplo: string | number;
}

/** Layouts de importação (seção 9). Os nomes das colunas são configuráveis pelo superusuário. */
export const LAYOUTS_EXCEL: Record<LayoutExcel, { titulo: string; campos: CampoLayout[] }> = {
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
  // Layouts de exportação (seção 9): nomes de coluna configuráveis no mapeamento.
  EXPORTACAO_PRODUCAO: {
    titulo: 'Produção apurada',
    campos: [
      {
        campo: 'loteExportacao',
        rotulo: 'Lote de exportação',
        colunaPadrao: 'Lote de exportação',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'numeroErp',
        rotulo: 'Número da OP no ERP',
        colunaPadrao: 'Número da OP no ERP',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'numeroInterno',
        rotulo: 'Número interno',
        colunaPadrao: 'Número interno',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'divisao', rotulo: 'Divisão', colunaPadrao: 'Divisão', obrigatorio: false, exemplo: '' },
      { campo: 'data', rotulo: 'Data', colunaPadrao: 'Data', obrigatorio: false, exemplo: '' },
      {
        campo: 'horarioTurno',
        rotulo: 'Horário de turno',
        colunaPadrao: 'Horário de turno',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'equipe', rotulo: 'Equipe', colunaPadrao: 'Equipe', obrigatorio: false, exemplo: '' },
      { campo: 'maquina', rotulo: 'Máquina', colunaPadrao: 'Máquina', obrigatorio: false, exemplo: '' },
      { campo: 'molde', rotulo: 'Molde', colunaPadrao: 'Molde', obrigatorio: false, exemplo: '' },
      {
        campo: 'codigoProduto',
        rotulo: 'Código do produto',
        colunaPadrao: 'Código do produto',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'quantidade',
        rotulo: 'Quantidade produzida',
        colunaPadrao: 'Quantidade produzida',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'unidade', rotulo: 'Unidade', colunaPadrao: 'Unidade', obrigatorio: false, exemplo: '' },
      {
        campo: 'conjuntos',
        rotulo: 'Número de conjuntos',
        colunaPadrao: 'Número de conjuntos',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'quantidadeAvulsos',
        rotulo: 'Quantidade em conjuntos avulsos',
        colunaPadrao: 'Quantidade em conjuntos avulsos',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'pecasRefugadas',
        rotulo: 'Peças refugadas',
        colunaPadrao: 'Peças refugadas',
        obrigatorio: false,
        exemplo: '',
      },
    ],
  },
  EXPORTACAO_CONSUMO: {
    titulo: 'Consumo de matéria-prima',
    campos: [
      {
        campo: 'loteExportacao',
        rotulo: 'Lote de exportação',
        colunaPadrao: 'Lote de exportação',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'numeroErp',
        rotulo: 'Número da OP no ERP',
        colunaPadrao: 'Número da OP no ERP',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'divisao', rotulo: 'Divisão', colunaPadrao: 'Divisão', obrigatorio: false, exemplo: '' },
      { campo: 'data', rotulo: 'Data', colunaPadrao: 'Data', obrigatorio: false, exemplo: '' },
      {
        campo: 'codigoMaterial',
        rotulo: 'Código do material',
        colunaPadrao: 'Código do material',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'loteMaterial',
        rotulo: 'Lote do material',
        colunaPadrao: 'Lote do material',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'fornecedor',
        rotulo: 'Fornecedor',
        colunaPadrao: 'Fornecedor',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'notaFiscal',
        rotulo: 'Nota fiscal',
        colunaPadrao: 'Nota fiscal',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'entradaKg',
        rotulo: 'Entrada (kg)',
        colunaPadrao: 'Entrada (kg)',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'devolucaoKg',
        rotulo: 'Devolução (kg)',
        colunaPadrao: 'Devolução (kg)',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'transferenciaKg',
        rotulo: 'Transferência (kg)',
        colunaPadrao: 'Transferência (kg)',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'consumoLiquidoKg',
        rotulo: 'Consumo líquido (kg)',
        colunaPadrao: 'Consumo líquido (kg)',
        obrigatorio: false,
        exemplo: '',
      },
    ],
  },
  EXPORTACAO_PERDAS: {
    titulo: 'Perdas',
    campos: [
      {
        campo: 'loteExportacao',
        rotulo: 'Lote de exportação',
        colunaPadrao: 'Lote de exportação',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'numeroErp',
        rotulo: 'Número da OP no ERP',
        colunaPadrao: 'Número da OP no ERP',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'divisao', rotulo: 'Divisão', colunaPadrao: 'Divisão', obrigatorio: false, exemplo: '' },
      { campo: 'data', rotulo: 'Data', colunaPadrao: 'Data', obrigatorio: false, exemplo: '' },
      { campo: 'maquina', rotulo: 'Máquina', colunaPadrao: 'Máquina', obrigatorio: false, exemplo: '' },
      {
        campo: 'tipoPerda',
        rotulo: 'Tipo de perda',
        colunaPadrao: 'Tipo de perda',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'pesoKg', rotulo: 'Peso (kg)', colunaPadrao: 'Peso (kg)', obrigatorio: false, exemplo: '' },
      {
        campo: 'quantidadePecas',
        rotulo: 'Quantidade (peças)',
        colunaPadrao: 'Quantidade (peças)',
        obrigatorio: false,
        exemplo: '',
      },
    ],
  },
  EXPORTACAO_ETIQUETAS: {
    titulo: 'Etiquetas e recebimento',
    campos: [
      {
        campo: 'loteExportacao',
        rotulo: 'Lote de exportação',
        colunaPadrao: 'Lote de exportação',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'codigoEtiqueta',
        rotulo: 'Código da etiqueta',
        colunaPadrao: 'Código da etiqueta',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'numeroErp',
        rotulo: 'Número da OP no ERP',
        colunaPadrao: 'Número da OP no ERP',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'codigoProduto',
        rotulo: 'Código do produto',
        colunaPadrao: 'Código do produto',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'quantidade',
        rotulo: 'Quantidade',
        colunaPadrao: 'Quantidade',
        obrigatorio: false,
        exemplo: '',
      },
      { campo: 'unidade', rotulo: 'Unidade', colunaPadrao: 'Unidade', obrigatorio: false, exemplo: '' },
      {
        campo: 'localEstoque',
        rotulo: 'Local de estoque',
        colunaPadrao: 'Local de estoque',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'recebidoEm',
        rotulo: 'Recebido em',
        colunaPadrao: 'Recebido em',
        obrigatorio: false,
        exemplo: '',
      },
      {
        campo: 'recebidoPor',
        rotulo: 'Recebido por',
        colunaPadrao: 'Recebido por',
        obrigatorio: false,
        exemplo: '',
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
