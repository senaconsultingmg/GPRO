import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconAlertTriangle, IconArrowsSplit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ESPECIALIDADES_MANUTENCAO,
  formatarDataHora,
  podeExecutarEtapa,
  ROTULO_ESPECIALIDADE,
  ROTULO_SITUACAO_ETAPA,
  ROTULO_SITUACAO_ORDEM_SERVICO,
  ROTULO_SITUACAO_SOLICITACAO,
  ROTULO_TIPO_ORDEM_SERVICO,
  type EspecialidadeManutencao,
  type SituacaoOrdemServico,
  type SituacaoSolicitacao,
  type TipoOrdemServico,
} from '@apontamento/shared';
import { api } from '../api/cliente';
import { useAutenticacao } from '../autenticacao/ContextoAutenticacao';
import { useLista } from '../componentes/PaginaCadastro';
import { AlertaErroApi, fmtNumero, notificarSucesso } from '../componentes/utilitarios';
import { TabelaIndicador } from './PainelIndicadores';

// ---------- tipos ----------
interface Eu {
  id: string;
  especialidades: EspecialidadeManutencao[];
  controladorManutencao: boolean;
}
interface Tecnico {
  id: string;
  nome: string;
  especialidades: EspecialidadeManutencao[];
  controladorManutencao: boolean;
}
interface Solicitacao {
  id: string;
  numero: number;
  situacao: SituacaoSolicitacao;
  descricao: string;
  ocorridaEm: string;
  local: string | null;
  maquina: { id: string; codigo: string } | null;
  solicitante: { nome: string };
  justificativaRecusa: string | null;
  paradaAnulada: boolean;
  outrasAbertasMaquina: number;
  ordemServico: { id: string; numero: number; situacao: SituacaoOrdemServico } | null;
}
type SituacaoEtapaExibida = keyof typeof ROTULO_SITUACAO_ETAPA;
interface Etapa {
  id: string;
  ordem: number;
  descricao: string;
  especialidade: EspecialidadeManutencao;
  situacao: 'PENDENTE' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'CANCELADA';
  situacaoExibida: SituacaoEtapaExibida;
  responsavelId: string | null;
  responsavel: { nome: string } | null;
  executorId: string | null;
  executor: { nome: string } | null;
  inicio: string | null;
  fim: string | null;
  servicoExecutado: string | null;
  justificativaCancelamento: string | null;
}
interface OrdemServico {
  id: string;
  numero: number;
  tipo: TipoOrdemServico;
  eletiva: boolean;
  situacao: SituacaoOrdemServico;
  criadoEm: string;
  servicoExecutado: string | null;
  controlador: { nome: string };
  solicitacao: {
    descricao: string;
    local: string | null;
    maquina: { codigo: string } | null;
    ocorridaEm: string;
  };
  etapas: Etapa[];
  tempoAteAtendimentoH: number | null;
  tempoReparoH: number | null;
  podeEncerrar: boolean;
}
interface EtapaEditada {
  ordem: number;
  descricao: string;
  especialidade: EspecialidadeManutencao | null;
  responsavelId: string | null;
}
interface Modelo {
  id: string;
  nome: string;
  descricao: string | null;
  etapas: { ordem: number; descricao: string; especialidade: EspecialidadeManutencao }[];
  ativo: boolean;
}

const COR_ETAPA: Record<SituacaoEtapaExibida, string> = {
  AGUARDANDO: 'gray',
  LIBERADA: 'blue',
  PENDENTE: 'gray',
  EM_EXECUCAO: 'yellow',
  CONCLUIDA: 'green',
  CANCELADA: 'red',
};
const COR_SOLICITACAO: Record<SituacaoSolicitacao, string> = {
  ABERTA: 'orange',
  EM_TRIAGEM: 'yellow',
  CONVERTIDA: 'blue',
  RECUSADA: 'red',
  ENCERRADA: 'green',
};
const numeroOs = (n: number) => `OS ${String(n).padStart(6, '0')}`;
const ondeE = (s: { maquina: { codigo: string } | null; local: string | null }) =>
  s.maquina?.codigo ?? s.local ?? '—';
const opcoesEspecialidade = ESPECIALIDADES_MANUTENCAO.map((e) => ({
  value: e,
  label: ROTULO_ESPECIALIDADE[e],
}));
const paraInstante = (v: string) => (v ? new Date(v).toISOString() : null);

function useEu() {
  return useQuery({ queryKey: ['manutencao', 'eu'], queryFn: () => api.get<Eu>('/manutencao/eu') });
}
function useTecnicos() {
  return useQuery({
    queryKey: ['manutencao', 'tecnicos'],
    queryFn: () => api.get<Tecnico[]>('/manutencao/tecnicos'),
  });
}
function useInvalidar() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['manutencao'] });
    cliente.invalidateQueries({ queryKey: ['painel'] });
  };
}

