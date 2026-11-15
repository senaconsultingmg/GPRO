import { useState } from 'react';
import { ActionIcon, Alert, Button, Code, Modal, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { CAMPOS_ZPL } from '@apontamento/shared';
import { imprimirTesteLayout } from '../api/impressao';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { configLayouts } from '../cadastros/configuracoes';
import { PaginaCadastro, useLista, type Registro } from '../componentes/PaginaCadastro';

/** Layouts de etiqueta com impressão de teste (seção 8). */
export function PaginaLayouts() {
  const { pode } = useAutenticacao();
  const { data: impressoras = [] } = useLista('impressoras', true);
  const [testando, setTestando] = useState<Registro | null>(null);
  const [impressoraId, setImpressoraId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    sucesso: boolean;
    mensagem: string | null;
    impressora: string;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <>
      <PaginaCadastro
        config={{
          ...configLayouts,
          descricao: `Modelo ZPL com campos {{campo}} e seções {{#campo}}...{{/campo}} (só aparecem quando o campo tem valor). Código de barras GS1-128 com ^BC...D e o campo {{gs1}}.`,
          acoesExtras: (r) =>
            pode('cadastros.escrever') ? (
              <Tooltip label="Imprimir teste">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  aria-label="Imprimir teste"
                  onClick={() => {
                    setResultado(null);
                    setImpressoraId((r.impressoraPadraoId as string | null) ?? null);
                    setTestando(r);
                  }}
                >
                  <IconPrinter size={18} />
                </ActionIcon>
              </Tooltip>
            ) : null,
        }}
      />
      <Modal
        opened={!!testando}
        onClose={() => setTestando(null)}
        title={<Text fw={600}>Imprimir teste — {testando?.nome as string}</Text>}
      >
        <Stack>
          <Select
            label="Impressora"
            data={impressoras.map((i) => ({ value: i.id, label: `${i.nome} (${i.enderecoIp}:${i.porta})` }))}
            value={impressoraId}
            onChange={setImpressoraId}
          />
          {resultado && (
            <Alert color={resultado.sucesso ? 'green' : 'red'}>
              {resultado.sucesso
                ? `Teste enviado para ${resultado.impressora}.`
                : `Falha: ${resultado.mensagem}`}
            </Alert>
          )}
          <Button
            loading={enviando}
            disabled={!impressoraId}
            onClick={async () => {
              setEnviando(true);
              try {
                setResultado(await imprimirTesteLayout(testando!.id, impressoraId));
              } catch (e) {
                setResultado({
                  sucesso: false,
                  mensagem: e instanceof Error ? e.message : String(e),
                  impressora: '',
                });
              } finally {
                setEnviando(false);
              }
            }}
          >
            Imprimir teste
          </Button>
          <Text size="xs" c="dimmed">
            Campos disponíveis: <Code>{CAMPOS_ZPL.join(', ')}</Code>
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
