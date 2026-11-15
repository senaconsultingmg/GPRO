import { describe, expect, it } from 'vitest';
import { PERMISSOES, temPermissao } from './permissoes.js';
import { PERFIS } from './enumeracoes.js';

describe('Permissões (seção 5)', () => {
  it('nega quando não há perfil', () => {
    expect(temPermissao([], 'cadastros.ler')).toBe(false);
    expect(temPermissao(null, 'cadastros.ler')).toBe(false);
  });
  it('todos os perfis leem cadastros; só superusuário escreve', () => {
    for (const p of PERFIS) {
      expect(temPermissao([p], 'cadastros.ler')).toBe(true);
      expect(temPermissao([p], 'cadastros.escrever')).toBe(p === 'SUPERUSUARIO');
    }
  });
  it('PCP cria fichas, superusuário aprova (P9)', () => {
    expect(temPermissao(['PCP'], 'fichas.escrever')).toBe(true);
    expect(temPermissao(['PCP'], 'fichas.aprovar')).toBe(false);
    expect(temPermissao(['SUPERUSUARIO'], 'fichas.aprovar')).toBe(true);
    expect(temPermissao(['SUPERUSUARIO'], 'fichas.escrever')).toBe(false);
  });
  it('perfis acumulados somam permissões', () => {
    expect(temPermissao(['APONTADOR', 'PCP'], 'fichas.escrever')).toBe(true);
  });
  it('permissão inexistente é negada', () => {
    expect(temPermissao(['SUPERUSUARIO'], 'nao.existe' as keyof typeof PERMISSOES)).toBe(false);
  });
});
