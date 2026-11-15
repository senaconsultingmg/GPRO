import { useState } from 'react';
import { Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBuildingFactory2 } from '@tabler/icons-react';
import { esquemaLogin } from '@apontamento/shared';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, errosZod } from '../componentes/utilitarios';

export function PaginaLogin() {
  const { entrar } = useAutenticacao();
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const form = useForm({
    initialValues: { login: '', senha: '' },
    validate: (v) => errosZod(esquemaLogin, v),
  });

  const enviar = form.onSubmit(async (v) => {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(v.login, v.senha);
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-gray-1)">
      <Paper withBorder shadow="md" p="xl" radius="md" w="100%" maw={420}>
        <form onSubmit={enviar}>
          <Stack>
            <Stack gap={4} align="center">
              <IconBuildingFactory2 size={48} color="var(--mantine-color-blue-7)" />
              <Title order={2}>Apontamento de Produção</Title>
              <Text c="dimmed" size="sm">
                Entre com seu login e senha
              </Text>
            </Stack>
            <TextInput
              label="Login"
              autoComplete="username"
              autoFocus
              size="lg"
              {...form.getInputProps('login')}
            />
            <PasswordInput
              label="Senha"
              autoComplete="current-password"
              size="lg"
              {...form.getInputProps('senha')}
            />
            <AlertaErroApi erro={erro} />
            <Button type="submit" size="lg" loading={enviando} fullWidth>
              Entrar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
