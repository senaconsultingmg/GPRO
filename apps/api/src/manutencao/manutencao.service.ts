import { Inject, Injectable } from '@nestjs/common';
import {
  etapaLiberada,
  etapasFinalizadas,
  horasPorEspecialidade,
  podeExecutarEtapa,
  situacaoExibida,
  tempoAteAtendimentoMs,
  tempoReparoMs,
  type EspecialidadeManutencao,
  type EtapaEntrada,
  type EtapaRegra,
} from '@apontamento/shared';
import type { z } from 'zod';
import type {
  esquemaAjustarEtapa,
  esquemaConverterOs,
  esquemaModeloSequencia,
  esquemaSolicitacaoManual,
} from '@apontamento/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Transacao } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { conflito, ErroNegocio, naoEncontrado, proibido } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

interface UsuarioManutencao extends UsuarioAutenticado {
  especialidades: EspecialidadeManutencao[];
  controladorManutencao: boolean;
}

/** Solicitação conta como "aberta" (aviso no painel) até a OS ser encerrada ou ser recusada. */
export const SITUACOES_ABERTAS = ['ABERTA', 'EM_TRIAGEM', 'CONVERTIDA'] as const;

const INCLUIR_OS = {
  solicitacao: {
    include: {
      maquina: { select: { id: true, codigo: true, descricao: true } },
      solicitante: { select: { nome: true } },
      eventoParada: { select: { id: true, situacao: true, horaOcorrencia: true } },
    },
  },
  controlador: { select: { id: true, nome: true } },
  encerradaPor: { select: { nome: true } },
  etapas: {
    include: {
      responsavel: { select: { id: true, nome: true } },
      executor: { select: { id: true, nome: true } },
    },
    orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
  },
} satisfies Prisma.OrdemServicoInclude;
type OsCarregada = Prisma.OrdemServicoGetPayload<{ include: typeof INCLUIR_OS }>;

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const horas = (ms: number | null) => (ms === null ? null : Math.round((ms / 3_600_000) * 100) / 100);

