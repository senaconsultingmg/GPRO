import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { configurarPosto } from './auxiliar';

const DIR_IMPRESSORA = 'impressora-simulada';
const API = 'http://localhost:3100/api';

async function entrar(page: Page, login: string, senha = 'Senha@123') {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('apontamento.tokenAcesso');
    localStorage.removeItem('apontamento.tokenRenovacao');
  });
  await page.goto('/');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible();
}

/** Códigos das etiquetas recebidas pela impressora simulada, da mais antiga para a mais nova. */
async function codigosImpressos(): Promise<string[]> {
  const arquivos = (await readdir(DIR_IMPRESSORA).catch(() => [] as string[])).sort();
  const zpls = await Promise.all(arquivos.map((a) => readFile(join(DIR_IMPRESSORA, a), 'utf8')));
  return zpls.map((z) => /\(21\)([A-Z0-9]{2}-\d{7})/.exec(z)?.[1] ?? '').filter(Boolean);
}

/** Simula a rede do servidor desligada: o app e o agente de impressão continuam acessíveis. */
const desligarServidor = (page: Page) => page.route('**/api/**', (r) => r.abort('internetdisconnected'));
const religarServidor = (page: Page) => page.unroute('**/api/**');

async function token(request: APIRequestContext, login: string, senha = 'Senha@123') {
  const r = await request.post(`${API}/autenticacao/entrar`, { data: { login, senha } });
  return { authorization: `Bearer ${(await r.json()).tokenAcesso}` };
}

/** Espera o tablet ter o pacote atualizado e números de etiqueta reservados. */
async function esperarPacote(page: Page, depoisDe = '') {
  const ind = page.locator('[data-numeros-livres]');
  await expect
    .poll(async () => Number((await ind.getAttribute('data-numeros-livres')) || 0), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await ind.getAttribute('data-pacote-em')) ?? '', { timeout: 15_000 })
    .not.toBe(depoisDe);
}

async function lancarProducao(page: Page, maquina: string, conjuntos: number, op?: RegExp) {
  const cartao = page.locator(`[data-maquina="${maquina}"]`);
  const dialogo = page.getByRole('dialog');
  await cartao.getByRole('button', { name: 'Produção' }).click();
  if (op) await dialogo.getByRole('button', { name: op }).click();
  for (let i = 1; i < conjuntos; i++) await dialogo.getByRole('button', { name: 'Mais um conjunto' }).click();
  await dialogo.getByLabel('Peso médio da peça').fill(maquina === 'INJ-03' ? '210' : '384');
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialogo).toBeHidden();
}

async function ligarECriarDivisoes(page: Page, maquina: string) {
  await page.getByRole('button', { name: 'Ligar máquina' }).first().click();
  const ligar = page.getByRole('dialog', { name: 'Ligar máquina' });
  await ligar.getByRole('button', { name: new RegExp(`^${maquina}`) }).click();
  await ligar.getByRole('button', { name: 'Ligar máquina' }).click();
  const divisoes = page.getByRole('dialog', { name: /Divisão das OPs/ });
  const criar = divisoes.getByRole('button', { name: /^Criar divisão/ });
  await expect(criar.first()).toBeVisible();
  while ((await criar.count()) > 0) {
    const antes = await criar.count();
    await criar.first().click();
    await expect(criar).toHaveCount(antes - 1);
  }
  await divisoes.getByRole('button', { name: 'Fechar' }).click();
}

async function fecharTurno(page: Page) {
  await page.getByRole('button', { name: 'Fechar turno' }).click();
  const fechar = page.getByRole('dialog', { name: 'Fechar turno' });
  for (const d of await fechar.getByText('Desligar', { exact: true }).all()) await d.click();
  await fechar.getByRole('button', { name: 'Fechar turno' }).click();
}

