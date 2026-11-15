import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Publico } from './comum/decoradores.js';
import { PrismaService } from './prisma/prisma.service.js';

@ApiTags('Saúde')
@Controller('saude')
export class SaudeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Publico()
  async verificar() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { situacao: 'ok', horaServidor: new Date().toISOString() };
  }
}
