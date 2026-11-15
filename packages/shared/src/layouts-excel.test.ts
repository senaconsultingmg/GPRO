import { describe, expect, it } from 'vitest';
import { interpretarData, interpretarEnum, interpretarNumero, interpretarUnidade } from './layouts-excel.js';
import { ROTULO_TIPO_PRODUTO } from './enumeracoes.js';

describe('Leitura de valores do Excel', () => {
  it('datas dd/mm/aaaa e ISO; rejeita data inexistente', () => {
    expect(interpretarData('7/1/2026')).toBe('2026-01-07');
    expect(interpretarData('2026-11-20')).toBe('2026-11-20');
    expect(interpretarData('31/02/2026')).toBeNull();
    expect(interpretarData('2026-02-30')).toBeNull();
    expect(interpretarData(new Date('2026-03-05T00:00:00Z'))).toBe('2026-03-05');
  });
  it('números em pt-BR', () => {
    expect(interpretarNumero('1.500,5')).toBe(1500.5);
    expect(interpretarNumero('12.5')).toBe(12.5);
    expect(interpretarNumero(3)).toBe(3);
    expect(interpretarNumero('abc')).toBeNull();
  });
  it('unidades e enumerações por código ou rótulo', () => {
    expect(interpretarUnidade('pç')).toBe('PECA');
    expect(interpretarUnidade('Kg')).toBe('KG');
    expect(interpretarUnidade('L')).toBeNull();
    expect(interpretarEnum('Matéria-prima', ROTULO_TIPO_PRODUTO)).toBe('MATERIA_PRIMA');
    expect(interpretarEnum('acabado', ROTULO_TIPO_PRODUTO)).toBe('ACABADO');
  });
});
