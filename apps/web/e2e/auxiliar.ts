import { expect, type Page } from '@playwright/test';

/** Configura o posto (prefixo das etiquetas) e o agente de impressão do teste. */
export async function configurarPosto(page: Page, prefixo: string) {
  await page.goto('/posto');
  await page.getByRole('combobox', { name: 'Dispositivo (posto)' }).click();
  await page.getByRole('option', { name: new RegExp(`^${prefixo} — `) }).click();
  await page.getByLabel('Endereço do agente de impressão').fill('http://localhost:9182');
  await page.getByLabel('Token do agente').fill('token-e2e');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Configuração do posto salva.')).toBeVisible();
  await page.goto('/');
}
