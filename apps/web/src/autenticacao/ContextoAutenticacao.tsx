import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { temPermissao, type Perfil, type Permissao } from '@apontamento/shared';
import { api, definirAoExpirarSessao, tokens } from '../api/cliente';

export interface UsuarioLogado {
  id: string;
  nome: string;
  login: string;
  perfis: Perfil[];
  deveTrocarSenha: boolean;
}

interface ValorContexto {
  usuario: UsuarioLogado | null;
  carregando: boolean;
  entrar(login: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  recarregar(): Promise<void>;
  pode(permissao: Permissao): boolean;
}

const Contexto = createContext<ValorContexto | null>(null);

export function ProvedorAutenticacao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!tokens.acesso()) {
      setUsuario(null);
      return;
    }
    try {
      setUsuario(await api.get<UsuarioLogado>('/autenticacao/eu'));
    } catch {
      tokens.limpar();
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    definirAoExpirarSessao(() => setUsuario(null));
    recarregar().finally(() => setCarregando(false));
  }, [recarregar]);

  const entrar = useCallback(async (login: string, senha: string) => {
    const r = await api.post<{ tokenAcesso: string; tokenRenovacao: string; usuario: UsuarioLogado }>(
      '/autenticacao/entrar',
      { login, senha },
    );
    tokens.salvar(r.tokenAcesso, r.tokenRenovacao);
    setUsuario(r.usuario);
  }, []);

  const sair = useCallback(async () => {
    const renovacao = tokens.renovacao();
    if (renovacao) await api.post('/autenticacao/sair', { tokenRenovacao: renovacao }).catch(() => undefined);
    tokens.limpar();
    setUsuario(null);
  }, []);

  const valor = useMemo<ValorContexto>(
    () => ({
      usuario,
      carregando,
      entrar,
      sair,
      recarregar,
      pode: (p) => temPermissao(usuario?.perfis, p),
    }),
    [usuario, carregando, entrar, sair, recarregar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAutenticacao(): ValorContexto {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAutenticacao fora do ProvedorAutenticacao');
  return v;
}
