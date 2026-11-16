/**
 * Seção 11 — regras puras usadas igualmente no servidor e no tablet (offline):
 * estado da máquina, etiquetas de cada lançamento, valores impressos e blocos de numeração.
 */
import { ROTULO_UNIDADE, type TipoEtiqueta, type Unidade } from './enumeracoes.js';
import { formatarDataHora } from './datas.js';
import { elementosGs1, gs1ComParenteses, mmParaPontos } from './etiquetas.js';
import { ordenarEventosTempo, type EventoTempo } from './indicadores.js';
import { montarConjuntos } from './apontamento.js';
import type { EventoEntrada } from './esquemas-producao.js';

// ---------- Estado da máquina ----------

export type EstadoMaquina = {
  situacao: 'LIGADA' | 'PARADA' | 'DESLIGADA';
  desde: Date | null;
  motivoParadaId: string | null;
};

/** Estado atual da máquina a partir dos eventos de tempo (válidos) do turno. */
export function estadoMaquina(
  eventos: { tipo: string; horaOcorrencia: Date | string; recebidoEm: Date | string; dados: unknown }[],
): EstadoMaquina {
  let estado: EstadoMaquina = { situacao: 'DESLIGADA', desde: null, motivoParadaId: null };
  const tempo = eventos
    .filter((e) => ['INICIO_MAQUINA', 'FIM_MAQUINA', 'PARADA', 'REINICIO'].includes(e.tipo))
    .map((e) => ({
      tipo: e.tipo as EventoTempo['tipo'],
      hora: new Date(e.horaOcorrencia).getTime(),
      seq: new Date(e.recebidoEm).getTime(),
      dados: e.dados,
    }));
  for (const e of ordenarEventosTempo(tempo)) {
    const desde = new Date(e.hora);
    if (e.tipo === 'INICIO_MAQUINA' || e.tipo === 'REINICIO')
      estado = { situacao: 'LIGADA', desde, motivoParadaId: null };
    else if (e.tipo === 'PARADA')
      estado = {
        situacao: 'PARADA',
        desde,
        motivoParadaId: (e.dados as { motivoParadaId: string }).motivoParadaId,
      };
    else estado = { situacao: 'DESLIGADA', desde, motivoParadaId: null };
  }
  return estado;
}

// ---------- Etiquetas de um lançamento ----------

export interface EtiquetaPlanejada {
  tipo: Extract<TipoEtiqueta, 'PRODUTO' | 'EXTRUSAO' | 'PERDA' | 'DEVOLUCAO_TRANSFERENCIA'>;
  quantidade: number;
  unidade: Unidade;
  pesoKg: number | null;
  avulso: boolean;
  numeroNoLancamento: number | null;
  totalNoLancamento: number | null;
  /** Campos impressos específicos do tipo. */
  dados: Record<string, string | number | null>;
}

