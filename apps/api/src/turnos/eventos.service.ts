import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  avaliarPeso,
  formatarDataHora,
  marcaHorario,
  montarConjuntos,
  periodoValidoTurno,
  ROTULO_MARCA_HORARIO,
  ROTULO_TIPO_EVENTO,
  TIPOS_MATERIAL,
  usaMolde,
  validarBloqueios,
  validarLinhaTempo,
  lerCodigoEtiqueta,
  type EventoEntrada,
  type EventoTempo,
  type TipoMaquina,
  type TipoProduto,
} from '@apontamento/shared';
import { Prisma, type TurnoApontamento } from '../generated/prisma/client.js';
import type { Transacao } from '../prisma/prisma.service.js';
import { ParametrosService } from '../parametros/parametros.service.js';
import { conflito, ErroNegocio, naoEncontrado } from '../comum/erros.js';
import type { UsuarioAutenticado } from '../comum/decoradores.js';
import { producaoPorOrdem } from '../ordens/producao-ordem.js';
import { emitirEtiquetas, proximoNumeroLote, type NovaEtiqueta } from '../etiquetas/emissao.js';
import { baixarLote, resolverLote } from '../materia-prima/materia-prima.service.js';

/** Eventos de saldo solto: só são gerados pela abertura de divisão e pelo fechamento do turno. */
export interface EventoSaldo {
  id: string;
  tipo: 'SALDO_AVULSO_DEIXADO' | 'SALDO_AVULSO_RECEBIDO';
  maquinaId: string;
  divisaoId: string;
  horaOcorrencia: string;
  quantidade: number;
  dados: Record<string, unknown>;
  justificativa?: null;
}

export interface ContextoLancamento {
  turno: TurnoApontamento;
  usuario: UsuarioAutenticado;
  dispositivo: string;
  agora: Date;
  /** Posto (dispositivo do cadastro) que emite as etiquetas — cabeçalho x-posto. */
  postoId?: string | null;
}

type DivisaoComOrdem = Prisma.DivisaoOpGetPayload<{
  include: { ordem: { include: { produto: true } }; rodadaOp: { include: { fichaTecnica: true } } };
}>;

/** Consumo líquido do lote pela OP (entradas + transferências recebidas − devoluções − transferências enviadas). */
async function consumoLiquidoLote(tx: Transacao, ordemId: string, loteId: string): Promise<number> {
  const divisoes = (await tx.divisaoOp.findMany({ where: { ordemId }, select: { id: true } })).map(
    (d) => d.id,
  );
  const eventos = await tx.evento.findMany({
    where: {
      tipo: { in: ['ENTRADA_MATERIA_PRIMA', 'DEVOLUCAO_MATERIA_PRIMA', 'TRANSFERENCIA'] },
      situacao: { not: 'INCORRETO' },
      dados: { path: ['loteId'], equals: loteId },
    },
  });
  let total = 0;
  for (const e of eventos) {
    const d = e.dados as { quantidadeKg: number; divisaoDestinoId?: string };
    const daOp = e.divisaoId !== null && divisoes.includes(e.divisaoId);
    if (e.tipo === 'ENTRADA_MATERIA_PRIMA' && daOp) total += d.quantidadeKg;
    if (e.tipo === 'DEVOLUCAO_MATERIA_PRIMA' && daOp) total -= d.quantidadeKg;
    if (e.tipo === 'TRANSFERENCIA') {
      if (daOp) total -= d.quantidadeKg;
      if (d.divisaoDestinoId && divisoes.includes(d.divisaoDestinoId)) total += d.quantidadeKg;
    }
  }
  return arred(total);
}

const TIPOS_TEMPO = ['INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO', 'SAIDA_PRODUCAO'] as const;
const arred = (n: number) => Math.round(n * 1000) / 1000;

/** Registro e validação dos eventos do turno (RN-05 a RN-08, RN-11). */
@Injectable()
export class EventosService {
  constructor(@Inject(ParametrosService) private readonly parametros: ParametrosService) {}

