import { describe, expect, it } from 'vitest';
import { opcoesConexao } from './prisma.service.js';

describe('Conexão com banco gerenciado (Supabase)', () => {
  it('sslmode=require: criptografa sem validar a cadeia e tira o parâmetro da URL', () => {
    expect(opcoesConexao('postgresql://u:s@pooler.supabase.com:5432/postgres?sslmode=require')).toEqual({
      connectionString: 'postgresql://u:s@pooler.supabase.com:5432/postgres',
      ssl: { rejectUnauthorized: false },
    });
  });
  it('verify-full valida o certificado; sem sslmode, a URL segue igual', () => {
    expect(opcoesConexao('postgresql://u:s@h:5432/db?sslmode=verify-full').ssl).toBe(true);
    expect(opcoesConexao('postgresql://u:s@db:5432/apontamento')).toEqual({
      connectionString: 'postgresql://u:s@db:5432/apontamento',
    });
  });
});
