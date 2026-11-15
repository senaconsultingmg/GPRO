import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { configurarApp } from '../configurar-app.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarDadosExemplo, SENHA_EXEMPLO } from '../dados-exemplo/semente.js';

export { SENHA_EXEMPLO };

export interface Contexto {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function criarContexto(): Promise<Contexto> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication({ logger: ['error'] });
  configurarApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Apaga todos os dados (mantém a estrutura e o histórico de migrations). */
export async function limparBanco(prisma: PrismaService): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tabelas.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function prepararComDadosExemplo(prisma: PrismaService): Promise<void> {
  await limparBanco(prisma);
  await carregarDadosExemplo(prisma, { escala: false });
}

export async function entrar(ctx: Contexto, login: string, senha = SENHA_EXEMPLO): Promise<string> {
  const r = await ctx.http().post('/api/autenticacao/entrar').send({ login, senha });
  if (r.status !== 200) throw new Error(`Falha no login de ${login}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.tokenAcesso as string;
}

export const LOGINS = {
  SUPERUSUARIO: 'admin@admin.com.br',
  PCP: 'pcp@exemplo.com.br',
  APONTADOR: 'apontador@exemplo.com.br',
  LIDER: 'lider@exemplo.com.br',
  ESTOQUE: 'estoque@exemplo.com.br',
  MATERIA_PRIMA: 'materiaprima@exemplo.com.br',
  MANUTENCAO: 'manutencao@exemplo.com.br',
} as const;

/** Faz login com um usuário de cada perfil e devolve os tokens. */
export async function tokensPorPerfil(ctx: Contexto): Promise<Record<keyof typeof LOGINS, string>> {
  const r = {} as Record<keyof typeof LOGINS, string>;
  for (const [perfil, login] of Object.entries(LOGINS) as [keyof typeof LOGINS, string][]) {
    r[perfil] = await entrar(ctx, login, perfil === 'SUPERUSUARIO' ? '12345678910' : SENHA_EXEMPLO);
  }
  return r;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