// ---------- editor de etapas (mesma ordem = em paralelo) ----------
export function EditorEtapas({
  etapas,
  aoMudar,
  tecnicos,
  comResponsavel = true,
  ordemMinima = 1,
}: {
  etapas: EtapaEditada[];
  aoMudar: (e: EtapaEditada[]) => void;
  tecnicos: Tecnico[];
  comResponsavel?: boolean;
  ordemMinima?: number;
}) {
  const ultima = etapas.at(-1)?.ordem ?? ordemMinima - 1;
  const mudar = (i: number, p: Partial<EtapaEditada>) =>
    aoMudar(etapas.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const nova = (ordem: number) =>
    aoMudar([...etapas, { ordem, descricao: '', especialidade: null, responsavelId: null }]);
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Etapas com a mesma ordem correm em paralelo; a etapa seguinte só começa quando todas as da ordem
        anterior terminarem.
      </Text>
      {etapas.map((e, i) => {
        const aptos = tecnicos.filter((t) => e.especialidade && t.especialidades.includes(e.especialidade));
        const paralela = etapas.some((x, j) => j !== i && x.ordem === e.ordem);
        return (
          <Paper key={i} withBorder p="xs" data-etapa-editor={i}>
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <NumberInput
                label="Ordem"
                min={ordemMinima}
                max={99}
                w={80}
                value={e.ordem}
                onChange={(v) => mudar(i, { ordem: Number(v) || ordemMinima })}
              />
              <TextInput
                label="Etapa"
                placeholder="Ex.: Retirar o molde da máquina"
                style={{ flex: 1 }}
                value={e.descricao}
                onChange={(ev) => mudar(i, { descricao: ev.currentTarget.value })}
              />
              <Select
                label="Especialidade"
                data={opcoesEspecialidade}
                w={160}
                value={e.especialidade}
                onChange={(v) =>
                  mudar(i, { especialidade: v as EspecialidadeManutencao, responsavelId: null })
                }
              />
              {comResponsavel && (
                <Select
                  label="Responsável"
                  placeholder="Qualquer da especialidade"
                  clearable
                  w={200}
                  data={aptos.map((t) => ({ value: t.id, label: t.nome }))}
                  value={e.responsavelId}
                  onChange={(v) => mudar(i, { responsavelId: v })}
                />
              )}
              <Tooltip label="Remover etapa">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  aria-label="Remover etapa"
                  onClick={() => aoMudar(etapas.filter((_, j) => j !== i))}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {paralela && (
              <Text size="xs" c="blue" mt={4}>
                Em paralelo com outra(s) etapa(s) da ordem {e.ordem}
              </Text>
            )}
          </Paper>
        );
      })}
      <Group gap="xs">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => nova(ultima + 1)}
        >
          Etapa seguinte
        </Button>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconArrowsSplit size={14} />}
          disabled={!etapas.length}
          onClick={() => nova(Math.max(ultima, ordemMinima))}
        >
          Em paralelo com a última
        </Button>
      </Group>
    </Stack>
  );
}

const etapasValidas = (e: EtapaEditada[]) =>
  e.length > 0 && e.every((x) => x.descricao.trim().length >= 3 && x.especialidade);
const paraEnvio = (e: EtapaEditada[]) =>
  [...e].sort((a, b) => a.ordem - b.ordem).map((x) => ({ ...x, descricao: x.descricao.trim() }));

