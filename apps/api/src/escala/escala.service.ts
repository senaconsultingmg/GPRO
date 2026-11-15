import { Inject, Injectable } from '@nestjs/common';
import {
  gerarEscalaCentral,
  gerarEscalaRevezamento,
  type GerarEscala,
  type LinhaEscala,
} from '@apontamento/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';

const paraDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const deDate = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class EscalaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async listar(de: string, ate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      throw new ErroNegocio('Informe o período (de, ate) no formato AAAA-MM-DD.');
    }
    const linhas = await this.prisma.escala.findMany({
      where: { data: { gte: paraDate(de), lte: paraDate(ate) } },
      include: {
        horarioTurno: { select: { id: true, nome: true, horaInicio: true, horaFim: true, modalidade: true } },
        equipe: { select: { id: true, letra: true } },
      },
      orderBy: [{ data: 'asc' }, { horarioTurno: { horaInicio: 'asc' } }],
    });
    return linhas.map((l) => ({ ...l, data: deDate(l.data) }));
  }

  async gerar(entrada: GerarEscala, usuario: UsuarioAutenticado) {
    let linhas: LinhaEscala[];
    const idsHorario = new Set<string>();
    const idsEquipe = new Set<string>();

    if (entrada.modalidade === 'REVEZAMENTO') {
      for (const dia of entrada.ciclo) {
        const doDia = new Set<string>();
        for (const a of dia) {
          if (doDia.has(a.horarioTurnoId))
            throw new ErroNegocio('Um horário aparece duas vezes no mesmo dia do ciclo.');
          doDia.add(a.horarioTurnoId);
          idsHorario.add(a.horarioTurnoId);
          idsEquipe.add(a.equipeId);
        }
      }
    } else {
      idsHorario.add(entrada.horarioTurnoId);
      idsEquipe.add(entrada.equipeId);
    }

    const horarios = await this.prisma.horarioTurno.findMany({ where: { id: { in: [...idsHorario] } } });
    const equipes = await this.prisma.equipe.findMany({ where: { id: { in: [...idsEquipe] } } });
    if (horarios.length !== idsHorario.size) throw naoEncontrado('Horário de turno');
    if (equipes.length !== idsEquipe.size) throw naoEncontrado('Equipe');
    if (horarios.some((h) => !h.ativo) || equipes.some((e) => !e.ativo)) {
      throw new ErroNegocio('Horário de turno ou equipe inativo não pode entrar na escala.');
    }
    if (horarios.some((h) => h.modalidade !== entrada.modalidade)) {
      throw new ErroNegocio(
        entrada.modalidade === 'CENTRAL'
          ? 'Selecione um horário de turno da modalidade "horário central".'
          : 'Selecione horários de turno da modalidade "revezamento".',
      );
    }

    try {
      if (entrada.modalidade === 'REVEZAMENTO') {
        linhas = gerarEscalaRevezamento(entrada);
      } else {
        linhas = gerarEscalaCentral({ ...entrada, diasSemana: horarios[0].diasSemana });
      }
    } catch (e) {
      throw new ErroNegocio((e as Error).message);
    }

    const periodo = { gte: paraDate(entrada.dataInicial), lte: paraDate(entrada.dataFinal) };
    return this.prisma.$transaction(async (tx) => {
      let substituidas = 0;
      if (entrada.substituir) {
        const r = await tx.escala.deleteMany({
          where: { data: periodo, horarioTurnoId: { in: [...idsHorario] } },
        });
        substituidas = r.count;
      }
      const criadas = await tx.escala.createMany({
        data: linhas.map((l) => ({
          data: paraDate(l.data),
          horarioTurnoId: l.horarioTurnoId,
          equipeId: l.equipeId,
        })),
        skipDuplicates: true,
      });
      const resumo = { geradas: criadas.count, substituidas, ignoradas: linhas.length - criadas.count };
      const nomeH = new Map(horarios.map((h) => [h.id, h.nome]));
      const letraE = new Map(equipes.map((e) => [e.id, e.letra]));
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Escala',
        acao: 'GERAR',
        novo: {
          modalidade: entrada.modalidade,
          dataInicial: entrada.dataInicial,
          dataFinal: entrada.dataFinal,
          substituir: entrada.substituir,
          ciclo:
            entrada.modalidade === 'REVEZAMENTO'
              ? entrada.ciclo.map((d) =>
                  d.map((a) => `${nomeH.get(a.horarioTurnoId)}=${letraE.get(a.equipeId)}`).join(', '),
                )
              : [`${nomeH.get(entrada.horarioTurnoId)}=${letraE.get(entrada.equipeId)}`],
          ...resumo,
        },
        completo: true,
      });
      return resumo;
    });
  }

  async atualizarEquipe(id: string, equipeId: string, usuario: UsuarioAutenticado) {
    const anterior = await this.prisma.escala.findUnique({ where: { id } });
    if (!anterior) throw naoEncontrado('Dia da escala');
    const equipe = await this.prisma.equipe.findUnique({ where: { id: equipeId } });
    if (!equipe?.ativo) throw new ErroNegocio('Equipe inexistente ou inativa.');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.escala.update({ where: { id }, data: { equipeId } });
      await this.auditoria.registrar(tx, {
        usuario,
        entidade: 'Escala',
        entidadeId: id,
        acao: 'ATUALIZAR',
        anterior,
        novo,
      });
      return { ...novo, data: deDate(novo.data) };
    });
  }
}
