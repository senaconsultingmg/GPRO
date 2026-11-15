import { describe, expect, it } from 'vitest';
import {
  codigoEtiqueta,
  elementosGs1,
  gs1ComParenteses,
  interpretarGs1,
  lerCodigoEtiqueta,
  mmParaPontos,
  preencherModeloZpl,
} from './etiquetas.js';
import { modeloZplPadrao } from './modelos-zpl.js';
import { TIPOS_ETIQUETA } from './enumeracoes.js';

describe('Seção 8 — código da etiqueta', () => {
  it('prefixo do posto + sequência de 7 dígitos', () => {
    expect(codigoEtiqueta('T3', 1245)).toBe('T3-0001245');
    expect(() => codigoEtiqueta('T', 1)).toThrow();
    expect(() => codigoEtiqueta('T3', 0)).toThrow();
    expect(() => codigoEtiqueta('T3', 10_000_000)).toThrow();
  });
});

describe('GS1-128 (EAN-128)', () => {
  const data = new Date('2026-11-14T17:32:00Z');
  it('monta os AIs: série, produto, quantidade, data e lote', () => {
    const e = elementosGs1({
      codigo: 'T3-0001245',
      codigoProduto: 'CAD-0031',
      quantidade: 30,
      unidade: 'PECA',
      data,
      lote: 'L261114-001',
    });
    expect(gs1ComParenteses(e)).toBe('(21)T3-0001245(240)CAD-0031(37)30(11)261114(10)L261114-001');
  });
  it('peso em kg com 3 decimais (3103)', () => {
    const e = elementosGs1({ codigo: 'MP-0000007', quantidade: 25.4, unidade: 'KG' });
    expect(e).toContainEqual({ ai: '3103', valor: '025400' });
    expect(elementosGs1({ codigo: 'MP-0000001', quantidade: 2000, unidade: 'KG' })).toContainEqual({
      ai: '3102',
      valor: '200000',
    });
    expect(elementosGs1({ codigo: 'MP-0000001', quantidade: 25000.5, unidade: 'KG' })).toContainEqual({
      ai: '3101',
      valor: '250005',
    });
  });
  it('omite do código de barras valores com caracteres fora do padrão GS1', () => {
    const e = elementosGs1({ codigo: 'T3-0000001', codigoProduto: 'CADEIRA AZUL', lote: 'ção' });
    expect(e.map((x) => x.ai)).toEqual(['21']);
  });
  it('interpreta leitura com parênteses e leitura bruta de leitor (com ]C1 e separador GS)', () => {
    expect(interpretarGs1('(21)T3-0001245(37)30')).toEqual([
      { ai: '21', valor: 'T3-0001245' },
      { ai: '37', valor: '30' },
    ]);
    const bruta = ']C121T3-0001245\u001d240CAD-0031\u001d3730\u001d11261114';
    expect(interpretarGs1(bruta)).toEqual([
      { ai: '21', valor: 'T3-0001245' },
      { ai: '240', valor: 'CAD-0031' },
      { ai: '37', valor: '30' },
      { ai: '11', valor: '261114' },
    ]);
    expect(interpretarGs1('3103025400\u001d21MP-0000007')).toEqual([
      { ai: '3103', valor: '025400' },
      { ai: '21', valor: 'MP-0000007' },
    ]);
  });
});

describe('Leitura do código', () => {
  it('aceita o código legível digitado, com minúsculas ou sem zeros', () => {
    expect(lerCodigoEtiqueta('T3-0001245')).toBe('T3-0001245');
    expect(lerCodigoEtiqueta(' t3-1245 ')).toBe('T3-0001245');
    expect(lerCodigoEtiqueta('t31245')).toBe('T3-0001245');
  });
  it('aceita o código de barras completo', () => {
    expect(lerCodigoEtiqueta('(21)T3-0001245(240)CAD-0031(37)30')).toBe('T3-0001245');
    expect(lerCodigoEtiqueta(']C121T3-0001245\u001d3730')).toBe('T3-0001245');
  });
  it('recusa leitura sem código de etiqueta', () => {
    expect(lerCodigoEtiqueta('(240)CAD-0031')).toBeNull();
    expect(lerCodigoEtiqueta('qualquer coisa')).toBeNull();
  });
});

describe('Modelo ZPL', () => {
  it('substitui campos, seções condicionais e limpa caracteres de controle', () => {
    const m = '^XA^FD{{codigo}}^FS{{#avulso}}^FR^FDAVULSO^FS{{/avulso}}^FD{{produto}}^FS^XZ';
    expect(preencherModeloZpl(m, { codigo: 'T3-0000001', avulso: 'AVULSO', produto: 'A^B~C' })).toBe(
      '^XA^FDT3-0000001^FS^FR^FDAVULSO^FS^FDA B C^FS^XZ',
    );
    expect(preencherModeloZpl(m, { codigo: 'X', avulso: '' })).toBe('^XA^FDX^FS^FD^FS^XZ');
  });
  it('mm em pontos', () => {
    expect(mmParaPontos(100, 203)).toBe(799);
    expect(mmParaPontos(150, 300)).toBe(1772);
  });
  it('há modelo inicial 100×150 e 100×50 para cada tipo, com código de barras GS1-128 (modo D)', () => {
    for (const tipo of TIPOS_ETIQUETA) {
      for (const tamanho of ['100x150', '100x50'] as const) {
        const z = modeloZplPadrao(tipo, tamanho);
        expect(z.startsWith('^XA')).toBe(true);
        expect(z).toContain('^BCN,');
        expect(z).toMatch(/,D\^FD\{\{gs1\}\}/);
        expect(z).toContain('{{codigo}}');
        expect(z).toContain('^PW{{larguraPontos}}');
      }
    }
    expect(modeloZplPadrao('PRODUTO', '100x150')).toContain('{{#avulso}}');
  });
});