  async registrar(
    tx: Transacao,
    ctx: ContextoLancamento,
    entrada: EventoEntrada | EventoSaldo,
  ): Promise<{
    evento: Prisma.EventoGetPayload<object>;
    duplicado: boolean;
    avisos: string[];
    etiquetas: { id: string; codigo: string }[];
  }> {
    const { turno, usuario, agora } = ctx;

    // Sem duplicidade: o identificador é gerado no dispositivo.
    const existente = await tx.evento.findUnique({ where: { id: entrada.id } });
    if (existente) {
      if (existente.turnoId === turno.id && existente.tipo === entrada.tipo) {
        const etiquetas = await tx.etiqueta.findMany({
          where: { eventoId: existente.id },
          select: { id: true, codigo: true },
          orderBy: { sequencia: 'asc' },
        });
        return { evento: existente, duplicado: true, avisos: [], etiquetas };
      }
      throw conflito('Identificador de evento já utilizado por outro lançamento.');
    }

    const hora = new Date(entrada.horaOcorrencia);
    const periodo = periodoValidoTurno({
      inicioNominal: turno.inicioNominal,
      fimNominal: turno.fimNominal,
      abertoEm: turno.abertoEm,
      fechadoEm: turno.fechadoEm,
      agora,
    });
    if (hora < periodo.inicio || hora > periodo.fim) {
      throw new ErroNegocio(
        `A hora da ocorrência (${formatarDataHora(hora)}) está fora do período do turno (${formatarDataHora(periodo.inicio)} a ${formatarDataHora(periodo.fim)}).`,
        [{ campo: 'horaOcorrencia', mensagem: 'Fora do período do turno.' }],
      );
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${turno.id}|${entrada.maquinaId}`}))`;
    const mt = await tx.maquinaTurno.findUnique({
      where: { turnoId_maquinaId: { turnoId: turno.id, maquinaId: entrada.maquinaId } },
      include: { maquina: true, rodada: { include: { ops: true } } },
    });
    if (!mt) throw new ErroNegocio('A máquina não está ligada neste turno. Ligue a máquina primeiro.');
    const tipoMaquina = mt.maquina.tipo as TipoMaquina;

    // Divisão da OP (lançamentos de produção, perdas e consumo são por OP).
    let divisao: Prisma.DivisaoOpGetPayload<{
      include: { ordem: { include: { produto: true } }; rodadaOp: { include: { fichaTecnica: true } } };
    }> | null = null;
    if ('divisaoId' in entrada && entrada.divisaoId) {
      divisao = await tx.divisaoOp.findUnique({
        where: { id: entrada.divisaoId },
        include: { ordem: { include: { produto: true } }, rodadaOp: { include: { fichaTecnica: true } } },
      });
      if (!divisao || divisao.turnoId !== turno.id || divisao.maquinaId !== entrada.maquinaId) {
        throw new ErroNegocio('A divisão da OP não pertence a esta máquina neste turno.');
      }
      if (['ENCERRADA', 'CANCELADA'].includes(divisao.ordem.situacao)) {
        throw new ErroNegocio(
          `A OP ${divisao.ordem.numeroErp ?? divisao.ordem.numeroInterno} está ${divisao.ordem.situacao === 'ENCERRADA' ? 'encerrada' : 'cancelada'}; lançamento recusado.`,
        );
      }
    }

    let dados: Record<string, unknown> = {};
    let quantidade: number | null = null;
    let pesoNaoConforme = false;
    let descricaoNc: string | null = null;
    const avisos: string[] = [];
    let loteLido: { id: string; numero: string; materialId: string } | null = null;
    let semiacabadoLido: {
      id: string;
      situacao: string;
      localEstoqueId: string | null;
      produtoId: string;
      quantidade: number;
    } | null = null;
    let tipoPerdaDescricao = '';

    switch (entrada.tipo) {
      case 'PARADA': {
        const motivo = await tx.motivoParada.findUnique({ where: { id: entrada.motivoParadaId } });
        if (!motivo?.ativo) throw new ErroNegocio('Motivo de parada inexistente ou inativo.');
        dados = {
          motivoParadaId: motivo.id,
          programada: motivo.programada,
          geraSolicitacaoManutencao: motivo.geraSolicitacaoManutencao,
        };
        break;
      }
      case 'SAIDA_PRODUCAO': {
        const d = divisao!;
        if (usaMolde(tipoMaquina)) {
          if (entrada.volumes.length) throw new ErroNegocio('Volumes com peso são lançados só na extrusão.');
          if (!entrada.conjuntoPadraoId)
            throw new ErroNegocio('Selecione o conjunto padrão.', [
              { campo: 'conjuntoPadraoId', mensagem: 'Obrigatório.' },
            ]);
          const conjunto = await tx.conjuntoPadrao.findUnique({ where: { id: entrada.conjuntoPadraoId } });
          if (!conjunto || conjunto.produtoId !== d.ordem.produtoId || !conjunto.ativo) {
            throw new ErroNegocio('Conjunto padrão inválido para o produto da OP.');
          }
          if (entrada.avulsos.length && !entrada.confirmarAvulso) {
            throw new ErroNegocio('Conjunto avulso (quantidade diferente do padrão) exige confirmação.', [
              { campo: 'confirmarAvulso', mensagem: 'Confirme o conjunto avulso.' },
            ]);
          }
          let montagem;
          try {
            montagem = montarConjuntos(conjunto.quantidade, entrada.conjuntosPadrao, entrada.avulsos);
          } catch (e) {
            throw new ErroNegocio((e as Error).message);
          }
          if (entrada.pesoMedioG == null) {
            throw new ErroNegocio('Informe o peso médio da peça.', [
              { campo: 'pesoMedioG', mensagem: 'Obrigatório.' },
            ]);
          }
          const ficha = d.rodadaOp.fichaTecnica;
          const peso = avaliarPeso(entrada.pesoMedioG, ficha.pesoPadraoG, ficha.toleranciaPesoPct);
          if (peso.naoConforme) {
            if (!entrada.justificativa) {
              throw new ErroNegocio(
                `Peso fora da tolerância (desvio de ${peso.desvioPct}% sobre ${ficha.pesoPadraoG} g, tolerância ${ficha.toleranciaPesoPct}%). A justificativa é obrigatória.`,
                [{ campo: 'justificativa', mensagem: 'Obrigatória para peso fora da tolerância.' }],
              );
            }
            pesoNaoConforme = true;
            descricaoNc = `Peso médio ${entrada.pesoMedioG} g (padrão ${ficha.pesoPadraoG} g ± ${ficha.toleranciaPesoPct}%, desvio ${peso.desvioPct}%) — OP ${d.codigo}`;
          }
          quantidade = montagem.total;
          dados = {
            conjuntoPadraoId: conjunto.id,
            tipoEmbalagem: conjunto.tipoEmbalagem,
            quantidadePorConjunto: conjunto.quantidade,
            conjuntos: montagem.conjuntos,
            temAvulso: entrada.avulsos.length > 0,
            pesoMedioG: entrada.pesoMedioG,
            pesoPadraoG: ficha.pesoPadraoG,
            toleranciaPesoPct: ficha.toleranciaPesoPct,
            desvioPct: peso.desvioPct,
          };
        } else {
          if (entrada.volumes.length === 0) throw new ErroNegocio('Informe ao menos um volume com o peso.');
          if (!entrada.operador)
            throw new ErroNegocio('Informe o operador que produziu.', [
              { campo: 'operador', mensagem: 'Obrigatório.' },
            ]);
          quantidade = arred(entrada.volumes.reduce((s, v) => s + v.pesoKg, 0));
          dados = {
            volumes: entrada.volumes.map((v, i) => ({ numero: i + 1, ...v })),
            operador: entrada.operador,
            indiceFluidez: entrada.indiceFluidez ?? null,
            produtosDestino: entrada.produtosDestino,
          };
        }
        break;
      }
      case 'PERDA': {
        const tipo = await tx.tipoPerda.findUnique({ where: { id: entrada.tipoPerdaId } });
        if (!tipo?.ativo) throw new ErroNegocio('Tipo de perda inexistente ou inativo.');
        quantidade = entrada.quantidadePecas ?? null;
        tipoPerdaDescricao = tipo.descricao;
        dados = {
          tipoPerdaId: tipo.id,
          contaComoRefugo: tipo.contaComoRefugo,
          pesoKg: entrada.pesoKg ?? null,
          quantidadePecas: entrada.quantidadePecas ?? null,
        };
        break;
      }
      case 'ENTRADA_MATERIA_PRIMA':
      case 'DEVOLUCAO_MATERIA_PRIMA':
      case 'TRANSFERENCIA': {
        // Fase 3: o material vem da etiqueta do lote/mistura (ou do número do lote).
        const lote = await resolverLote(tx, entrada.leitura);
        if (
          !TIPOS_MATERIAL.includes(lote.material.tipo as TipoProduto) ||
          lote.material.tipo === 'SEMIACABADO'
        ) {
          throw new ErroNegocio(
            'O lote lido não é de matéria-prima, aditivo, extrusado, moído, reciclado ou mistura.',
          );
        }
        quantidade = entrada.quantidadeKg;
        dados = {
          materialId: lote.materialId,
          loteId: lote.id,
          lote: lote.numero,
          quantidadeKg: entrada.quantidadeKg,
        };
        loteLido = { id: lote.id, numero: lote.numero, materialId: lote.materialId };
        if (entrada.tipo !== 'ENTRADA_MATERIA_PRIMA') {
          const consumido = await consumoLiquidoLote(tx, divisao!.ordemId, lote.id);
          if (consumido + 1e-9 < entrada.quantidadeKg) {
            throw new ErroNegocio(
              `A OP consumiu ${consumido.toLocaleString('pt-BR')} kg do lote ${lote.numero}; não é possível ${entrada.tipo === 'TRANSFERENCIA' ? 'transferir' : 'devolver'} ${entrada.quantidadeKg.toLocaleString('pt-BR')} kg.`,
            );
          }
        }
        if (entrada.tipo === 'TRANSFERENCIA') {
          const destino = await tx.divisaoOp.findUnique({
            where: { id: entrada.divisaoDestinoId },
            include: { turno: true, maquina: true },
          });
          if (!destino || destino.turno.situacao !== 'ABERTO')
            throw new ErroNegocio('A OP de destino precisa estar em um turno aberto.');
          if (destino.id === entrada.divisaoId || destino.maquinaId === entrada.maquinaId) {
            throw new ErroNegocio('A transferência deve ir para outra máquina.');
          }
          dados = {
            ...dados,
            divisaoDestinoId: destino.id,
            maquinaDestinoId: destino.maquinaId,
            codigoDivisaoDestino: destino.codigo,
            maquinaDestino: destino.maquina.codigo,
          };
        }
        break;
      }
      case 'ENTRADA_SEMIACABADO': {
        const codigo = lerCodigoEtiqueta(entrada.leitura);
        const etq = codigo
          ? await tx.etiqueta.findUnique({ where: { codigo }, include: { produto: true } })
          : null;
        if (!etq) throw new ErroNegocio(`Etiqueta "${entrada.leitura.trim()}" não encontrada.`);
        if (etq.tipo !== 'PRODUTO' || etq.produto.tipo !== 'SEMIACABADO')
          throw new ErroNegocio(`A etiqueta ${etq.codigo} não é de semiacabado.`);
        if (!['EMITIDA', 'RECEBIDA'].includes(etq.situacao)) {
          throw new ErroNegocio(
            `A etiqueta ${etq.codigo} está ${etq.situacao === 'CONSUMIDA' ? 'consumida' : etq.situacao.toLowerCase()} e não pode entrar na produção.`,
          );
        }
        quantidade = etq.quantidade;
        dados = {
          produtoId: etq.produtoId,
          quantidade: etq.quantidade,
          etiquetaId: etq.id,
          etiqueta: etq.codigo,
          lote: etq.codigo,
        };
        semiacabadoLido = {
          id: etq.id,
          situacao: etq.situacao,
          localEstoqueId: etq.localEstoqueId,
          produtoId: etq.produtoId,
          quantidade: etq.quantidade,
        };
        break;
      }
      case 'BLOQUEIO_CAVIDADE':
      case 'DESBLOQUEIO_CAVIDADE': {
        if (!usaMolde(tipoMaquina)) throw new ErroNegocio('Extrusora não tem cavidades.');
        const op = mt.rodada.ops.find((o) => o.cavidades.includes(entrada.cavidade));
        if (!op)
          throw new ErroNegocio(`A cavidade ${entrada.cavidade} não está atribuída a nenhuma OP da rodada.`);
        // Bloqueios pertencem à rodada: valida com os eventos de todos os turnos dela.
        const anteriores = await tx.evento.findMany({
          where: {
            rodadaId: mt.rodadaId,
            tipo: { in: ['BLOQUEIO_CAVIDADE', 'DESBLOQUEIO_CAVIDADE'] },
            situacao: { not: 'INCORRETO' },
          },
        });
        const erro = validarBloqueios([
          ...anteriores.map((e) => ({
            tipo: e.tipo as 'BLOQUEIO_CAVIDADE',
            cavidade: (e.dados as { cavidade: number }).cavidade,
            hora: e.horaOcorrencia.getTime(),
          })),
          { tipo: entrada.tipo, cavidade: entrada.cavidade, hora: hora.getTime() },
        ]);
        if (erro) throw new ErroNegocio(erro);
        dados = {
          cavidade: entrada.cavidade,
          rodadaOpId: op.id,
          ordemId: op.ordemId,
          ...(entrada.tipo === 'BLOQUEIO_CAVIDADE' ? { motivo: entrada.motivo } : {}),
        };
        break;
      }
      case 'SALDO_AVULSO_DEIXADO':
      case 'SALDO_AVULSO_RECEBIDO':
        quantidade = entrada.quantidade;
        dados = entrada.dados;
        break;
      case 'INICIO_MAQUINA':
        if (!['PLANEJADA', 'EM_ANDAMENTO'].includes(mt.rodada.situacao))
          throw new ErroNegocio('A rodada da máquina está encerrada.');
        break;
      case 'FIM_MAQUINA':
      case 'REINICIO':
        break;
    }

    // RN-05: sequência início/parada/reinício/fim e saída fora de parada.
    if ((TIPOS_TEMPO as readonly string[]).includes(entrada.tipo)) {
      const existentes = await tx.evento.findMany({
        where: {
          turnoId: turno.id,
          maquinaId: entrada.maquinaId,
          tipo: { in: [...TIPOS_TEMPO] },
          situacao: { not: 'INCORRETO' },
        },
        select: { tipo: true, horaOcorrencia: true, recebidoEm: true },
      });
      const erro = validarLinhaTempo([
        ...existentes.map((e) => ({
          tipo: e.tipo as EventoTempo['tipo'],
          hora: e.horaOcorrencia.getTime(),
          seq: e.recebidoEm.getTime(),
        })),
        { tipo: entrada.tipo as EventoTempo['tipo'], hora: hora.getTime(), seq: Number.MAX_SAFE_INTEGER },
      ]);
      if (erro) throw new ErroNegocio(erro, [{ campo: 'horaOcorrencia', mensagem: erro }]);
    }

    // RN-08: marca de horário com a tolerância parametrizável.
    const tolerancia = await this.parametros.numero('tolerancia_horario_min');
    const marca = marcaHorario(hora, agora, tolerancia);

    const evento = await tx.evento.create({
      data: {
        id: entrada.id,
        tipo: entrada.tipo,
        turnoId: turno.id,
        maquinaId: entrada.maquinaId,
        rodadaId: mt.rodadaId,
        divisaoId: divisao?.id ?? null,
        horaOcorrencia: hora,
        horaRegistro: agora,
        usuarioId: usuario.id,
        dispositivo: ctx.dispositivo,
        dados: dados as Prisma.InputJsonValue,
        quantidade,
        marcaHorario: marca,
        pesoNaoConforme,
        justificativa: entrada.justificativa ?? null,
      },
    });

    // Pendências para o líder (decisão na Fase 4).
    if (marca !== 'NO_MOMENTO') {
      await tx.aprovacao.create({
        data: {
          tipo: 'HORARIO',
          turnoId: turno.id,
          eventoId: evento.id,
          solicitanteId: usuario.id,
          descricao: `${ROTULO_TIPO_EVENTO[entrada.tipo]} ${ROTULO_MARCA_HORARIO[marca].toLowerCase()}: ocorrência ${formatarDataHora(hora)}, registro ${formatarDataHora(agora)} — máquina ${mt.maquina.codigo}`,
        },
      });
    }
    if (pesoNaoConforme) {
      await tx.aprovacao.create({
        data: {
          tipo: 'PESO',
          turnoId: turno.id,
          eventoId: evento.id,
          solicitanteId: usuario.id,
          descricao: descricaoNc!,
        },
      });
    }

    // Fase 3: estoque e etiquetas do lançamento.
    if (entrada.tipo === 'ENTRADA_MATERIA_PRIMA' && loteLido) {
      await baixarLote(tx, {
        loteId: loteLido.id,
        loteNumero: loteLido.numero,
        produtoId: loteLido.materialId,
        quantidadeKg: entrada.quantidadeKg,
        tipo: 'CONSUMO_PRODUCAO',
        usuarioId: usuario.id,
        eventoId: evento.id,
      });
    }
    if (semiacabadoLido) {
      if (semiacabadoLido.situacao === 'RECEBIDA' && semiacabadoLido.localEstoqueId) {
        await tx.movimentoEstoque.create({
          data: {
            tipo: 'CONSUMO_SEMIACABADO',
            produtoId: semiacabadoLido.produtoId,
            etiquetaId: semiacabadoLido.id,
            localOrigemId: semiacabadoLido.localEstoqueId,
            quantidade: semiacabadoLido.quantidade,
            eventoId: evento.id,
            usuarioId: usuario.id,
          },
        });
      }
      await tx.etiqueta.update({ where: { id: semiacabadoLido.id }, data: { situacao: 'CONSUMIDA' } });
    }
    const etiquetas = await this.gerarEtiquetas(
      tx,
      ctx,
      entrada,
      evento.id,
      mt.maquina.codigo,
      divisao,
      dados,
      tipoPerdaDescricao,
    );

    if (entrada.tipo === 'SAIDA_PRODUCAO' && divisao) {
      const produzido = (await producaoPorOrdem(tx, [divisao.ordemId])).get(divisao.ordemId) ?? 0;
      if (produzido > divisao.ordem.quantidade) {
        avisos.push(
          `A OP ${divisao.ordem.numeroErp ?? divisao.ordem.numeroInterno} passou da quantidade demandada (${produzido} de ${divisao.ordem.quantidade}).`,
        );
      }
    }
    return { evento, duplicado: false, avisos, etiquetas };
  }

  /** Etiquetas do lançamento (seção 8): uma por conjunto ou volume; uma por perda, devolução e transferência. */
  private async gerarEtiquetas(
    tx: Transacao,
    ctx: ContextoLancamento,
    entrada: EventoEntrada | EventoSaldo,
    eventoId: string,
    maquinaCodigo: string,
    divisao: DivisaoComOrdem | null,
    dados: Record<string, unknown>,
    tipoPerda: string,
  ) {
    if (!divisao) return [];
    const base = { eventoId, divisaoId: divisao.id, turnoId: ctx.turno.id };
    const itens: NovaEtiqueta[] = [];
    if (entrada.tipo === 'SAIDA_PRODUCAO') {
      const conjuntos =
        (dados.conjuntos as { numero: number; quantidade: number; avulso: boolean }[] | undefined) ?? [];
      if (conjuntos.length) {
        conjuntos.forEach((c) =>
          itens.push({
            ...base,
            tipo: 'PRODUTO',
            produtoId: divisao.ordem.produtoId,
            quantidade: c.quantidade,
            unidade: 'PECA',
            pesoKg: dados.pesoMedioG ? arred((Number(dados.pesoMedioG) * c.quantidade) / 1000) : null,
            avulso: c.avulso,
            numeroNoLancamento: c.numero,
            totalNoLancamento: conjuntos.length,
            dados: { embalagem: String(dados.tipoEmbalagem ?? '') },
          }),
        );
      } else {
        // Extrusão: os volumes da divisão formam um lote de extrusado.
        let lote = await tx.loteMaterial.findFirst({ where: { divisaoId: divisao.id } });
        const volumes = (dados.volumes as { tipoVolume: string; pesoKg: number }[]) ?? [];
        const total = arred(volumes.reduce((s, v) => s + v.pesoKg, 0));
        if (!lote) {
          lote = await tx.loteMaterial.create({
            data: {
              numero: await proximoNumeroLote(tx),
              materialId: divisao.ordem.produtoId,
              origem: 'EXTRUSAO',
              quantidadeInicial: 0,
              indiceFluidez: (dados.indiceFluidez as number | null) ?? null,
              cor: divisao.ordem.produto.cor,
              ordemExtrusaoId: divisao.ordemId,
              divisaoId: divisao.id,
              criadoPorId: ctx.usuario.id,
            },
          });
        }
        lote = await tx.loteMaterial.update({
          where: { id: lote.id },
          data: {
            quantidadeInicial: { increment: total },
            ...(dados.indiceFluidez ? { indiceFluidez: dados.indiceFluidez as number } : {}),
          },
        });
        const destinos = await tx.produto.findMany({
          where: { id: { in: (dados.produtosDestino as string[]) ?? [] } },
          select: { codigo: true },
        });
        volumes.forEach((v, i) =>
          itens.push({
            ...base,
            tipo: 'EXTRUSAO',
            produtoId: divisao.ordem.produtoId,
            quantidade: v.pesoKg,
            unidade: 'KG',
            pesoKg: v.pesoKg,
            loteId: lote.id,
            numeroNoLancamento: i + 1,
            totalNoLancamento: volumes.length,
            dados: {
              operador: String(dados.operador ?? ''),
              destinos: destinos.map((d) => d.codigo).join(', '),
              tipoVolume: v.tipoVolume,
            },
          }),
        );
      }
    } else if (entrada.tipo === 'PERDA') {
      const peso = dados.pesoKg as number | null;
      const pecas = dados.quantidadePecas as number | null;
      itens.push({
        ...base,
        tipo: 'PERDA',
        produtoId: divisao.ordem.produtoId,
        quantidade: peso ?? pecas ?? 0,
        unidade: peso != null ? 'KG' : 'PECA',
        pesoKg: peso,
        dados: { tipoPerda, quantidadePecas: pecas },
      });
    } else if (entrada.tipo === 'DEVOLUCAO_MATERIA_PRIMA' || entrada.tipo === 'TRANSFERENCIA') {
      const devolucao = entrada.tipo === 'DEVOLUCAO_MATERIA_PRIMA';
      itens.push({
        ...base,
        tipo: 'DEVOLUCAO_TRANSFERENCIA',
        produtoId: dados.materialId as string,
        quantidade: entrada.quantidadeKg,
        unidade: 'KG',
        pesoKg: entrada.quantidadeKg,
        loteId: dados.loteId as string,
        dados: {
          operacao: devolucao ? 'DEVOLUÇÃO' : 'TRANSFERÊNCIA',
          origem: `${maquinaCodigo} · ${divisao.codigo}`,
          destino: devolucao ? 'Matéria-prima' : `${dados.maquinaDestino} · ${dados.codigoDivisaoDestino}`,
        },
      });
    }
    const criadas = await emitirEtiquetas(tx, ctx.postoId, ctx.usuario.id, itens);
    return criadas.map((e) => ({ id: e.id, codigo: e.codigo }));
  }

  novoId(): string {
    return randomUUID();
  }

  async exigirMaquina(tx: Transacao, maquinaId: string) {
    const m = await tx.maquina.findUnique({ where: { id: maquinaId } });
    if (!m) throw naoEncontrado('Máquina');
    return m;
  }
}
