import { expect, test, type Page } from '@playwright/test';

async function entrar(page: Page, login: string, senha: string) {
  await page.goto('/');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe.serial('Fase 1 — fundação e cadastros', () => {
  test('primeiro acesso do admin exige troca da senha inicial', async ({ page }) => {
    await entrar(page, 'admin@admin.com.br', '12345678910');
    const modal = page.getByRole('dialog', { name: 'Trocar senha' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('senha inicial')).toBeVisible();
    await modal.getByLabel('Senha atual').fill('12345678910');
    await modal.getByLabel('Nova senha', { exact: true }).fill('AdminNovo#2026');
    await modal.getByLabel('Confirme a nova senha').fill('AdminNovo#2026');
    await modal.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Olá, Administrador' })).toBeVisible();
  });

  test('tela do molde mostra máquinas compatíveis e o critério que falhou', async ({ page }) => {
    await entrar(page, 'admin@admin.com.br', 'AdminNovo#2026');
    await page.getByRole('link', { name: 'Moldes', exact: true }).click();
    const linha = page.getByRole('row', { name: /MOL-MES-1/ });
    await linha.getByRole('button', { name: 'Cavidades e compatibilidade' }).click();
    const gaveta = page.getByRole('dialog');
    await expect(gaveta.getByRole('row', { name: /INJ-02.*Compatível/ })).toBeVisible();
    await expect(gaveta.getByRole('row', { name: /INJ-01/ })).toContainText('Incompatível');
    await expect(gaveta.getByRole('row', { name: /INJ-01/ })).toContainText(
      'Força de fechamento da máquina (250 t) menor que a exigida pelo molde (420 t).',
    );
  });

  test('cadastro de produto aparece na auditoria', async ({ page }) => {
    await entrar(page, 'admin@admin.com.br', 'AdminNovo#2026');
    await page.getByRole('link', { name: 'Produtos', exact: true }).click();
    await page.getByRole('button', { name: /Novo\(a\) produto/ }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Código (ERP)').fill('E2E-001');
    await modal.getByLabel('Descrição').fill('Produto criado no teste de ponta a ponta');
    await modal.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('row', { name: /E2E-001/ })).toBeVisible();

    await page.getByRole('link', { name: 'Auditoria', exact: true }).click();
    const registro = page.getByRole('row', { name: /Produto.*CRIAR/ }).first();
    await expect(registro).toContainText('admin@admin.com.br');
    await expect(registro).toContainText('E2E-001');
  });

  test('PCP: menu restrito e ficha com molde incompatível é recusada com o critério', async ({ page }) => {
    await entrar(page, 'pcp@exemplo.com.br', 'Senha@123');
    await expect(page.getByRole('link', { name: 'Fichas técnicas', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuários', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Auditoria', exact: true })).toHaveCount(0);
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('link', { name: 'Fichas técnicas', exact: true }).click();
    await page.getByRole('button', { name: 'Nova ficha' }).click();
    const modal = page.getByRole('dialog');
    const escolher = async (rotulo: string, opcao: RegExp) => {
      await modal.getByRole('combobox', { name: rotulo }).click();
      await page.getByRole('option', { name: opcao }).click();
    };
    await escolher('Produto', /MES-0010/);
    await escolher('Máquina', /INJ-01/);
    await escolher('Molde', /MOL-MES-1/);
    await expect(modal.getByText('Molde incompatível com a máquina')).toBeVisible();
    await modal.getByLabel('Ciclo').fill('90');
    await modal.getByRole('button', { name: 'Criar rascunho' }).click();
    await expect(modal.getByText('O molde MOL-MES-1 não é compatível com a máquina INJ-01.')).toBeVisible();
    await expect(modal.getByText(/Peso do molde \(3\.100 kg\) excede o máximo/).first()).toBeVisible();
  });
});
