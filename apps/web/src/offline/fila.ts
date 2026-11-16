import type { QueryClient } from '@tanstack/react-query';
import { BASE, ErroApi, idDispositivo, renovar, tokens } from '../api/cliente';
import { banco, type ItemFila, type TipoItemFila } from './db';
import { atualizarEstado, lerEstado } from './estado';

/**
 * Fila de envio do tablet (seção 11). Cada lançamento é gravado primeiro no aparelho, com
 * identificador gerado aqui, e enviado à API na ordem. O servidor ignora repetições, então
 * reenviar nunca duplica. Recusas do servidor vão para a lista de recusados; nada some.
 */

let clienteConsultas: QueryClient | null = null;
export const definirClienteConsultas = (c: QueryClient) => (clienteConsultas = c);

/** Usuário logado (guardado no tablet pela autenticação). */
export function usuarioAtualId(): string | null {
  try {
    return (
      (JSON.parse(localStorage.getItem('apontamento.usuario') ?? 'null') as { id?: string } | null)?.id ??
      null
    );
  } catch {
    return null;
  }
}

let contador = 0;
const proximaSeq = () => Date.now() * 1000 + (contador++ % 1000);

async function contarPendentes() {
  const u = usuarioAtualId();
  const n = u ? await banco.fila.where('usuarioId').equals(u).count() : 0;
  atualizarEstado({ pendentes: n, versao: lerEstado().versao + 1 });
  return n;
}

export async function pendentesDoTurno(turnoId: string): Promise<ItemFila[]> {
  return (await banco.fila.where('turnoId').equals(turnoId).toArray()).sort((a, b) => a.seq - b.seq);
}

export async function itensDoUsuario(): Promise<ItemFila[]> {
  const u = usuarioAtualId();
  if (!u) return [];
  return (await banco.fila.where('usuarioId').equals(u).toArray()).sort((a, b) => a.seq - b.seq);
}

/** status 0 = sem conexão (tenta de novo depois). */
type Resposta =
  { ok: true; corpo: unknown } | { ok: false; status: number; corpo: { mensagem?: string; detalhes?: [] } };

async function enviarItem(item: ItemFila): Promise<Resposta> {
  const tentar = () =>
    fetch(`${BASE}${item.rota}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens.acesso() ?? ''}`,
        'x-dispositivo': idDispositivo(),
        ...(item.posto ? { 'x-posto': item.posto } : {}),
        'x-hora-registro': item.horaRegistro,
        'x-hora-dispositivo': new Date().toISOString(),
      },
      body: JSON.stringify(item.corpo),
    });
  try {
    let r = await tentar();
    if (r.status === 401) {
      const ren = await renovar();
      if (ren !== 'renovado') return { ok: false, status: 0, corpo: {} };
      r = await tentar();
    }
    const texto = await r.text();
    const corpo = texto ? JSON.parse(texto) : undefined;
    if (r.ok) return { ok: true, corpo };
    // Servidor fora do ar ou proxy: tenta de novo depois, sem recusar.
    if (r.status >= 500 || r.status === 401) return { ok: false, status: 0, corpo: {} };
    return { ok: false, status: r.status, corpo: corpo ?? {} };
  } catch {
    return { ok: false, status: 0, corpo: {} };
  }
}

/** Avisa o servidor do item recusado (lista de recusados) e o retira da fila. */
async function registrarRecusa(item: ItemFila, status: number, mensagem: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/offline/recusados`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens.acesso() ?? ''}`,
        'x-dispositivo': idDispositivo(),
      },
      body: JSON.stringify({
        itemId: item.id,
        turnoId: item.turnoId,
        tipo: item.tipo,
        rota: item.rota,
        corpo: item.corpo,
        status,
        mensagem,
        criadoEm: item.horaRegistro,
      }),
    });
    if (!r.ok) return false;
  } catch {
    return false;
  }
  await banco.transaction('rw', banco.fila, banco.etiquetas, banco.impressoes, async () => {
    await banco.fila.delete(item.id);
    await banco.etiquetas.where('itemId').equals(item.id).delete();
    await banco.impressoes.where('itemId').equals(item.id).delete();
  });
  atualizarEstado({ recusados: lerEstado().recusados + 1 });
  return true;
}

export async function enfileirar(
  p: Omit<ItemFila, 'seq' | 'tentativas' | 'usuarioId' | 'horaRegistro'> & { horaRegistro?: string },
): Promise<ItemFila> {
  const usuarioId = usuarioAtualId();
  if (!usuarioId) throw new ErroApi(401, 'Sessão encerrada. Entre novamente.');
  const item: ItemFila = {
    ...p,
    usuarioId,
    seq: proximaSeq(),
    tentativas: 0,
    horaRegistro: p.horaRegistro ?? new Date().toISOString(),
  };
  await banco.fila.add(item);
  await contarPendentes();
  return item;
}

/**
 * Envia agora o item recém-gravado, se ele é o primeiro da fila e há conexão: a tela recebe a
 * resposta do servidor (erros de validação aparecem no formulário, e o item sai da fila).
 * Sem conexão, o item fica na fila e sobe sozinho depois.
 */
