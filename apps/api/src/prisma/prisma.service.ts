import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { configuracao } from '../configuracao.js';

export type Transacao = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/**
 * Opções de conexão do driver a partir da URL. Bancos gerenciados (ex.: Supabase) pedem
 * `sslmode=require`: a conexão é criptografada sem validar a cadeia do certificado (mesmo
 * comportamento do libpq); `sslmode=verify-full` valida o certificado.
 */
export function opcoesConexao(url: string): {
  connectionString: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
} {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { connectionString: url };
  }
  const modo = u.searchParams.get('sslmode');
  if (!modo || modo === 'disable') return { connectionString: url };
  u.searchParams.delete('sslmode');
  return {
    connectionString: u.toString(),
    ssl: modo === 'verify-full' ? true : { rejectUnauthorized: false },
  };
}

export function criarPrismaClient(url = configuracao.urlBanco): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(opcoesConexao(url)) });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg(opcoesConexao(configuracao.urlBanco)) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
