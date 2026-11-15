import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { configurarPosto } from './auxiliar';

const DIR_IMPRESSORA = 'impressora-simulada';

async function entrar(page: Page, login: string, senha = 'Senha@123') {
  await page.goto('/');
  // Troca de usuário no mesmo navegador: descarta a sessão anterior (mantém a configuração do posto).
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

/** Etiquetas recebidas pela impressora simulada (conteúdo ZPL), da mais antiga para a mais nova. */
async function impressas(): Promise<string[]> {
  const arquivos = (await readdir(DIR_IMPRESSORA).catch(() => [] as string[])).sort();
  return Promise.all(arquivos.map((a) => readFile(join(DIR_IMPRESSORA, a), 'utf8')));
}

/** Aponta as impressoras para uma porta (9101 = simulada; 9102 = fechada, para simular falha). */
async function portaImpressoras(request: APIRequestContext, porta: number) {
  const login = await request.post('http://localhost:3100/api/autenticacao/entrar', {
    data: { login: 'admin@admin.com.br', senha: 'AdminNovo#2026' },
  });
  const { tokenAcesso } = await login.json();
  const cab = { authorization: `Bearer ${tokenAcesso}` };
  const lista = await (await request.get('http://localhost:3100/api/impressoras', { headers: cab })).json();
  for (const i of lista) {
    const { id, criadoEm: _c, atualizadoEm: _a, ...dados } = i;
    await request.put(`http://localhost:3100/api/impressoras/${id}`, {
      headers: cab,
      data: { ...dados, porta },
    });
  }
}

test.describe.serial('Fase 3 — etiquetas, matéria-prima e estoque', () => {
  test('3 conjuntos imprimem 3 etiquetas com códigos distintos; falha deixa pendente e reenviável', async ({
    page,
    request,
  }) => {
    await entrar(page, 'apontador2@exemplo.com.br');
    await configurarPosto(page, 'T2');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    const cartao = page.locator('[data-maquina="INJ-01"]');
    const lancamento = page.getByRole('dialog');
    const antes = (await impressas()).length;

    await cartao.getByRole('button', { name: 'Produção' }).click();
    await lancamento.getByRole('button', { name: 'Mais um conjunto' }).click();
    await lancamento.getByRole('button', { name: 'Mais um conjunto' }).click();
    await lancamento.getByLabel('Peso médio da peça').fill('384');
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Etiquetas impressas')).toBeVisible();
    await expect.poll(async () => (await impressas()).length).toBe(antes + 3);
    const novas = (await impressas()).slice(-3);
    const codigos = novas.map((z) => /\(21\)(T2-\d{7})/.exec(z)?.[1]);
    expect(new Set(codigos).size).toBe(3);
    expect(novas[0]).toContain('^BCN,150,N,N,N,D');
    expect(novas[0]).toContain('(240)CAD-0031(37)30');

    // Impressora fora do ar: o lançamento vale e a etiqueta fica pendente.
    await portaImpressoras(request, 9102);
    await cartao.getByRole('button', { name: 'Produção' }).click();
    await lancamento.getByLabel('Peso médio da peça').fill('384');
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/1 etiqueta\(s\) com impressão pendente/)).toBeVisible();

    await page.getByRole('link', { name: 'Etiquetas', exact: true }).click();
    await page.getByLabel('Só impressão pendente').check();
    await expect(page.getByRole('button', { name: 'Reenviar 1 pendente(s)' })).toBeVisible();
    await portaImpressoras(request, 9101);
    await page.getByRole('button', { name: 'Reenviar 1 pendente(s)' }).click();
    await expect(page.getByText('Etiquetas impressas')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reenviar/ })).toHaveCount(0);

    // Reimpressão sai como 2ª via.
    await page.getByLabel('Só impressão pendente').uncheck();
    await page.getByRole('button', { name: `Imprimir ${codigos[0]}` }).click();
    await expect.poll(async () => (await impressas()).at(-1) ?? '').toContain('2ª VIA');
  });

  test('superusuário altera tamanho e modelo do layout e imprime um teste', async ({ page }) => {
    await entrar(page, 'admin@admin.com.br', 'AdminNovo#2026');
    await configurarPosto(page, 'MP');
    await page.goto('/layouts-etiqueta');
    const linha = page.getByRole('row', { name: /Produto 100x50/ });
    await linha.getByRole('button', { name: 'Editar' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Altura').fill('40');
    await modal
      .getByLabel('Modelo ZPL')
      .fill('^XA^PW{{larguraPontos}}^LL{{alturaPontos}}^FO20,20^A0N,30,30^FDTESTE E2E {{codigo}}^FS^XZ');
    await modal.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /Produto 100x50.*100 × 40 mm/ })).toBeVisible();
    await page
      .getByRole('row', { name: /Produto 100x50/ })
      .getByRole('button', { name: 'Imprimir teste' })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Imprimir teste' }).click();
    await expect(page.getByText(/Teste enviado para Zebra Injeção/)).toBeVisible();
    await expect
      .poll(async () => (await impressas()).at(-1) ?? '')
      .toBe('^XA^PW799^LL320^FO20,20^A0N,30,30^FDTESTE E2E TS-0000000^FS^XZ');
  });

  test('mistura baixa os lotes, gera lote e etiqueta e é lida na entrada de matéria-prima da OP', async ({
    page,
  }) => {
    await entrar(page, 'materiaprima@exemplo.com.br');
    await configurarPosto(page, 'MP');
    await page.getByRole('link', { name: 'Matéria-prima', exact: true }).click();
    await page.getByRole('tab', { name: 'Mistura' }).click();
    const escolher = async (rotulo: string | RegExp, opcao: RegExp) => {
      await page.getByRole('combobox', { name: rotulo }).click();
      await page.getByRole('option', { name: opcao }).first().click();
    };
    await escolher('Material da mistura', /MIS-PP-AZ/);
    await escolher('Local da mistura', /Silos/);
    await escolher('Componente 1', /PP-H103/);
    await page.getByLabel('kg').nth(0).fill('40');
    await escolher('Componente 2', /MB-AZ01/);
    await page.getByLabel('kg').nth(1).fill('2');
    await expect(page.getByText('Total: 42 kg')).toBeVisible();
    await page.getByRole('button', { name: 'Preparar mistura e imprimir etiqueta' }).click();
    await expect(page.getByText(/Mistura preparada: lote L\d{6}-\d{3}/)).toBeVisible();
    await expect
      .poll(async () => (await impressas()).at(-1) ?? '')
      .toContain('PP-H103 95,24%, MB-AZ01 4,76%');
    const zplMistura = (await impressas()).at(-1)!;
    const codigoMistura = /\(21\)(MP-\d{7})/.exec(zplMistura)![1];

    await page.getByRole('tab', { name: 'Lotes e saldo' }).click();
    await expect(
      page.getByRole('row', { name: new RegExp(`MIS-PP-AZ.*42 kg.*${codigoMistura}`) }),
    ).toBeVisible();

    // O apontador lê a etiqueta da mistura na entrada de matéria-prima.
    await entrar(page, 'apontador2@exemplo.com.br');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    await page.locator('[data-maquina="INJ-01"]').getByRole('button', { name: 'Matéria-prima' }).click();
    const lancamento = page.getByRole('dialog');
    await lancamento.getByLabel('Etiqueta do lote ou mistura').fill(codigoMistura);
    await lancamento.getByLabel('Quantidade').fill('10');
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(lancamento).toBeHidden();
    await expect(page.getByRole('row', { name: /MIS-PP-AZ lote L\d{6}-\d{3}: 10 kg/ })).toBeVisible();
  });

  test('estoque recebe a etiqueta lida; segunda leitura é recusada; parâmetro de visão alterna a lista', async ({
    page,
  }) => {
    const ultimaProduto = (await impressas()).filter((z) => z.includes('(240)CAD-0031')).at(0)!;
    const codigo = /\(21\)([A-Z0-9]{2}-\d{7})/.exec(ultimaProduto)![1];
    await entrar(page, 'estoque@exemplo.com.br');
    await page.getByRole('link', { name: 'Estoque', exact: true }).click();
    await page.getByRole('combobox', { name: 'Local de estoque' }).click();
    await page.getByRole('option', { name: 'Expedição' }).click();
    const leitura = page.getByLabel('Leitura da etiqueta');
    await leitura.fill(`(21)${codigo}(240)CAD-0031(37)30`);
    await leitura.press('Enter');
    await expect(page.getByText(`Etiqueta ${codigo}`)).toBeVisible();
    await expect(page.getByText(/CAD-0031 — Cadeira plástica sem braço branca/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
    await expect(page.getByText(`Etiqueta ${codigo} recebida em Expedição.`)).toBeVisible();
    await leitura.fill(codigo);
    await leitura.press('Enter');
    await expect(page.getByText(/já foi recebida em .* por Ester Estoque \(Expedição\)/)).toBeVisible();
    await page.getByRole('tab', { name: 'Saldo por local' }).click();
    await expect(
      page.locator('.mantine-Card-root', { hasText: 'Expedição' }).getByText('30 Peça'),
    ).toBeVisible();

    // Superusuário muda a visão para "só pendentes".
    await entrar(page, 'admin@admin.com.br', 'AdminNovo#2026');
    await page.goto('/parametros');
    await page.getByRole('combobox', { name: 'visao_recebimento' }).click();
    await page.getByRole('option', { name: 'Só pendentes' }).click();
    await page
      .getByRole('row', { name: /visao_recebimento/ })
      .getByRole('button', { name: 'Salvar' })
      .click();
    await expect(page.getByText('Parâmetro salvo.')).toBeVisible();
    await entrar(page, 'estoque@exemplo.com.br');
    await page.getByRole('link', { name: 'Estoque', exact: true }).click();
    await expect(page.getByText('Etiquetas de produto (só pendentes, últimos 30 dias)')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(codigo) })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Emitida/ }).first()).toBeVisible();
  });
});
