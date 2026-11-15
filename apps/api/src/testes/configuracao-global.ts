import { execSync } from 'node:child_process';

/** Aplica as migrations no banco de teste antes da suíte. */
export default function configurar(): void {
  const url =
    process.env.DATABASE_URL_TESTE ?? 'postgresql://postgres:postgres@localhost:5432/apontamento_teste';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
