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

const MOTIVO = 'Câmara quente vazando (e2e)';

test.describe.serial('Fase 6 — manutenção com OS em etapas', () => {
  test('parada com motivo de manutenção cria a solicitação sem ação extra; o painel indica', async ({
    page,
    browser,
  }) => {
    await entrar(page, 'apontador2@exemplo.com.br');
    await configurarPosto(page, 'T2');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    const maquina = page.locator('[data-maquina="INJ-01"]');
    await maquina.getByRole('button', { name: 'Parada' }).click();
    const lancamento = page.getByRole('dialog');
    await lancamento.getByRole('button', { name: /MOL — Problema no molde/ }).click();
    await lancamento.getByLabel(/Justificativa/).fill(MOTIVO);
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(lancamento).toBeHidden();

    const tv = await (await browser.newContext()).newPage();
    await entrar(tv, 'estoque@exemplo.com.br');
    await tv.getByRole('link', { name: 'Acompanhamento', exact: true }).click();
    const cartao = tv.locator('[data-maquina="INJ-01"]');
    await expect(cartao).toHaveAttribute('data-situacao', 'PARADA');
    await expect(cartao.locator('[data-manutencao]')).toBeVisible();
  });

  test('controlador recusa duplicadas e aprova com a sequência da troca de câmara quente', async ({
    page,
  }) => {
    await entrar(page, 'manutencao@exemplo.com.br');
    await page.getByRole('link', { name: 'Manutenção', exact: true }).click();
    await page.getByRole('tab', { name: 'Solicitações' }).click();
    const nossa = page.getByRole('row').filter({ hasText: MOTIVO });
    await expect(nossa).toBeVisible();
    await expect(nossa).toContainText('INJ-01: MOL — Problema no molde');
    await expect(nossa).toContainText(/outra\(s\) solicitação\(ões\) aberta\(s\)/);

    // As outras solicitações abertas da INJ-01 (de paradas das fases anteriores) são recusadas como duplicadas.
    const outras = page
      .getByRole('row')
      .filter({ hasText: 'INJ-01' })
      .filter({ hasNotText: MOTIVO })
      .filter({ has: page.getByRole('button', { name: 'Recusar' }) });
    const modal = page.getByRole('dialog');
    while ((await outras.count()) > 0) {
      await outras.first().getByRole('button', { name: 'Recusar' }).click();
      await modal
        .getByLabel('Justificativa da recusa')
        .fill('Duplicada: tratada na solicitação da câmara quente.');
      await modal.getByRole('button', { name: 'Recusar' }).click();
      await expect(modal).toBeHidden();
    }

    await nossa.getByRole('button', { name: 'Aprovar / abrir OS' }).click();
    await modal.getByRole('combobox', { name: 'Usar modelo de sequência' }).click();
    await page.getByRole('option', { name: 'Troca de câmara quente' }).click();
    await expect(modal.locator('[data-etapa-editor]')).toHaveCount(8);
    await expect(modal.getByText('Em paralelo com outra(s) etapa(s) da ordem 4').first()).toBeVisible();
    await modal.getByRole('button', { name: 'Aprovar e abrir OS' }).click();
    await expect(page.getByText(/OS \d{6} aberta com 8 etapa\(s\)/)).toBeVisible();
  });

  test('técnico de setup executa a sua etapa; etapas paralelas são liberadas juntas', async ({ page }) => {
    await entrar(page, 'setup@exemplo.com.br');
    await page.getByRole('link', { name: 'Manutenção', exact: true }).click();
    const minha = page.locator('[data-minha-etapa="Retirar o molde da máquina"]');
    await expect(minha).toBeVisible();
    await expect(page.locator('[data-minha-etapa="Recolocar o molde na máquina"]')).toHaveCount(0);
    const modal = page.getByRole('dialog');
    await minha.getByRole('button', { name: 'Iniciar' }).click();
    await modal.getByRole('button', { name: 'Iniciar etapa' }).click();
    await expect(page.getByText('Etapa iniciada.')).toBeVisible();
    await minha.getByRole('button', { name: 'Concluir' }).click();
    await modal.getByLabel('Serviço executado').fill('Molde retirado e colocado na bancada.');
    await modal.getByRole('button', { name: 'Concluir etapa' }).click();
    await expect(page.getByText('Etapa concluída.')).toBeVisible();
    await expect(page.getByText('Nenhuma etapa liberada para você agora.')).toBeVisible();

    // Ferramentaria agora vê a abertura do molde.
    await entrar(page, 'ferramentaria@exemplo.com.br');
    await page.getByRole('link', { name: 'Manutenção', exact: true }).click();
    await expect(page.locator('[data-minha-etapa="Abrir o molde"]')).toBeVisible();
  });

  test('controlador conclui a sequência, encerra a OS e a máquina continua parada', async ({
    page,
    browser,
  }) => {
    await entrar(page, 'manutencao@exemplo.com.br');
    await page.getByRole('link', { name: 'Manutenção', exact: true }).click();
    await page.getByRole('tab', { name: 'Ordens de serviço' }).click();
    const os = page.locator('[data-os]').filter({ hasText: MOTIVO });
    const modal = page.getByRole('dialog');
    const executar = async (etapa: string) => {
      const p = os.locator(`[data-etapa="${etapa}"]`);
      await p.getByRole('button', { name: 'Iniciar' }).click();
      await modal.getByRole('button', { name: 'Iniciar etapa' }).click();
      await expect(modal).toBeHidden();
      await p.getByRole('button', { name: 'Concluir' }).click();
      await modal.getByLabel('Serviço executado').fill(`${etapa}: feito.`);
      await modal.getByRole('button', { name: 'Concluir etapa' }).click();
      await expect(modal).toBeHidden();
      await expect(p).toHaveAttribute('data-situacao', 'CONCLUIDA');
    };
    await expect(os.locator('[data-etapa="Retirar o molde da máquina"]')).toHaveAttribute(
      'data-situacao',
      'CONCLUIDA',
    );
    await expect(os.getByRole('button', { name: 'Encerrar OS' })).toBeDisabled();
    await executar('Abrir o molde');
    await executar('Avaliar a câmara quente');
    // Ordem 4: óleo e câmara liberados juntos; a limpeza do molde espera os dois.
    await expect(os.locator('[data-etapa="Trocar o óleo da máquina"]')).toHaveAttribute(
      'data-situacao',
      'LIBERADA',
    );
    await expect(os.locator('[data-etapa="Trocar a câmara quente"]')).toHaveAttribute(
      'data-situacao',
      'LIBERADA',
    );
    await expect(os.locator('[data-etapa="Limpar o molde"]')).toHaveAttribute('data-situacao', 'AGUARDANDO');
    await executar('Trocar o óleo da máquina');
    await expect(os.locator('[data-etapa="Limpar o molde"]')).toHaveAttribute('data-situacao', 'AGUARDANDO');
    await executar('Trocar a câmara quente');
    await executar('Limpar o molde');
    await executar('Fechar o molde');
    await executar('Recolocar o molde na máquina');

    await os.getByRole('button', { name: 'Encerrar OS' }).click();
    await expect(modal.getByText(/não reinicia a máquina/)).toBeVisible();
    await modal
      .getByLabel('Resumo do serviço executado')
      .fill('Câmara quente trocada, óleo renovado e molde limpo.');
    await modal.getByRole('button', { name: 'Encerrar OS' }).click();
    await expect(page.getByText(/encerrada\. O reinício da máquina é lançado pelo apontador/)).toBeVisible();

    const tv = await (await browser.newContext()).newPage();
    await entrar(tv, 'estoque@exemplo.com.br');
    await tv.getByRole('link', { name: 'Acompanhamento', exact: true }).click();
    const cartao = tv.locator('[data-maquina="INJ-01"]');
    await expect(cartao).toHaveAttribute('data-situacao', 'PARADA');
    await expect(cartao.locator('[data-manutencao]')).toHaveCount(0);

    // Indicadores do módulo.
    await page.getByRole('tab', { name: 'Indicadores' }).click();
    const linha = page
      .locator('[data-tabela="Solicitações e tempos por máquina"] tbody tr')
      .filter({ hasText: 'INJ-01' });
    await expect(linha).toBeVisible();
    await expect(
      page.locator('[data-tabela="Horas por especialidade"] tbody tr').filter({ hasText: 'Ferramentaria' }),
    ).toBeVisible();
  });
});
