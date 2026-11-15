import type { TipoEtiqueta } from './enumeracoes.js';

/**
 * Modelos ZPL iniciais (seção 8): 100 × 150 mm e 100 × 50 mm para cada tipo de etiqueta.
 * Coordenadas para 203 dpi; o superusuário pode editar o modelo. Campos disponíveis em CAMPOS_ZPL.
 */

type Linha = [rotulo: string, campo: string];

const TITULO: Record<TipoEtiqueta, string> = {
  PRODUTO: '{{produto}}',
  EXTRUSAO: 'EXTRUSADO {{material}}',
  MISTURA: 'MISTURA {{lote}}',
  ENTRADA_MATERIA_PRIMA: 'MP {{material}}',
  PERDA: 'PERDA {{tipoPerda}}',
  DEVOLUCAO_TRANSFERENCIA: '{{operacao}} {{material}}',
};

const LINHAS: Record<TipoEtiqueta, Linha[]> = {
  PRODUTO: [
    ['Descrição', 'produtoDescricao'],
    ['Quantidade', 'quantidadeTexto'],
    ['Embalagem', 'embalagem'],
    ['OP (ERP)', 'op'],
    ['Divisão', 'divisao'],
    ['Máquina', 'maquina'],
    ['Conjunto', 'conjunto'],
    ['Data/hora', 'dataHora'],
    ['Turno', 'turno'],
    ['Responsável', 'responsavel'],
  ],
  EXTRUSAO: [
    ['Peso', 'pesoTexto'],
    ['Fabricação', 'data'],
    ['Lote', 'lote'],
    ['OP extrusão', 'op'],
    ['Operador', 'operador'],
    ['Turno', 'turno'],
    ['Fluidez média', 'fluidez'],
    ['Cor', 'cor'],
    ['Destina-se a', 'destinos'],
  ],
  MISTURA: [
    ['Peso', 'pesoTexto'],
    ['Composição', 'composicao'],
    ['Destina-se a', 'destinos'],
    ['Data', 'data'],
    ['Responsável', 'responsavel'],
  ],
  ENTRADA_MATERIA_PRIMA: [
    ['Descrição', 'materialDescricao'],
    ['Lote', 'lote'],
    ['Fornecedor', 'fornecedor'],
    ['Nota fiscal', 'notaFiscal'],
    ['Peso', 'pesoTexto'],
    ['Data', 'data'],
  ],
  PERDA: [
    ['Peso', 'pesoTexto'],
    ['Quantidade', 'quantidadeTexto'],
    ['OP', 'op'],
    ['Máquina', 'maquina'],
    ['Data/hora', 'dataHora'],
    ['Turno', 'turno'],
  ],
  DEVOLUCAO_TRANSFERENCIA: [
    ['Lote', 'lote'],
    ['Peso', 'pesoTexto'],
    ['Origem', 'origem'],
    ['Destino', 'destino'],
    ['Data/hora', 'dataHora'],
    ['Responsável', 'responsavel'],
  ],
};

const CABECALHO = '^XA\n^CI28\n^PW{{larguraPontos}}\n^LL{{alturaPontos}}\n';

function grande(tipo: TipoEtiqueta): string {
  let y = 30;
  let z = CABECALHO;
  z += `^FO30,${y}^A0N,44,44^FB560,2,0,L^FD${TITULO[tipo]}^FS\n`;
  z += `{{#segundaVia}}^FO600,${y}^GB190,56,56^FS^FO615,${y + 10}^A0N,40,40^FR^FD2ª VIA^FS{{/segundaVia}}\n`;
  y += 110;
  for (const [rotulo, campo] of LINHAS[tipo]) {
    z += `^FO30,${y}^A0N,26,26^FD${rotulo}:^FS^FO260,${y}^A0N,30,30^FB530,2,0,L^FD{{${campo}}}^FS\n`;
    y += 62;
  }
  if (tipo === 'PRODUTO') {
    z += `{{#avulso}}^FO30,${y}^GB760,100,100^FS^FO230,${y + 15}^A0N,80,80^FR^FDAVULSO^FS{{/avulso}}\n`;
    y += 120;
  }
  y = Math.max(y, 860);
  z += `^FO30,${y}^BY2,2^BCN,150,N,N,N,D^FD{{gs1}}^FS\n`;
  z += `^FO30,${y + 160}^A0N,22,22^FB760,2,0,L^FD{{gs1}}^FS\n`;
  z += `^FO30,${y + 220}^A0N,90,90^FD{{codigo}}^FS\n`;
  z += '^XZ\n';
  return z;
}

function pequena(tipo: TipoEtiqueta): string {
  const linhas = LINHAS[tipo].slice(0, 3);
  let z = CABECALHO;
  z += `^FO20,15^A0N,34,34^FB600,1,0,L^FD${TITULO[tipo]}^FS\n`;
  z += `^FO560,15^A0N,40,40^FD{{codigo}}^FS\n`;
  z += `{{#segundaVia}}^FO640,60^A0N,28,28^FD2ª VIA^FS{{/segundaVia}}\n`;
  let y = 65;
  for (const [rotulo, campo] of linhas) {
    z += `^FO20,${y}^A0N,24,24^FD${rotulo}: {{${campo}}}^FS\n`;
    y += 34;
  }
  if (tipo === 'PRODUTO')
    z += `{{#avulso}}^FO560,100^GB230,60,60^FS^FO585,110^A0N,44,44^FR^FDAVULSO^FS{{/avulso}}\n`;
  z += `^FO20,${y + 10}^BY2,2^BCN,110,N,N,N,D^FD{{gs1}}^FS\n`;
  z += `^FO20,${y + 128}^A0N,20,20^FD{{gs1}}^FS\n`;
  z += '^XZ\n';
  return z;
}

export function modeloZplPadrao(tipo: TipoEtiqueta, tamanho: '100x150' | '100x50'): string {
  return tamanho === '100x150' ? grande(tipo) : pequena(tipo);
}

/** Campos que os modelos podem usar (exibidos na tela de edição do layout). */
export const CAMPOS_ZPL = [
  'codigo',
  'gs1',
  'segundaVia',
  'avulso',
  'larguraPontos',
  'alturaPontos',
  'data',
  'hora',
  'dataHora',
  'turno',
  'responsavel',
  'produto',
  'produtoDescricao',
  'quantidade',
  'unidade',
  'quantidadeTexto',
  'embalagem',
  'op',
  'divisao',
  'maquina',
  'conjunto',
  'material',
  'materialDescricao',
  'lote',
  'peso',
  'pesoTexto',
  'fornecedor',
  'notaFiscal',
  'operador',
  'fluidez',
  'cor',
  'destinos',
  'composicao',
  'tipoPerda',
  'origem',
  'destino',
  'operacao',
] as const;
