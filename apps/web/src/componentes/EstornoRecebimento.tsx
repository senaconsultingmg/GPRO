import { useState } from 'react';
import { Alert, Button, Card, Group, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconArrowBackUp, IconBarcode } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/cliente';
import { AlertaErroApi, notificarSucesso } from './utilitarios';

/**
 * Estorno de recebimento (Fase 4): necessário antes de o líder aprovar a correção de um lançamento
 * cuja etiqueta já foi recebida. O recebimento fica registrado como estornado; nada some.
 */
export function EstornoRecebimento({ setor }: { setor: 'estoque' | 'materia-prima' }) {
  const cliente = useQueryClient();
  const [leitura, setLeitura] = useState('');
  const [motivo, setMotivo] = useState('');
  const estornar = useMutation({
    mutationFn: () =>
      api.post<{ codigo: string }>(`/${setor}/estornar`, { leitura: leitura.trim(), motivo: motivo.trim() }),
    onSuccess: (r) => {
      notificarSucesso(`Recebimento da etiqueta ${r.codigo} estornado.`);
      setLeitura('');
      setMotivo('');
      cliente.invalidateQueries({ queryKey: [setor] });
      cliente.invalidateQueries({ queryKey: ['estoque'] });
      cliente.invalidateQueries({ queryKey: ['etiquetas'] });
    },
  });
  return (
    <Card withBorder maw={640}>
      <Stack>
        <Title order={4}>Estornar recebimento</Title>
        <Alert color="blue">
          Use quando o líder for corrigir um lançamento cuja etiqueta já foi recebida. A etiqueta volta a
          "emitida" e o saldo do local é revertido; o recebimento original continua no histórico.
        </Alert>
        <TextInput
          label="Etiqueta"
          placeholder="Leia ou digite o código"
          leftSection={<IconBarcode size={18} />}
          value={leitura}
          onChange={(e) => setLeitura(e.currentTarget.value)}
        />
        <Textarea
          label="Motivo do estorno"
          withAsterisk
          autosize
          minRows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Etiquetas já exportadas ao ERP não podem ser estornadas.
        </Text>
        <AlertaErroApi erro={estornar.error} />
        <Group justify="flex-end">
          <Button
            color="orange"
            leftSection={<IconArrowBackUp size={18} />}
            disabled={!leitura.trim() || motivo.trim().length < 5}
            loading={estornar.isPending}
            onClick={() => estornar.mutate()}
          >
            Estornar
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
