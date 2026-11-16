import { describe, expect, it } from 'vitest';
import {
  estadoMaquina,
  livresNosBlocos,
  numeroLoteExtrusao,
  planejarEtiquetas,
  precisaReservar,
  proximasSequencias,
  valoresImpressao,
} from './offline.js';
import { esquemaEvento } from './esquemas-producao.js';

const ctx = {
  conjunto: { quantidade: 30, tipoEmbalagem: 'PALLET' },
  maquinaCodigo: 'INJ-01',
  divisaoCodigo: '04508401001-03',
};
const evento = (dados: Record<string, unknown>) =>
  esquemaEvento.parse({
    id: crypto.randomUUID(),
    maquinaId: crypto.randomUUID(),
    horaOcorrencia: new Date().toISOString(),
    ...dados,
  });

describe('Seção 11 — estado da máquina (igual no servidor e no tablet)', () => {
  it('ordena pela hora da ocorrência e aceita datas em texto (dados do aparelho)', () => {
    const e = estadoMaquina([
      {
        tipo: 'PARADA',
        horaOcorrencia: '2026-11-16T10:00:00Z',
        recebidoEm: '2026-11-16T10:00:01Z',
        dados: { motivoParadaId: 'm1' },
      },
      {
        tipo: 'INICIO_MAQUINA',
        horaOcorrencia: '2026-11-16T08:00:00Z',
        recebidoEm: '2026-11-16T08:00:01Z',
        dados: {},
      },
    ]);
    expect(e).toEqual({ situacao: 'PARADA', desde: new Date('2026-11-16T10:00:00Z'), motivoParadaId: 'm1' });
    expect(estadoMaquina([]).situacao).toBe('DESLIGADA');
  });
});

describe('Seção 8/11 — etiquetas planejadas a partir do lançamento', () => {
  it('3 conjuntos de 30 + 1 avulso de 18 = 4 etiquetas com "n de N" e AVULSO', () => {
    const r = planejarEtiquetas(
      evento({
        tipo: 'SAIDA_PRODUCAO',
        divisaoId: crypto.randomUUID(),
        conjuntosPadrao: 3,
        avulsos: [18],
        confirmarAvulso: true,
        pesoMedioG: 400,
      }),
      ctx,
    );
    expect(
      r.map((x) => [x.quantidade, x.numeroNoLancamento, x.totalNoLancamento, x.avulso, x.pesoKg]),
    ).toEqual([
      [30, 1, 4, false, 12],
      [30, 2, 4, false, 12],
      [30, 3, 4, false, 12],
      [18, 4, 4, true, 7.2],
    ]);
    expect(r[0].dados).toEqual({ embalagem: 'PALLET' });
  });
  it('extrusão: uma etiqueta por volume; perda, devolução e transferência: uma; parada: nenhuma', () => {
    const ext = planejarEtiquetas(
      evento({
        tipo: 'SAIDA_PRODUCAO',
        divisaoId: crypto.randomUUID(),
        volumes: [
          { tipoVolume: 'SACO', pesoKg: 25 },
          { tipoVolume: 'SACO', pesoKg: 24.5 },
        ],
        operador: 'Ana',
      }),
      { ...ctx, conjunto: null, destinos: 'CAD-0031' },
    );
    expect(ext.map((x) => [x.tipo, x.quantidade, x.unidade, x.numeroNoLancamento])).toEqual([
      ['EXTRUSAO', 25, 'KG', 1],
      ['EXTRUSAO', 24.5, 'KG', 2],
    ]);
    expect(
      planejarEtiquetas(
        evento({
          tipo: 'PERDA',
          divisaoId: crypto.randomUUID(),
          tipoPerdaId: crypto.randomUUID(),
          quantidadePecas: 2,
        }),
        { ...ctx, tipoPerda: 'Peça refugada' },
      )[0],
    ).toMatchObject({
      tipo: 'PERDA',
      quantidade: 2,
      unidade: 'PECA',
      dados: { tipoPerda: 'Peça refugada', quantidadePecas: 2 },
    });
    const transf = planejarEtiquetas(
      evento({
        tipo: 'TRANSFERENCIA',
        divisaoId: crypto.randomUUID(),
        leitura: 'L1',
        quantidadeKg: 5,
        divisaoDestinoId: crypto.randomUUID(),
      }),
      { ...ctx, maquinaDestino: 'INJ-02', divisaoDestinoCodigo: '04508401002-01' },
    );
    expect(transf[0].dados).toEqual({
      operacao: 'TRANSFERÊNCIA',
      origem: 'INJ-01 · 04508401001-03',
      destino: 'INJ-02 · 04508401002-01',
    });
    expect(planejarEtiquetas(evento({ tipo: 'PARADA', motivoParadaId: crypto.randomUUID() }), ctx)).toEqual(
      [],
    );
    expect(numeroLoteExtrusao('12-01')).toBe('LE-12-01');
  });
});

describe('Seção 11 — valores impressos (mesmo ZPL offline e online)', () => {
  it('monta GS1, conjunto e turno a partir dos dados da etiqueta', () => {
    const v = valoresImpressao(
      {
        codigo: 'T1-0000007',
        emitidaEm: '2026-11-16T13:30:00Z',
        quantidade: 30,
        unidade: 'PECA',
        pesoKg: 12,
        avulso: false,
        numeroNoLancamento: 2,
        totalNoLancamento: 3,
        dados: { embalagem: 'PALLET' },
        produto: { codigo: 'CAD-0031', descricao: 'Cadeira' },
        lote: null,
        divisao: {
          codigo: '04508401001-03',
          ordem: { numeroErp: '04508401001', numeroInterno: 1 },
          maquina: { codigo: 'INJ-01' },
        },
        turno: { equipe: { letra: 'A' }, horarioTurno: { nome: 'Dia' } },
        responsavel: { login: 'joao' },
      },
      { segundaVia: false, larguraMm: 100, alturaMm: 150, dpi: 203 },
    );
    expect(v).toMatchObject({
      codigo: 'T1-0000007',
      conjunto: '2 de 3',
      turno: 'A-Dia',
      embalagem: 'PALLET',
      op: '04508401001',
      dataHora: '16/11/2026 10:30',
    });
    expect(v.gs1).toBe('(21)T1-0000007(240)CAD-0031(37)30(11)261116');
  });
});

describe('Seção 11 — blocos de numeração do tablet', () => {
  const blocos = [
    { inicio: 1001, fim: 1005 },
    { inicio: 2001, fim: 2010 },
  ];
  it('usa os números em ordem, pulando para o bloco seguinte', () => {
    expect(proximasSequencias(blocos, 0, 3)).toEqual([1001, 1002, 1003]);
    expect(proximasSequencias(blocos, 1003, 4)).toEqual([1004, 1005, 2001, 2002]);
    expect(proximasSequencias(blocos, 2008, 3)).toBeNull();
  });
  it('conta livres e pede outro bloco abaixo de 20%', () => {
    expect(livresNosBlocos(blocos, 1003)).toBe(12);
    expect(precisaReservar(blocos, 1003, 10)).toBe(false);
    expect(precisaReservar(blocos, 2009, 10)).toBe(true);
  });
});
