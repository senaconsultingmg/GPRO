import { ActionIcon, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

export interface ItemParametro {
  nome: string;
  valor: string;
  unidade: string | null;
}

/** Editor de lista { nome, valor, unidade } (parâmetros adicionais e de processo). */
export function ListaParametrosLivres({
  valor,
  aoMudar,
  rotulo,
  somenteLeitura,
  erro,
}: {
  valor: ItemParametro[];
  aoMudar: (v: ItemParametro[]) => void;
  rotulo: string;
  somenteLeitura?: boolean;
  erro?: string;
}) {
  const atualizar = (i: number, campo: keyof ItemParametro, v: string) =>
    aoMudar(valor.map((item, j) => (j === i ? { ...item, [campo]: v } : item)));
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {rotulo}
      </Text>
      {valor.length === 0 && (
        <Text size="sm" c="dimmed">
          Nenhum item.
        </Text>
      )}
      {valor.map((item, i) => (
        <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
          <TextInput
            aria-label="Nome"
            placeholder="Nome"
            value={item.nome}
            onChange={(e) => atualizar(i, 'nome', e.currentTarget.value)}
            readOnly={somenteLeitura}
            style={{ flex: 3 }}
          />
          <TextInput
            aria-label="Valor"
            placeholder="Valor"
            value={item.valor}
            onChange={(e) => atualizar(i, 'valor', e.currentTarget.value)}
            readOnly={somenteLeitura}
            style={{ flex: 2 }}
          />
          <TextInput
            aria-label="Unidade"
            placeholder="Unidade"
            value={item.unidade ?? ''}
            onChange={(e) => atualizar(i, 'unidade', e.currentTarget.value)}
            readOnly={somenteLeitura}
            style={{ flex: 1 }}
          />
          {!somenteLeitura && (
            <ActionIcon
              size="lg"
              color="red"
              variant="subtle"
              aria-label="Remover"
              onClick={() => aoMudar(valor.filter((_, j) => j !== i))}
            >
              <IconTrash size={18} />
            </ActionIcon>
          )}
        </Group>
      ))}
      {erro && (
        <Text size="xs" c="red">
          {erro}
        </Text>
      )}
      {!somenteLeitura && (
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => aoMudar([...valor, { nome: '', valor: '', unidade: null }])}
          w="fit-content"
        >
          Adicionar
        </Button>
      )}
    </Stack>
  );
}
