/** Cliente HTTP da API com renovação automática do token de acesso. */
import { lerPosto } from './posto';
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const CHAVE_ACESSO = 'apontamento.tokenAcesso';
const CHAVE_RENOVACAO = 'apontamento.tokenRenovacao';
const CHAVE_DISPOSITIVO = 'apontamento.dispositivo';

export interface DetalheErro {
  campo?: string;
  criterio?: string;
  mensagem: string;
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly detalhes: DetalheErro[] = [],
  ) {
    super(mensagem);
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    /* armazenamento indisponível */
  }
}

/** Identificador do dispositivo (sessão por dispositivo). */
export function idDispositivo(): string {
  let id = ler(CHAVE_DISPOSITIVO);
  if (!id) {
    id = crypto.randomUUID();
    gravar(CHAVE_DISPOSITIVO, id);
  }
  return id;
}

export const tokens = {
  acesso: () => ler(CHAVE_ACESSO),
  renovacao: () => ler(CHAVE_RENOVACAO),
  salvar(acesso: string, renovacao: string) {
    gravar(CHAVE_ACESSO, acesso);
    gravar(CHAVE_RENOVACAO, renovacao);
  },
  limpar() {
    gravar(CHAVE_ACESSO, null);
    gravar(CHAVE_RENOVACAO, null);
  },
};

/** Avisado quando a sessão expira e não pode ser renovada. */
let aoExpirarSessao: () => void = () => {};
export function definirAoExpirarSessao(f: () => void): void {
  aoExpirarSessao = f;
}

/** Resultado da renovação: renovado, recusado pelo servidor ou falha de rede (sessão mantida). */
type Renovacao = 'renovado' | 'recusado' | 'falha';
let renovacaoEmAndamento: Promise<Renovacao> | null = null;
async function renovar(): Promise<Renovacao> {
  const tokenRenovacao = tokens.renovacao();
  if (!tokenRenovacao) return 'recusado';
  renovacaoEmAndamento ??= (async () => {
    try {
      const r = await fetch(`${BASE}/autenticacao/renovar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokenRenovacao }),
      });
      if (r.status === 401 || r.status === 403) return 'recusado';
      if (!r.ok) return 'falha';
      const corpo = await r.json();
      tokens.salvar(corpo.tokenAcesso, corpo.tokenRenovacao);
      return 'renovado';
    } catch {
      return 'falha';
    } finally {
      setTimeout(() => (renovacaoEmAndamento = null), 0);
    }
  })();
  return renovacaoEmAndamento;
}

async function executar(metodo: string, caminho: string, corpo?: unknown): Promise<Response> {
  const cabecalhos: Record<string, string> = { 'x-dispositivo': idDispositivo() };
  const posto = lerPosto().postoId;
  if (posto) cabecalhos['x-posto'] = posto;
  const acesso = tokens.acesso();
  if (acesso) cabecalhos.authorization = `Bearer ${acesso}`;
  const formulario = corpo instanceof FormData;
  if (corpo !== undefined && !formulario) cabecalhos['content-type'] = 'application/json';
  return fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
  });
}

export async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await executar(metodo, caminho, corpo);
    if (r.status === 401 && !caminho.startsWith('/autenticacao/entrar') && tokens.renovacao()) {
      const renovacao = await renovar();
      if (renovacao === 'renovado') {
        r = await executar(metodo, caminho, corpo);
      } else if (renovacao === 'recusado') {
        tokens.limpar();
        aoExpirarSessao();
      } else {
        throw new Error('falha de rede na renovação');
      }
    }
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : undefined;
  if (!r.ok) {
    throw new ErroApi(r.status, dados?.mensagem ?? `Erro ${r.status}`, dados?.detalhes ?? []);
  }
  return dados as T;
}

/** Baixa um arquivo da API (ex.: modelo de Excel) e oferece ao navegador. */
async function baixar(caminho: string, nomeArquivo: string, corpo?: unknown): Promise<void> {
  const metodo = corpo === undefined ? 'GET' : 'POST';
  let r = await executar(metodo, caminho, corpo);
  if (r.status === 401 && (await renovar()) === 'renovado') r = await executar(metodo, caminho, corpo);
  if (!r.ok) {
    const dados = await r.json().catch(() => ({}));
    throw new ErroApi(r.status, dados?.mensagem ?? `Erro ${r.status}`);
  }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Lê um fluxo Server-Sent Events autenticado (o token vai no cabeçalho, não na URL).
 * Resolve quando o fluxo termina ou cai; quem chama decide reconectar.
 */
export async function lerFluxo(
  caminho: string,
  aoEvento: (tipo: string, dados: unknown) => void,
  sinal: AbortSignal,
): Promise<void> {
  const abrir = () =>
    fetch(`${BASE}${caminho}`, {
      headers: { authorization: `Bearer ${tokens.acesso() ?? ''}`, accept: 'text/event-stream' },
      signal: sinal,
    });
  let r = await abrir();
  if (r.status === 401 && (await renovar()) === 'renovado') r = await abrir();
  if (!r.ok || !r.body) throw new ErroApi(r.status, `Erro ${r.status}`);
  const leitor = r.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) return;
    resto += decodificador.decode(value, { stream: true });
    const blocos = resto.split('\n\n');
    resto = blocos.pop() ?? '';
    for (const bloco of blocos) {
      let tipo = 'message';
      const dados: string[] = [];
      for (const linha of bloco.split('\n')) {
        if (linha.startsWith('event:')) tipo = linha.slice(6).trim();
        else if (linha.startsWith('data:')) dados.push(linha.slice(5).trim());
      }
      if (!dados.length) continue;
      try {
        aoEvento(tipo, JSON.parse(dados.join('\n')));
      } catch {
        aoEvento(tipo, dados.join('\n'));
      }
    }
  }
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo ?? {}),
  put: <T>(caminho: string, corpo: unknown) => requisitar<T>('PUT', caminho, corpo),
  /** Envia arquivo em multipart/form-data. */
  enviarArquivo: <T>(caminho: string, campo: string, arquivo: File) => {
    const f = new FormData();
    f.append(campo, arquivo);
    return requisitar<T>('POST', caminho, f);
  },
  baixar,
};