export async function enviarAgora<T = unknown>(
  item: ItemFila,
): Promise<{ enviado: true; corpo: T } | { enviado: false }> {
  const primeiros = await itensDoUsuario();
  if (primeiros[0]?.id !== item.id) {
    void processarFila();
    return { enviado: false };
  }
  atualizarEstado({ enviando: true });
  const r = await enviarItem(item);
  atualizarEstado({ enviando: false });
  if (r.ok) {
    await banco.fila.delete(item.id);
    atualizarEstado({ conectado: true, ultimoErro: null });
    await contarPendentes();
    void processarFila();
    return { enviado: true, corpo: r.corpo as T };
  }
  if (r.status === 0) {
    atualizarEstado({ conectado: false });
    agendar();
    return { enviado: false };
  }
  // Recusado com o apontador na tela: o formulário mostra o erro e ele corrige.
  await banco.transaction('rw', banco.fila, banco.etiquetas, async () => {
    await banco.fila.delete(item.id);
    await banco.etiquetas.where('itemId').equals(item.id).delete();
  });
  await contarPendentes();
  throw new ErroApi(r.status, r.corpo.mensagem ?? `Erro ${r.status}`, r.corpo.detalhes ?? []);
}

let rodando: Promise<void> | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;

function agendar(ms = 5000) {
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => void processarFila(), ms);
}

/** Envia a fila em ordem; para no primeiro problema de rede e tenta de novo depois. */
export function processarFila(): Promise<void> {
  rodando ??= (async () => {
    try {
      atualizarEstado({ enviando: true });
      for (const item of await itensDoUsuario()) {
        const r = await enviarItem(item);
        if (r.ok) {
          await banco.fila.delete(item.id);
          atualizarEstado({ conectado: true, ultimoErro: null });
          await contarPendentes();
          continue;
        }
        if (r.status === 0) {
          await banco.fila.update(item.id, {
            tentativas: item.tentativas + 1,
            ultimoErro: 'Sem conexão com o servidor.',
          });
          atualizarEstado({ conectado: false, ultimoErro: 'Sem conexão com o servidor.' });
          agendar();
          return;
        }
        const mensagem = r.corpo.mensagem ?? `Erro ${r.status}`;
        if (!(await registrarRecusa(item, r.status, mensagem))) {
          atualizarEstado({ conectado: false });
          agendar();
          return;
        }
        await contarPendentes();
      }
      await enviarImpressoes();
      await informarEstadoFila();
    } finally {
      atualizarEstado({ enviando: false });
      rodando = null;
      await contarPendentes();
      clienteConsultas?.invalidateQueries({ queryKey: ['turno'] });
      clienteConsultas?.invalidateQueries({ queryKey: ['recusados'] });
    }
  })();
  return rodando;
}

/** Informa ao servidor quantos lançamentos de cada turno aguardam envio neste tablet. */
export async function informarEstadoFila(): Promise<void> {
  const u = usuarioAtualId();
  if (!u || !tokens.acesso()) return;
  const itens = await banco.fila.toArray();
  const porTurno = new Map<string, number>();
  for (const i of itens) porTurno.set(i.turnoId, (porTurno.get(i.turnoId) ?? 0) + 1);
  try {
    const r = await fetch(`${BASE}/offline/estado-fila`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens.acesso()}`,
        'x-dispositivo': idDispositivo(),
        'x-hora-dispositivo': new Date().toISOString(),
      },
      body: JSON.stringify({
        pendentes: [...porTurno].map(([turnoId, quantidade]) => ({ turnoId, quantidade })),
      }),
    });
    atualizarEstado({ conectado: r.status < 500 });
  } catch {
    atualizarEstado({ conectado: false });
  }
}

/** Resultados de impressão feitos offline, depois que os lançamentos das etiquetas subiram. */
async function enviarImpressoes(): Promise<void> {
  const naFila = new Set((await banco.fila.toArray()).map((i) => i.id));
  const prontas = (await banco.impressoes.toArray()).filter((i) => !naFila.has(i.itemId));
  if (!prontas.length) return;
  try {
    const r = await fetch(`${BASE}/offline/impressoes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens.acesso() ?? ''}`,
        'x-dispositivo': idDispositivo(),
      },
      body: JSON.stringify({
        itens: prontas.map((i) => ({
          codigo: i.codigo,
          layoutId: i.layoutId,
          impressoraId: i.impressoraId,
          sucesso: i.sucesso,
          mensagem: i.mensagem,
          em: i.em,
        })),
      }),
    });
    if (r.ok) await banco.impressoes.bulkDelete(prontas.map((i) => i.id));
  } catch {
    /* tenta na próxima rodada */
  }
}

/** Liga o envio automático: ao voltar a rede, a cada 30 s e ao abrir o aplicativo. */
export function iniciarSincronizacao(): () => void {
  const aoVoltar = () => {
    atualizarEstado({ conectado: true });
    void processarFila();
  };
  const aoCair = () => atualizarEstado({ conectado: false });
  window.addEventListener('online', aoVoltar);
  window.addEventListener('offline', aoCair);
  const intervalo = setInterval(() => void processarFila(), 30_000);
  void contarPendentes().then(() => processarFila());
  return () => {
    window.removeEventListener('online', aoVoltar);
    window.removeEventListener('offline', aoCair);
    clearInterval(intervalo);
  };
}

export const tipoRotulo: Record<TipoItemFila, string> = {
  ABRIR_TURNO: 'Abertura do turno',
  LIGAR_MAQUINA: 'Ligar máquina',
  CRIAR_DIVISAO: 'Divisão da OP',
  EVENTO: 'Lançamento',
  FECHAR_TURNO: 'Fechamento do turno',
};
