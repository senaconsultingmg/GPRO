import { useSyncExternalStore } from 'react';

/** Situação da conexão e da fila do tablet, mostrada sempre no topo (seção 11). */
export interface EstadoSincronizacao {
  conectado: boolean;
  pendentes: number;
  enviando: boolean;
  ultimoErro: string | null;
  /** Lançamentos recusados nesta sessão (vão para a lista de recusados). */
  recusados: number;
  /** Última atualização do pacote do tablet e números de etiqueta livres no bloco reservado. */
  pacoteEm: string | null;
  numerosLivres: number | null;
  /** Muda a cada alteração da fila: as telas refazem a projeção do turno. */
  versao: number;
}

let estado: EstadoSincronizacao = {
  conectado: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendentes: 0,
  enviando: false,
  ultimoErro: null,
  recusados: 0,
  pacoteEm: null,
  numerosLivres: null,
  versao: 0,
};
const ouvintes = new Set<() => void>();

export function atualizarEstado(p: Partial<EstadoSincronizacao>) {
  estado = { ...estado, ...p };
  for (const o of ouvintes) o();
}

export const lerEstado = () => estado;

export function useSincronizacao(): EstadoSincronizacao {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => estado,
  );
}
