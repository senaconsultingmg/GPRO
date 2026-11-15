import { Alert, Badge, List } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ZodType } from 'zod';
import { ErroApi } from '../api/cliente';

/** Converte os erros do Zod em { campo: mensagem } para o formulário. */
export function errosZod(esquema: ZodType, valores: unknown): Record<string, string> {
  const r = esquema.safeParse(valores);
  if (r.success) return {};
  const erros: Record<string, string> = {};
  for (const i of r.error.issues) {
    const campo = i.path.join('.') || '_';
    erros[campo] ??= i.message;
  }
  return erros;
}

/** Converte os detalhes de erro da API em { campo: mensagem }. */
export function errosApiPorCampo(e: unknown): Record<string, string> {
  if (!(e instanceof ErroApi)) return {};
  const r: Record<string, string> = {};
  for (const d of e.detalhes) if (d.campo) r[d.campo] ??= d.mensagem;
  return r;
}

export function notificarErro(e: unknown, titulo = 'Não foi possível concluir'): void {
  notifications.show({
    color: 'red',
    title: titulo,
    message: e instanceof Error ? e.message : String(e),
    autoClose: 8000,
  });
}

export function notificarSucesso(mensagem: string): void {
  notifications.show({ color: 'green', message: mensagem, autoClose: 3000 });
}

/** Mostra a mensagem da API e os detalhes sem campo (ex.: critérios de compatibilidade). */
export function AlertaErroApi({ erro }: { erro: unknown }) {
  if (!erro) return null;
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const detalhes = erro instanceof ErroApi ? erro.detalhes : [];
  return (
    <Alert color="red" icon={<IconAlertTriangle />} title={mensagem}>
      {detalhes.length > 0 && (
        <List size="sm">
          {detalhes.map((d, i) => (
            <List.Item key={i}>{d.mensagem}</List.Item>
          ))}
        </List>
      )}
    </Alert>
  );
}

export function SimNao({ valor }: { valor: boolean }) {
  return valor ? (
    <Badge color="green" variant="light">
      Sim
    </Badge>
  ) : (
    <Badge color="gray" variant="light">
      Não
    </Badge>
  );
}

export function Ativo({ valor }: { valor: boolean }) {
  return valor ? (
    <Badge color="green" variant="light">
      Ativo
    </Badge>
  ) : (
    <Badge color="gray" variant="light">
      Inativo
    </Badge>
  );
}

export const fmtNumero = (n: number | null | undefined, casas = 2) =>
  n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Converte '' (campo numérico vazio) em null. */
export const numeroOuNulo = (v: unknown): number | null =>
  v === '' || v === null || v === undefined ? null : Number(v);