// ---------- solicitações ----------
function NovaSolicitacao({ aoConcluir }: { aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const { data: maquinas = [] } = useLista('maquinas', true);
  const [maquinaId, setMaquinaId] = useState<string | null>(null);
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const salvar = useMutation({
    mutationFn: () => api.post('/manutencao/solicitacoes', { maquinaId, local: local || null, descricao }),
    onSuccess: () => {
      invalidar();
      notificarSucesso('Solicitação registrada.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Select
        label="Máquina"
        placeholder="Sem máquina (ex.: predial)"
        clearable
        data={maquinas.map((m) => ({ value: m.id, label: `${m.codigo} — ${m.descricao}` }))}
        value={maquinaId}
        onChange={setMaquinaId}
      />
      {!maquinaId && (
        <TextInput
          label="Local"
          placeholder="Ex.: Telhado do galpão 2"
          value={local}
          onChange={(e) => setLocal(e.currentTarget.value)}
        />
      )}
      <Textarea
        label="Descrição do problema"
        withAsterisk
        autosize
        minRows={3}
        value={descricao}
        onChange={(e) => setDescricao(e.currentTarget.value)}
      />
      <AlertaErroApi erro={salvar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button
          disabled={descricao.trim().length < 5 || (!maquinaId && !local.trim())}
          loading={salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          Registrar
        </Button>
      </Group>
    </Stack>
  );
}

function Recusar({ s, aoConcluir }: { s: Solicitacao; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const [justificativa, setJustificativa] = useState('');
  const recusar = useMutation({
    mutationFn: () => api.post(`/manutencao/solicitacoes/${s.id}/recusar`, { justificativa }),
    onSuccess: () => {
      invalidar();
      notificarSucesso('Solicitação recusada.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text size="sm">{s.descricao}</Text>
      <Textarea
        label="Justificativa da recusa"
        withAsterisk
        autosize
        minRows={2}
        value={justificativa}
        onChange={(e) => setJustificativa(e.currentTarget.value)}
      />
      <AlertaErroApi erro={recusar.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button
          color="red"
          disabled={justificativa.trim().length < 5}
          loading={recusar.isPending}
          onClick={() => recusar.mutate()}
        >
          Recusar
        </Button>
      </Group>
    </Stack>
  );
}

function ConverterOs({ s, aoConcluir }: { s: Solicitacao; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const { data: tecnicos = [] } = useTecnicos();
  const modelos = useQuery({
    queryKey: ['manutencao', 'modelos'],
    queryFn: () => api.get<Modelo[]>('/manutencao/modelos'),
  });
  const [tipo, setTipo] = useState<TipoOrdemServico>('CORRETIVA');
  const [eletiva, setEletiva] = useState(false);
  const [etapas, setEtapas] = useState<EtapaEditada[]>([]);
  const converter = useMutation({
    mutationFn: () =>
      api.post<OrdemServico>(`/manutencao/solicitacoes/${s.id}/converter`, {
        tipo,
        eletiva,
        etapas: paraEnvio(etapas),
      }),
    onSuccess: (os) => {
      invalidar();
      notificarSucesso(`${numeroOs(os.numero)} aberta com ${os.etapas.length} etapa(s).`);
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Alert color="blue">
        {ondeE(s)} · {s.descricao}
      </Alert>
      <Group>
        <SegmentedControl
          value={tipo}
          onChange={(v) => setTipo(v as TipoOrdemServico)}
          data={[
            { value: 'CORRETIVA', label: 'Corretiva' },
            { value: 'PREVENTIVA', label: 'Preventiva' },
          ]}
        />
        <Checkbox
          label="Eletiva (pode ser programada)"
          checked={eletiva}
          onChange={(e) => setEletiva(e.currentTarget.checked)}
        />
        <Select
          label="Usar modelo de sequência"
          placeholder="Escolha um modelo"
          clearable
          w={260}
          data={(modelos.data ?? []).filter((m) => m.ativo).map((m) => ({ value: m.id, label: m.nome }))}
          onChange={(v) => {
            const m = modelos.data?.find((x) => x.id === v);
            if (m) setEtapas(m.etapas.map((e) => ({ ...e, responsavelId: null })));
          }}
        />
      </Group>
      <EditorEtapas etapas={etapas} aoMudar={setEtapas} tecnicos={tecnicos} />
      <AlertaErroApi erro={converter.error} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button
          disabled={!etapasValidas(etapas)}
          loading={converter.isPending}
          onClick={() => converter.mutate()}
        >
          Aprovar e abrir OS
        </Button>
      </Group>
    </Stack>
  );
}

function Solicitacoes({ eu }: { eu: Eu | undefined }) {
  const { pode } = useAutenticacao();
  const invalidar = useInvalidar();
  const [filtro, setFiltro] = useState('ABERTAS');
  const [nova, setNova] = useState(false);
  const [recusando, setRecusando] = useState<Solicitacao | null>(null);
  const [convertendo, setConvertendo] = useState<Solicitacao | null>(null);
  const lista = useQuery({
    queryKey: ['manutencao', 'solicitacoes', filtro],
    queryFn: () => api.get<Solicitacao[]>(`/manutencao/solicitacoes${filtro ? `?situacao=${filtro}` : ''}`),
  });
  const triagem = useMutation({
    mutationFn: (id: string) => api.post(`/manutencao/solicitacoes/${id}/triagem`, {}),
    onSuccess: invalidar,
  });
  const controlador = !!eu?.controladorManutencao;
  return (
    <Stack>
      <Group justify="space-between">
        <SegmentedControl
          value={filtro}
          onChange={setFiltro}
          data={[
            { value: 'ABERTAS', label: 'Em aberto' },
            { value: 'RECUSADA', label: 'Recusadas' },
            { value: 'ENCERRADA', label: 'Encerradas' },
            { value: '', label: 'Todas' },
          ]}
        />
        {pode('manutencao.solicitar') && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setNova(true)}>
            Nova solicitação
          </Button>
        )}
      </Group>
      <AlertaErroApi erro={lista.error ?? triagem.error} />
      {lista.data?.length === 0 && <Alert color="green">Nenhuma solicitação nesta situação.</Alert>}
      {!!lista.data?.length && (
        <ScrollArea>
          <Table striped miw={960} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nº</Table.Th>
                <Table.Th>Ocorrência</Table.Th>
                <Table.Th>Máquina / local</Table.Th>
                <Table.Th>Descrição</Table.Th>
                <Table.Th>Solicitante</Table.Th>
                <Table.Th>Situação</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.data.map((s) => (
                <Table.Tr key={s.id} data-solicitacao={s.numero}>
                  <Table.Td>{s.numero}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(s.ocorridaEm)}</Table.Td>
                  <Table.Td fw={700}>{ondeE(s)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{s.descricao}</Text>
                    {s.outrasAbertasMaquina > 0 && (
                      <Text size="xs" c="orange">
                        <IconAlertTriangle size={12} /> Já há {s.outrasAbertasMaquina} outra(s)
                        solicitação(ões) aberta(s) para esta máquina
                      </Text>
                    )}
                    {s.paradaAnulada && (
                      <Text size="xs" c="red">
                        Parada anulada por correção
                      </Text>
                    )}
                    {s.justificativaRecusa && (
                      <Text size="xs" c="dimmed">
                        Recusa: {s.justificativaRecusa}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{s.solicitante.nome}</Table.Td>
                  <Table.Td>
                    <Badge color={COR_SOLICITACAO[s.situacao]}>
                      {ROTULO_SITUACAO_SOLICITACAO[s.situacao]}
                    </Badge>
                    {s.ordemServico && (
                      <Text size="xs" c="dimmed">
                        {numeroOs(s.ordemServico.numero)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {controlador && (s.situacao === 'ABERTA' || s.situacao === 'EM_TRIAGEM') && (
                      <Group gap={4} wrap="nowrap" justify="flex-end">
                        {s.situacao === 'ABERTA' && (
                          <Button
                            size="xs"
                            variant="default"
                            loading={triagem.isPending && triagem.variables === s.id}
                            onClick={() => triagem.mutate(s.id)}
                          >
                            Triagem
                          </Button>
                        )}
                        <Button size="xs" color="red" variant="light" onClick={() => setRecusando(s)}>
                          Recusar
                        </Button>
                        <Button size="xs" onClick={() => setConvertendo(s)}>
                          Aprovar / abrir OS
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Modal
        opened={nova}
        onClose={() => setNova(false)}
        title={<Text fw={700}>Nova solicitação de manutenção</Text>}
      >
        {nova && <NovaSolicitacao aoConcluir={() => setNova(false)} />}
      </Modal>
      <Modal
        opened={!!recusando}
        onClose={() => setRecusando(null)}
        title={<Text fw={700}>Recusar solicitação</Text>}
      >
        {recusando && <Recusar s={recusando} aoConcluir={() => setRecusando(null)} />}
      </Modal>
      <Modal
        opened={!!convertendo}
        onClose={() => setConvertendo(null)}
        size="80rem"
        title={<Text fw={700}>Aprovar e abrir ordem de serviço</Text>}
      >
        {convertendo && <ConverterOs s={convertendo} aoConcluir={() => setConvertendo(null)} />}
      </Modal>
    </Stack>
  );
}

// ---------- execução de etapas ----------
function AcaoEtapa({ etapa, aoConcluir }: { etapa: Etapa; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const iniciar = etapa.situacao === 'PENDENTE';
  const [hora, setHora] = useState('');
  const [servico, setServico] = useState('');
  const acao = useMutation({
    mutationFn: () =>
      iniciar
        ? api.post(`/manutencao/etapas/${etapa.id}/iniciar`, { inicio: paraInstante(hora) })
        : api.post(`/manutencao/etapas/${etapa.id}/concluir`, {
            fim: paraInstante(hora),
            servicoExecutado: servico,
          }),
    onSuccess: () => {
      invalidar();
      notificarSucesso(iniciar ? 'Etapa iniciada.' : 'Etapa concluída.');
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text fw={700}>
        {etapa.descricao} · {ROTULO_ESPECIALIDADE[etapa.especialidade]}
      </Text>
      <TextInput
        type="datetime-local"
        label={iniciar ? 'Início (deixe vazio para agora)' : 'Fim (deixe vazio para agora)'}
        value={hora}
        onChange={(e) => setHora(e.currentTarget.value)}
      />
      {!iniciar && (
        <Textarea
          label="Serviço executado"
          withAsterisk
          autosize
          minRows={3}
          value={servico}
          onChange={(e) => setServico(e.currentTarget.value)}
        />
      )}
      <AlertaErroApi erro={acao.error} />
      <Group grow>
        <Button size="lg" variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button
          size="lg"
          color={iniciar ? 'blue' : 'green'}
          disabled={!iniciar && servico.trim().length < 3}
          loading={acao.isPending}
          onClick={() => acao.mutate()}
        >
          {iniciar ? 'Iniciar etapa' : 'Concluir etapa'}
        </Button>
      </Group>
    </Stack>
  );
}

function CancelarEtapa({ etapa, aoConcluir }: { etapa: Etapa; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const [justificativa, setJustificativa] = useState('');
  const cancelar = useMutation({
    mutationFn: () => api.post(`/manutencao/etapas/${etapa.id}/cancelar`, { justificativa }),
    onSuccess: () => {
      invalidar();
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Text>{etapa.descricao}</Text>
      <Textarea
        label="Justificativa"
        withAsterisk
        value={justificativa}
        onChange={(e) => setJustificativa(e.currentTarget.value)}
      />
      <AlertaErroApi erro={cancelar.error} />
      <Group justify="flex-end">
        <Button
          color="red"
          disabled={justificativa.trim().length < 5}
          loading={cancelar.isPending}
          onClick={() => cancelar.mutate()}
        >
          Cancelar etapa
        </Button>
      </Group>
    </Stack>
  );
}

function IncluirEtapas({ os, aoConcluir }: { os: OrdemServico; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const { data: tecnicos = [] } = useTecnicos();
  const iniciadas = os.etapas.filter((e) => e.situacao !== 'PENDENTE').map((e) => e.ordem);
  const minimo = Math.max(1, ...iniciadas);
  const ultima = Math.max(0, ...os.etapas.map((e) => e.ordem));
  const [etapas, setEtapas] = useState<EtapaEditada[]>([
    { ordem: ultima + 1, descricao: '', especialidade: null, responsavelId: null },
  ]);
  const incluir = useMutation({
    mutationFn: () => api.post(`/manutencao/ordens/${os.id}/etapas`, { etapas: paraEnvio(etapas) }),
    onSuccess: () => {
      invalidar();
      aoConcluir();
    },
  });
  return (
    <Stack>
      <EditorEtapas etapas={etapas} aoMudar={setEtapas} tecnicos={tecnicos} ordemMinima={minimo} />
      <AlertaErroApi erro={incluir.error} />
      <Group justify="flex-end">
        <Button
          disabled={!etapasValidas(etapas)}
          loading={incluir.isPending}
          onClick={() => incluir.mutate()}
        >
          Incluir etapas
        </Button>
      </Group>
    </Stack>
  );
}

function EncerrarOs({ os, aoConcluir }: { os: OrdemServico; aoConcluir: () => void }) {
  const invalidar = useInvalidar();
  const [servico, setServico] = useState('');
  const encerrar = useMutation({
    mutationFn: () => api.post(`/manutencao/ordens/${os.id}/encerrar`, { servicoExecutado: servico }),
    onSuccess: () => {
      invalidar();
      notificarSucesso(`${numeroOs(os.numero)} encerrada. O reinício da máquina é lançado pelo apontador.`);
      aoConcluir();
    },
  });
  return (
    <Stack>
      <Alert color="blue">
        Encerrar a OS não reinicia a máquina: o reinício é sempre lançado pelo apontador.
      </Alert>
      <Textarea
        label="Resumo do serviço executado"
        withAsterisk
        autosize
        minRows={3}
        value={servico}
        onChange={(e) => setServico(e.currentTarget.value)}
      />
      <AlertaErroApi erro={encerrar.error} />
      <Group justify="flex-end">
        <Button
          color="green"
          disabled={servico.trim().length < 5}
          loading={encerrar.isPending}
          onClick={() => encerrar.mutate()}
        >
          Encerrar OS
        </Button>
      </Group>
    </Stack>
  );
}

/** Sequência da OS: uma coluna por ordem; etapas da mesma ordem empilhadas (em paralelo). */
function CartaoOs({ os, eu }: { os: OrdemServico; eu: Eu | undefined }) {
  const [executando, setExecutando] = useState<Etapa | null>(null);
  const [cancelando, setCancelando] = useState<Etapa | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const controlador = !!eu?.controladorManutencao;
  const ordens = [...new Set(os.etapas.map((e) => e.ordem))].sort((a, b) => a - b);
  const podeAgir = (e: Etapa) =>
    !!eu &&
    os.situacao !== 'ENCERRADA' &&
    ((e.situacaoExibida === 'LIBERADA' && podeExecutarEtapa(e, eu)) ||
      (e.situacao === 'EM_EXECUCAO' && (e.executorId === eu.id || podeExecutarEtapa(e, eu))));
  return (
    <Card withBorder data-os={os.numero}>
      <Group justify="space-between" mb="xs">
        <div>
          <Group gap="xs">
            <Title order={4}>{numeroOs(os.numero)}</Title>
            <Badge variant="light">{ROTULO_TIPO_ORDEM_SERVICO[os.tipo]}</Badge>
            {os.eletiva && <Badge variant="outline">Eletiva</Badge>}
            <Badge
              color={
                os.situacao === 'ENCERRADA' ? 'green' : os.situacao === 'EM_EXECUCAO' ? 'yellow' : 'blue'
              }
            >
              {ROTULO_SITUACAO_ORDEM_SERVICO[os.situacao]}
            </Badge>
          </Group>
          <Text size="sm">
            <b>{ondeE(os.solicitacao)}</b> · {os.solicitacao.descricao}
          </Text>
          <Text size="xs" c="dimmed">
            Ocorrência {formatarDataHora(os.solicitacao.ocorridaEm)} · controlador {os.controlador.nome}
            {os.tempoAteAtendimentoH !== null
              ? ` · atendimento em ${fmtNumero(os.tempoAteAtendimentoH)} h`
              : ''}
            {os.tempoReparoH !== null ? ` · reparo ${fmtNumero(os.tempoReparoH)} h` : ''}
          </Text>
        </div>
        {controlador && os.situacao !== 'ENCERRADA' && (
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setIncluindo(true)}
            >
              Incluir etapas
            </Button>
            <Button size="xs" color="green" disabled={!os.podeEncerrar} onClick={() => setEncerrando(true)}>
              Encerrar OS
            </Button>
          </Group>
        )}
      </Group>
      <ScrollArea>
        <Group align="stretch" wrap="nowrap" gap="xs" pb="xs">
          {ordens.map((o) => (
            <Stack key={o} gap="xs" miw={220} maw={260} data-ordem={o}>
              <Text size="xs" fw={700} c="dimmed">
                {o}ª {os.etapas.filter((e) => e.ordem === o).length > 1 ? '· em paralelo' : ''}
              </Text>
              {os.etapas
                .filter((e) => e.ordem === o)
                .map((e) => (
                  <Paper
                    key={e.id}
                    withBorder
                    p="xs"
                    data-etapa={e.descricao}
                    data-situacao={e.situacaoExibida}
                    style={{ borderLeft: `4px solid var(--mantine-color-${COR_ETAPA[e.situacaoExibida]}-6)` }}
                  >
                    <Text size="sm" fw={600} td={e.situacao === 'CANCELADA' ? 'line-through' : undefined}>
                      {e.descricao}
                    </Text>
                    <Group gap={4} mt={2}>
                      <Badge size="xs" variant="outline">
                        {ROTULO_ESPECIALIDADE[e.especialidade]}
                      </Badge>
                      <Badge size="xs" color={COR_ETAPA[e.situacaoExibida]}>
                        {ROTULO_SITUACAO_ETAPA[e.situacaoExibida]}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {e.executor?.nome ?? e.responsavel?.nome ?? 'Qualquer da especialidade'}
                    </Text>
                    {e.inicio && (
                      <Text size="xs" c="dimmed">
                        {formatarDataHora(e.inicio).slice(11)}
                        {e.fim ? ` – ${formatarDataHora(e.fim).slice(11)}` : ' – em andamento'}
                      </Text>
                    )}
                    {e.servicoExecutado && <Text size="xs">{e.servicoExecutado}</Text>}
                    {e.justificativaCancelamento && (
                      <Text size="xs" c="red">
                        {e.justificativaCancelamento}
                      </Text>
                    )}
                    <Group gap={4} mt={4}>
                      {podeAgir(e) && (
                        <Button size="compact-xs" onClick={() => setExecutando(e)}>
                          {e.situacao === 'PENDENTE' ? 'Iniciar' : 'Concluir'}
                        </Button>
                      )}
                      {controlador && e.situacao === 'PENDENTE' && os.situacao !== 'ENCERRADA' && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          onClick={() => setCancelando(e)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </Group>
                  </Paper>
                ))}
            </Stack>
          ))}
        </Group>
      </ScrollArea>
      {os.servicoExecutado && (
        <Text size="sm" mt="xs">
          <b>Serviço executado:</b> {os.servicoExecutado}
        </Text>
      )}
      <Modal
        opened={!!executando}
        onClose={() => setExecutando(null)}
        title={<Text fw={700}>{numeroOs(os.numero)}</Text>}
      >
        {executando && <AcaoEtapa etapa={executando} aoConcluir={() => setExecutando(null)} />}
      </Modal>
      <Modal
        opened={!!cancelando}
        onClose={() => setCancelando(null)}
        title={<Text fw={700}>Cancelar etapa</Text>}
      >
        {cancelando && <CancelarEtapa etapa={cancelando} aoConcluir={() => setCancelando(null)} />}
      </Modal>
      <Modal
        opened={incluindo}
        onClose={() => setIncluindo(false)}
        size="80rem"
        title={<Text fw={700}>Incluir etapas — {numeroOs(os.numero)}</Text>}
      >
        {incluindo && <IncluirEtapas os={os} aoConcluir={() => setIncluindo(false)} />}
      </Modal>
      <Modal
        opened={encerrando}
        onClose={() => setEncerrando(false)}
        title={<Text fw={700}>Encerrar {numeroOs(os.numero)}</Text>}
      >
        {encerrando && <EncerrarOs os={os} aoConcluir={() => setEncerrando(false)} />}
      </Modal>
    </Card>
  );
}

function Ordens({ eu }: { eu: Eu | undefined }) {
  const [filtro, setFiltro] = useState('ABERTAS');
  const lista = useQuery({
    queryKey: ['manutencao', 'ordens', filtro],
    queryFn: () => api.get<OrdemServico[]>(`/manutencao/ordens${filtro ? `?situacao=${filtro}` : ''}`),
  });
  return (
    <Stack>
      <SegmentedControl
        w="fit-content"
        value={filtro}
        onChange={setFiltro}
        data={[
          { value: 'ABERTAS', label: 'Em andamento' },
          { value: 'ENCERRADA', label: 'Encerradas' },
          { value: '', label: 'Todas' },
        ]}
      />
      <AlertaErroApi erro={lista.error} />
      {lista.data?.length === 0 && <Alert color="green">Nenhuma ordem de serviço nesta situação.</Alert>}
      {lista.data?.map((os) => (
        <CartaoOs key={os.id} os={os} eu={eu} />
      ))}
    </Stack>
  );
}

interface MinhaEtapa extends Etapa {
  os: { id: string; numero: number };
  solicitacao: { descricao: string; maquina: { codigo: string } | null; local: string | null };
}

/** Tela do técnico: etapas liberadas ou em execução da sua especialidade, em botões grandes. */
function MinhasEtapas() {
  const [executando, setExecutando] = useState<MinhaEtapa | null>(null);
  const dados = useQuery({
    queryKey: ['manutencao', 'minhas'],
    queryFn: () =>
      api.get<{ especialidades: EspecialidadeManutencao[]; etapas: MinhaEtapa[] }>(
        '/manutencao/minhas-etapas',
      ),
    refetchInterval: 30_000,
  });
  const d = dados.data;
  return (
    <Stack>
      {d && (
        <Text size="sm" c="dimmed">
          Suas especialidades:{' '}
          {d.especialidades.map((e) => ROTULO_ESPECIALIDADE[e]).join(', ') ||
            'nenhuma (peça ao superusuário)'}
        </Text>
      )}
      <AlertaErroApi erro={dados.error} />
      {d?.etapas.length === 0 && <Alert color="green">Nenhuma etapa liberada para você agora.</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {d?.etapas.map((e) => (
          <Card key={e.id} withBorder data-minha-etapa={e.descricao}>
            <Text size="xs" c="dimmed">
              {numeroOs(e.os.numero)} · {ondeE(e.solicitacao)}
            </Text>
            <Title order={4}>{e.descricao}</Title>
            <Text size="sm" c="dimmed" lineClamp={2}>
              {e.solicitacao.descricao}
            </Text>
            <Group gap={4} my="xs">
              <Badge variant="outline">{ROTULO_ESPECIALIDADE[e.especialidade]}</Badge>
              <Badge color={COR_ETAPA[e.situacaoExibida]}>{ROTULO_SITUACAO_ETAPA[e.situacaoExibida]}</Badge>
            </Group>
            <Button
              size="xl"
              color={e.situacao === 'PENDENTE' ? 'blue' : 'green'}
              onClick={() => setExecutando(e)}
            >
              {e.situacao === 'PENDENTE' ? 'Iniciar' : 'Concluir'}
            </Button>
          </Card>
        ))}
      </SimpleGrid>
      <Modal
        opened={!!executando}
        onClose={() => setExecutando(null)}
        title={<Text fw={700}>{executando && numeroOs(executando.os.numero)}</Text>}
      >
        {executando && <AcaoEtapa etapa={executando} aoConcluir={() => setExecutando(null)} />}
      </Modal>
    </Stack>
  );
}

function Modelos({ eu }: { eu: Eu | undefined }) {
  const invalidar = useInvalidar();
  const lista = useQuery({
    queryKey: ['manutencao', 'modelos'],
    queryFn: () => api.get<Modelo[]>('/manutencao/modelos'),
  });
  const [editando, setEditando] = useState<Partial<Modelo> | null>(null);
  const [etapas, setEtapas] = useState<EtapaEditada[]>([]);
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        nome: editando?.nome ?? '',
        descricao: editando?.descricao ?? null,
        ativo: editando?.ativo ?? true,
        etapas: paraEnvio(etapas).map(({ responsavelId: _r, ...e }) => e),
      };
      return editando?.id
        ? api.put(`/manutencao/modelos/${editando.id}`, corpo)
        : api.post('/manutencao/modelos', corpo);
    },
    onSuccess: () => {
      invalidar();
      setEditando(null);
    },
  });
  const controlador = !!eu?.controladorManutencao;
  return (
    <Stack>
      {controlador && (
        <Button
          w="fit-content"
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditando({ nome: '', ativo: true });
            setEtapas([]);
          }}
        >
          Novo modelo
        </Button>
      )}
      <AlertaErroApi erro={lista.error} />
      {lista.data?.map((m) => (
        <Card key={m.id} withBorder>
          <Group justify="space-between">
            <div>
              <Text fw={700}>
                {m.nome} {!m.ativo && <Badge color="gray">Inativo</Badge>}
              </Text>
              {m.descricao && (
                <Text size="xs" c="dimmed">
                  {m.descricao}
                </Text>
              )}
            </div>
            {controlador && (
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setEditando(m);
                  setEtapas(m.etapas.map((e) => ({ ...e, responsavelId: null })));
                }}
              >
                Editar
              </Button>
            )}
          </Group>
          <Text size="sm" mt={4}>
            {m.etapas
              .map((e) => `${e.ordem}. ${e.descricao} (${ROTULO_ESPECIALIDADE[e.especialidade]})`)
              .join(' → ')}
          </Text>
        </Card>
      ))}
      <Modal
        opened={!!editando}
        onClose={() => setEditando(null)}
        size="70rem"
        title={<Text fw={700}>Modelo de sequência</Text>}
      >
        {editando && (
          <Stack>
            <TextInput
              label="Nome"
              withAsterisk
              value={editando.nome ?? ''}
              onChange={(e) => setEditando({ ...editando, nome: e.currentTarget.value })}
            />
            <TextInput
              label="Descrição"
              value={editando.descricao ?? ''}
              onChange={(e) => setEditando({ ...editando, descricao: e.currentTarget.value })}
            />
            <Checkbox
              label="Ativo"
              checked={editando.ativo ?? true}
              onChange={(e) => setEditando({ ...editando, ativo: e.currentTarget.checked })}
            />
            <EditorEtapas etapas={etapas} aoMudar={setEtapas} tecnicos={[]} comResponsavel={false} />
            <AlertaErroApi erro={salvar.error} />
            <Group justify="flex-end">
              <Button
                disabled={!editando.nome?.trim() || !etapasValidas(etapas)}
                loading={salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                Salvar modelo
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

function Indicadores() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [periodo, setPeriodo] = useState<[string | null, string | null]>([`${hoje.slice(0, 8)}01`, hoje]);
  const [inicio, fim] = periodo;
  const dados = useQuery({
    queryKey: ['manutencao', 'indicadores', inicio, fim],
    queryFn: () =>
      api.get<{
        porMaquina: Record<string, string | number | null>[];
        porEspecialidade: { especialidade: EspecialidadeManutencao; horas: number; etapas: number }[];
        total: number;
      }>(`/manutencao/indicadores?inicio=${inicio}&fim=${fim}`),
    enabled: !!inicio && !!fim,
  });
  return (
    <Stack>
      <DatePickerInput
        type="range"
        label="Período (data da ocorrência)"
        valueFormat="DD/MM/YYYY"
        value={periodo}
        onChange={(v) => setPeriodo(v as [string | null, string | null])}
        w={260}
      />
      <AlertaErroApi erro={dados.error} />
      {dados.data && (
        <>
          <TabelaIndicador
            titulo="Solicitações e tempos por máquina"
            colunas={[
              { chave: 'maquina', rotulo: 'Máquina / local' },
              { chave: 'solicitacoes', rotulo: 'Solicitações', formato: 'numero', casas: 0 },
              { chave: 'abertas', rotulo: 'Em aberto', formato: 'numero', casas: 0 },
              { chave: 'recusadas', rotulo: 'Recusadas', formato: 'numero', casas: 0 },
              { chave: 'convertidas', rotulo: 'Viraram OS', formato: 'numero', casas: 0 },
              { chave: 'atendimentoMedioH', rotulo: 'Até o atendimento — média (h)', formato: 'numero' },
              { chave: 'atendimentoMaximoH', rotulo: 'Até o atendimento — máx. (h)', formato: 'numero' },
              { chave: 'reparoMedioH', rotulo: 'Reparo — média (h)', formato: 'numero' },
              { chave: 'reparoMaximoH', rotulo: 'Reparo — máx. (h)', formato: 'numero' },
            ]}
            linhas={dados.data.porMaquina}
          />
          <TabelaIndicador
            titulo="Horas por especialidade"
            colunas={[
              { chave: 'especialidade', rotulo: 'Especialidade' },
              { chave: 'etapas', rotulo: 'Etapas concluídas', formato: 'numero', casas: 0 },
              { chave: 'horas', rotulo: 'Horas trabalhadas', formato: 'numero' },
            ]}
            linhas={dados.data.porEspecialidade.map((e) => ({
              ...e,
              especialidade: ROTULO_ESPECIALIDADE[e.especialidade],
            }))}
          />
        </>
      )}
    </Stack>
  );
}

/** Manutenção (RN-14): solicitações, ordens de serviço em etapas, execução pelo técnico e indicadores. */
export function PaginaManutencao() {
  const { pode } = useAutenticacao();
  const eu = useEu();
  const executa = pode('manutencao.executar');
  if (eu.isLoading) return <Loader />;
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Manutenção</Title>
        {eu.data && executa && (
          <Group gap={4}>
            {eu.data.controladorManutencao && <Badge color="grape">Controlador</Badge>}
            {eu.data.especialidades.map((e) => (
              <Badge key={e} variant="outline">
                {ROTULO_ESPECIALIDADE[e]}
              </Badge>
            ))}
          </Group>
        )}
      </Group>
      <Tabs
        defaultValue={
          executa && !eu.data?.controladorManutencao && eu.data?.especialidades.length
            ? 'minhas'
            : 'solicitacoes'
        }
        keepMounted={false}
      >
        <Tabs.List>
          {executa && <Tabs.Tab value="minhas">Minhas etapas</Tabs.Tab>}
          <Tabs.Tab value="solicitacoes">Solicitações</Tabs.Tab>
          <Tabs.Tab value="ordens">Ordens de serviço</Tabs.Tab>
          <Tabs.Tab value="modelos">Modelos de sequência</Tabs.Tab>
          <Tabs.Tab value="indicadores">Indicadores</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="minhas" pt="md">
          <MinhasEtapas />
        </Tabs.Panel>
        <Tabs.Panel value="solicitacoes" pt="md">
          <Solicitacoes eu={eu.data} />
        </Tabs.Panel>
        <Tabs.Panel value="ordens" pt="md">
          <Ordens eu={eu.data} />
        </Tabs.Panel>
        <Tabs.Panel value="modelos" pt="md">
          <Modelos eu={eu.data} />
        </Tabs.Panel>
        <Tabs.Panel value="indicadores" pt="md">
          <Indicadores />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
