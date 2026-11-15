import { useState } from 'react';
import { Alert, Button, Group, Modal, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { esquemaTrocaSenha } from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, errosApiPorCampo, errosZod, notificarSucesso } from '../componentes/utilitarios';

/** Troca de senha. Quando obrigatória (senha inicial), a janela não pode ser fechada. */
export function ModalTrocarSenha({
  aberto,
  obrigatoria,
  aoFechar,
}: {
  aberto: boolean;
  obrigatoria: boolean;
  aoFechar: () => void;
}) {
  const { recarregar, sair } = useAutenticacao();
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const form = useForm({
    initialValues: { senhaAtual: '', novaSenha: '', confirmacao: '' },
    validate: (v) => {
      const e = errosZod(esquemaTrocaSenha, v);
      if (v.novaSenha !== v.confirmacao) e.confirmacao = 'A confirmação não confere.';
      return e;
    },
  });
  const enviar = form.onSubmit(async (v) => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post('/autenticacao/trocar-senha', { senhaAtual: v.senhaAtual, novaSenha: v.novaSenha });
      notificarSucesso('Senha alterada.');
      form.reset();
      await recarregar();
      aoFechar();
    } catch (e) {
      setErro(e);
      form.setErrors(errosApiPorCampo(e));
    } finally {
      setEnviando(false);
    }
  });
  return (
    <Modal
      opened={aberto}
      onClose={aoFechar}
      title="Trocar senha"
      closeOnClickOutside={!obrigatoria}
      closeOnEscape={!obrigatoria}
      withCloseButton={!obrigatoria}
    >
      <form onSubmit={enviar}>
        <Stack>
          {obrigatoria && (
            <Alert color="yellow">
              Você está usando uma senha inicial. Defina uma nova senha para continuar.
            </Alert>
          )}
          <PasswordInput
            label="Senha atual"
            autoComplete="current-password"
            {...form.getInputProps('senhaAtual')}
          />
          <PasswordInput
            label="Nova senha"
            description="Mínimo de 8 caracteres."
            autoComplete="new-password"
            {...form.getInputProps('novaSenha')}
          />
          <PasswordInput
            label="Confirme a nova senha"
            autoComplete="new-password"
            {...form.getInputProps('confirmacao')}
          />
          <AlertaErroApi erro={erro} />
          <Group justify="flex-end">
            {obrigatoria ? (
              <Button variant="default" onClick={() => sair()}>
                Sair
              </Button>
            ) : (
              <Button variant="default" onClick={aoFechar}>
                Cancelar
              </Button>
            )}
            <Button type="submit" loading={enviando}>
              Salvar nova senha
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
