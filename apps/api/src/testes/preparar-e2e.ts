/** Prepara o banco dos testes de ponta a ponta: aplica migrations, limpa e carrega os dados de exemplo. */
import { execSync } from 'node:child_process';
import { criarPrismaClient } from '../prisma/prisma.service.js';
import { carregarDadosExemplo } from '../dados-exemplo/semente.js';

const url = process.env.DATABASE_URL;
if (!url?.includes('e2e')) throw new Error('DATABASE_URL deve apontar para um banco de e2e.');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
const prisma = criarPrismaClient(url);
const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
await prisma.$executeRawUnsafe(
  `TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
);
await carregarDadosExemplo(prisma);
// Impressoras do teste apontam para a impressora simulada (porta 9101).
await prisma.impressora.updateMany({ data: { enderecoIp: '127.0.0.1', porta: 9101 } });
await prisma.$disconnect();
console.log('Banco de e2e preparado.');
