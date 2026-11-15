import { describe, expect, it } from 'vitest';
import { esquemaFichaTecnica, esquemaMaquina, esquemaDispositivo } from './esquemas.js';

describe('Esquemas', () => {
  it('injetora exige dados de compatibilidade; extrusora exige capacidade', () => {
    const r = esquemaMaquina.safeParse({ codigo: 'INJ', descricao: 'x', tipo: 'INJETORA' });
    expect(r.success).toBe(false);
    const e = esquemaMaquina.safeParse({ codigo: 'EXT', descricao: 'x', tipo: 'EXTRUSORA' });
    expect(e.success).toBe(false);
    expect(
      esquemaMaquina.safeParse({ codigo: 'EXT', descricao: 'x', tipo: 'EXTRUSORA', capacidadeKgH: 80 })
        .success,
    ).toBe(true);
  });
  it('ficha exige PH ou ciclo', () => {
    const base = { produtoId: crypto.randomUUID(), maquinaId: crypto.randomUUID(), cavidades: 2 };
    expect(esquemaFichaTecnica.safeParse(base).success).toBe(false);
    expect(esquemaFichaTecnica.safeParse({ ...base, cicloS: 30 }).success).toBe(true);
  });
  it('mensagens em português', () => {
    const r = esquemaDispositivo.safeParse({ nome: '', prefixo: 'ABC' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join(' ')).toMatch(/obrigatório|prefixo/i);
  });
});
