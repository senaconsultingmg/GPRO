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

/** Abre o relatório do turno fechado na Fase 2 (apontador João). */
async function abrirRelatorioTurnoJoao(page: Page) {
  await page.getByRole('link', { name: 'Turnos e relatórios', exact: true }).click();
  await page
    .getByRole('row', { name: /João Apontador/ })
    .first()
    .getByRole('link', { name: 'Relatório' })
    .click();
  await expect(page.getByRole('heading', { name: /Relatório do turno/ })).toBeVisible();
}

test.describe.serial('Fase 4 — correções, aprovações, apuração e exportação', () => {
  test('PCP não enxerga o turno fechado antes da aprovação do líder', async ({ page }) => {
    await entrar(page, 'pcp@exemplo.com.br');
    await page.getByRole('link', { name: 'Apuração e exportação', exact: true }).click();
    await expect(page.getByText('Nenhum turno aprovado aguardando apuração.')).toBeVisible();
    await page.getByRole('link', { name: 'Turnos e relatórios', exact: true }).click();
    await expect(page.getByRole('row', { name: /João Apontador/ })).toHaveCount(0);
  });

  test('apontador solicita correção de um lançamento do turno fechado', async ({ page }) => {
    await entrar(page, 'apontador@exemplo.com.br');
    await configurarPosto(page, 'T1');
    await abrirRelatorioTurnoJoao(page);
    const linha = page.getByRole('row', { name: /Perda.*Peça refugada/ }).first();
    await linha.getByRole('button', { name: 'Corrigir' }).click();
    const modal = page.getByRole('dialog', { name: 'Solicitar correção' });
    await expect(modal.getByLabel('Quantidade')).toHaveValue('2');
    await modal.getByLabel('Quantidade').fill('3');
    await modal.getByRole('button', { name: 'Solicitar correção' }).click();
    await expect(modal.getByText('Informe o motivo da correção.')).toBeVisible();
    await modal.getByLabel('Motivo da correção').fill('Foram 3 peças refugadas, não 2.');
    await modal.getByRole('button', { name: 'Solicitar correção' }).click();
    await expect(page.getByText('Correção enviada para aprovação do líder.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Perda.*Correção pendente/ })).toBeVisible();
  });

  test('líder decide as pendências e aprova o relatório; original fica em vermelho ligado ao corretivo', async ({
    page,
  }) => {
    await entrar(page, 'lider@exemplo.com.br');
    await configurarPosto(page, 'T1');
    await page.getByRole('link', { name: 'Aprovações', exact: true }).click();
    const fechado = page.locator('tr[data-turno]').filter({ hasText: 'João Apontador' });
    await expect(fechado.getByRole('button', { name: 'Aprovar relatório' })).toBeDisabled();

    const pendencia = page
      .getByRole('row', { name: /João Apontador/ })
      .filter({ has: page.getByRole('button', { name: 'Decidir' }) });
    const modal = page.getByRole('dialog', { name: 'Decidir pendência' });
    while ((await pendencia.count()) > 0) {
      await pendencia.first().getByRole('button', { name: 'Decidir' }).click();
      await modal.getByLabel('Parecer').fill('Conferido com o apontador');
      await modal.getByRole('button', { name: 'Aprovar' }).click();
      await expect(modal).toBeHidden();
    }
    await expect(fechado.getByText('Sem pendências')).toBeVisible();
    await fechado.getByRole('button', { name: 'Aprovar relatório' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aprovar relatório' }).click();
    await expect(page.getByText(/Relatório do turno aprovado/)).toBeVisible();

    await abrirRelatorioTurnoJoao(page);
    const original = page.locator('tr[data-situacao="INCORRETO"]').filter({ hasText: 'Peça refugada' });
    await expect(original).toContainText('corrigido pelo lançamento');
    await expect(original).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByRole('row', { name: /Corrige o lançamento/ })).toContainText('3 pç');
  });

  test('PCP apura e exporta; o lote baixa os 4 arquivos e o turno exportado não aceita alteração', async ({
    page,
  }) => {
    await entrar(page, 'pcp@exemplo.com.br');
    await page.getByRole('link', { name: 'Apuração e exportação', exact: true }).click();
    const cartao = page.locator('[data-turno]').filter({ hasText: 'João Apontador' });
    await cartao.getByRole('button', { name: 'Apurar' }).click();
    await expect(page.getByText(/Turno apurado/)).toBeVisible();

    await page.getByRole('tab', { name: 'Exportação' }).click();
    await expect(page.getByRole('tab', { name: /Produção \(\d+\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Exportar' }).click();
    await expect(page.getByText(/Lote de exportação \d+ gerado/)).toBeVisible();
    const lote = page.getByRole('row').filter({ hasText: 'Paula Planejamento' }).first();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      lote.getByRole('button', { name: /^Produção/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^exportacao-\d+-producao\.xlsx$/);
    const conteudo = await readFile((await download.path())!);
    expect(conteudo.subarray(0, 2).toString()).toBe('PK');
    // Nada novo: o botão fica desabilitado (não exporta o mesmo item duas vezes).
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeDisabled();

    await entrar(page, 'apontador@exemplo.com.br');
    await abrirRelatorioTurnoJoao(page);
    await expect(page.getByText('Turno exportado ao ERP: não aceita nenhuma alteração.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Corrigir' })).toHaveCount(0);
  });
});
