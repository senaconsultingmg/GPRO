import { describe, expect, it } from 'vitest';
import {
  calcularOee,
  calcularPhReal,
  calcularTempos,
  consumoTeorico,
  montarBloqueios,
  montarLinhaTempo,
  producaoEsperada,
  validarBloqueios,
  validarLinhaTempo,
  type EventoTempo,
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
