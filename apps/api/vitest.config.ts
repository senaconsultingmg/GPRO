import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgresql://postgres:postgres@localhost:5432/apontamento_teste';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: './src/testes/configuracao-global.ts',
    env: { DATABASE_URL: URL_TESTE, JWT_SEGREDO: 'segredo-de-teste', NODE_ENV: 'test' },
  },
  // SWC emite os metadados de decorators que o NestJS usa.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
