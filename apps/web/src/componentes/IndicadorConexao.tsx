import { useEffect } from 'react';
import { Badge, Group, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCloudUpload, IconWifi, IconWifiOff } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useSincronizacao } from '../offline/estado';
import { iniciarSincronizacao, processarFila } from '../offline/fila';
import { atualizarPacote } from '../offline/pacote';

/**
 * Seção 11 — o apontador vê sempre se está conectado e quantos lançamentos aguardam envio.
 * Também liga o envio automático da fila e a atualização do pacote do tablet (a cada 15 min).
 */
export function IndicadorConexao() {
  const { pode } = useAutenticacao();
  const apontador = pode('offline.sincronizar');
  const e = useSincronizacao();
  useEffect(() => {
    if (!apontador) return;
    const parar = iniciarSincronizacao();
    void atualizarPacote();
    const pacote = setInterval(() => void atualizarPacote(), 15 * 60_000);
    return () => {
      parar();
      clearInterval(pacote);
    };
  }, [apontador]);
  if (!apontador) return null;
  return (
    <Group
      gap={6}
      wrap="nowrap"
      data-conexao={e.conectado ? 'online' : 'offline'}
      data-pacote-em={e.pacoteEm ?? ''}
      data-numeros-livres={e.numerosLivres ?? ''}
    >
      <Tooltip
        label={e.conectado ? 'Conectado ao servidor' : 'Sem conexão: os lançamentos ficam salvos no tablet'}
      >
        <Badge
          size="lg"
          color={e.conectado ? 'green' : 'red'}
          variant={e.conectado ? 'light' : 'filled'}
          leftSection={e.conectado ? <IconWifi size={14} /> : <IconWifiOff size={14} />}
        >
          {e.conectado ? 'Conectado' : 'Sem conexão'}
        </Badge>
      </Tooltip>
      {e.pendentes > 0 && (
        <Tooltip label="Toque para tentar enviar agora">
          <Badge
            size="lg"
            color="yellow"
            leftSection={<IconCloudUpload size={14} />}
            style={{ cursor: 'pointer' }}
            onClick={() => void processarFila()}
            data-pendentes={e.pendentes}
          >
            {e.pendentes} aguardando envio
          </Badge>
        </Tooltip>
      )}
      {e.recusados > 0 && (
        <Badge
          size="lg"
          color="red"
          variant="light"
          component={Link}
          to="/recusados"
          leftSection={<IconAlertTriangle size={14} />}
          style={{ cursor: 'pointer' }}
        >
          {e.recusados} recusado(s)
        </Badge>
      )}
    </Group>
  );
}
