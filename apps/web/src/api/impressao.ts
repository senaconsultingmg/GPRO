import { api } from './cliente';
import { lerPosto } from './posto';

interface Preparacao {
  impressaoId: string;
  zpl: string;
  segundaVia?: boolean;
  etiqueta?: { id: string; codigo: string };
  impressora: { nome: string; enderecoIp: string; porta: number };
}

/** Envia o ZPL ao agente de impressão da rede local. */
export async function enviarAoAgente(
  p: Pick<Preparacao, 'zpl' | 'impressora'>,
): Promise<{ sucesso: boolean; mensagem: string | null }> {
  const { agenteUrl, agenteToken } = lerPosto();
  try {
    const r = await fetch(`${agenteUrl.replace(/\/$/, '')}/imprimir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': agenteToken },
      body: JSON.stringify({ host: p.impressora.enderecoIp, porta: p.impressora.porta, zpl: p.zpl }),
    });
    if (r.ok) return { sucesso: true, mensagem: null };
    const corpo = await r.json().catch(() => ({}));
    return { sucesso: false, mensagem: corpo.mensagem ?? `Agente respondeu ${r.status}` };
  } catch {
    return { sucesso: false, mensagem: `Agente de impressão inacessível em ${agenteUrl}.` };
  }
}

export interface ResultadoImpressao {
  impressas: string[];
  pendentes: { codigo: string; mensagem: string }[];
}

/**
 * Imprime as etiquetas: a API monta o ZPL, o dispositivo envia ao agente e informa o resultado.
 * Falha não desfaz o lançamento: a etiqueta fica como "impressão pendente" (seção 8).
 */
export async function imprimirEtiquetas(
  ids: string[],
  opcoes: { impressoraId?: string | null; layoutId?: string | null } = {},
): Promise<ResultadoImpressao> {
  const r: ResultadoImpressao = { impressas: [], pendentes: [] };
  for (const id of ids) {
    let prep: Preparacao;
    try {
      prep = await api.post<Preparacao>(`/etiquetas/${id}/impressao`, opcoes);
    } catch (e) {
      r.pendentes.push({ codigo: id, mensagem: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const envio = await enviarAoAgente(prep);
    await api.put(`/impressoes/${prep.impressaoId}`, envio).catch(() => undefined);
    if (envio.sucesso) r.impressas.push(prep.etiqueta!.codigo);
    else r.pendentes.push({ codigo: prep.etiqueta!.codigo, mensagem: envio.mensagem ?? '' });
  }
  return r;
}

/** Impressão de teste de um layout. */
export async function imprimirTesteLayout(layoutId: string, impressoraId?: string | null) {
  const prep = await api.post<Preparacao>(`/layouts-etiqueta/${layoutId}/teste`, {
    impressoraId: impressoraId ?? null,
  });
  const envio = await enviarAoAgente(prep);
  await api.put(`/impressoes/${prep.impressaoId}`, envio).catch(() => undefined);
  return { ...envio, impressora: prep.impressora.nome };
}

export async function testarAgente(url: string): Promise<string> {
  const r = await fetch(`${url.replace(/\/$/, '')}/saude`);
  const c = await r.json();
  return c.simulacao ? 'Agente respondendo (modo simulação).' : 'Agente respondendo.';
}
