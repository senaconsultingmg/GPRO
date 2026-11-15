import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCheck, IconDownload, IconFileSpreadsheet, IconSettings, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatarDataHora,
  type LayoutExcel,
  type LayoutImportacao,
  type Permissao,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { AlertaErroApi, notificarErro, notificarSucesso } from '../componentes/utilitarios';

interface CampoLayout {
  campo: string;
  rotulo: string;
  colunaPadrao: string;
  coluna: string;
  obrigatorio: boolean;
}
interface Layout {
  layout: LayoutExcel;
  tipo: 'IMPORTACAO' | 'EXPORTACAO';
  titulo: string;
  campos: CampoLayout[];
}
interface Resultado {
  sucesso: boolean;
  linhas: number;
  erros: { linha: number | null; campo?: string; mensagem: string }[];
  novos: number;
  atualizacoes: number;
  simulacao: boolean;
  criados?: number;
  atualizados?: number;
}
interface RegistroImportacao {
  id: string;
  layout: string;
  arquivoNome: string;
  criadoEm: string;
  sucesso: boolean;
  linhas: number;
  criados: number;
  atualizados: number;
  usuario: { nome: string };
}

const ROTAS: Record<LayoutImportacao, { rota: string; permissao: Permissao }> = {
  IMPORTACAO_ORDENS: { rota: 'ordens', permissao: 'ordens.escrever' },
  IMPORTACAO_PRODUTOS: { rota: 'produtos', permissao: 'produtos.importar' },
};

