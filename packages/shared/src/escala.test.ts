import { describe, expect, it } from 'vitest';
import { diaDaSemana, duracaoTurnoMinutos, gerarEscalaCentral, gerarEscalaRevezamento } from './escala.js';

describe('Escala', () => {
  it('12x36 com 4 equipes: A/B no 1º dia, C/D no 2º, e repete', () => {
    const linhas = gerarEscalaRevezamento({
      dataInicial: '2026-11-01',
      dataFinal: '2026-11-04',
      ciclo: [
        [
          { horarioTurnoId: 'dia', equipeId: 'A' },
          { horarioTurnoId: 'noite', equipeId: 'B' },
        ],
        [
          { horarioTurnoId: 'dia', equipeId: 'C' },
          { horarioTurnoId: 'noite', equipeId: 'D' },
        ],
      ],
    });
    expect(linhas.map((l) => `${l.data.slice(8)}:${l.horarioTurnoId}:${l.equipeId}`)).toEqual([
      '01:dia:A',
      '01:noite:B',
      '02:dia:C',
      '02:noite:D',
      '03:dia:A',
      '03:noite:B',
      '04:dia:C',
      '04:noite:D',
    ]);
  });

  it('cada equipe trabalha 12 h e folga 36 h (uma vez a cada 48 h)', () => {
    const linhas = gerarEscalaRevezamento({
      dataInicial: '2026-02-27',
      dataFinal: '2026-03-02',
      ciclo: [
        [
          { horarioTurnoId: 'dia', equipeId: 'A' },
          { horarioTurnoId: 'noite', equipeId: 'B' },
        ],
        [
          { horarioTurnoId: 'dia', equipeId: 'C' },
          { horarioTurnoId: 'noite', equipeId: 'D' },
        ],
      ],
    });
    expect(linhas.filter((l) => l.equipeId === 'A').map((l) => l.data)).toEqual(['2026-02-27', '2026-03-01']);
  });

  it('horário central somente nos dias da semana do horário (seg a sex)', () => {
    const linhas = gerarEscalaCentral({
      dataInicial: '2026-11-13', // sexta
      dataFinal: '2026-11-17', // terça
      horarioTurnoId: 'central',
      equipeId: 'ADM',
      diasSemana: [1, 2, 3, 4, 5],
    });
    expect(linhas.map((l) => l.data)).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });

  it('valida período', () => {
    expect(() =>
      gerarEscalaCentral({
        dataInicial: '2026-11-10',
        dataFinal: '2026-11-01',
        horarioTurnoId: 'x',
        equipeId: 'y',
        diasSemana: [1],
      }),
    ).toThrow(/data final/);
    expect(() =>
      gerarEscalaRevezamento({ dataInicial: '2026-02-30', dataFinal: '2026-03-01', ciclo: [[]] }),
    ).toThrow(/inválida/);
  });

  it('dia da semana e duração de turno que atravessa a meia-noite', () => {
    expect(diaDaSemana('2026-11-15')).toBe(0);
    expect(duracaoTurnoMinutos('07:00', '19:00')).toBe(720);
    expect(duracaoTurnoMinutos('19:00', '07:00')).toBe(720);
    expect(duracaoTurnoMinutos('08:00', '17:48')).toBe(588);
  });
});
