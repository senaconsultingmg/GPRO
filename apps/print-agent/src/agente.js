/**
 * Agente de impressão (seção 8): serviço pequeno na rede da fábrica que recebe o ZPL por HTTP
 * e o repassa à impressora Zebra por TCP. Funciona com a aplicação na nuvem e sem internet,
 * pois o tablet fala direto com o agente na rede local.
 */
import { createServer as criarHttp } from 'node:http';
import { createServer as criarHttps } from 'node:https';
import { connect } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

/**
 * @typedef {object} Configuracao
 * @property {string} token            Token exigido no cabeçalho x-token.
 * @property {number[]} portas         Portas TCP permitidas (padrão 9100).
 * @property {string[]} hosts          Hosts permitidos (vazio = qualquer host).
 * @property {string} origens          Valor de Access-Control-Allow-Origin.
 * @property {string | null} simularDir Grava o ZPL em arquivos em vez de enviar à impressora.
 * @property {number} timeoutMs        Tempo máximo de conexão/envio.
 */

/** Lê a configuração das variáveis de ambiente. */
export function configuracaoDoAmbiente(env = process.env) {
  return {
    token: env.AGENTE_TOKEN ?? '',
    portas: (env.AGENTE_PORTAS ?? '9100')
      .split(',')
      .map((p) => Number(p.trim()))
      .filter(Boolean),
    hosts: (env.AGENTE_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    origens: env.AGENTE_ORIGENS ?? '*',
    simularDir: env.AGENTE_SIMULAR_DIR || null,
    timeoutMs: Number(env.AGENTE_TIMEOUT_MS ?? 5000),
  };
}

/** Envia o ZPL por TCP e resolve quando a conexão é encerrada sem erro. */
export function enviarTcp(host, porta, zpl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: porta });
    let concluido = false;
    const falhar = (erro) => {
      if (concluido) return;
      concluido = true;
      socket.destroy();
      reject(erro);
    };
    socket.setTimeout(timeoutMs, () =>
      falhar(new Error(`Tempo esgotado ao falar com a impressora ${host}:${porta}.`)),
    );
    socket.on('error', (e) =>
      falhar(new Error(`Falha ao conectar na impressora ${host}:${porta}: ${e.code ?? e.message}.`)),
    );
    socket.on('connect', () => {
      socket.end(zpl, 'utf8', () => {
        concluido = true;
        resolve();
      });
    });
  });
}

function tokenValido(recebido, esperado) {
  if (!esperado) return true;
  const a = Buffer.from(String(recebido ?? ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function lerCorpo(req, limite = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) {
        reject(new Error('Requisição muito grande.'));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

/** Cria o servidor HTTP(S) do agente. */
export function criarAgente(config, tls = null) {
  let contador = 0;
  const tratar = async (req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': config.origens,
        'access-control-allow-headers': 'content-type, x-token',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        // Chrome: permite que uma página pública chame um serviço da rede privada.
        'access-control-allow-private-network': 'true',
      });
      res.end(JSON.stringify(corpo));
    };
    try {
      if (req.method === 'OPTIONS') return responder(204, {});
      if (req.method === 'GET' && req.url === '/saude')
        return responder(200, { situacao: 'ok', simulacao: !!config.simularDir });
      if (req.method !== 'POST' || req.url !== '/imprimir')
        return responder(404, { mensagem: 'Rota não encontrada.' });
      if (!tokenValido(req.headers['x-token'], config.token))
        return responder(401, { mensagem: 'Token do agente inválido.' });
      let corpo;
      try {
        corpo = JSON.parse(await lerCorpo(req));
      } catch {
        return responder(400, { mensagem: 'Corpo inválido: envie JSON com host, porta e zpl.' });
      }
      const host = String(corpo.host ?? '').trim();
      const porta = Number(corpo.porta ?? 9100);
      const zpl = String(corpo.zpl ?? '');
      if (!host || !zpl.includes('^XA'))
        return responder(400, { mensagem: 'Informe host e um ZPL válido (^XA ... ^XZ).' });
      if (!config.portas.includes(porta))
        return responder(403, { mensagem: `Porta ${porta} não permitida no agente.` });
      if (config.hosts.length && !config.hosts.includes(host))
        return responder(403, { mensagem: `Impressora ${host} não permitida no agente.` });
      if (config.simularDir) {
        await mkdir(config.simularDir, { recursive: true });
        const arquivo = join(
          config.simularDir,
          `${Date.now()}-${++contador}-${host.replace(/[^\w.-]/g, '_')}-${porta}.zpl`,
        );
        await writeFile(arquivo, zpl, 'utf8');
        return responder(200, { ok: true, simulacao: true, arquivo });
      }
      await enviarTcp(host, porta, zpl, config.timeoutMs);
      return responder(200, { ok: true });
    } catch (e) {
      return responder(502, { mensagem: e instanceof Error ? e.message : String(e) });
    }
  };
  return tls ? criarHttps(tls, tratar) : criarHttp(tratar);
}

/** Carrega certificado e chave quando AGENTE_TLS_CERT e AGENTE_TLS_KEY estão definidos. */
export async function tlsDoAmbiente(env = process.env) {
  if (!env.AGENTE_TLS_CERT || !env.AGENTE_TLS_KEY) return null;
  return { cert: await readFile(env.AGENTE_TLS_CERT), key: await readFile(env.AGENTE_TLS_KEY) };
}
