import { formatarDataHora, mmParaPontos, valoresImpressao } from '@apontamento/shared';
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

/** Valores substituídos no modelo ZPL: a mesma função do tablet (impressão offline). */
export { valoresImpressao };

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
