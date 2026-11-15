import { describe, expect, it } from 'vitest';
import {
  agregarFatos,
  agregarPor,
  calcularOee,
  calcularPhReal,
  calcularTempos,
  consumoTeorico,
  granularidadePadrao,
  montarBloqueios,
  montarLinhaTempo,
  producaoEsperada,
  validarBloqueios,
  validarLinhaTempo,
  type EventoTempo,
  type FatoProducao,
} from './indicadores.js';

const H = 3_600_000;
const h = (horas: number) => horas * H; // instantes relativos para facilitar a leitura

describe('RN-05 — linha do tempo da máquina', () => {
  it('aceita início → parada → reinício → saída → fim', () => {
    const ev: EventoTempo[] = [
      { tipo: 'INICIO_MAQUINA', hora: h(0) },
      { tipo: 'PARADA', hora: h(2) },
      { tipo: 'REINICIO', hora: h(3) },
      { tipo: 'SAIDA_PRODUCAO', hora: h(4) },
      { tipo: 'FIM_MAQUINA', hora: h(8) },
    ];
    expect(validarLinhaTempo(ev)).toBeNull();
  });
  it('recusa saída de produção dentro do intervalo parado', () => {
    const ev: EventoTempo[] = [
      { tipo: 'INICIO_MAQUINA', hora: h(0) },
      { tipo: 'PARADA', hora: h(2) },
      { tipo: 'SAIDA_PRODUCAO', hora: h(2.5) },
      { tipo: 'REINICIO', hora: h(3) },
    ];
    expect(validarLinhaTempo(ev)).toMatch(/parada/);
  });
  it('recusa paradas sobrepostas e reinício sem parada', () => {
    expect(
      validarLinhaTempo([
        { tipo: 'INICIO_MAQUINA', hora: 0 },
        { tipo: 'PARADA', hora: h(1) },
        { tipo: 'PARADA', hora: h(1.5) },
      ]),
    ).toMatch(/sobrepor/);
    expect(
      validarLinhaTempo([
        { tipo: 'INICIO_MAQUINA', hora: 0 },
        { tipo: 'REINICIO', hora: h(1) },
      ]),
    ).toMatch(/reiniciar/);
  });
  it('eventos no mesmo instante seguem a ordem de registro', () => {
    expect(
      validarLinhaTempo([
        { tipo: 'INICIO_MAQUINA', hora: 0, seq: 1 },
        { tipo: 'PARADA', hora: h(1), seq: 2 },
        { tipo: 'REINICIO', hora: h(1), seq: 3 },
      ]),
    ).toBeNull();
  });
  it('recusa saída com a máquina desligada', () => {
    expect(validarLinhaTempo([{ tipo: 'SAIDA_PRODUCAO', hora: 0 }])).toMatch(/ligada/);
  });
});

