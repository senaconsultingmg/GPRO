/**
 * Código da etiqueta, conteúdo GS1-128 (EAN-128), leitura e preenchimento de modelos ZPL (seção 8).
 * Decisão do usuário: sem QR Code; código de barras GS1-128 com identificadores de aplicação (AI).
 */

/** Código legível: prefixo do posto (2 caracteres) + "-" + sequência de 7 dígitos. Ex.: T3-0001245. */
export function codigoEtiqueta(prefixo: string, sequencia: number): string {
  if (!/^[A-Z0-9]{2}$/.test(prefixo)) throw new Error('Prefixo do posto inválido.');
  if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > 9_999_999)
    throw new Error('Sequência da etiqueta fora da faixa.');
  return `${prefixo}-${String(sequencia).padStart(7, '0')}`;
}

export const RE_CODIGO_ETIQUETA = /^[A-Z0-9]{2}-\d{7}$/;

// Conjunto de caracteres GS1 "82" (AIs alfanuméricos).
const RE_GS1 = /^[A-Za-z0-9!"%&'()*+,\-./:;<=>?_]+$/;

export interface DadosGs1 {
  codigo: string;
  codigoProduto?: string | null;
  quantidade?: number | null;
  unidade?: 'PECA' | 'KG' | null;
  data?: Date | null;
  lote?: string | null;
}

export interface ElementoGs1 {
  ai: string;
  valor: string;
}

/** AAMMDD no fuso informado (padrão São Paulo). */
function aammdd(d: Date, fuso = 'America/Sao_Paulo'): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: '2-digit', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}`;
}

/**
 * Elementos GS1-128 da etiqueta:
 * (21) nº de série = código da etiqueta; (240) código do produto; (37) quantidade em peças
 * ou (310n) peso líquido em kg (n = casas decimais que cabem em 6 dígitos); (11) data de produção; (10) lote.
 * Valores com caracteres fora do padrão GS1 são omitidos do código de barras (seguem impressos por extenso).
 */
export function elementosGs1(d: DadosGs1): ElementoGs1[] {
  const r: ElementoGs1[] = [{ ai: '21', valor: d.codigo }];
  if (d.codigoProduto && RE_GS1.test(d.codigoProduto) && d.codigoProduto.length <= 30)
    r.push({ ai: '240', valor: d.codigoProduto });
  if (d.quantidade != null && d.quantidade > 0) {
    if (d.unidade === 'KG') {
      // (310n) peso líquido em kg com n decimais: usa a maior precisão que cabe em 6 dígitos.
      for (const n of [3, 2, 1, 0]) {
        const valor = Math.round(d.quantidade * 10 ** n);
        if (valor <= 999_999) {
          r.push({ ai: `310${n}`, valor: String(valor).padStart(6, '0') });
          break;
        }
      }
    } else if (Number.isInteger(d.quantidade) && d.quantidade <= 99_999_999) {
      r.push({ ai: '37', valor: String(d.quantidade) });
    }
  }
  if (d.data) r.push({ ai: '11', valor: aammdd(d.data) });
  if (d.lote && RE_GS1.test(d.lote) && d.lote.length <= 20) r.push({ ai: '10', valor: d.lote });
  return r;
}

/** Texto com AIs entre parênteses — formato aceito pela Zebra no modo D (^BC...D) e legível por humanos. */
export const gs1ComParenteses = (e: ElementoGs1[]) => e.map((x) => `(${x.ai})${x.valor}`).join('');

// AIs de tamanho fixo (sem separador FNC1/GS); os demais são variáveis.
const TAMANHO_FIXO: Record<string, number> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '11': 6,
  '13': 6,
  '15': 6,
  '17': 6,
};
const AIS_4: RegExp = /^(31\d\d|32\d\d|33\d\d|34\d\d|35\d\d|36\d\d)/;
const AIS_3 = ['240', '241', '250', '251', '400', '401'];
const GS = '\u001d';

/** Interpreta o texto lido por um leitor GS1-128 (com ou sem "]C1", com GS ou parênteses). */
export function interpretarGs1(texto: string): ElementoGs1[] | null {
  let t = texto.trim();
  if (t.startsWith(']C1')) t = t.slice(3);
  if (t.startsWith('(')) {
    const r: ElementoGs1[] = [];
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(t))) r.push({ ai: m[1], valor: m[2] });
    return r.length ? r : null;
  }
  const r: ElementoGs1[] = [];
  let i = 0;
  while (i < t.length) {
    if (t[i] === GS) {
      i++;
      continue;
    }
    const resto = t.slice(i);
    let ai: string;
    if (AIS_4.test(resto)) ai = resto.slice(0, 4);
    else if (AIS_3.includes(resto.slice(0, 3)) || resto.startsWith('37'))
      ai = resto.startsWith('37') ? '37' : resto.slice(0, 3);
    else ai = resto.slice(0, 2);
    if (!/^\d+$/.test(ai)) return null;
    i += ai.length;
    const fixo = TAMANHO_FIXO[ai] ?? (AIS_4.test(ai) ? 6 : undefined);
    if (fixo !== undefined) {
      r.push({ ai, valor: t.slice(i, i + fixo) });
      i += fixo;
    } else {
      const fim = t.indexOf(GS, i);
      const valor = fim === -1 ? t.slice(i) : t.slice(i, fim);
      r.push({ ai, valor });
      i += valor.length;
    }
  }
  return r.length ? r : null;
}

/**
 * Extrai o código da etiqueta de uma leitura: código legível digitado (T3-0001245, aceitando
 * minúsculas e sem zeros à esquerda) ou o código de barras GS1-128 completo (AI 21).
 */
export function lerCodigoEtiqueta(leitura: string): string | null {
  const t = leitura.trim();
  const simples = /^([A-Za-z0-9]{2})-?(\d{1,7})$/.exec(t);
  if (simples) return `${simples[1].toUpperCase()}-${simples[2].padStart(7, '0')}`;
  const elementos = interpretarGs1(t);
  const serie = elementos?.find((e) => e.ai === '21')?.valor;
  return serie && RE_CODIGO_ETIQUETA.test(serie.toUpperCase()) ? serie.toUpperCase() : null;
}

/** Converte mm em pontos para a resolução da impressora. */
export const mmParaPontos = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

/** Remove caracteres de controle do ZPL (^ e ~) e quebras de linha dos valores. */
const limparZpl = (v: string) => v.replace(/[\^~]/g, ' ').replace(/[\r\n]+/g, ' ');

/**
 * Preenche o modelo ZPL: {{campo}} é substituído pelo valor; {{#campo}}...{{/campo}} só aparece
 * quando o campo tem valor (ex.: destaque AVULSO, "2ª via"). Campos ausentes ficam vazios.
 */
export function preencherModeloZpl(
  modelo: string,
  valores: Record<string, string | number | null | undefined>,
): string {
  const texto = (k: string) => {
    const v = valores[k];
    return v === null || v === undefined ? '' : limparZpl(String(v));
  };
  const comSecoes = modelo.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, bloco: string) =>
    texto(k) ? bloco : '',
  );
  return comSecoes.replace(/\{\{(\w+)\}\}/g, (_, k: string) => texto(k));
}
