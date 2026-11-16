import {
  precisaReservar,
  proximasSequencias,
  type BlocoNumeracao,
  type TipoMaquina,
  type Unidade,
} from '@apontamento/shared';
import { api, ErroApi } from '../api/cliente';
import { lerPosto } from '../api/posto';
import { banco, gravarChave, lerChave } from './db';
import { atualizarEstado } from './estado';
import type { OpDaRodada, TurnoDetalhe } from '../paginas/apontamento/tipos';

/** Dados que o tablet baixa para trabalhar sem o servidor (GET /offline/pacote). */
export interface Pacote {
  geradoEm: string;
  usuario: { id: string; nome: string; login: string };
  parametros: { toleranciaHorarioMin: number; tamanhoBloco: number };
  sugestao: { data: string; horarioTurnoId: string | null; equipeId: string | null };
  horarios: {
    id: string;
    nome: string;
    horaInicio: string;
    horaFim: string;
    paradaProgramadaPrevistaMin: number;
  }[];
  equipes: { id: string; letra: string }[];
  motivos: { id: string; codigo: string; descricao: string; programada: boolean }[];
  tiposPerda: { id: string; descricao: string; contaComoRefugo: boolean }[];
  conjuntos: { id: string; produtoId: string; quantidade: number; tipoEmbalagem: string; ativo: boolean }[];
  produtos: {
    id: string;
    codigo: string;
    descricao: string;
    tipo: string;
    unidade: Unidade;
    cor: string | null;
  }[];
  layouts: {
    id: string;
    nome: string;
    tipoEtiqueta: string;
    larguraMm: number;
    alturaMm: number;
    modeloZpl: string;
    impressoraPadraoId: string | null;
  }[];
  impressoras: { id: string; nome: string; enderecoIp: string; porta: number; resolucaoDpi: number }[];
  maquinas: {
    maquina: { id: string; codigo: string; descricao: string; tipo: TipoMaquina };
    rodadas: {
      id: string;
      numero: number;
      situacao: string;
      maquinaId: string;
      molde: { codigo: string; numeroCavidades: number } | null;
      ops: OpDaRodada[];
    }[];
    ocupadaPor: { turnoId: string; apontadorId: string; apontador: string } | null;
    sugestaoInicio: string | null;
    sugestaoParadaMotivoId: string | null;
    rodadaAnteriorId: string | null;
  }[];
  ordens: { id: string; produzido: number; ultimoSequencial: number; saldoSoltoPendente: number }[];
  lotes: {
    id: string;
    numero: string;
    materialId: string;
    material: { id: string; codigo: string; descricao: string; tipo: string };
    saldo: number;
  }[];
  divisoesAbertas: {
    id: string;
    codigo: string;
    maquinaId: string;
    maquina: { codigo: string };
    ordem: { produto: { codigo: string } };
  }[];
  posto: { id: string; prefixo: string; nome: string } | null;
  numeracao: { blocos: BlocoNumeracao[]; ultimaUsadaServidor: number } | null;
  turnoAberto: TurnoDetalhe | null;
}

export const lerPacote = () => lerChave<Pacote>('pacote');

/** Numeração local por posto: blocos reservados e o último número usado neste tablet. */
interface Numeracao {
  blocos: BlocoNumeracao[];
  ultimaUsada: number;
}
const chaveNumeracao = (posto: string) => `numeracao:${posto}`;

async function mesclarNumeracao(posto: string, blocos: BlocoNumeracao[], ultimaServidor: number) {
  await banco.transaction('rw', banco.chaves, async () => {
    const atual = (await lerChave<Numeracao>(chaveNumeracao(posto))) ?? { blocos: [], ultimaUsada: 0 };
    const todos = [...atual.blocos];
    for (const b of blocos)
      if (!todos.some((x) => x.inicio === b.inicio)) todos.push({ inicio: b.inicio, fim: b.fim });
    await gravarChave(chaveNumeracao(posto), {
      blocos: todos,
      ultimaUsada: Math.max(atual.ultimaUsada, ultimaServidor),
    });
  });
}

