import {
  elementosGs1,
  formatarDataHora,
  gs1ComParenteses,
  mmParaPontos,
  ROTULO_UNIDADE,
  type Unidade,
} from '@apontamento/shared';
import type { Prisma } from '../generated/prisma/client.js';

export const INCLUIR_ETIQUETA = {
  produto: { select: { id: true, codigo: true, descricao: true, cor: true, tipo: true } },
  lote: {
    select: { id: true, numero: true, fornecedor: true, notaFiscal: true, indiceFluidez: true, cor: true },
  },
  divisao: {
    select: {
      codigo: true,
      ordem: { select: { numeroErp: true, numeroInterno: true } },
      maquina: { select: { codigo: true } },
    },
  },
  turno: {
    select: {
      id: true,
      data: true,
      situacao: true,
      horarioTurno: { select: { nome: true } },
      equipe: { select: { letra: true } },
    },
  },
  responsavel: { select: { nome: true, login: true } },
  localEstoque: { select: { id: true, nome: true } },
  /** Recebimento vigente (não estornado). */
  recebimentos: {
    where: { estornadoEm: null },
    orderBy: { recebidoEm: 'desc' },
    take: 1,
    include: { recebidoPor: { select: { nome: true } }, localEstoque: { select: { nome: true } } },
  },
} satisfies Prisma.EtiquetaInclude;

export type EtiquetaCompleta = Prisma.EtiquetaGetPayload<{ include: typeof INCLUIR_ETIQUETA }>;

const n = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Valores substituídos no modelo ZPL para uma etiqueta. */
export function valoresImpressao(
  e: EtiquetaCompleta,
  opcoes: { segundaVia: boolean; larguraMm: number; alturaMm: number; dpi: number },
): Record<string, string> {
  const d = (e.dados ?? {}) as Record<string, string | number | null>;
  const dataHora = formatarDataHora(e.emitidaEm);
  const peso = e.pesoKg ?? (e.unidade === 'KG' ? e.quantidade : null);
  const gs1 = gs1ComParenteses(
    elementosGs1({
      codigo: e.codigo,
      codigoProduto: e.produto.codigo,
      quantidade: e.quantidade,
      unidade: e.unidade as Unidade,
      data: e.emitidaEm,
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
    unidade: ROTULO_UNIDADE[e.unidade as Unidade],
    quantidadeTexto:
      d.quantidadePecas != null
        ? `${n(Number(d.quantidadePecas))} pç`
        : `${n(e.quantidade)} ${ROTULO_UNIDADE[e.unidade as Unidade]}`,
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

/** Dados fictícios para a impressão de teste de um layout. */
export function valoresTeste(opcoes: {
  larguraMm: number;
  alturaMm: number;
  dpi: number;
}): Record<string, string> {
  const agora = formatarDataHora(new Date());
  return {
    codigo: 'TS-0000000',
    gs1: '(21)TS-0000000(240)TESTE(37)1',
    segundaVia: '',
    avulso: 'AVULSO',
    larguraPontos: String(mmParaPontos(opcoes.larguraMm, opcoes.dpi)),
    alturaPontos: String(mmParaPontos(opcoes.alturaMm, opcoes.dpi)),
    data: agora.slice(0, 10),
    hora: agora.slice(11),
    dataHora: agora,
    responsavel: 'teste',
    turno: 'A-Dia',
    produto: 'TESTE',
    produtoDescricao: 'Etiqueta de teste',
    material: 'TESTE',
    materialDescricao: 'Material de teste',
    quantidade: '1',
    unidade: 'Peça',
    quantidadeTexto: '1 Peça',
    peso: '1',
    pesoTexto: '1 kg',
    lote: 'L000000-000',
    fornecedor: 'Fornecedor',
    notaFiscal: '000000',
    fluidez: '0',
    cor: 'Natural',
    op: '00000000000',
    divisao: '00000000000-01',
    maquina: 'MAQ',
    conjunto: '1 de 1',
    embalagem: 'PALLET',
    operador: 'Operador',
    destinos: '—',
    composicao: '—',
    tipoPerda: 'Teste',
    origem: 'Origem',
    destino: 'Destino',
    operacao: 'TESTE',
  };
}
