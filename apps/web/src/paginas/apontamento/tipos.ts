import type { MarcaHorario, SituacaoTurno, TipoEvento, TipoMaquina, Unidade } from '@apontamento/shared';

export interface OpDaRodada {
  id: string;
  ordemId: string;
  cavidades: number[];
  ordem: {
    id: string;
    numeroErp: string | null;
    numeroInterno: number;
    quantidade: number;
    unidade: Unidade;
    situacao: string;
    produto: { id: string; codigo: string; descricao: string; unidade: Unidade };
  };
  fichaTecnica: {
    versao: number;
    phPadrao: number;
    pesoPadraoG: number | null;
    toleranciaPesoPct: number | null;
    cavidades: number;
  };
}

export interface DivisaoNoTurno {
  id: string;
  codigo: string;
  ordemId: string;
  rodadaOpId: string;
  maquinaId: string;
  meta: number;
  horasDisponiveis: number;
  phReferencia: number;
  etiquetado: number;
  saldoRecebido: number;
  saldoDeixado: number;
  producaoOp: number;
  quantidadeOp: number;
}

export interface MaquinaNoTurno {
  id: string;
  maquinaId: string;
  rodadaId: string;
  segueRodando: boolean;
  maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
  rodada: {
    id: string;
    numero: number;
    situacao: string;
    molde: { codigo: string; numeroCavidades: number } | null;
    ops: OpDaRodada[];
  };
  estado: {
    situacao: 'LIGADA' | 'PARADA' | 'DESLIGADA';
    desde: string | null;
    motivoParada: { codigo: string; descricao: string; programada: boolean } | null;
  };
  cavidadesBloqueadas: { cavidade: number; motivo: string }[];
  divisoes: DivisaoNoTurno[];
}

export interface EventoLista {
  id: string;
  tipo: TipoEvento;
  maquinaId: string;
  divisaoId: string | null;
  horaOcorrencia: string;
  horaRegistro: string;
  marcaHorario: MarcaHorario;
  pesoNaoConforme: boolean;
  situacao: string;
  corrigeEventoId: string | null;
  resumo: string;
  justificativa: string | null;
  dados: Record<string, unknown>;
  usuario: { nome: string };
}

export interface TurnoDetalhe {
  id: string;
  data: string;
  situacao: SituacaoTurno;
  abertoEm: string;
  fechadoEm: string | null;
  inicioNominal: string;
  fimNominal: string;
  apontador: { id: string; nome: string };
  horarioTurno: { nome: string; horaInicio: string; horaFim: string };
  equipe: { letra: string };
  maquinas: MaquinaNoTurno[];
  eventos: EventoLista[];
  pendencias: { id: string; tipo: string; descricao: string }[];
}

/** Valor do campo de hora ("AAAA-MM-DD HH:mm:00") no horário do tablet da fábrica. */
export function paraCampoHora(d: Date | string = new Date()): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}:00`;
}

export const deCampoHora = (v: string) => new Date(v.replace(' ', 'T')).toISOString();