/** Baixa o pacote e garante números de etiqueta reservados (bloco novo abaixo de 20%). */
export async function atualizarPacote(): Promise<Pacote | null> {
  let pacote: Pacote;
  try {
    pacote = await api.get<Pacote>('/offline/pacote');
  } catch {
    return (await lerPacote()) ?? null;
  }
  await gravarChave('pacote', pacote);
  const posto = lerPosto().postoId;
  if (posto && pacote.posto?.id === posto) {
    await mesclarNumeracao(posto, pacote.numeracao?.blocos ?? [], pacote.numeracao?.ultimaUsadaServidor ?? 0);
    const n = await lerChave<Numeracao>(chaveNumeracao(posto));
    if (!n || precisaReservar(n.blocos, n.ultimaUsada, pacote.parametros.tamanhoBloco)) {
      try {
        const r = await api.post<{ blocos: BlocoNumeracao[]; ultimaUsadaServidor: number }>(
          '/offline/blocos',
          {},
        );
        await mesclarNumeracao(posto, r.blocos, r.ultimaUsadaServidor);
      } catch {
        /* sem conexão: tenta na próxima atualização */
      }
    }
  }
  atualizarEstado({ pacoteEm: pacote.geradoEm, numerosLivres: await numerosLivres() });
  return pacote;
}

/**
 * Próximos números de etiqueta do bloco deste tablet. Sem bloco suficiente, o lançamento com
 * etiqueta não pode ser feito offline (online, o servidor numera).
 */
export async function reservarSequencias(quantidade: number): Promise<number[] | null> {
  const posto = lerPosto().postoId;
  if (!posto || quantidade === 0) return null;
  return banco
    .transaction('rw', banco.chaves, async () => {
      const n = await lerChave<Numeracao>(chaveNumeracao(posto));
      if (!n) return null;
      const seqs = proximasSequencias(n.blocos, n.ultimaUsada, quantidade);
      if (!seqs) return null;
      await gravarChave(chaveNumeracao(posto), { ...n, ultimaUsada: seqs[seqs.length - 1] });
      return seqs;
    })
    .then(async (seqs) => {
      atualizarEstado({ numerosLivres: await numerosLivres() });
      return seqs;
    });
}

export async function numerosLivres(): Promise<number | null> {
  const posto = lerPosto().postoId;
  if (!posto) return null;
  const n = await lerChave<Numeracao>(chaveNumeracao(posto));
  if (!n) return 0;
  return n.blocos.reduce((s, b) => s + Math.max(0, b.fim - Math.max(b.inicio - 1, n.ultimaUsada)), 0);
}

/**
 * Consulta com cópia no tablet: com servidor, atualiza a cópia; sem servidor (falha de rede),
 * devolve a última cópia guardada.
 */
export async function consultarComCache<T>(chave: string, busca: () => Promise<T>): Promise<T> {
  try {
    const r = await busca();
    await gravarChave(`cache:${chave}`, r);
    return r;
  } catch (e) {
    if (e instanceof ErroApi && e.status !== 0) throw e;
    const guardado = await lerChave<T>(`cache:${chave}`);
    if (guardado !== undefined) return guardado;
    throw e;
  }
}

/** Erro de rede (sem servidor), em vez de recusa da API. */
export const semConexao = (e: unknown) => e instanceof ErroApi && e.status === 0;

/** Listas de cadastro que o pacote do tablet traz (quando nunca foram abertas com conexão). */
export async function listaDoPacote(rota: string): Promise<unknown[] | null> {
  const p = await lerPacote();
  if (!p) return null;
  const mapa: Record<string, unknown[]> = {
    'motivos-parada': p.motivos.map((m) => ({ ...m, ativo: true })),
    'tipos-perda': p.tiposPerda.map((t) => ({ ...t, ativo: true })),
    produtos: p.produtos.map((x) => ({ ...x, ativo: true })),
    'conjuntos-padrao': p.conjuntos,
    'horarios-turno': p.horarios.map((h) => ({ ...h, ativo: true })),
    equipes: p.equipes.map((e) => ({ ...e, ativo: true })),
    maquinas: p.maquinas.map((m) => ({ ...m.maquina, ativa: true })),
  };
  return mapa[rota] ?? null;
}

/** Lotes com saldo do pacote, no formato da lista de lotes (leitura de matéria-prima offline). */
export async function lotesDoPacote() {
  const p = await lerPacote();
  return (p?.lotes ?? []).map((l) => ({
    ...l,
    porLocal: [] as { localId: string; local: string; saldo: number }[],
  }));
}
