import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { PARAMETROS_INICIAIS, validarValorParametro, type TipoParametro } from '@apontamento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

@Injectable()
export class ParametrosService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Garante que todos os parâmetros conhecidos existam, sem alterar valores já definidos. */
  async onModuleInit(): Promise<void> {
    await this.prisma.parametroSistema.createMany({
      data: PARAMETROS_INICIAIS.map((p) => ({
        chave: p.chave,
        valor: p.valorInicial,
        tipo: p.tipo,
        opcoes: p.opcoes ?? [],
        descricao: p.descricao,
      })),
      skipDuplicates: true,
    });
  }

  listar() {
    return this.prisma.parametroSistema.findMany({ orderBy: { chave: 'asc' } });
  }

  /** Valor de um parâmetro como texto (usado pelas regras das fases seguintes). */
  async valor(chave: string): Promise<string> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave } });
    if (!p) throw naoEncontrado(`Parâmetro ${chave}`);
    return p.valor;
  }

  async numero(chave: string): Promise<number> {
    return Number((await this.valor(chave)).replace(',', '.'));
  }

  async atualizar(chave: string, valor: string, autor: UsuarioAutenticado) {
    const anterior = await this.prisma.parametroSistema.findUnique({ where: { chave } });
    if (!anterior) throw naoEncontrado('Parâmetro');
    const erro = validarValorParametro(anterior.tipo as TipoParametro, valor, anterior.opcoes);
    if (erro) throw new ErroNegocio(erro, [{ campo: 'valor', mensagem: erro }]);
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.parametroSistema.update({
        where: { chave },
        data: { valor, atualizadoPorId: autor.id },
      });
      await this.auditoria.registrar(tx, {
        usuario: autor,
        entidade: 'ParametroSistema',
        entidadeId: chave,
        acao: 'ATUALIZAR',
        anterior: { valor: anterior.valor },
        novo: { valor: novo.valor },
      });
      return novo;
    });
  }
}
