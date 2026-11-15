import { defineConfig, devices } from '@playwright/test';

const URL_E2E =
  process.env.DATABASE_URL_E2E ?? 'postgresql://postgres:postgres@localhost:5432/apontamento_e2e';
const CHROMIUM = process.env.PW_CHROMIUM_PATH; // ex.: /opt/pw-browsers/chromium

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './e2e/preparar.ts',
  use: {
    baseURL: 'http://localhost:5174',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {},
  },
  projects: [
    { name: 'tablet', use: { ...devices['Galaxy Tab S4 landscape'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:3100/api/saude',
      env: { DATABASE_URL: URL_E2E, PORTA_API: '3100', JWT_SEGREDO: 'segredo-e2e' },
      reuseExistingServer: false,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_PROXY_API: 'http://localhost:3100' },
      reuseExistingServer: false,
    },
  ],
});