test.describe.serial('Fase 7 — offline e sincronização', () => {
  test('com o servidor fora, o apontador lança um turno inteiro e imprime; ao religar, tudo sobe sem duplicar', async ({
    page,
    request,
  }) => {
    await entrar(page, 'apontador2@exemplo.com.br');
    await configurarPosto(page, 'T2');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    // Encerra (online) o turno que ficou aberto nas fases anteriores.
    await fecharTurno(page);
    await expect(page.getByRole('heading', { name: /Relatório do turno/ })).toBeVisible();
    const pacoteAntes = (await page.locator('[data-pacote-em]').getAttribute('data-pacote-em')) ?? '';
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Abrir turno' })).toBeVisible();
    await esperarPacote(page, pacoteAntes);

    await desligarServidor(page);
    const impressosAntes = (await codigosImpressos()).length;
    await page.getByRole('button', { name: 'Abrir turno' }).click();
    await expect(page.getByRole('heading', { name: /^Turno (Dia|Noite)/ })).toBeVisible();
    await expect(page.locator('[data-conexao="offline"]')).toBeVisible();
    await expect(page.getByText('Sem conexão', { exact: true })).toBeVisible();

    await ligarECriarDivisoes(page, 'INJ-01');
    const cartao = page.locator('[data-maquina="INJ-01"]');
    await expect(cartao.getByText('Produzindo')).toBeVisible();
    await lancarProducao(page, 'INJ-01', 2);
    await expect.poll(async () => (await codigosImpressos()).length).toBe(impressosAntes + 2);
    const impressos = (await codigosImpressos()).slice(-2);
    expect(impressos.every((c) => c.startsWith('T2-'))).toBe(true);

    const dialogo = page.getByRole('dialog');
    await cartao.getByRole('button', { name: 'Parada' }).click();
    await dialogo.getByRole('button', { name: /REF — Refeição/ }).click();
    await dialogo.getByRole('button', { name: 'Confirmar' }).click();
    await expect(cartao.getByText('Parada', { exact: true })).toBeVisible();
    await cartao.getByRole('button', { name: 'Reinício' }).click();
    await dialogo.getByRole('button', { name: 'Confirmar' }).click();
    await expect(cartao.getByText('Produzindo')).toBeVisible();
    await expect(page.getByRole('row', { name: /Aguardando envio/ }).first()).toBeVisible();

    await fecharTurno(page);
    await expect(page.getByRole('heading', { name: 'Abrir turno' })).toBeVisible();
    const pendentes = page.locator('[data-pendentes]');
    const naFila = Number(await pendentes.getAttribute('data-pendentes'));
    expect(naFila).toBe(9); // abrir, ligar, 3 divisões, produção, parada, reinício e fechar

    // Volta a rede: a fila sobe sozinha, na ordem.
    await religarServidor(page);
    await pendentes.dispatchEvent('click').catch(() => undefined);
    await expect(page.locator('[data-conexao="online"]')).toBeVisible({ timeout: 20_000 });
    await expect(pendentes).toHaveCount(0, { timeout: 20_000 });

    const cab = await token(request, 'pcp@exemplo.com.br');
    const lider = await token(request, 'lider@exemplo.com.br');
    const turnos = await (await request.get(`${API}/turnos?situacao=FECHADO`, { headers: lider })).json();
    const turno = turnos.find(
      (t: { apontador: { nome: string } }) => t.apontador.nome === 'Marina Apontadora',
    );
    const detalhe = await (await request.get(`${API}/turnos/${turno.id}`, { headers: lider })).json();
    const tipos = detalhe.eventos.map((e: { tipo: string }) => e.tipo).sort();
    expect(tipos.filter((t: string) => t === 'SAIDA_PRODUCAO')).toHaveLength(1);
    expect(tipos.filter((t: string) => t === 'INICIO_MAQUINA')).toHaveLength(1);
    expect(tipos.filter((t: string) => t === 'FIM_MAQUINA')).toHaveLength(1);
    expect(detalhe.divisoes ?? detalhe.maquinas[0].divisoes).toHaveLength(3);
    for (const codigo of impressos) {
      const ler = async () =>
        (await request.get(`${API}/etiquetas/leitura?codigo=${codigo}`, { headers: cab })).json();
      expect(await ler()).toMatchObject({ codigo, turnoId: turno.id });
      // A impressão feita offline é informada ao servidor depois que o lançamento sobe.
      await expect.poll(async () => (await ler()).impressaoPendente, { timeout: 15_000 }).toBe(false);
    }
  });

  test('dois tablets offline no mesmo posto emitem etiquetas sem código repetido', async ({
    browser,
    request,
  }) => {
    const abrirTablet = async (login: string, maquina: string) => {
      const page = await (await browser.newContext()).newPage();
      await entrar(page, login);
      await configurarPosto(page, 'T1');
      await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
      await esperarPacote(page);
      await page.getByRole('button', { name: 'Abrir turno' }).click();
      await expect(page.getByRole('heading', { name: /^Turno (Dia|Noite)/ })).toBeVisible();
      await ligarECriarDivisoes(page, maquina);
      return page;
    };
    const a = await abrirTablet('apontador@exemplo.com.br', 'INJ-03');
    const b = await abrirTablet('apontador2@exemplo.com.br', 'INJ-01');
    const antes = (await codigosImpressos()).length;
    await desligarServidor(a);
    await desligarServidor(b);
    await lancarProducao(a, 'INJ-03', 2);
    await lancarProducao(b, 'INJ-01', 2);
    await lancarProducao(a, 'INJ-03', 1);
    await lancarProducao(b, 'INJ-01', 1);
    await expect.poll(async () => (await codigosImpressos()).length).toBe(antes + 6);
    const codigos = (await codigosImpressos()).slice(-6);
    expect(codigos.every((c) => c.startsWith('T1-'))).toBe(true);
    expect(new Set(codigos).size).toBe(6);

    for (const p of [a, b]) {
      await religarServidor(p);
      await p
        .locator('[data-pendentes]')
        .dispatchEvent('click')
        .catch(() => undefined);
      await expect(p.locator('[data-pendentes]')).toHaveCount(0, { timeout: 20_000 });
    }
    const cab = await token(request, 'pcp@exemplo.com.br');
    for (const codigo of codigos) {
      const r = await request.get(`${API}/etiquetas/leitura?codigo=${codigo}`, { headers: cab });
      expect(r.status(), codigo).toBe(200);
    }
  });

  test('evento recusado na sincronização aparece na lista de recusados', async ({ page, request }) => {
    await entrar(page, 'apontador2@exemplo.com.br');
    await configurarPosto(page, 'T2');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    await expect(page.locator('[data-maquina="INJ-01"]')).toBeVisible();
    await esperarPacote(page);

    // Enquanto o tablet está offline, o PCP encerra a OP do CAD-0032.
    await desligarServidor(page);
    const cab = await token(request, 'pcp@exemplo.com.br');
    const ordens = await (await request.get(`${API}/ordens`, { headers: cab })).json();
    const op = ordens.find((o: { numeroErp: string }) => o.numeroErp === '04508401002');
    expect((await request.post(`${API}/ordens/${op.id}/encerrar`, { headers: cab })).status()).toBe(200);

    await lancarProducao(page, 'INJ-01', 1, /CAD-0032/);
    await expect(page.locator('[data-pendentes]')).toHaveAttribute('data-pendentes', '1');
    await religarServidor(page);
    await page
      .locator('[data-pendentes]')
      .dispatchEvent('click')
      .catch(() => undefined);
    await expect(page.locator('[data-pendentes]')).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole('link', { name: /1 recusado\(s\)/ }).click();

    await expect(page.getByRole('heading', { name: 'Lançamentos recusados' })).toBeVisible();
    const linha = page.locator('[data-recusado]').filter({ hasText: /encerrada/ });
    await expect(linha).toContainText('Saída de produção');
    await linha.getByRole('button', { name: 'Descartar' }).click();
    const modal = page.getByRole('dialog');
    await modal
      .getByLabel('Justificativa do descarte')
      .fill('OP encerrada pelo PCP; produção lançada na OP seguinte.');
    await modal.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByText('Nenhum lançamento recusado nesta situação.')).toBeVisible();
    await page.getByText('Descartados', { exact: true }).click();
    await expect(page.locator('[data-recusado]').filter({ hasText: /encerrada/ })).toContainText(
      'OP encerrada pelo PCP',
    );
  });
});
