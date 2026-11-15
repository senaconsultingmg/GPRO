import { describe, expect, it } from 'vitest';
import { calcularPhPadrao } from './calculos.js';

describe('RN-02 — PH padrão calculado', () => {
  it('3600 ÷ ciclo × cavidades', () => {
    expect(calcularPhPadrao(30, 3)).toBe(360);
    expect(calcularPhPadrao(45, 1)).toBe(80);
    expect(calcularPhPadrao(7, 2)).toBe(1028.57);
  });
  it('recusa ciclo ou cavidades inválidos', () => {
    expect(() => calcularPhPadrao(0, 2)).toThrow();
    expect(() => calcularPhPadrao(10, 0)).toThrow();
    expect(() => calcularPhPadrao(10, 1.5)).toThrow();
  });
});