describe('Seção 10 — tempos e OEE com valores conhecidos', () => {
  // Turno de 12 h: refeição (programada) 1 h, quebra (não programada) 1,5 h.
  const eventos: EventoTempo[] = [
    { tipo: 'INICIO_MAQUINA', hora: h(0) },
    { tipo: 'PARADA', hora: h(4), programada: true },
    { tipo: 'REINICIO', hora: h(5) },
    { tipo: 'PARADA', hora: h(8), programada: false },
    { tipo: 'REINICIO', hora: h(9.5) },
  ];
  const { ligados, paradas } = montarLinhaTempo(eventos, h(12));
  const tempos = calcularTempos(ligados, paradas);

  it('tempo ligado, planejado e produzindo', () => {
    expect(tempos.ligadoMs).toBe(h(12));
    expect(tempos.planejadoMs).toBe(h(11));
    expect(tempos.produzindoMs).toBe(h(9.5));
    expect(tempos.produzindo).toEqual([
      { inicio: h(0), fim: h(4) },
      { inicio: h(5), fim: h(8) },
      { inicio: h(9.5), fim: h(12) },
    ]);
  });

  it('produção esperada sem bloqueio = horas produzindo × PH', () => {
    expect(producaoEsperada({ produzindo: tempos.produzindo, ph: 60, cavidadesOp: [1], bloqueios: [] })).toBe(
      570,
    );
  });

  it('cavidade bloqueada reduz a produção esperada na proporção das cavidades ativas', () => {
    // OP com 2 cavidades; cavidade 2 bloqueada das 5 h às 8 h (3 h produzindo com metade das cavidades).
    const bloqueios = montarBloqueios(
      [
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 2, hora: h(5) },
        { tipo: 'DESBLOQUEIO_CAVIDADE', cavidade: 2, hora: h(8) },
      ],
      h(12),
    );
    const semBloqueio = producaoEsperada({
      produzindo: tempos.produzindo,
      ph: 240,
      cavidadesOp: [1, 2],
      bloqueios: [],
    });
    const comBloqueio = producaoEsperada({
      produzindo: tempos.produzindo,
      ph: 240,
      cavidadesOp: [1, 2],
      bloqueios,
    });
    expect(semBloqueio).toBe(2280);
    expect(comBloqueio).toBe(2280 - 3 * 240 * 0.5);
    // Bloqueio de cavidade de outra OP não afeta.
    expect(producaoEsperada({ produzindo: tempos.produzindo, ph: 60, cavidadesOp: [3], bloqueios })).toBe(
      570,
    );
  });

  it('OEE da rodada com 3 OPs (somando as OPs) e PH real', () => {
    // 3 OPs de 1 cavidade cada, PH 60 cada → esperada 570 por OP = 1710.
    const esperada =
      3 * producaoEsperada({ produzindo: tempos.produzindo, ph: 60, cavidadesOp: [1], bloqueios: [] });
    const oee = calcularOee({
      planejadoMs: tempos.planejadoMs,
      produzindoMs: tempos.produzindoMs,
      producaoEsperada: esperada,
      boas: 1500,
      refugadas: 39,
    });
    expect(oee.disponibilidade).toBeCloseTo(9.5 / 11, 10);
    expect(oee.performance).toBeCloseTo(1539 / 1710, 10);
    expect(oee.qualidade).toBeCloseTo(1500 / 1539, 10);
    expect(oee.oee).toBeCloseTo((9.5 / 11) * (1539 / 1710) * (1500 / 1539), 10);
    expect(oee.alertaPerformance).toBe(false);
    expect(calcularPhReal(513, tempos.produzindoMs)).toBe(54);
  });

  it('performance acima de 100% gera alerta; sem tempo planejado os fatores ficam nulos', () => {
    expect(
      calcularOee({ planejadoMs: H, produzindoMs: H, producaoEsperada: 60, boas: 70, refugadas: 0 })
        .alertaPerformance,
    ).toBe(true);
    expect(
      calcularOee({ planejadoMs: 0, produzindoMs: 0, producaoEsperada: 0, boas: 0, refugadas: 0 }).oee,
    ).toBeNull();
  });

  it('parada sem reinício termina com o fim da máquina; ligado sem fim termina no fechamento', () => {
    const r = montarLinhaTempo(
      [
        { tipo: 'INICIO_MAQUINA', hora: h(1) },
        { tipo: 'PARADA', hora: h(10), programada: false },
      ],
      h(12),
    );
    expect(r.ligados).toEqual([{ inicio: h(1), fim: h(12) }]);
    expect(r.paradas[0]).toMatchObject({ inicio: h(10), fim: h(12), aberta: true });
  });
});

describe('Bloqueios de cavidade', () => {
  it('valida sequência por cavidade', () => {
    expect(
      validarBloqueios([
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 1, hora: 0 },
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 1, hora: 5 },
      ]),
    ).toMatch(/já está bloqueada/);
    expect(validarBloqueios([{ tipo: 'DESBLOQUEIO_CAVIDADE', cavidade: 2, hora: 0 }])).toMatch(
      /não está bloqueada/,
    );
    expect(
      validarBloqueios([
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 1, hora: 0 },
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 2, hora: 1 },
      ]),
    ).toBeNull();
  });
});

describe('Consumo teórico', () => {
  it('g/peça × peças e percentual sobre kg', () => {
    expect(
      consumoTeorico([{ materialId: 'pp', consumoGPorPeca: 375, percentual: null }], 90, 'PECA', 383),
    ).toEqual([{ materialId: 'pp', kg: 33.75 }]);
    expect(
      consumoTeorico([{ materialId: 'moido', consumoGPorPeca: null, percentual: 98 }], 500, 'KG', null),
    ).toEqual([{ materialId: 'moido', kg: 490 }]);
  });
});

