import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ZodType } from 'zod';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Permissao, UsuarioAtual, type UsuarioAutenticado } from '../comum/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { naoEncontrado } from '../comum/erros.js';

type Registro = Record<string, unknown> & { id: string };

/** Subconjunto do delegate do Prisma usado pelo CRUD genérico. */
interface Delegate {
  findMany(args: object): Promise<Registro[]>;
  findUnique(args: object): Promise<Registro | null>;
  create(args: object): Promise<Registro>;
  update(args: object): Promise<Registro>;
}

export interface DefinicaoCadastro<T extends object = Record<string, unknown>> {
  /** Caminho da rota, ex.: "maquinas". */
  rota: string;
  /** Nome do delegate no Prisma, ex.: "maquina". */
  modelo: string;
  /** Nome da entidade na auditoria. */
  entidade: string;
  /** Nome exibido na documentação. */
  rotulo: string;
  esquema: ZodType<T>;
  camposBusca: string[];
  campoAtivo?: 'ativo' | 'ativa';
  ordenarPor?: object;
  incluir?: object;
  /** Validações adicionais antes de gravar. */
  validar?: (prisma: PrismaService, dados: T, id?: string) => Promise<void>;
  /** Ações adicionais na mesma transação, após gravar. */
  aposSalvar?: (tx: Transacao, registro: Registro, anterior: Registro | null) => Promise<void>;
}

/** CRUD genérico de cadastros com auditoria. Cadastros não são excluídos: são inativados. */
@Injectable()
export class CadastroService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private delegate(cliente: Transacao | PrismaService, modelo: string): Delegate {
    return (cliente as unknown as Record<string, Delegate>)[modelo];
  }

  listar(def: DefinicaoCadastro<object>, busca?: string, apenasAtivos?: boolean) {
    const where: Record<string, unknown> = {};
    if (busca?.trim()) {
      where.OR = def.camposBusca.map((c) => ({ [c]: { contains: busca.trim(), mode: 'insensitive' } }));
    }
    if (apenasAtivos) where[def.campoAtivo ?? 'ativo'] = true;
    return this.delegate(this.prisma, def.modelo).findMany({
      where,
      include: def.incluir,
      orderBy: def.ordenarPor ?? { criadoEm: 'asc' },
      take: 2000,
    });
  }

  async obter(def: DefinicaoCadastro<object>, id: string) {
    const r = await this.delegate(this.prisma, def.modelo).findUnique({
      where: { id },
      include: def.incluir,
    });
    if (!r) throw naoEncontrado(def.rotulo);
    return r;
  }

  async criar(def: DefinicaoCadastro<object>, dados: object, usuario: UsuarioAutenticado) {
    await def.validar?.(this.prisma, dados);
    const id = await this.prisma.$transaction(async (tx) => {
      const novo = await this.delegate(tx, def.modelo).create({ data: dados });
      await def.aposSalvar?.(tx, novo, null);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: def.entidade,
        entidadeId: novo.id,
        acao: 'CRIAR',
        novo,
      });
      return novo.id;
    });
    return this.obter(def, id);
  }

  async atualizar(def: DefinicaoCadastro<object>, id: string, dados: object, usuario: UsuarioAutenticado) {
    const anterior = await this.delegate(this.prisma, def.modelo).findUnique({ where: { id } });
    if (!anterior) throw naoEncontrado(def.rotulo);
    await def.validar?.(this.prisma, dados, id);
    await this.prisma.$transaction(async (tx) => {
      const novo = await this.delegate(tx, def.modelo).update({ where: { id }, data: dados });
      await def.aposSalvar?.(tx, novo, anterior);
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: def.entidade,
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior,
        novo,
      });
    });
    return this.obter(def, id);
  }
}

/** Gera um controller REST (listar, obter, criar, atualizar) para o cadastro. */
export function criarControladorCadastro(def: DefinicaoCadastro<object>): Type<unknown> {
  @ApiTags(def.rotulo)
  @ApiBearerAuth()
  @Controller(def.rota)
  class ControladorCadastro {
    constructor(@Inject(CadastroService) readonly servico: CadastroService) {}

    @Get()
    @Permissao('cadastros.ler')
    listar(@Query('busca') busca?: string, @Query('ativos') ativos?: string) {
      return this.servico.listar(def, busca, ativos === 'true');
    }

    @Get(':id')
    @Permissao('cadastros.ler')
    obter(@Param('id', ParseUUIDPipe) id: string) {
      return this.servico.obter(def, id);
    }

    @Post()
    @Permissao('cadastros.escrever')
    criar(@Body(new ValidacaoZod(def.esquema)) dados: object, @UsuarioAtual() usuario: UsuarioAutenticado) {
      return this.servico.criar(def, dados, usuario);
    }

    @Put(':id')
    @Permissao('cadastros.escrever')
    atualizar(
      @Param('id', ParseUUIDPipe) id: string,
      @Body(new ValidacaoZod(def.esquema)) dados: object,
      @UsuarioAtual() usuario: UsuarioAutenticado,
    ) {
      return this.servico.atualizar(def, id, dados, usuario);
    }
  }
  Object.defineProperty(ControladorCadastro, 'name', { value: `Controlador_${def.rota.replace(/-/g, '_')}` });
  return ControladorCadastro;
}
