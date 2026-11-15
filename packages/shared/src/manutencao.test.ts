import { describe, expect, it } from 'vitest';
import {
  etapaLiberada,
  etapasFinalizadas,
  horasPorEspecialidade,
  podeExecutarEtapa,
  situacaoExibida,
  tempoAteAtendimentoMs,
  tempoReparoMs,
  type EtapaRegra,
} from './manutencao.js';
import { esquemaConverterOs, esquemaSolicitacaoManual } from './esquemas-manutencao.js';

const H = 3_600_000;
const t = (h: number) => new Date(Date.UTC(2026, 10, 15, 8) + h * H);
const etapa = (
  id: string,
  ordem: number,
  especialidade: EtapaRegra['especialidade'],
  extra: Partial<EtapaRegra> = {},
): EtapaRegra => ({
  id,
  ordem,
  especialidade,
  situacao: 'PENDENTE',
  responsavelId: null,
  ...extra,
});

describe('RN-14 — sequência de etapas da OS (mesma ordem = em paralelo)', () => {
  // Troca de câmara quente.
  const base = () => [
    etapa('retirar', 1, 'SETUP'),
    etapa('abrir', 2, 'FERRAMENTARIA'),
    etapa('avaliar', 3, 'ELETRICA'),
    etapa('oleo', 4, 'MECANICA'),
    etapa('camara', 4, 'ELETRICA'),
    etapa('limpar', 5, 'FERRAMENTARIA'),
  ];

  it('só a primeira ordem começa liberada', () => {
    const e = base();
    expect(e.map((x) => situacaoExibida(x, e))).toEqual([
      'LIBERADA',
      'AGUARDANDO',
      'AGUARDANDO',
      'AGUARDANDO',
      'AGUARDANDO',
      'AGUARDANDO',
    ]);
  });

  it('etapas paralelas são liberadas juntas e a seguinte espera as duas', () => {
    const e = base();
    for (const id of ['retirar', 'abrir', 'avaliar']) e.find((x) => x.id === id)!.situacao = 'CONCLUIDA';
    expect(etapaLiberada(e[3], e)).toBe(true);
    expect(etapaLiberada(e[4], e)).toBe(true);
    expect(etapaLiberada(e[5], e)).toBe(false);
    e[3].situacao = 'CONCLUIDA';
    expect(etapaLiberada(e[5], e)).toBe(false);
    e[4].situacao = 'CANCELADA';
    expect(etapaLiberada(e[5], e)).toBe(true);
    expect(etapasFinalizadas(e)).toBe(false);
    e[5].situacao = 'CONCLUIDA';
    expect(etapasFinalizadas(e)).toBe(true);
  });

  it('só canceladas não contam como finalizadas', () => {
    expect(etapasFinalizadas([etapa('a', 1, 'SETUP', { situacao: 'CANCELADA' })])).toBe(false);
    expect(etapasFinalizadas([])).toBe(false);
  });
});

describe('RN-14 — quem executa a etapa', () => {
  const tecnico = { id: 'u1', especialidades: ['ELETRICA', 'HIDRAULICA'], controladorManutencao: false };
  it('técnico da especialidade, sem responsável definido ou sendo o responsável', () => {
    expect(podeExecutarEtapa({ especialidade: 'ELETRICA', responsavelId: null }, tecnico)).toBe(true);
    expect(podeExecutarEtapa({ especialidade: 'ELETRICA', responsavelId: 'u1' }, tecnico)).toBe(true);
    expect(podeExecutarEtapa({ especialidade: 'ELETRICA', responsavelId: 'u2' }, tecnico)).toBe(false);
    expect(podeExecutarEtapa({ especialidade: 'MECANICA', responsavelId: null }, tecnico)).toBe(false);
  });
  it('controlador executa qualquer etapa', () => {
    expect(
      podeExecutarEtapa(
        { especialidade: 'SETUP', responsavelId: 'u9' },
        { id: 'c', especialidades: [], controladorManutencao: true },
      ),
    ).toBe(true);
  });
});

describe('RN-14 — indicadores do módulo', () => {
  const etapas: EtapaRegra[] = [
    etapa('a', 1, 'SETUP', { situacao: 'CONCLUIDA', inicio: t(1), fim: t(1.5) }),
    etapa('b', 2, 'MECANICA', { situacao: 'CONCLUIDA', inicio: t(1.5), fim: t(3.5) }),
    etapa('c', 2, 'ELETRICA', { situacao: 'CONCLUIDA', inicio: t(1.5), fim: t(4) }),
    etapa('d', 3, 'SETUP', { situacao: 'CANCELADA' }),
  ];
  it('tempo até o atendimento: da parada ao início da primeira etapa', () => {
    expect(tempoAteAtendimentoMs(t(0), etapas)).toBe(1 * H);
    expect(tempoAteAtendimentoMs(t(0), [etapa('x', 1, 'SETUP')])).toBeNull();
  });
  it('tempo de reparo: do início da primeira etapa ao fim da última; só com tudo finalizado', () => {
    expect(tempoReparoMs(etapas)).toBe(3 * H);
    expect(
      tempoReparoMs([...etapas, etapa('e', 4, 'SETUP', { situacao: 'EM_EXECUCAO', inicio: t(4) })]),
    ).toBeNull();
  });
  it('horas por especialidade somam as etapas concluídas', () => {
    expect(horasPorEspecialidade(etapas)).toEqual({ SETUP: 0.5, MECANICA: 2, ELETRICA: 2.5 });
  });
});

describe('Esquemas de manutenção', () => {
  it('solicitação manual exige máquina ou local', () => {
    expect(esquemaSolicitacaoManual.safeParse({ descricao: 'Goteira no telhado' }).success).toBe(false);
    expect(
      esquemaSolicitacaoManual.safeParse({ local: 'Galpão 2', descricao: 'Goteira no telhado' }).success,
    ).toBe(true);
  });
  it('OS exige ao menos uma etapa com especialidade', () => {
    expect(esquemaConverterOs.safeParse({ tipo: 'CORRETIVA', etapas: [] }).success).toBe(false);
    expect(
      esquemaConverterOs.safeParse({
        tipo: 'CORRETIVA',
        etapas: [{ ordem: 1, descricao: 'Retirar molde', especialidade: 'SETUP' }],
      }).success,
    ).toBe(true);
  });
});
