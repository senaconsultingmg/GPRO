import { Button, Group, Stack } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconClock } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { paraCampoHora } from './tipos';

const AJUSTES = [-10, -1, 1, 10];

/**
 * Hora da ocorrência (RN-08): vem preenchida com a hora atual. Formato fixo dd/mm/aaaa hh:mm (24 h),
 * com botões grandes para ajustar minutos sem teclado. `aoMudar` recebe `editada = false` quando o
 * valor representa "agora" (o envio usa a hora exata, com segundos).
 */
export function CampoHora({
  valor,
  aoMudar,
  erro,
}: {
  valor: string;
  aoMudar: (v: string, editada: boolean) => void;
  erro?: string;
}) {
  return (
    <Stack gap="xs">
      <DateTimePicker
        label="Hora da ocorrência"
        size="lg"
        valueFormat="DD/MM/YYYY HH:mm"
        value={valor}
        onChange={(v) => v && aoMudar(dayjs(v).format('YYYY-MM-DD HH:mm:00'), true)}
        error={erro}
        dropdownType="modal"
      />
      <Group gap="xs" grow>
        {AJUSTES.filter((a) => a < 0).map((a) => (
          <Button
            key={a}
            size="lg"
            variant="default"
            onClick={() => aoMudar(dayjs(valor).add(a, 'minute').format('YYYY-MM-DD HH:mm:00'), true)}
          >
            {a} min
          </Button>
        ))}
        <Button
          size="lg"
          variant="light"
          leftSection={<IconClock size={18} />}
          onClick={() => aoMudar(paraCampoHora(), false)}
        >
          Agora
        </Button>
        {AJUSTES.filter((a) => a > 0).map((a) => (
          <Button
            key={a}
            size="lg"
            variant="default"
            onClick={() => aoMudar(dayjs(valor).add(a, 'minute').format('YYYY-MM-DD HH:mm:00'), true)}
          >
            +{a} min
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
