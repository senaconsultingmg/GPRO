import { expect, test, type Page } from '@playwright/test';

async function entrar(page: Page, login: string, senha = 'Senha@123') {
  await page.goto('/');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible();
}

/** Data/hora local da fábrica no formato do campo datetime-local. */
function horaLocal(deslocamentoMin: number): string {
  const d = new Date(Date.now() + deslocamentoMin * 60_000);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Minutos desde o início do turno (Dia 07:00 / Noite 19:00 nos dados de exemplo). */
function minutosNoTurno(): number {
  const [h, m] = horaLocal(0).slice(11).split(':').map(Number);
  return (h * 60 + m - 420 + 1440) % 720;
}

test.describe.serial('Fase 2 — turno completo no tablet com rodada de 3 OPs', () => {
  test('apontador abre o turno, liga a máquina, cria as divisões e lança os eventos até o fechamento', async ({
    page,
  }) => {
    await entrar(page, 'apontador@exemplo.com.br');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();

    // Abertura com sugestão da escala.
    await expect(page.getByRole('heading', { name: 'Abrir turno' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir turno' }).click();
    await expect(page.getByRole('heading', { name: /^Turno (Dia|Noite)/ })).toBeVisible();

    // Liga a INJ-01 (rodada de 3 OPs no MOL-CAD-3).
    await page.getByRole('button', { name: 'Ligar máquina' }).first().click();
    const ligar = page.getByRole('dialog', { name: 'Ligar máquina' });
    await ligar.getByRole('button', { name: /INJ-01/ }).click();
    await ligar.getByRole('button', { name: 'Ligar máquina' }).click();

    // Divisões com código ERP-NN e meta calculada.
    const divisoes = page.getByRole('dialog', { name: /Divisão das OPs/ });
    for (const codigo of ['04508401001-01', '04508401002-01', '04508401003-01']) {
      await divisoes.getByRole('button', { name: `Criar divisão ${codigo}` }).click();
      await expect(divisoes.getByRole('button', { name: `Criar divisão ${codigo}` })).toHaveCount(0);
    }
    await divisoes.getByRole('button', { name: 'Fechar' }).click();

    const cartao = page.locator('[data-maquina="INJ-01"]');
    await expect(cartao.getByText('Produzindo')).toBeVisible();
    await expect(cartao.getByText('04508401001-01')).toBeVisible();

    const lancamento = page.getByRole('dialog');
    const confirmar = async () => {
      await lancamento.getByRole('button', { name: 'Confirmar' }).click();
      await expect(lancamento).toBeHidden();
    };

    // 3 conjuntos de 30 = 90 peças.
    await cartao.getByRole('button', { name: 'Produção' }).click();
    await lancamento.getByRole('button', { name: 'Mais um conjunto' }).click();
    await lancamento.getByRole('button', { name: 'Mais um conjunto' }).click();
    await lancamento.getByLabel('Peso médio da peça').fill('385');
    await expect(lancamento.getByText('Total: 90 peças em 3 conjunto(s)')).toBeVisible();
    await confirmar();

    // Conjunto avulso exige confirmação e aparece destacado.
    await cartao.getByRole('button', { name: 'Produção' }).click();
    await lancamento.getByRole('button', { name: /Conjunto avulso/ }).click();
    await lancamento.getByLabel('Conjunto avulso 1 (peças)').fill('18');
    await lancamento.getByLabel('Peso médio da peça').fill('383');
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(lancamento.getByText('Confirme o conjunto avulso.')).toBeVisible();
    await lancamento.getByLabel(/Confirmo o fechamento de conjunto/).check();
    await confirmar();
    await expect(page.getByRole('row', { name: /AVULSO: 18 pç/ })).toBeVisible();

    // Peso fora da tolerância: NC com justificativa obrigatória.
    await cartao.getByRole('button', { name: 'Produção' }).click();
    await lancamento.getByRole('button', { name: /04508401002-01/ }).click();
    await lancamento.getByLabel('Peso médio da peça').fill('420');
    await expect(lancamento.getByText('Peso fora da tolerância (NC)')).toBeVisible();
    await lancamento.getByRole('button', { name: 'Confirmar' }).click();
    await expect(lancamento.getByText(/Justificativa obrigatória/)).toBeVisible();
    await lancamento.getByLabel(/Justificativa \(obrigatória\)/).fill('Variação de matéria-prima.');
    await confirmar();
    await expect(page.getByRole('row', { name: /Peso NC/ })).toBeVisible();

    // Parada e reinício.
    await cartao.getByRole('button', { name: 'Parada' }).click();
    await lancamento.getByRole('button', { name: /MEC — Quebra mecânica/ }).click();
    await confirmar();
    await expect(cartao.getByText('Parada', { exact: true })).toBeVisible();
    await expect(cartao.getByText(/MEC — Quebra mecânica há/)).toBeVisible();
    await cartao.getByRole('button', { name: 'Reinício' }).click();
    await confirmar();
    await expect(cartao.getByText('Produzindo')).toBeVisible();

    // Perda de peças refugadas.
    await cartao.getByRole('button', { name: 'Perda' }).click();
    await lancamento.getByRole('button', { name: 'Peça refugada' }).click();
    await lancamento.getByLabel('Quantidade').fill('2');
    await confirmar();

    // Bloqueio de cavidade.
    await cartao.getByRole('button', { name: 'Bloquear cavidade' }).click();
    await lancamento.getByRole('button', { name: '3 · CAD-0033' }).click();
    await lancamento.getByLabel('Motivo do bloqueio').fill('Ponteira entupida');
    await confirmar();
    await expect(cartao.getByText('Cavidade 3 bloqueada')).toBeVisible();

    // Lançamento com hora divergente fica marcado.
    const antecipar = minutosNoTurno() < 20;
    await cartao.getByRole('button', { name: 'Matéria-prima' }).click();
    // Ajuste rápido de 20 minutos (tolerância de 10 min).
    const botao = lancamento.getByRole('button', { name: antecipar ? '+10 min' : '-10 min' });
    await botao.click();
    await botao.click();
    await lancamento.getByRole('combobox', { name: 'Material' }).click();
    await page.getByRole('option', { name: /PP-H103/ }).click();
    await lancamento.getByLabel('Lote').fill('L-777');
    await lancamento.getByLabel('Quantidade').fill('25');
    await confirmar();
    await expect(
      page.getByRole('row', { name: new RegExp(`L-777.*${antecipar ? 'Antecipado' : 'Retroativo'}`) }),
    ).toBeVisible();

    // Fechamento: máquina segue rodando e saldo solto de 12 peças.
    await page.getByRole('button', { name: 'Fechar turno' }).click();
    const fechar = page.getByRole('dialog', { name: 'Fechar turno' });
    await fechar.getByText('Segue rodando').click();
    await fechar.getByLabel(/Saldo solto .* 04508401001-01/).fill('12');
    await fechar.getByRole('button', { name: 'Fechar turno' }).click();

    // Relatório do turno.
    await expect(page.getByRole('heading', { name: /Relatório do turno/ })).toBeVisible();
    const linhaOp1 = page.getByRole('row', { name: /04508401001-01/ }).first();
    // 90 + 48 etiquetadas + 12 de saldo solto = 150.
    await expect(linhaOp1).toContainText('150 Peça');
    await expect(linhaOp1).toContainText('AVULSO 18');
    await expect(page.getByRole('row', { name: /04508401002-01/ }).first()).toContainText('1 peso NC');
    await expect(page.getByText(/MEC — Quebra mecânica/).first()).toBeVisible();
    await expect(page.getByText(/Cavidade 3: desde/)).toBeVisible();
    await expect(page.getByText('Peso fora da tolerância').first()).toBeVisible();
    await expect(page.getByText('OEE', { exact: true })).toBeVisible();
  });

  test('no turno seguinte o saldo solto é oferecido para confirmação', async ({ page }) => {
    await entrar(page, 'apontador2@exemplo.com.br');
    await page.getByRole('link', { name: 'Apontamento', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir turno' }).click();
    await page.getByRole('button', { name: 'Ligar máquina' }).first().click();
    const ligar = page.getByRole('dialog', { name: 'Ligar máquina' });
    await ligar.getByRole('button', { name: /INJ-01.*Seguia rodando/ }).click();
    await expect(ligar.getByText(/vinha rodando do turno anterior/)).toBeVisible();
    await ligar.getByRole('button', { name: 'Ligar máquina' }).click();
    const divisoes = page.getByRole('dialog', { name: /Divisão das OPs/ });
    await expect(
      divisoes.getByText('O turno anterior deixou 12 peça(s). Confirme o saldo recebido:'),
    ).toBeVisible();
    await divisoes.getByRole('button', { name: 'Criar divisão 04508401001-02' }).click();
    await expect(divisoes.getByRole('button', { name: 'Criar divisão 04508401001-02' })).toHaveCount(0);
  });

  test('PCP vê o layout de importação e as OPs com os dois números', async ({ page }) => {
    await entrar(page, 'pcp@exemplo.com.br');
    await page.getByRole('link', { name: 'Importação Excel', exact: true }).click();
    const cartao = page.locator('.mantine-Card-root', { hasText: 'Ordens de produção' }).first();
    await expect(cartao.getByText(/Número da OP\*/)).toBeVisible();
    await page.getByRole('link', { name: 'Ordens de produção', exact: true }).click();
    await expect(page.getByRole('row', { name: /04508401001/ })).toContainText('nº interno');
  });
});
