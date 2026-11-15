import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { criarAgente } from './agente.js';
import { criarSimulador } from './simulador-impressora.js';

const ouvir = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function cenario(config = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'zpl-'));
  const impressora = criarSimulador(dir);
  const portaImpressora = await ouvir(impressora);
  // Porta fechada: abre e fecha um servidor para obter uma porta livre.
  const temp = createServer();
  const portaFechada = await ouvir(temp);
  await new Promise((r) => temp.close(r));
  const agente = criarAgente({
    token: 'segredo',
    portas: [portaImpressora, portaFechada],
    hosts: [],
    origens: '*',
    simularDir: null,
    timeoutMs: 2000,
    ...config,
  });
  const portaAgente = await ouvir(agente);
  const url = `http://127.0.0.1:${portaAgente}`;
  const fechar = () =>
    Promise.all([new Promise((r) => agente.close(r)), new Promise((r) => impressora.close(r))]);
  return { dir, url, portaImpressora, portaFechada, fechar };
}

const imprimir = (url, corpo, token = 'segredo') =>
  fetch(`${url}/imprimir`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': token },
    body: JSON.stringify(corpo),
  });

test('repassa o ZPL à impressora por TCP', async () => {
  const c = await cenario();
  const zpl = '^XA^FO20,20^FDT1-0000001^FS^XZ';
  const r = await imprimir(c.url, { host: '127.0.0.1', porta: c.portaImpressora, zpl });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  await esperar(100);
  const arquivos = await readdir(c.dir);
  assert.equal(arquivos.length, 1);
  assert.equal(await readFile(join(c.dir, arquivos[0]), 'utf8'), zpl);
  await c.fechar();
});

test('falha de conexão com a impressora retorna 502 com a mensagem', async () => {
  const c = await cenario();
  const r = await imprimir(c.url, { host: '127.0.0.1', porta: c.portaFechada, zpl: '^XA^XZ' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).mensagem, /Falha ao conectar na impressora/);
  await c.fechar();
});

test('exige token, porta permitida e ZPL válido', async () => {
  const c = await cenario();
  assert.equal(
    (await imprimir(c.url, { host: '127.0.0.1', porta: c.portaImpressora, zpl: '^XA^XZ' }, 'errado')).status,
    401,
  );
  assert.equal((await imprimir(c.url, { host: '127.0.0.1', porta: 22, zpl: '^XA^XZ' })).status, 403);
  assert.equal(
    (await imprimir(c.url, { host: '127.0.0.1', porta: c.portaImpressora, zpl: 'rm -rf' })).status,
    400,
  );
  const pre = await fetch(`${c.url}/imprimir`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
  await c.fechar();
});

test('modo simulação grava o ZPL em arquivo sem abrir conexão', async () => {
  const simularDir = await mkdtemp(join(tmpdir(), 'sim-'));
  const c = await cenario({ simularDir, portas: [9100] });
  const r = await imprimir(c.url, { host: '10.0.0.50', porta: 9100, zpl: '^XA^FDsim^FS^XZ' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).simulacao, true);
  assert.equal((await readdir(simularDir)).length, 1);
  const saude = await (await fetch(`${c.url}/saude`)).json();
  assert.deepEqual(saude, { situacao: 'ok', simulacao: true });
  await c.fechar();
});
