import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { configurarPosto } from './auxiliar';

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

test.describe.serial('Fase 5 — painéis e indicadores', () => {
  test('ao lançar uma parada, o cartão fica vermelho com motivo e tempo em contagem, sem recarregar', async ({
    browser,
  }) => {
    // Quem acompanha (TV/monitor): perfil de estoque, só leitura dos painéis.
    const tv = await (await browser.newContext()).newPage();
    await entrar(tv, 'estoque@exemplo.com.br');
    await tv.getByRole('link', { name: 'Acompanhamento', exact: true }).click();
    const cartao = tv.locator('[data-maquina="INJ-01"]');
    await expect(cartao).toHaveAttribute('data-situacao', 'LIGADA');
    await expect(tv.locator('[data-conectado="true"]')).toBeVisible();
    let recarregou = false;
    tv.on('framenavigated', (f) => {
      if (f === tv.mainFrame()) recarregou = true;
    });

    // O apontador lança a parada no tablet.
    const tablet = await (await browser.newContext()).newPage();
    await entrar(tablet, 'apontador2@exemplo.com.br');
    await configurarPosto(tablet, 'T2');
    await tablet.getByRole('link', { name: 'Apontamento', exact: true }).click();
    const maquina = tablet.locator('[data-maquina="INJ-01"]');
    await maquina.getByRole('button', { name: 'Parada' }).click();
    const lancamento = tablet.getByRole('dialog');
    await lancamento.getByRole('button', { name: /MEC — Quebra mecânica/ }).click();
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(lancamento).toBeHidden();

    await expect(cartao).toHaveAttribute('data-situacao', 'PARADA', { timeout: 10_000 });
    await expect(cartao).toContainText('MEC — Quebra mecânica');
    const contagem = cartao.locator('[data-contagem]');
    const primeiro = await contagem.textContent();
    await expect(contagem).not.toHaveText(primeiro ?? '', { timeout: 3000 });
    await expect(cartao).toHaveCSS('border-color', 'rgb(250, 82, 82)');
    expect(recarregou).toBe(false);

    // Reinício: volta a verde, também sem recarregar.
    await maquina.getByRole('button', { name: 'Reinício' }).click();
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(cartao).toHaveAttribute('data-situacao', 'LIGADA', { timeout: 10_000 });
    expect(recarregou).toBe(false);

    // Modo TV: tela sem menu.
    await tv.getByRole('link', { name: 'Tela cheia' }).click();
    await expect(tv.getByRole('link', { name: 'Indicadores', exact: true })).toHaveCount(0);
    await expect(tv.locator('[data-maquina="INJ-01"]')).toBeVisible();
  });

  test('filtros por equipe e por horário de turno funcionam; tabelas exportam para Excel', async ({
    page,
  }) => {
    await entrar(page, 'pcp@exemplo.com.br');
    await page.getByRole('link', { name: 'Indicadores', exact: true }).click();
    const equipes = page.locator('[data-tabela="Comparação entre equipes"] tbody tr');
    await expect(equipes.first()).toBeVisible();
    const letra = ((await equipes.first().locator('td').first().textContent()) ?? '').trim();

    await page.getByRole('combobox', { name: 'Equipe' }).click();
    await page.getByRole('option', { name: `Equipe ${letra}`, exact: true }).click();
    await expect(
      page
        .locator('[data-tabela="Comparação entre equipes"] tbody td:first-child')
        .filter({ hasNotText: letra }),
    ).toHaveCount(0);

    const horarios = page.locator('[data-tabela="Comparação entre horários de turno"] tbody tr');
    const horario = ((await horarios.first().locator('td').first().textContent()) ?? '').trim();
    await page.getByRole('combobox', { name: 'Horário de turno' }).click();
    await page.getByRole('option', { name: horario, exact: true }).click();
    await expect(
      page
        .locator('[data-tabela="Comparação entre horários de turno"] tbody td:first-child')
        .filter({ hasNotText: horario }),
    ).toHaveCount(0);
    await expect(page.getByText(/\d+ turno\(s\)/).first()).toBeVisible();

    // Equipe sem turnos no período: nenhuma linha.
    const outra = ['A', 'B', 'C', 'D'].find((l) => l !== letra)!;
    await page.getByRole('combobox', { name: 'Equipe' }).click();
    await page.getByRole('option', { name: `Equipe ${outra}`, exact: true }).click();
    await expect(
      page
        .locator('[data-tabela="Comparação entre equipes"] tbody td:first-child')
        .filter({ hasNotText: outra }),
    ).toHaveCount(0);

    // Exportação para Excel.
    await page.getByRole('combobox', { name: 'Equipe' }).click();
    await page.getByRole('option', { name: `Equipe ${letra}`, exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar OEE por máquina para Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('oee-por-maquina.xlsx');
    const conteudo = await readFile((await download.path())!);
    expect(conteudo.subarray(0, 2).toString()).toBe('PK');
    await expect(page.getByText('Evolução do OEE')).toBeVisible();
  });
});
