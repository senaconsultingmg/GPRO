/** Configuração lida das variáveis de ambiente. */
const producao = process.env.NODE_ENV === 'production';

function obrigatoria(nome: string, padraoDesenvolvimento: string): string {
  const valor = process.env[nome];
  if (valor) return valor;
  if (producao) throw new Error(`Variável de ambiente obrigatória não definida: ${nome}`);
  return padraoDesenvolvimento;
}

export const configuracao = {
  producao,
  porta: Number(process.env.PORTA_API ?? 3000),
  urlBanco: obrigatoria('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/apontamento'),
  jwtSegredo: obrigatoria('JWT_SEGREDO', 'segredo-somente-para-desenvolvimento'),
  jwtAcessoMinutos: Number(process.env.JWT_ACESSO_MINUTOS ?? 15),
  renovacaoDias: Number(process.env.RENOVACAO_DIAS ?? 30),
};

/** Usuário inicial: só funciona enquanto o cadastro de usuários estiver vazio. */
export const ADMIN_INICIAL = {
  login: 'admin@admin.com.br',
  senha: '12345678910',
  nome: 'Administrador',
} as const;
