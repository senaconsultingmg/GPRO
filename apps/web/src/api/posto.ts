/** Configuração deste posto (tablet/PC), guardada no próprio dispositivo. */
const CHAVES = {
  posto: 'apontamento.posto',
  agenteUrl: 'apontamento.agente.url',
  agenteToken: 'apontamento.agente.token',
};

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string | null) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    /* armazenamento indisponível */
  }
}

export interface ConfiguracaoPosto {
  /** Dispositivo do cadastro (o prefixo compõe o código das etiquetas). */
  postoId: string | null;
  /** Endereço do agente de impressão na rede da fábrica. */
  agenteUrl: string;
  agenteToken: string;
}

export const AGENTE_PADRAO = `${typeof location !== 'undefined' ? location.protocol : 'http:'}//${typeof location !== 'undefined' ? location.hostname : 'localhost'}:9180`;

export function lerPosto(): ConfiguracaoPosto {
  return {
    postoId: ler(CHAVES.posto),
    agenteUrl: ler(CHAVES.agenteUrl) ?? AGENTE_PADRAO,
    agenteToken: ler(CHAVES.agenteToken) ?? '',
  };
}

export function salvarPosto(c: ConfiguracaoPosto) {
  gravar(CHAVES.posto, c.postoId);
  gravar(CHAVES.agenteUrl, c.agenteUrl);
  gravar(CHAVES.agenteToken, c.agenteToken);
}
