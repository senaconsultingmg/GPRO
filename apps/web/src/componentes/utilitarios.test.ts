import { describe, expect, it } from 'vitest';
import { esquemaDispositivo } from '@apontamento/shared';
import { ErroApi } from '../api/cliente';
import { errosApiPorCampo, errosZod, numeroOuNulo } from './utilitarios';

describe('utilitários de formulário', () => {
  it('converte erros do Zod em mensagens por campo (validação repetida no front-end)', () => {
    const erros = errosZod(esquemaDispositivo, { nome: 'Tablet', prefixo: 'ABC' });
    expect(Object.keys(erros)).toEqual(['prefixo']);
    expect(erros.prefixo).toMatch(/2 letras ou números/);
  });
  it('converte detalhes da API em erros por campo', () => {
    const e = new ErroApi(400, 'Dados inválidos', [
      { campo: 'codigo', mensagem: 'Obrigatório.' },
      { mensagem: 'geral' },
    ]);
    expect(errosApiPorCampo(e)).toEqual({ codigo: 'Obrigatório.' });
  });
  it('campo numérico vazio vira nulo', () => {
    expect(numeroOuNulo('')).toBeNull();
    expect(numeroOuNulo('12.5')).toBe(12.5);
  });
});
