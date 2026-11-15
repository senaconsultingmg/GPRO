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
  // Fase 2
  'ordens.ler': TODOS,
  /** PCP digita, importa, encerra e cancela OPs (RN-01). */
  'ordens.escrever': ['PCP'],
  /** Importação de produtos por Excel: PCP e superusuário (dono do cadastro de produtos). */
  'produtos.importar': ['PCP', 'SUPERUSUARIO'],
  /** Mapeamento de colunas dos layouts de Excel (seção 9). */
  'excel.mapear': ['SUPERUSUARIO'],
  'importacoes.ler': ['PCP', 'SUPERUSUARIO'],
  'rodadas.ler': TODOS,
  /** PCP cria qualquer rodada; matéria-prima só rodadas de extrusora (Fase 3). */
  'rodadas.escrever': ['PCP', 'MATERIA_PRIMA'],
  'turnos.ler': TODOS,
  /** Abrir/fechar turno, ligar máquinas, criar divisões e lançar eventos (somente no próprio turno). */
  'apontamento.lancar': ['APONTADOR'],
  // Fase 3
  /** Ordem de extrusão: PCP ou setor de matéria-prima (sem número do ERP, P10). */
  'ordens.extrusao': ['PCP', 'MATERIA_PRIMA'],
  'etiquetas.ler': TODOS,
  /** Emitir e reimprimir etiquetas. */
  'etiquetas.imprimir': ['APONTADOR', 'MATERIA_PRIMA', 'ESTOQUE', 'SUPERUSUARIO'],
  'materiaprima.ler': ['MATERIA_PRIMA', 'PCP', 'APONTADOR', 'SUPERUSUARIO'],
  'materiaprima.escrever': ['MATERIA_PRIMA'],
  'estoque.ler': ['ESTOQUE', 'PCP', 'SUPERUSUARIO', 'MATERIA_PRIMA'],
  'estoque.receber': ['ESTOQUE'],
} as const satisfies Record<string, Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

export function temPermissao(perfis: readonly Perfil[] | undefined | null, permissao: Permissao): boolean {
  if (!perfis || perfis.length === 0) return false;
  const autorizados = PERMISSOES[permissao] as readonly Perfil[] | undefined;
  if (!autorizados) return false;
  return perfis.some((p) => autorizados.includes(p));
}