export interface ContextoEtiquetas {
  /** Molde: quantidade e embalagem do conjunto padrão; extrusão: null. */
  conjunto: { quantidade: number; tipoEmbalagem: string } | null;
  maquinaCodigo: string;
  divisaoCodigo: string;
  tipoPerda?: string;
  /** Códigos dos produtos de destino (extrusão), separados por vírgula. */
  destinos?: string;
  /** Transferência: máquina e divisão de destino. */
  maquinaDestino?: string;
  divisaoDestinoCodigo?: string;
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

/** Número do lote de extrusado: um por divisão, determinado pelo código (vale offline). */
export const numeroLoteExtrusao = (codigoDivisao: string) => `LE-${codigoDivisao}`;

/**
 * Seção 8 — etiquetas geradas por um lançamento: uma por conjunto (com "n de N" e AVULSO) ou por
 * volume de extrusão; uma por perda, devolução e transferência. Demais lançamentos não geram.
 * O mesmo cálculo roda no servidor e no tablet, para que a etiqueta impressa offline seja a gravada.
 */
export function planejarEtiquetas(entrada: EventoEntrada, ctx: ContextoEtiquetas): EtiquetaPlanejada[] {
  const base = { avulso: false, numeroNoLancamento: null, totalNoLancamento: null };
  switch (entrada.tipo) {
    case 'SAIDA_PRODUCAO': {
      if (ctx.conjunto) {
        const { conjuntos } = montarConjuntos(
          ctx.conjunto.quantidade,
          entrada.conjuntosPadrao,
          entrada.avulsos,
        );
        return conjuntos.map((c) => ({
          tipo: 'PRODUTO',
          quantidade: c.quantidade,
          unidade: 'PECA',
          pesoKg: entrada.pesoMedioG ? arred((entrada.pesoMedioG * c.quantidade) / 1000) : null,
          avulso: c.avulso,
          numeroNoLancamento: c.numero,
          totalNoLancamento: conjuntos.length,
          dados: { embalagem: ctx.conjunto!.tipoEmbalagem },
        }));
      }
      return entrada.volumes.map((v, i) => ({
        tipo: 'EXTRUSAO',
        quantidade: v.pesoKg,
        unidade: 'KG',
        pesoKg: v.pesoKg,
        avulso: false,
        numeroNoLancamento: i + 1,
        totalNoLancamento: entrada.volumes.length,
        dados: { operador: entrada.operador ?? '', destinos: ctx.destinos ?? '', tipoVolume: v.tipoVolume },
      }));
    }
    case 'PERDA': {
      const peso = entrada.pesoKg ?? null;
      const pecas = entrada.quantidadePecas ?? null;
      return [
        {
          ...base,
          tipo: 'PERDA',
          quantidade: peso ?? pecas ?? 0,
          unidade: peso != null ? 'KG' : 'PECA',
          pesoKg: peso,
          dados: { tipoPerda: ctx.tipoPerda ?? '', quantidadePecas: pecas },
        },
      ];
    }
    case 'DEVOLUCAO_MATERIA_PRIMA':
    case 'TRANSFERENCIA': {
      const devolucao = entrada.tipo === 'DEVOLUCAO_MATERIA_PRIMA';
      return [
        {
          ...base,
          tipo: 'DEVOLUCAO_TRANSFERENCIA',
          quantidade: entrada.quantidadeKg,
          unidade: 'KG',
          pesoKg: entrada.quantidadeKg,
          dados: {
            operacao: devolucao ? 'DEVOLUÇÃO' : 'TRANSFERÊNCIA',
            origem: `${ctx.maquinaCodigo} · ${ctx.divisaoCodigo}`,
            destino: devolucao
              ? 'Matéria-prima'
              : `${ctx.maquinaDestino ?? ''} · ${ctx.divisaoDestinoCodigo ?? ''}`,
          },
        },
      ];
    }
    default:
      return [];
  }
}

// ---------- Valores impressos ----------

/** Dados de uma etiqueta para montar o ZPL (vindos do banco ou do pacote do tablet). */
export interface EtiquetaImpressao {
  codigo: string;
  emitidaEm: Date | string;
  quantidade: number;
  unidade: string;
  pesoKg: number | null;
  avulso: boolean;
  numeroNoLancamento: number | null;
  totalNoLancamento: number | null;
  dados: unknown;
  produto: { codigo: string; descricao: string; cor?: string | null };
  lote: {
    numero: string;
    fornecedor?: string | null;
    notaFiscal?: string | null;
    indiceFluidez?: number | null;
    cor?: string | null;
  } | null;
  divisao: {
    codigo: string;
    ordem: { numeroErp: string | null; numeroInterno: number };
    maquina: { codigo: string };
  } | null;
  turno: { equipe: { letra: string }; horarioTurno: { nome: string } } | null;
  responsavel: { login: string };
}

const n = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Valores substituídos no modelo ZPL para uma etiqueta. */
export function valoresImpressao(
  e: EtiquetaImpressao,
  opcoes: { segundaVia: boolean; larguraMm: number; alturaMm: number; dpi: number },
): Record<string, string> {
  const d = (e.dados ?? {}) as Record<string, string | number | null>;
  const dataHora = formatarDataHora(e.emitidaEm);
  const unidade = e.unidade as Unidade;
  const peso = e.pesoKg ?? (unidade === 'KG' ? e.quantidade : null);
  const gs1 = gs1ComParenteses(
    elementosGs1({
      codigo: e.codigo,
      codigoProduto: e.produto.codigo,
      quantidade: e.quantidade,
      unidade,
      data: new Date(e.emitidaEm),
      lote: e.lote?.numero ?? null,
    }),
  );
  const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, texto(v)])),
    codigo: e.codigo,
    gs1,
    segundaVia: opcoes.segundaVia ? '2ª VIA' : '',
    avulso: e.avulso ? 'AVULSO' : '',
    larguraPontos: String(mmParaPontos(opcoes.larguraMm, opcoes.dpi)),
    alturaPontos: String(mmParaPontos(opcoes.alturaMm, opcoes.dpi)),
    data: dataHora.slice(0, 10),
    hora: dataHora.slice(11),
    dataHora,
    responsavel: e.responsavel.login,
    turno: e.turno ? `${e.turno.equipe.letra}-${e.turno.horarioTurno.nome}` : texto(d.turno),
    produto: e.produto.codigo,
    produtoDescricao: e.produto.descricao,
    material: e.produto.codigo,
    materialDescricao: e.produto.descricao,
    quantidade: n(e.quantidade),
    unidade: ROTULO_UNIDADE[unidade],
    quantidadeTexto:
      d.quantidadePecas != null
        ? `${n(Number(d.quantidadePecas))} pç`
        : `${n(e.quantidade)} ${ROTULO_UNIDADE[unidade]}`,
    peso: peso != null ? n(peso) : '',
    pesoTexto: peso != null ? `${n(peso)} kg` : '',
    lote: e.lote?.numero ?? texto(d.lote),
    fornecedor: e.lote?.fornecedor ?? texto(d.fornecedor),
    notaFiscal: e.lote?.notaFiscal ?? texto(d.notaFiscal),
    fluidez: e.lote?.indiceFluidez != null ? n(e.lote.indiceFluidez) : texto(d.fluidez),
    cor: e.lote?.cor ?? e.produto.cor ?? texto(d.cor),
    op: e.divisao ? (e.divisao.ordem.numeroErp ?? `nº ${e.divisao.ordem.numeroInterno}`) : texto(d.op),
    divisao: e.divisao?.codigo ?? texto(d.divisao),
    maquina: e.divisao?.maquina.codigo ?? texto(d.maquina),
    conjunto:
      e.numeroNoLancamento && e.totalNoLancamento ? `${e.numeroNoLancamento} de ${e.totalNoLancamento}` : '',
  };
}

