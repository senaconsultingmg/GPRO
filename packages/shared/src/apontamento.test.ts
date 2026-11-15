import { describe, expect, it } from 'vitest';
import {
  avaliarPeso,
  calcularMeta,
  codigoDivisao,
  horasDisponiveisSugeridas,
  marcaHorario,
  montarConjuntos,
  periodoValidoTurno,
  producaoDoTurno,
} from './apontamento.js';
import { horarioVigente, instanteLocal, periodoNominal } from './tempo.js';

const t = (iso: string) => new Date(iso);

describe('RN-08 — hora da ocorrência × hora do registro', () => {
  const registro = t('2026-11-16T13:00:00Z');
  it('dentro da tolerância é "no momento"', () => {
    expect(marcaHorario(t('2026-11-16T12:50:00Z'), registro, 10)).toBe('NO_MOMENTO');
    expect(marcaHorario(t('2026-11-16T13:10:00Z'), registro, 10)).toBe('NO_MOMENTO');
  });
  it('acima da tolerância marca retroativo ou antecipado', () => {
    expect(marcaHorario(t('2026-11-16T12:49:00Z'), registro, 10)).toBe('RETROATIVO');
    expect(marcaHorario(t('2026-11-16T13:11:00Z'), registro, 10)).toBe('ANTECIPADO');
  });
  it('tolerância é parametrizável', () => {
    expect(marcaHorario(t('2026-11-16T12:45:00Z'), registro, 15)).toBe('NO_MOMENTO');
  });
  it('período válido vai do início nominal (ou abertura antecipada) ao fim nominal ou fechamento real', () => {
    const base = { inicioNominal: t('2026-11-16T10:00:00Z'), fimNominal: t('2026-11-16T22:00:00Z') };
    expect(
      periodoValidoTurno({ ...base, abertoEm: t('2026-11-16T09:50:00Z'), agora: t('2026-11-16T12:00:00Z') }),
    ).toEqual({
      inicio: t('2026-11-16T09:50:00Z'),
      fim: t('2026-11-16T22:00:00Z'),
    });
    expect(
      periodoValidoTurno({
        ...base,
        abertoEm: t('2026-11-16T10:05:00Z'),
        fechadoEm: t('2026-11-16T22:20:00Z'),
        agora: t('2026-11-17T01:00:00Z'),
      }),
    ).toEqual({ inicio: t('2026-11-16T10:00:00Z'), fim: t('2026-11-16T22:20:00Z') });
  });
});

describe('RN-07 — conferência de peso', () => {
  it('dentro da tolerância é conforme', () => {
    expect(avaliarPeso(390, 383.33, 3)).toEqual({ naoConforme: false, desvioPct: 1.74 });
  });
  it('acima da tolerância (para mais ou para menos) é NC', () => {
    expect(avaliarPeso(400, 383.33, 3).naoConforme).toBe(true);
    expect(avaliarPeso(370, 383.33, 3)).toEqual({ naoConforme: true, desvioPct: -3.48 });
  });
  it('sem peso padrão na ficha não há conferência', () => {
    expect(avaliarPeso(100, null, 3)).toEqual({ naoConforme: false, desvioPct: null });
  });
});

describe('RN-04 — divisão da OP e meta', () => {
  it('código: número do ERP + sequencial com 2 dígitos', () => {
    expect(codigoDivisao('04508401001', 2)).toBe('04508401001-02');
    expect(codigoDivisao('17', 11)).toBe('17-11');
  });
  it('horas disponíveis: duração do turno − paradas programadas previstas', () => {
    const p = {
      inicioNominal: t('2026-11-16T10:00:00Z'),
      fimNominal: t('2026-11-16T22:00:00Z'),
      paradaProgramadaPrevistaMin: 60,
    };
    expect(horasDisponiveisSugeridas({ ...p, inicioMaquina: t('2026-11-16T10:00:00Z') })).toBe(11);
    expect(horasDisponiveisSugeridas({ ...p, inicioMaquina: t('2026-11-16T09:30:00Z') })).toBe(11);
    // Máquina ligada no meio do turno.
    expect(horasDisponiveisSugeridas({ ...p, inicioMaquina: t('2026-11-16T16:30:00Z') })).toBe(4.5);
    expect(horasDisponiveisSugeridas({ ...p, inicioMaquina: t('2026-11-16T21:30:00Z') })).toBe(0);
  });
  it('meta = horas × PH, limitada ao saldo da OP', () => {
    expect(calcularMeta(11, 60, 3000, 'PECA')).toBe(660);
    expect(calcularMeta(11, 60, 500, 'PECA')).toBe(500);
    expect(calcularMeta(10.5, 65.45, 3000, 'PECA')).toBe(687);
    expect(calcularMeta(11, 100, 5000, 'KG')).toBe(1100);
    expect(calcularMeta(8, 60, -20, 'PECA')).toBe(0);
  });
});

describe('RN-06 — conjuntos, avulsos e produção do turno', () => {
  it('3 conjuntos de 30 = 90 peças e 3 conjuntos numerados', () => {
    const r = montarConjuntos(30, 3, []);
    expect(r.total).toBe(90);
    expect(r.conjuntos).toEqual([
      { numero: 1, quantidade: 30, avulso: false },
      { numero: 2, quantidade: 30, avulso: false },
      { numero: 3, quantidade: 30, avulso: false },
    ]);
  });
  it('conjunto avulso tem quantidade diferente do padrão', () => {
    const r = montarConjuntos(30, 1, [18]);
    expect(r.total).toBe(48);
    expect(r.conjuntos[1]).toEqual({ numero: 2, quantidade: 18, avulso: true });
    expect(() => montarConjuntos(30, 0, [30])).toThrow(/diferente do padrão/);
    expect(() => montarConjuntos(30, 0, [])).toThrow(/ao menos um/);
  });
  it('produção = etiquetado + saldo deixado − saldo recebido', () => {
    expect(producaoDoTurno(90, 12, 0)).toBe(102);
    expect(producaoDoTurno(60, 5, 12)).toBe(53);
  });
});

describe('Fuso e período do turno', () => {
  it('hora local de São Paulo (UTC−3) vira instante UTC', () => {
    expect(instanteLocal('2026-11-16', '07:00').toISOString()).toBe('2026-11-16T10:00:00.000Z');
  });
  it('turno da noite termina no dia seguinte', () => {
    const p = periodoNominal('2026-11-16', '19:00', '07:00');
    expect(p.inicio.toISOString()).toBe('2026-11-16T22:00:00.000Z');
    expect(p.fim.toISOString()).toBe('2026-11-17T10:00:00.000Z');
  });
  it('horário vigente considera o turno da noite iniciado na véspera', () => {
    const horarios = [
      { nome: 'Dia', horaInicio: '07:00', horaFim: '19:00', diasSemana: [0, 1, 2, 3, 4, 5, 6] },
      { nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', diasSemana: [0, 1, 2, 3, 4, 5, 6] },
    ];
    expect(horarioVigente(horarios, t('2026-11-17T05:00:00Z'))).toMatchObject({
      data: '2026-11-16',
      horario: { nome: 'Noite' },
    });
    expect(horarioVigente(horarios, t('2026-11-17T12:00:00Z'))).toMatchObject({
      data: '2026-11-17',
      horario: { nome: 'Dia' },
    });
  });
});
