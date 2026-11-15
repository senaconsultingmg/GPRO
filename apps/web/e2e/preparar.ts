import { execSync } from 'node:child_process';

export default function preparar(): void {
  const url = process.env.DATABASE_URL_E2E ?? 'postgresql://postgres:postgres@localhost:5432/apontamento_e2e';
  execSync('npx tsx src/testes/preparar-e2e.ts', {
    cwd: '../api',
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