// ---------- Blocos de numeração por posto ----------

export interface BlocoNumeracao {
  inicio: number;
  fim: number;
}

/**
 * Próximas `quantidade` sequências livres dentro dos blocos reservados pelo aparelho, a partir da
 * última usada. Retorna null se os blocos não bastam (o tablet precisa reservar outro).
 */
export function proximasSequencias(
  blocos: BlocoNumeracao[],
  ultimaUsada: number,
  quantidade: number,
): number[] | null {
  const r: number[] = [];
  let atual = ultimaUsada;
  for (const b of [...blocos].sort((a, c) => a.inicio - c.inicio)) {
    let s = Math.max(atual + 1, b.inicio);
    while (s <= b.fim && r.length < quantidade) {
      r.push(s);
      atual = s;
      s++;
    }
    if (r.length === quantidade) return r;
  }
  return r.length === quantidade ? r : null;
}

/** Números ainda livres nos blocos após a última usada. */
export function livresNosBlocos(blocos: BlocoNumeracao[], ultimaUsada: number): number {
  return blocos.reduce((s, b) => s + Math.max(0, b.fim - Math.max(b.inicio - 1, ultimaUsada)), 0);
}

/** Reserva outro bloco quando restar menos de 20% do tamanho do bloco. */
export const precisaReservar = (blocos: BlocoNumeracao[], ultimaUsada: number, tamanhoBloco: number) =>
  livresNosBlocos(blocos, ultimaUsada) < Math.max(1, Math.ceil(tamanhoBloco * 0.2));
