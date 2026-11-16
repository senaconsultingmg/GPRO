import Dexie, { type Table } from 'dexie';
import type { EtiquetaImpressao } from '@apontamento/shared';

/** Tipos de item da fila de envio (seção 11): cada um vira uma requisição à API, na ordem. */
export type TipoItemFila = 'ABRIR_TURNO' | 'LIGAR_MAQUINA' | 'CRIAR_DIVISAO' | 'EVENTO' | 'FECHAR_TURNO';

export interface ItemFila {
  /** Identificador único gerado no tablet (o servidor ignora repetições). */
  id: string;
  /** Ordem de envio. */
  seq: number;
  tipo: TipoItemFila;
  rota: string;
  corpo: Record<string, unknown>;
  turnoId: string;
  usuarioId: string;
  /** Posto (dispositivo do cadastro) usado nas etiquetas. */
  posto: string | null;
  /** Hora do registro no relógio do tablet. */
  horaRegistro: string;
  tentativas: number;
  ultimoErro?: string | null;
  /** Dados só para a tela (código provisório da divisão, resumo do lançamento etc.). */
  local?: Record<string, unknown>;
}

/** Etiqueta emitida pelo tablet (com o número do bloco reservado), para imprimir e reimprimir offline. */
export interface EtiquetaLocal extends EtiquetaImpressao {
  /** Item da fila (lançamento) que gerou a etiqueta. */
  itemId: string;
  tipo: string;
  impressa: boolean;
}

/** Resultado de impressão feita offline, a informar ao servidor depois que o lançamento subir. */
export interface ImpressaoLocal {
  id: string;
  itemId: string;
  codigo: string;
  layoutId: string | null;
  impressoraId: string | null;
  sucesso: boolean;
  mensagem: string | null;
  em: string;
}

export interface Chave {
  chave: string;
  valor: unknown;
  atualizadoEm: string;
}

class BancoLocal extends Dexie {
  chaves!: Table<Chave, string>;
  fila!: Table<ItemFila, string>;
  etiquetas!: Table<EtiquetaLocal, string>;
  impressoes!: Table<ImpressaoLocal, string>;

  constructor() {
    super('apontamento');
    this.version(1).stores({
      chaves: 'chave',
      fila: 'id, seq, turnoId, usuarioId',
      etiquetas: 'codigo, itemId',
      impressoes: 'id, itemId',
    });
  }
}

export const banco = new BancoLocal();

export async function lerChave<T>(chave: string): Promise<T | undefined> {
  try {
    return (await banco.chaves.get(chave))?.valor as T | undefined;
  } catch {
    return undefined;
  }
}

export async function gravarChave(chave: string, valor: unknown): Promise<void> {
  try {
    await banco.chaves.put({ chave, valor, atualizadoEm: new Date().toISOString() });
  } catch {
    /* armazenamento indisponível: segue sem cache */
  }
}
