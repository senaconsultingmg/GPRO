import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ADMIN_INICIAL, configuracao } from '../configuracao.js';
import { ErroNegocio, naoAutenticado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

export const hashSenha = (senha: string) => argon2.hash(senha, { type: argon2.argon2id });
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  login: true,
  perfis: true,
  equipeId: true,
  ativo: true,
  deveTrocarSenha: true,
} as const;

@Injectable()
export class AutenticacaoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Cria o administrador inicial quando o cadastro de usuários está vazio e as credenciais
   * informadas são as do usuário inicial. Depois que existir qualquer usuário, vale a regra normal.
   */
  private async criarAdminInicialSeNecessario(login: string, senha: string): Promise<void> {
    if (login !== ADMIN_INICIAL.login || senha !== ADMIN_INICIAL.senha) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7426001)`;
      if ((await tx.usuario.count()) > 0) return;
      const admin = await tx.usuario.create({
        data: {
          nome: ADMIN_INICIAL.nome,
          login: ADMIN_INICIAL.login,
          senhaHash: await hashSenha(ADMIN_INICIAL.senha),
          perfis: ['SUPERUSUARIO'],
          deveTrocarSenha: true,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario: null,
        entidade: 'Usuario',
        entidadeId: admin.id,
        acao: 'CRIAR_ADMIN_INICIAL',
        novo: { login: admin.login, perfis: admin.perfis },
        completo: true,
      });
    });
  }

  async entrar(loginInformado: string, senha: string, dispositivo: string) {
    const login = loginInformado.trim().toLowerCase();
    await this.criarAdminInicialSeNecessario(login, senha);

    const usuario = await this.prisma.usuario.findUnique({ where: { login } });
    const senhaOk = usuario ? await argon2.verify(usuario.senhaHash, senha).catch(() => false) : false;
    if (!usuario || !senhaOk) throw naoAutenticado('Login ou senha inválidos.');
    if (!usuario.ativo) throw naoAutenticado('Usuário inativo. Procure o administrador.');

    // Uma sessão por dispositivo: revoga a anterior do mesmo dispositivo.
    await this.prisma.sessaoDispositivo.updateMany({
      where: { usuarioId: usuario.id, dispositivo, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
    return this.emitirTokens(usuario.id, dispositivo);
  }

  private async emitirTokens(usuarioId: string, dispositivo: string, sessaoId?: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: CAMPOS_PUBLICOS,
    });
    const tokenRenovacao = randomBytes(48).toString('base64url');
    const expiraEm = new Date(Date.now() + configuracao.renovacaoDias * 86_400_000);
    if (sessaoId) {
      await this.prisma.sessaoDispositivo.update({
        where: { id: sessaoId },
        data: { tokenRenovacaoHash: hashToken(tokenRenovacao), ultimoUsoEm: new Date(), expiraEm },
      });
    } else {
      await this.prisma.sessaoDispositivo.create({
        data: { usuarioId, dispositivo, tokenRenovacaoHash: hashToken(tokenRenovacao), expiraEm },
      });
    }
    const tokenAcesso = await this.jwt.signAsync({
      sub: usuario.id,
      login: usuario.login,
      perfis: usuario.perfis,
    });
    return {
      tokenAcesso,
      tokenRenovacao,
      acessoExpiraEm: new Date(Date.now() + configuracao.jwtAcessoMinutos * 60_000).toISOString(),
      usuario,
    };
  }

  /** Troca o token de renovação por um novo par (rotação). */
  async renovar(tokenRenovacao: string) {
    const sessao = await this.prisma.sessaoDispositivo.findUnique({
      where: { tokenRenovacaoHash: hashToken(tokenRenovacao) },
      include: { usuario: { select: { ativo: true } } },
    });
    if (!sessao || sessao.revogadaEm || sessao.expiraEm < new Date() || !sessao.usuario.ativo) {
      throw naoAutenticado();
    }
    return this.emitirTokens(sessao.usuarioId, sessao.dispositivo, sessao.id);
  }

  async sair(tokenRenovacao: string): Promise<void> {
    await this.prisma.sessaoDispositivo.updateMany({
      where: { tokenRenovacaoHash: hashToken(tokenRenovacao), revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }

  eu(id: string) {
    return this.prisma.usuario.findUniqueOrThrow({
      where: { id },
      select: { ...CAMPOS_PUBLICOS, equipe: { select: { letra: true } } },
    });
  }

  async trocarSenha(usuario: UsuarioAutenticado, senhaAtual: string, novaSenha: string): Promise<void> {
    const atual = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    if (!(await argon2.verify(atual.senhaHash, senhaAtual).catch(() => false))) {
      throw new ErroNegocio('Senha atual incorreta.', [
        { campo: 'senhaAtual', mensagem: 'Senha atual incorreta.' },
      ]);
    }
    if (senhaAtual === novaSenha) {
      throw new ErroNegocio('A nova senha deve ser diferente da atual.', [
        { campo: 'novaSenha', mensagem: 'Use uma senha diferente da atual.' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash: await hashSenha(novaSenha), deveTrocarSenha: false },
      });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Usuario',
        entidadeId: usuario.id,
        acao: 'TROCAR_SENHA',
        anterior: { senha: '***' },
        novo: { senha: '***' },
        completo: true,
      });
    });
  }
}