/** Manutenção (RN-14): solicitações, triagem, OS com etapas por especialidade e indicadores. */
@Injectable()
export class ManutencaoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  // ---------- apoio ----------

  async usuario(u: UsuarioAutenticado): Promise<UsuarioManutencao> {
    const r = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: u.id },
      select: { especialidades: true, controladorManutencao: true },
    });
    return { ...u, ...r };
  }

  private async controlador(u: UsuarioAutenticado) {
    const m = await this.usuario(u);
    if (!m.controladorManutencao) throw proibido('Somente o controlador de manutenção pode fazer esta ação.');
    return m;
  }

  /** Instante informado (ou agora); não pode estar no futuro nem antes de um limite. */
  private instante(valor: string | null | undefined, minimo: Date | null, rotulo: string) {
    const d = valor ? new Date(valor) : new Date();
    if (d.getTime() > Date.now() + 5 * 60_000) throw new ErroNegocio(`${rotulo} não pode estar no futuro.`);
    if (minimo && d < minimo)
      throw new ErroNegocio(`${rotulo} não pode ser anterior a ${minimo.toISOString()}.`);
    return d;
  }

  private async validarEtapas(tx: Transacao, etapas: Partial<EtapaEntrada>[]) {
    const ids = [...new Set(etapas.map((e) => e.responsavelId).filter((x): x is string => !!x))];
    const tecnicos = await tx.usuario.findMany({ where: { id: { in: ids } } });
    for (const e of etapas) {
      if (!e.responsavelId) continue;
      const t = tecnicos.find((x) => x.id === e.responsavelId);
      if (!t?.ativo || !t.perfis.includes('MANUTENCAO')) {
        throw new ErroNegocio('O responsável da etapa deve ser um usuário ativo do perfil Manutenção.');
      }
      if (e.especialidade && !t.especialidades.includes(e.especialidade) && !t.controladorManutencao) {
        throw new ErroNegocio(`${t.nome} não tem a especialidade da etapa "${e.descricao ?? ''}".`);
      }
    }
  }

  private exibir(os: OsCarregada) {
    const regras = os.etapas as unknown as EtapaRegra[];
    return {
      ...os,
      etapas: os.etapas.map((e) => ({
        ...e,
        situacaoExibida: situacaoExibida(e as unknown as EtapaRegra, regras),
      })),
      tempoAteAtendimentoH: horas(tempoAteAtendimentoMs(os.solicitacao.ocorridaEm, regras)),
      tempoReparoH: horas(tempoReparoMs(regras)),
      podeEncerrar: os.situacao !== 'ENCERRADA' && etapasFinalizadas(regras),
    };
  }

  private async carregarOs(id: string, tx: Transacao | PrismaService = this.prisma) {
    const os = await tx.ordemServico.findUnique({ where: { id }, include: INCLUIR_OS });
    if (!os) throw naoEncontrado('Ordem de serviço');
    return os;
  }

  // ---------- solicitações ----------

  async listarSolicitacoes(filtro: { situacao?: string; maquinaId?: string }) {
    const where: Prisma.SolicitacaoManutencaoWhereInput = {};
    if (filtro.situacao === 'ABERTAS') where.situacao = { in: [...SITUACOES_ABERTAS] };
    else if (filtro.situacao)
      where.situacao = filtro.situacao as Prisma.EnumSituacaoSolicitacaoFilter['equals'];
    if (filtro.maquinaId) where.maquinaId = filtro.maquinaId;
    const itens = await this.prisma.solicitacaoManutencao.findMany({
      where,
      include: {
        maquina: { select: { id: true, codigo: true, descricao: true } },
        solicitante: { select: { nome: true } },
        triagemPor: { select: { nome: true } },
        eventoParada: { select: { situacao: true, horaOcorrencia: true } },
        ordemServico: { select: { id: true, numero: true, situacao: true } },
      },
      orderBy: { ocorridaEm: 'desc' },
      take: 500,
    });
    // Aviso de possível duplicidade: outras solicitações abertas da mesma máquina.
    const abertas = await this.prisma.solicitacaoManutencao.groupBy({
      by: ['maquinaId'],
      where: { situacao: { in: [...SITUACOES_ABERTAS] }, maquinaId: { not: null } },
      _count: true,
    });
    const porMaquina = new Map(abertas.map((a) => [a.maquinaId, a._count]));
    return itens.map((s) => ({
      ...s,
      paradaAnulada: s.eventoParada?.situacao === 'INCORRETO',
      outrasAbertasMaquina:
        s.maquinaId && (SITUACOES_ABERTAS as readonly string[]).includes(s.situacao)
          ? (porMaquina.get(s.maquinaId) ?? 1) - 1
          : 0,
    }));
  }

  async criarManual(dados: z.infer<typeof esquemaSolicitacaoManual>, u: UsuarioAutenticado) {
    if (dados.maquinaId) {
      const m = await this.prisma.maquina.findUnique({ where: { id: dados.maquinaId } });
      if (!m) throw naoEncontrado('Máquina');
    }
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitacaoManutencao.create({
        data: {
          maquinaId: dados.maquinaId ?? null,
          local: dados.local || null,
          descricao: dados.descricao,
          solicitanteId: u.id,
          ocorridaEm: new Date(),
        },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'SolicitacaoManutencao',
        entidadeId: s.id,
        acao: 'CRIAR',
        novo: s,
      });
      return s;
    });
  }

  private async solicitacaoDecidivel(id: string) {
    const s = await this.prisma.solicitacaoManutencao.findUnique({ where: { id } });
    if (!s) throw naoEncontrado('Solicitação');
    if (s.situacao !== 'ABERTA' && s.situacao !== 'EM_TRIAGEM')
      throw conflito('Esta solicitação já foi decidida.');
    return s;
  }

  async iniciarTriagem(id: string, u: UsuarioAutenticado) {
    await this.controlador(u);
    const s = await this.solicitacaoDecidivel(id);
    if (s.situacao === 'EM_TRIAGEM') throw conflito('A solicitação já está em triagem.');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.solicitacaoManutencao.update({
        where: { id },
        data: { situacao: 'EM_TRIAGEM', triagemEm: new Date(), triagemPorId: u.id },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'SolicitacaoManutencao',
        entidadeId: id,
        acao: 'INICIAR_TRIAGEM',
        anterior: { situacao: s.situacao },
        novo: { situacao: 'EM_TRIAGEM' },
      });
      return novo;
    });
  }

  async recusar(id: string, justificativa: string, u: UsuarioAutenticado) {
    await this.controlador(u);
    const s = await this.solicitacaoDecidivel(id);
    return this.prisma.$transaction(async (tx) => {
      const agora = new Date();
      const novo = await tx.solicitacaoManutencao.update({
        where: { id },
        data: {
          situacao: 'RECUSADA',
          recusadaEm: agora,
          justificativaRecusa: justificativa,
          triagemEm: s.triagemEm ?? agora,
          triagemPorId: s.triagemPorId ?? u.id,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'SolicitacaoManutencao',
        entidadeId: id,
        acao: 'RECUSAR',
        anterior: { situacao: s.situacao },
        novo: { situacao: 'RECUSADA', justificativa },
        completo: true,
      });
      return novo;
    });
  }

  /** Aprovação pelo controlador: cria a OS com a sequência de etapas. */
  async converter(id: string, dados: z.infer<typeof esquemaConverterOs>, u: UsuarioAutenticado) {
    await this.controlador(u);
    const s = await this.solicitacaoDecidivel(id);
    return this.prisma.$transaction(async (tx) => {
      await this.validarEtapas(tx, dados.etapas);
      const agora = new Date();
      await tx.solicitacaoManutencao.update({
        where: { id },
        data: {
          situacao: 'CONVERTIDA',
          triagemEm: s.triagemEm ?? agora,
          triagemPorId: s.triagemPorId ?? u.id,
        },
      });
      const os = await tx.ordemServico.create({
        data: {
          solicitacaoId: id,
          tipo: dados.tipo,
          eletiva: dados.eletiva,
          controladorId: u.id,
          etapas: {
            create: dados.etapas.map((e) => ({
              ordem: e.ordem,
              descricao: e.descricao,
              especialidade: e.especialidade,
              responsavelId: e.responsavelId ?? null,
            })),
          },
        },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'OrdemServico',
        entidadeId: os.id,
        acao: 'CRIAR',
        novo: { ...os, etapas: dados.etapas },
        completo: true,
      });
      return this.exibir(await this.carregarOs(os.id, tx));
    });
  }

  // ---------- ordens de serviço ----------

  async listarOs(filtro: { situacao?: string }) {
    const where: Prisma.OrdemServicoWhereInput = {};
    if (filtro.situacao === 'ABERTAS') where.situacao = { not: 'ENCERRADA' };
    else if (filtro.situacao)
      where.situacao = filtro.situacao as Prisma.EnumSituacaoOrdemServicoFilter['equals'];
    const lista = await this.prisma.ordemServico.findMany({
      where,
      include: INCLUIR_OS,
      orderBy: { numero: 'desc' },
      take: 300,
    });
    return lista.map((o) => this.exibir(o));
  }

  async obterOs(id: string) {
    return this.exibir(await this.carregarOs(id));
  }

  private exigirOsEditavel(os: { situacao: string }) {
    if (os.situacao === 'ENCERRADA') throw conflito('Ordem de serviço encerrada não aceita alteração.');
  }

  async incluirEtapas(osId: string, etapas: EtapaEntrada[], u: UsuarioAutenticado) {
    await this.controlador(u);
    const os = await this.carregarOs(osId);
    this.exigirOsEditavel(os);
    // Não pode incluir etapa antes de uma que já começou (a sequência já passou dali).
    const iniciadas = os.etapas.filter((e) => e.situacao !== 'PENDENTE');
    const maiorIniciada = Math.max(0, ...iniciadas.map((e) => e.ordem));
    if (etapas.some((e) => e.ordem < maiorIniciada)) {
      throw new ErroNegocio(`A sequência já passou da ordem ${maiorIniciada}; inclua etapas a partir dela.`);
    }
    return this.prisma.$transaction(async (tx) => {
      await this.validarEtapas(tx, etapas);
      await tx.etapaOrdemServico.createMany({
        data: etapas.map((e) => ({
          ordemServicoId: osId,
          ordem: e.ordem,
          descricao: e.descricao,
          especialidade: e.especialidade,
          responsavelId: e.responsavelId ?? null,
        })),
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'OrdemServico',
        entidadeId: osId,
        acao: 'INCLUIR_ETAPAS',
        novo: { etapas },
        completo: true,
      });
      return this.exibir(await this.carregarOs(osId, tx));
    });
  }

  private async carregarEtapa(id: string) {
    const etapa = await this.prisma.etapaOrdemServico.findUnique({ where: { id } });
    if (!etapa) throw naoEncontrado('Etapa');
    const os = await this.carregarOs(etapa.ordemServicoId);
    this.exigirOsEditavel(os);
    return { etapa, os };
  }

  async ajustarEtapa(id: string, dados: z.infer<typeof esquemaAjustarEtapa>, u: UsuarioAutenticado) {
    await this.controlador(u);
    const { etapa } = await this.carregarEtapa(id);
    if (etapa.situacao !== 'PENDENTE')
      throw conflito('Só etapas que ainda não começaram podem ser alteradas.');
    return this.prisma.$transaction(async (tx) => {
      await this.validarEtapas(tx, [{ ...etapa, ...dados }]);
      const novo = await tx.etapaOrdemServico.update({
        where: { id },
        data: {
          ordem: dados.ordem,
          descricao: dados.descricao,
          especialidade: dados.especialidade,
          responsavelId: dados.responsavelId === undefined ? undefined : dados.responsavelId,
        },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'EtapaOrdemServico',
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior: etapa,
        novo,
      });
      return this.exibir(await this.carregarOs(etapa.ordemServicoId, tx));
    });
  }

  async cancelarEtapa(id: string, justificativa: string, u: UsuarioAutenticado) {
    await this.controlador(u);
    const { etapa } = await this.carregarEtapa(id);
    if (etapa.situacao !== 'PENDENTE')
      throw conflito('Só etapas que ainda não começaram podem ser canceladas.');
    return this.prisma.$transaction(async (tx) => {
      await tx.etapaOrdemServico.update({
        where: { id },
        data: { situacao: 'CANCELADA', justificativaCancelamento: justificativa },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'EtapaOrdemServico',
        entidadeId: id,
        acao: 'CANCELAR',
        anterior: { situacao: 'PENDENTE' },
        novo: { situacao: 'CANCELADA', justificativa },
        completo: true,
      });
      return this.exibir(await this.carregarOs(etapa.ordemServicoId, tx));
    });
  }

  async iniciarEtapa(id: string, inicio: string | null | undefined, u: UsuarioAutenticado) {
    const m = await this.usuario(u);
    const { etapa, os } = await this.carregarEtapa(id);
    if (etapa.situacao !== 'PENDENTE') throw conflito('Esta etapa já foi iniciada.');
    if (!podeExecutarEtapa(etapa, m)) {
      throw proibido(
        etapa.responsavelId ? 'Esta etapa tem outro responsável.' : 'Esta etapa é de outra especialidade.',
      );
    }
    if (!etapaLiberada(etapa as unknown as EtapaRegra, os.etapas as unknown as EtapaRegra[])) {
      throw conflito('Etapa ainda não liberada: conclua as etapas anteriores da sequência.');
    }
    const quando = this.instante(inicio, os.solicitacao.ocorridaEm, 'O início');
    return this.prisma.$transaction(async (tx) => {
      await tx.etapaOrdemServico.update({
        where: { id },
        data: { situacao: 'EM_EXECUCAO', inicio: quando, executorId: u.id },
      });
      if (os.situacao === 'ABERTA')
        await tx.ordemServico.update({
          where: { id: os.id },
          data: { situacao: 'EM_EXECUCAO', inicio: quando },
        });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'EtapaOrdemServico',
        entidadeId: id,
        acao: 'INICIAR',
        anterior: { situacao: 'PENDENTE' },
        novo: { situacao: 'EM_EXECUCAO', inicio: quando },
      });
      return this.exibir(await this.carregarOs(os.id, tx));
    });
  }

  async concluirEtapa(
    id: string,
    dados: { fim?: string | null; servicoExecutado: string },
    u: UsuarioAutenticado,
  ) {
    const m = await this.usuario(u);
    const { etapa, os } = await this.carregarEtapa(id);
    if (etapa.situacao !== 'EM_EXECUCAO') throw conflito('Só etapas em execução podem ser concluídas.');
    if (etapa.executorId !== u.id && !podeExecutarEtapa(etapa, m))
      throw proibido('Esta etapa é de outro responsável.');
    const fim = this.instante(dados.fim, etapa.inicio, 'O fim');
    return this.prisma.$transaction(async (tx) => {
      await tx.etapaOrdemServico.update({
        where: { id },
        data: { situacao: 'CONCLUIDA', fim, servicoExecutado: dados.servicoExecutado },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'EtapaOrdemServico',
        entidadeId: id,
        acao: 'CONCLUIR',
        anterior: { situacao: 'EM_EXECUCAO' },
        novo: { situacao: 'CONCLUIDA', fim, servicoExecutado: dados.servicoExecutado },
      });
      return this.exibir(await this.carregarOs(os.id, tx));
    });
  }

  /** Encerra a OS (todas as etapas finalizadas). Não lança nenhum evento: o reinício é do apontador. */
  async encerrarOs(id: string, servicoExecutado: string, u: UsuarioAutenticado) {
    await this.controlador(u);
    const os = await this.carregarOs(id);
    this.exigirOsEditavel(os);
    const regras = os.etapas as unknown as EtapaRegra[];
    if (!etapasFinalizadas(regras))
      throw conflito('Conclua ou cancele todas as etapas antes de encerrar a OS.');
    const concluidas = os.etapas.filter((e) => e.situacao === 'CONCLUIDA');
    const inicio = new Date(Math.min(...concluidas.map((e) => e.inicio!.getTime())));
    const fim = new Date(Math.max(...concluidas.map((e) => e.fim!.getTime())));
    return this.prisma.$transaction(async (tx) => {
      const agora = new Date();
      await tx.ordemServico.update({
        where: { id },
        data: {
          situacao: 'ENCERRADA',
          inicio,
          fim,
          servicoExecutado,
          encerradaEm: agora,
          encerradaPorId: u.id,
        },
      });
      await tx.solicitacaoManutencao.update({
        where: { id: os.solicitacaoId },
        data: { situacao: 'ENCERRADA' },
      });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'OrdemServico',
        entidadeId: id,
        acao: 'ENCERRAR',
        anterior: { situacao: os.situacao },
        novo: { situacao: 'ENCERRADA', inicio, fim, servicoExecutado },
        completo: true,
      });
      return this.exibir(await this.carregarOs(id, tx));
    });
  }

  /** Etapas que o técnico pode executar agora (liberadas ou em execução, da sua especialidade). */
  async minhasEtapas(u: UsuarioAutenticado) {
    const m = await this.usuario(u);
    const oss = await this.prisma.ordemServico.findMany({
      where: { situacao: { not: 'ENCERRADA' } },
      include: INCLUIR_OS,
      orderBy: { numero: 'asc' },
    });
    const r = [];
    for (const os of oss) {
      const regras = os.etapas as unknown as EtapaRegra[];
      for (const e of os.etapas) {
        const exib = situacaoExibida(e as unknown as EtapaRegra, regras);
        const emExecucaoMinha =
          e.situacao === 'EM_EXECUCAO' && (e.executorId === u.id || podeExecutarEtapa(e, m));
        if ((exib === 'LIBERADA' && podeExecutarEtapa(e, m)) || emExecucaoMinha) {
          r.push({
            ...e,
            situacaoExibida: exib,
            os: { id: os.id, numero: os.numero, tipo: os.tipo, eletiva: os.eletiva },
            solicitacao: {
              descricao: os.solicitacao.descricao,
              maquina: os.solicitacao.maquina,
              local: os.solicitacao.local,
            },
          });
        }
      }
    }
    return { especialidades: m.especialidades, controlador: m.controladorManutencao, etapas: r };
  }

  async tecnicos() {
    return this.prisma.usuario.findMany({
      where: { ativo: true, perfis: { has: 'MANUTENCAO' } },
      select: { id: true, nome: true, especialidades: true, controladorManutencao: true },
      orderBy: { nome: 'asc' },
    });
  }

  // ---------- modelos de sequência ----------

  listarModelos() {
    return this.prisma.modeloSequencia.findMany({ orderBy: { nome: 'asc' } });
  }

  async salvarModelo(
    id: string | null,
    dados: z.infer<typeof esquemaModeloSequencia>,
    u: UsuarioAutenticado,
  ) {
    await this.controlador(u);
    const repetido = await this.prisma.modeloSequencia.findFirst({
      where: { nome: dados.nome, ...(id ? { id: { not: id } } : {}) },
    });
    if (repetido) throw conflito('Já existe um modelo com esse nome.');
    return this.prisma.$transaction(async (tx) => {
      const anterior = id ? await tx.modeloSequencia.findUnique({ where: { id } }) : null;
      if (id && !anterior) throw naoEncontrado('Modelo');
      const dadosGravar = {
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        etapas: dados.etapas,
        ativo: dados.ativo,
      };
      const m = id
        ? await tx.modeloSequencia.update({ where: { id }, data: dadosGravar })
        : await tx.modeloSequencia.create({ data: { ...dadosGravar, criadoPorId: u.id } });
      await this.auditoria.registrar(tx, {
        usuario: u,
        entidade: 'ModeloSequencia',
        entidadeId: m.id,
        acao: id ? 'ATUALIZAR' : 'CRIAR',
        anterior,
        novo: m,
      });
      return m;
    });
  }

  // ---------- painel e indicadores ----------

  /** Máquinas com solicitação aberta, em triagem ou com OS não encerrada (aviso no painel). */
  async maquinasComSolicitacaoAberta(): Promise<Map<string, number>> {
    const g = await this.prisma.solicitacaoManutencao.groupBy({
      by: ['maquinaId'],
      where: { situacao: { in: [...SITUACOES_ABERTAS] }, maquinaId: { not: null } },
      _count: true,
    });
    return new Map(g.map((x) => [x.maquinaId!, x._count]));
  }

  /** Indicadores do módulo no período (data da ocorrência): por máquina/local e horas por especialidade. */
  async indicadores(f: { inicio: string; fim: string }) {
    const solicitacoes = await this.prisma.solicitacaoManutencao.findMany({
      where: {
        ocorridaEm: {
          gte: new Date(`${f.inicio}T03:00:00Z`),
          lt: new Date(Date.parse(`${f.fim}T03:00:00Z`) + 86_400_000),
        },
      },
      include: { maquina: { select: { codigo: true } }, ordemServico: { include: { etapas: true } } },
    });
    const grupos = new Map<string, typeof solicitacoes>();
    for (const s of solicitacoes) {
      const k = s.maquina?.codigo ?? (s.local ? `Local: ${s.local}` : '—');
      grupos.set(k, [...(grupos.get(k) ?? []), s]);
    }
    const porMaquina = [...grupos.entries()]
      .map(([maquina, lista]) => {
        const atendimento = lista
          .map((s) =>
            s.ordemServico
              ? tempoAteAtendimentoMs(s.ocorridaEm, s.ordemServico.etapas as unknown as EtapaRegra[])
              : null,
          )
          .filter((x): x is number => x !== null);
        const reparo = lista
          .filter((s) => s.ordemServico?.situacao === 'ENCERRADA')
          .map((s) => tempoReparoMs(s.ordemServico!.etapas as unknown as EtapaRegra[]))
          .filter((x): x is number => x !== null);
        return {
          maquina,
          solicitacoes: lista.length,
          abertas: lista.filter((s) => (SITUACOES_ABERTAS as readonly string[]).includes(s.situacao)).length,
          recusadas: lista.filter((s) => s.situacao === 'RECUSADA').length,
          convertidas: lista.filter((s) => !!s.ordemServico).length,
          atendimentoMedioH: horas(media(atendimento)),
          atendimentoMaximoH: horas(atendimento.length ? Math.max(...atendimento) : null),
          reparoMedioH: horas(media(reparo)),
          reparoMaximoH: horas(reparo.length ? Math.max(...reparo) : null),
        };
      })
      .sort((a, b) => b.solicitacoes - a.solicitacoes || a.maquina.localeCompare(b.maquina));
    const total: Partial<Record<EspecialidadeManutencao, number>> = {};
    const etapasConcluidas: Record<string, number> = {};
    for (const s of solicitacoes) {
      if (!s.ordemServico) continue;
      for (const [esp, h] of Object.entries(
        horasPorEspecialidade(s.ordemServico.etapas as unknown as EtapaRegra[]),
      )) {
        total[esp as EspecialidadeManutencao] =
          Math.round(((total[esp as EspecialidadeManutencao] ?? 0) + h) * 100) / 100;
      }
      for (const e of s.ordemServico.etapas)
        if (e.situacao === 'CONCLUIDA')
          etapasConcluidas[e.especialidade] = (etapasConcluidas[e.especialidade] ?? 0) + 1;
    }
    const porEspecialidade = Object.entries(total)
      .map(([especialidade, h]) => ({
        especialidade,
        horas: h,
        etapas: etapasConcluidas[especialidade] ?? 0,
      }))
      .sort((a, b) => b.horas - a.horas);
    return { porMaquina, porEspecialidade, total: solicitacoes.length };
  }
}