function CartaoImportacao({ layout }: { layout: Layout }) {
  const cliente = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const { rota } = ROTAS[layout.layout as LayoutImportacao];
  const enviar = useMutation({
    mutationFn: (simular: boolean) =>
      api.enviarArquivo<Resultado>(
        `/importacoes/${rota}${simular ? '?simular=true' : ''}`,
        'arquivo',
        arquivo!,
      ),
    onSuccess: (r) => {
      setResultado(r);
      if (!r.simulacao) {
        cliente.invalidateQueries({ queryKey: ['importacoes'] });
        cliente.invalidateQueries({ queryKey: [rota] });
        cliente.invalidateQueries({ queryKey: ['ordens'] });
        if (r.sucesso)
          notificarSucesso(`Importação concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s).`);
      }
    },
  });
  return (
    <Card withBorder padding="lg">
      <Stack>
        <Group justify="space-between">
          <Group gap="xs">
            <IconFileSpreadsheet color="var(--mantine-color-green-7)" />
            <Title order={4}>{layout.titulo}</Title>
          </Group>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconDownload size={14} />}
            onClick={() =>
              api
                .baixar(`/importacoes/layouts/${layout.layout}/modelo`, `modelo-${rota}.xlsx`)
                .catch(notificarErro)
            }
          >
            Baixar modelo
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Colunas: {layout.campos.map((c) => `${c.coluna}${c.obrigatorio ? '*' : ''}`).join(', ')}
        </Text>
        <FileInput
          label="Arquivo .xlsx"
          placeholder="Escolha o arquivo"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          value={arquivo}
          onChange={(f) => {
            setArquivo(f);
            setResultado(null);
          }}
          clearable
        />
        <Group>
          <Button
            variant="light"
            disabled={!arquivo}
            loading={enviar.isPending && enviar.variables === true}
            onClick={() => enviar.mutate(true)}
            leftSection={<IconCheck size={16} />}
          >
            Validar
          </Button>
          <Button
            disabled={!arquivo || (resultado !== null && !resultado.sucesso)}
            loading={enviar.isPending && enviar.variables === false}
            onClick={() => enviar.mutate(false)}
            leftSection={<IconUpload size={16} />}
          >
            Importar
          </Button>
        </Group>
        <AlertaErroApi erro={enviar.error} />
        {resultado && resultado.sucesso && (
          <Alert color="green" title={resultado.simulacao ? 'Arquivo válido' : 'Importado'}>
            {resultado.linhas} linha(s):{' '}
            {resultado.simulacao
              ? `${resultado.novos} novo(s) e ${resultado.atualizacoes} atualização(ões). Clique em Importar para gravar.`
              : `${resultado.criados} criado(s) e ${resultado.atualizados} atualizado(s).`}
          </Alert>
        )}
        {resultado && !resultado.sucesso && (
          <Alert color="red" title={`Nada foi importado: ${resultado.erros.length} erro(s) encontrado(s)`}>
            <ScrollArea.Autosize mah={260}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Linha</Table.Th>
                    <Table.Th>Erro</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resultado.erros.map((e, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{e.linha ?? '—'}</Table.Td>
                      <Table.Td>{e.mensagem}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}

function ModalMapeamento({ layout, aoFechar }: { layout: Layout; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const [colunas, setColunas] = useState<Record<string, string>>(
    Object.fromEntries(layout.campos.map((c) => [c.campo, c.coluna])),
  );
  const salvar = useMutation({
    mutationFn: () => api.put(`/importacoes/layouts/${layout.layout}`, { colunas }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['importacoes', 'layouts'] });
      notificarSucesso('Mapeamento salvo.');
      aoFechar();
    },
  });
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Informe o nome da coluna no arquivo do ERP para cada campo do sistema.
      </Text>
      {layout.campos.map((c) => (
        <TextInput
          key={c.campo}
          label={`${c.rotulo}${c.obrigatorio ? ' *' : ''}`}
          description={`Padrão: ${c.colunaPadrao}`}
          value={colunas[c.campo]}
          onChange={(e) => setColunas({ ...colunas, [c.campo]: e.currentTarget.value })}
        />
      ))}
      <AlertaErroApi erro={salvar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button onClick={() => salvar.mutate()} loading={salvar.isPending}>
          Salvar
        </Button>
      </Group>
    </Stack>
  );
}

export function PaginaImportacoes() {
  const { pode } = useAutenticacao();
  const [mapeando, setMapeando] = useState<Layout | null>(null);
  const layouts = useQuery({
    queryKey: ['importacoes', 'layouts'],
    queryFn: () => api.get<Layout[]>('/importacoes/layouts'),
  });
  const historico = useQuery({
    queryKey: ['importacoes'],
    queryFn: () => api.get<RegistroImportacao[]>('/importacoes'),
  });
  return (
    <Stack>
      <Title order={2}>Importação de Excel</Title>
      <Text c="dimmed" size="sm">
        O arquivo inteiro é validado antes de gravar: ou importa tudo, ou nada. Linha repetida atualiza o
        registro somente se ele ainda não tiver apontamentos.
      </Text>
      <AlertaErroApi erro={layouts.error} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {layouts.data
          ?.filter((l) => l.tipo === 'IMPORTACAO' && pode(ROTAS[l.layout as LayoutImportacao].permissao))
          .map((l) => (
            <CartaoImportacao key={l.layout} layout={l} />
          ))}
      </SimpleGrid>
      {pode('excel.mapear') && (
        <Group>
          {layouts.data?.map((l) => (
            <Button
              key={l.layout}
              variant="default"
              leftSection={<IconSettings size={16} />}
              onClick={() => setMapeando(l)}
            >
              Mapear colunas — {l.titulo}
              {l.tipo === 'EXPORTACAO' ? ' (exportação)' : ''}
            </Button>
          ))}
        </Group>
      )}
      <Title order={4} mt="md">
        Histórico
      </Title>
      <ScrollArea>
        <Table striped miw={700}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data/hora</Table.Th>
              <Table.Th>Layout</Table.Th>
              <Table.Th>Arquivo</Table.Th>
              <Table.Th>Usuário</Table.Th>
              <Table.Th>Resultado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {historico.data?.map((h) => (
              <Table.Tr key={h.id}>
                <Table.Td>{formatarDataHora(h.criadoEm)}</Table.Td>
                <Table.Td>{h.layout === 'IMPORTACAO_ORDENS' ? 'Ordens de produção' : 'Produtos'}</Table.Td>
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() =>
                      api.baixar(`/importacoes/${h.id}/arquivo`, h.arquivoNome).catch(notificarErro)
                    }
                  >
                    {h.arquivoNome}
                  </Button>
                </Table.Td>
                <Table.Td>{h.usuario.nome}</Table.Td>
                <Table.Td>
                  {h.sucesso ? (
                    <Badge color="green">{`${h.criados} novo(s), ${h.atualizados} atualizado(s)`}</Badge>
                  ) : (
                    <Badge color="red">Recusado ({h.linhas} linhas)</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Modal
        opened={!!mapeando}
        onClose={() => setMapeando(null)}
        title={<Text fw={600}>Mapeamento — {mapeando?.titulo}</Text>}
      >
        {mapeando && <ModalMapeamento layout={mapeando} aoFechar={() => setMapeando(null)} />}
      </Modal>
    </Stack>
  );
}
