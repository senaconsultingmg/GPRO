import type { Perfil } from './enumeracoes.js';

/**
 * Matriz de permissões (seção 5). Cada permissão lista os perfis autorizados.
 * A API nega por padrão: toda rota precisa declarar uma permissão desta lista
 * ou ser marcada explicitamente como pública.
 */
const TODOS: Perfil[] = [
  'SUPERUSUARIO',
  'PCP',
  'APONTADOR',
  'LIDER',
  'ESTOQUE',
  'MATERIA_PRIMA',
  'MANUTENCAO',
];

export const PERMISSOES = {
  /** Consulta dos cadastros básicos (máquinas, moldes, produtos, motivos...). Todos precisam deles. */
  'cadastros.ler': TODOS,
  /** Criação e alteração dos cadastros básicos. */
  'cadastros.escrever': ['SUPERUSUARIO'],
  'usuarios.ler': ['SUPERUSUARIO'],
  'usuarios.escrever': ['SUPERUSUARIO'],
  'parametros.ler': ['SUPERUSUARIO'],
  'parametros.escrever': ['SUPERUSUARIO'],
  'auditoria.ler': ['SUPERUSUARIO'],
  'escala.ler': TODOS,
  'escala.escrever': ['SUPERUSUARIO'],
  'fichas.ler': TODOS,
  /** PCP cria e revisa fichas técnicas (rascunhos). */
  'fichas.escrever': ['PCP'],
  /** Superusuário aprova fichas técnicas (premissa P9). */
  'fichas.aprovar': ['SUPERUSUARIO'],
} as const satisfies Record<string, Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

export function temPermissao(perfis: readonly Perfil[] | undefined | null, permissao: Permissao): boolean {
  if (!perfis || perfis.length === 0) return false;
  const autorizados = PERMISSOES[permissao] as readonly Perfil[] | undefined;
  if (!autorizados) return false;
  return perfis.some((p) => autorizados.includes(p));
}
