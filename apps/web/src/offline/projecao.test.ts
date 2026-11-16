import { describe, expect, it } from 'vitest';
import type { ItemFila } from './db';
import type { Pacote } from './pacote';
import { projetarTurno } from './projecao';

const ids = {
  turno: 't1',
  maquina: 'm1',
  rodada: 'r1',
  op: 'op1',
  ordem: 'o1',
  divisao: 'd1',
  conjunto: 'c1',
  motivo: 'mot1',
  horario: 'h1',
  equipe: 'e1',
};
const pacote = {
  usuario: { id: 'u1', nome: 'Marina', login: 'marina' },
  parametros: { toleranciaHorarioMin: 10, tamanhoBloco: 1000 },
  horarios: [
    { id: ids.horario, nome: 'Dia', horaInicio: '07:00', horaFim: '19:00', paradaProgramadaPrevistaMin: 60 },
  ],
  equipes: [{ id: ids.equipe, letra: 'A' }],
  motivos: [{ id: ids.motivo, codigo: 'MEC', descricao: 'Quebra mecânica', programada: false }],
  tiposPerda: [],
  conjuntos: [{ id: ids.conjunto, produtoId: 'p1', quantidade: 30, tipoEmbalagem: 'PALLET', ativo: true }],
  ordens: [{ id: ids.ordem, produzido: 100, ultimoSequencial: 2, saldoSoltoPendente: 0 }],
  lotes: [],
  maquinas: [
    {
      maquina: { id: ids.maquina, codigo: 'INJ-01', descricao: 'Injetora', tipo: 'INJETORA' },
      rodadas: [
        {
          id: ids.rodada,
          numero: 1,
          situacao: 'EM_ANDAMENTO',
          maquinaId: ids.maquina,
          molde: { codigo: 'MOL', numeroCavidades: 1 },
          ops: [
            {
              id: ids.op,
              ordemId: ids.ordem,
              cavidades: [1],
              ordem: {
                id: ids.ordem,
                numeroErp: '045',
                numeroInterno: 1,
                quantidade: 3000,
                unidade: 'PECA',
                situacao: 'EM_PRODUCAO',
                produto: { id: 'p1', codigo: 'CAD-0031', descricao: 'Cadeira', unidade: 'PECA' },
              },
              fichaTecnica: { versao: 1, phPadrao: 60, pesoPadraoG: 384, toleranciaPesoPct: 3, cavidades: 1 },
            },
          ],
        },
      ],
      ocupadaPor: null,
      sugestaoInicio: null,
      sugestaoParadaMotivoId: null,
      rodadaAnteriorId: null,
    },
  ],
} as unknown as Pacote;

let seq = 0;
const item = (
  tipo: ItemFila['tipo'],
  corpo: Record<string, unknown>,
  hora: string,
  local?: Record<string, unknown>,
): ItemFila => ({
  id: `i${++seq}`,
  seq,
  tipo,
  rota: '/x',
  corpo,
  turnoId: ids.turno,
  usuarioId: 'u1',
  posto: null,
  horaRegistro: hora,
  tentativas: 0,
  local,
});

describe('Seção 11 — turno projetado no tablet (cópia do servidor + fila)', () => {
  const itens = [
    item(
      'ABRIR_TURNO',
      {
        id: ids.turno,
        data: '2026-11-16',
        horarioTurnoId: ids.horario,
        equipeId: ids.equipe,
        abertoEm: '2026-11-16T10:00:00Z',
      },
      '2026-11-16T10:00:00Z',
    ),
    item(
      'LIGAR_MAQUINA',
      {
        eventoId: 'ev-ini',
        maquinaId: ids.maquina,
        rodadaId: ids.rodada,
        horaOcorrencia: '2026-11-16T10:05:00Z',
        iniciarParadaMotivoId: null,
      },
      '2026-11-16T10:05:00Z',
    ),
    item(
      'CRIAR_DIVISAO',
      { id: ids.divisao, rodadaOpId: ids.op, maquinaId: ids.maquina, horasDisponiveis: 11 },
      '2026-11-16T10:06:00Z',
      { codigo: '045-03', meta: 660 },
    ),
    item(
      'EVENTO',
      {
        id: 'ev-s',
        tipo: 'SAIDA_PRODUCAO',
        maquinaId: ids.maquina,
        divisaoId: ids.divisao,
        horaOcorrencia: '2026-11-16T11:00:00Z',
        conjuntoPadraoId: ids.conjunto,
        conjuntosPadrao: 2,
        avulsos: [],
        pesoMedioG: 420,
      },
      '2026-11-16T11:00:00Z',
    ),
    item(
      'EVENTO',
      {
        id: 'ev-p',
        tipo: 'PARADA',
        maquinaId: ids.maquina,
        horaOcorrencia: '2026-11-16T12:00:00Z',
        motivoParadaId: ids.motivo,
      },
      '2026-11-16T12:30:00Z',
    ),
  ];

  it('turno aberto offline: máquina, divisão provisória, produção e estado recalculado', () => {
    const t = projetarTurno(null, itens, pacote)!;
    expect(t).toMatchObject({
      id: ids.turno,
      situacao: 'ABERTO',
      equipe: { letra: 'A' },
      horarioTurno: { nome: 'Dia' },
    });
    expect(t.inicioNominal).toBe('2026-11-16T10:00:00.000Z'); // 07:00 em São Paulo
    const m = t.maquinas[0];
    expect(m.divisoes[0]).toMatchObject({ codigo: '045-03', meta: 660, etiquetado: 60, producaoOp: 160 });
    expect(m.estado).toMatchObject({
      situacao: 'PARADA',
      desde: '2026-11-16T12:00:00.000Z',
      motivoParada: { codigo: 'MEC' },
    });
    expect(t.eventos.map((e) => e.tipo)).toEqual(['PARADA', 'SAIDA_PRODUCAO', 'INICIO_MAQUINA']);
    expect(t.eventos.every((e) => e.pendenteEnvio)).toBe(true);
    const saida = t.eventos.find((e) => e.tipo === 'SAIDA_PRODUCAO')!;
    expect(saida.resumo).toContain('2 conjunto(s), 60 pç');
    expect(saida.pesoNaoConforme).toBe(true); // 420 g contra 384 g ± 3%
    // Registrada 30 min depois da ocorrência: marca de retroativo, como no servidor.
    expect(t.eventos.find((e) => e.tipo === 'PARADA')!.marcaHorario).toBe('RETROATIVO');
  });

  it('fechamento na fila deixa o turno fechado; sem abertura nem cópia, não há turno', () => {
    const t = projetarTurno(
      null,
      [...itens, item('FECHAR_TURNO', { horaFechamento: '2026-11-16T19:00:00Z' }, '2026-11-16T19:00:00Z')],
      pacote,
    )!;
    expect(t).toMatchObject({ situacao: 'FECHADO', fechadoEm: '2026-11-16T19:00:00Z' });
    expect(projetarTurno(null, [], pacote)).toBeNull();
  });
});
