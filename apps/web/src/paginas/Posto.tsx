import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconDeviceTablet } from '@tabler/icons-react';
import { lerPosto, salvarPosto } from '../api/posto';
import { testarAgente } from '../api/impressao';
import { useLista } from '../componentes/PaginaCadastro';
import { notificarSucesso } from '../componentes/utilitarios';

/** Configurar este posto: dispositivo (prefixo das etiquetas) e agente de impressão da rede local. */
export function PaginaPosto() {
  const { data: dispositivos = [] } = useLista('dispositivos', true);
  const inicial = lerPosto();
  const [postoId, setPostoId] = useState<string | null>(inicial.postoId);
  const [agenteUrl, setAgenteUrl] = useState(inicial.agenteUrl);
  const [agenteToken, setAgenteToken] = useState(inicial.agenteToken);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);
  const escolhido = dispositivos.find((d) => d.id === postoId);
  return (
    <Stack maw={640}>
      <Title order={2}>Configurar este posto</Title>
      <Text c="dimmed" size="sm">
        A configuração fica guardada neste tablet ou computador. O prefixo do dispositivo compõe o código das
        etiquetas emitidas aqui (ex.: T3-0001245).
      </Text>
      <Card withBorder>
        <Stack>
          <Select
            label="Dispositivo (posto)"
            size="lg"
            leftSection={<IconDeviceTablet size={18} />}
            data={dispositivos.map((d) => ({ value: d.id, label: `${d.prefixo} — ${d.nome}` }))}
            value={postoId}
            onChange={setPostoId}
          />
          {escolhido && (
            <Text size="sm">
              Etiquetas deste posto: {escolhido.prefixo as string}-0000001, {escolhido.prefixo as string}
              -0000002…
            </Text>
          )}
          <TextInput
            label="Endereço do agente de impressão"
            description="Serviço na rede da fábrica que envia o ZPL às impressoras Zebra (ex.: http://192.168.0.10:9180)."
            size="lg"
            value={agenteUrl}
            onChange={(e) => setAgenteUrl(e.currentTarget.value)}
          />
          <PasswordInput
            label="Token do agente"
            size="lg"
            value={agenteToken}
            onChange={(e) => setAgenteToken(e.currentTarget.value)}
          />
          {teste && <Alert color={teste.ok ? 'green' : 'red'}>{teste.texto}</Alert>}
          <Group>
            <Button
              variant="light"
              size="lg"
              onClick={() =>
                testarAgente(agenteUrl)
                  .then((t) => setTeste({ ok: true, texto: t }))
                  .catch(() =>
                    setTeste({ ok: false, texto: `Não foi possível falar com o agente em ${agenteUrl}.` }),
                  )
              }
            >
              Testar agente
            </Button>
            <Button
              size="lg"
              onClick={() => {
                salvarPosto({ postoId, agenteUrl, agenteToken });
                notificarSucesso('Configuração do posto salva.');
              }}
            >
              Salvar
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