describe('Seção 10 — Fase 5: rodada com várias OPs e cavidade bloqueada, períodos e grupos', () => {
  // Turno de 12 h com refeição (programada, 1 h) e quebra (não programada, 1,5 h): produzindo 9,5 h.
  const { ligados, paradas } = montarLinhaTempo(
    [
      { tipo: 'INICIO_MAQUINA', hora: h(0) },
      { tipo: 'PARADA', hora: h(4), programada: true },
      { tipo: 'REINICIO', hora: h(5) },
      { tipo: 'PARADA', hora: h(8), programada: false },
      { tipo: 'REINICIO', hora: h(9.5) },
    ],
    h(12),
  );
  const tempos = calcularTempos(ligados, paradas);

  it('Disponibilidade, Performance, Qualidade, OEE e PH de uma rodada de 3 OPs com cavidade bloqueada', () => {
    // Molde de 4 cavidades: OP1 cavidades 1 e 2 (PH 120), OP2 cavidade 3 (PH 60), OP3 cavidade 4 (PH 60).
    // Cavidade 2 bloqueada das 5 h às 8 h (3 h produzindo com metade das cavidades da OP1).
    const bloqueios = montarBloqueios(
      [
        { tipo: 'BLOQUEIO_CAVIDADE', cavidade: 2, hora: h(5) },
        { tipo: 'DESBLOQUEIO_CAVIDADE', cavidade: 2, hora: h(8) },
      ],
      h(12),
    );
    const esp = (ph: number, cavidadesOp: number[]) =>
      producaoEsperada({ produzindo: tempos.produzindo, ph, cavidadesOp, bloqueios });
    const op1 = esp(120, [1, 2]);
    const op2 = esp(60, [3]);
    const op3 = esp(60, [4]);
    expect(op1).toBe(9.5 * 120 - 3 * 120 * 0.5); // 960
    expect(op2).toBe(570);
    expect(op3).toBe(570);
    const fatos: FatoProducao[] = [
      { ...tempos, producaoEsperada: op1, boas: 900, refugadas: 20 },
      { ...tempos, producaoEsperada: op2, boas: 500, refugadas: 10 },
      { ...tempos, producaoEsperada: op3, boas: 530, refugadas: 0 },
    ];
    // A rodada é uma máquina: tempo uma vez só, quantidades somadas das OPs.
    const rodada = agregarFatos([
      {
        ...tempos,
        producaoEsperada: op1 + op2 + op3,
        boas: fatos.reduce((s, f) => s + f.boas, 0),
        refugadas: fatos.reduce((s, f) => s + f.refugadas, 0),
      },
    ]);
    expect(rodada.producaoEsperada).toBe(2100);
    expect(rodada.disponibilidade).toBeCloseTo(9.5 / 11, 10);
    expect(rodada.performance).toBeCloseTo(1960 / 2100, 10);
    expect(rodada.qualidade).toBeCloseTo(1930 / 1960, 10);
    expect(rodada.oee).toBeCloseTo((9.5 / 11) * (1960 / 2100) * (1930 / 1960), 10);
    // PH real da OP1 = produção total da OP ÷ horas produzindo da máquina.
    expect(calcularPhReal(920, tempos.produzindoMs)).toBe(96.84);
  });

  it('OEE do mês soma tempos e quantidades; não é a média dos dias', () => {
    const dia1: FatoProducao = {
      ligadoMs: h(12),
      planejadoMs: h(12),
      produzindoMs: h(12),
      producaoEsperada: 1200,
      boas: 1200,
      refugadas: 0,
    }; // OEE 100%
    const dia2: FatoProducao = {
      ligadoMs: h(2),
      planejadoMs: h(2),
      produzindoMs: h(1),
      producaoEsperada: 100,
      boas: 50,
      refugadas: 0,
    }; // Disponibilidade 50%, Performance 50%, OEE 25%
    const d1 = agregarFatos([dia1]);
    const d2 = agregarFatos([dia2]);
    expect(d1.oee).toBe(1);
    expect(d2.oee).toBe(0.25);
    const mes = agregarFatos([dia1, dia2]);
    expect(mes.disponibilidade).toBeCloseTo(13 / 14, 10);
    expect(mes.performance).toBeCloseTo(1250 / 1300, 10);
    expect(mes.qualidade).toBe(1);
    expect(mes.oee).toBeCloseTo((13 / 14) * (1250 / 1300), 10);
    expect(mes.oee).not.toBeCloseTo((d1.oee! + d2.oee!) / 2, 3); // média seria 62,5%
    expect(mes.phReal).toBe(96.15);
    expect(mes.n).toBe(2);
  });

  it('extrusora: mesmas fórmulas em kg e kg/h; agrupamento por chave', () => {
    const fatos = [
      {
        maquina: 'EXT-01',
        ligadoMs: h(8),
        planejadoMs: h(8),
        produzindoMs: h(8),
        producaoEsperada: 800,
        boas: 720,
        refugadas: 0,
      },
      {
        maquina: 'EXT-01',
        ligadoMs: h(8),
        planejadoMs: h(7),
        produzindoMs: h(6),
        producaoEsperada: 600,
        boas: 600,
        refugadas: 0,
      },
      {
        maquina: 'INJ-01',
        ligadoMs: h(1),
        planejadoMs: h(1),
        produzindoMs: h(1),
        producaoEsperada: 60,
        boas: 30,
        refugadas: 0,
      },
    ];
    const g = agregarPor(fatos, (f) => f.maquina);
    const ext = g.get('EXT-01')!;
    expect(ext.itens).toHaveLength(2);
    expect(ext.phReal).toBe(94.29); // 1320 kg ÷ 14 h
    expect(ext.disponibilidade).toBeCloseTo(14 / 15, 10);
    expect(ext.performance).toBeCloseTo(1320 / 1400, 10);
    expect(g.get('INJ-01')!.performance).toBe(0.5);
  });

  it('granularidade da evolução: por dia até 62 dias, por mês acima', () => {
    expect(granularidadePadrao('2026-11-01', '2026-11-30')).toBe('DIA');
    expect(granularidadePadrao('2026-01-01', '2026-03-03')).toBe('DIA');
    expect(granularidadePadrao('2026-01-01', '2026-03-04')).toBe('MES');
    expect(granularidadePadrao('2026-01-01', '2026-12-31')).toBe('MES');
  });
});
