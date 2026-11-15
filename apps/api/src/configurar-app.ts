import type { INestApplication } from '@nestjs/common';

/** Configuração comum à aplicação real e aos testes. */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
