import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconBarcode, IconMinus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  avaliarPeso,
  esquemaEvento,
  ROTULO_TIPO_VOLUME,
  usaMolde,
  type TipoEvento,
  type TipoVolumeExtrusao,
} from '@apontamento/shared';
import { api } from '../../api/cliente';
import { useLista } from '../../componentes/PaginaCadastro';
import { imprimirComAviso } from '../../componentes/notificarImpressao';
import { useLotes } from '../MateriaPrima';
import {
  AlertaErroApi,
  errosApiPorCampo,
  errosZod,
  fmtNumero,
  notificarSucesso,
  numeroOuNulo,
} from '../../componentes/utilitarios';
import { CampoHora } from './CampoHora';
import { deCampoHora, paraCampoHora, type MaquinaNoTurno, type TurnoDetalhe } from './tipos';

export type TipoLancamento = Exclude<TipoEvento, 'SALDO_AVULSO_DEIXADO' | 'SALDO_AVULSO_RECEBIDO'>;

/** Leitura da etiqueta do lote/mistura (ou número do lote), com lista dos lotes com saldo como alternativa. */
function LeituraLote({
  valor,
  aoMudar,
  erro,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
}) {
  const { data: lotes = [] } = useLotes(true);
  return (
    <Group grow align="flex-start">
      <TextInput
        label="Etiqueta do lote ou mistura"
        description="Leia o código de barras ou digite o código / número do lote."
        size="lg"
        leftSection={<IconBarcode />}
        autoFocus
        value={valor}
        onChange={(e) => aoMudar(e.currentTarget.value)}
        error={erro}
      />
      <Select
        label="ou escolha o lote"
        size="lg"
        searchable
        clearable
        data={lotes.map((l) => ({
          value: l.numero,
          label: `${l.material.codigo} · ${l.numero} · ${fmtNumero(l.saldo)} kg`,
        }))}
        value={lotes.some((l) => l.numero === valor) ? valor : null}
        onChange={(v) => aoMudar(v ?? '')}
      />
    </Group>
  );
}

const COM_DIVISAO: TipoLancamento[] = [
  'SAIDA_PRODUCAO',
  'PERDA',
  'ENTRADA_MATERIA_PRIMA',
  'ENTRADA_SEMIACABADO',
  'DEVOLUCAO_MATERIA_PRIMA',
  'TRANSFERENCIA',
];

/** Formulário de um lançamento do apontador, pensado para toque (botões grandes, poucas digitações). */
export function FormularioLancamento({
  turno,
  maquina,
  tipo,
  aoConcluir,
}: {
  turno: TurnoDetalhe;
  maquina: MaquinaNoTurno;
  tipo: TipoLancamento;
  aoConcluir: () => void;
}) {
  const cliente = useQueryClient();
  // O identificador é gerado uma vez: reenviar após falha de rede não duplica o lançamento.
  const [idEvento] = useState(() => crypto.randomUUID());
  const [hora, setHora] = useState(paraCampoHora());
  const [horaEditada, setHoraEditada] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [divisaoId, setDivisaoId] = useState<string | null>(maquina.divisoes[0]?.id ?? null);
  const [motivoParadaId, setMotivoParadaId] = useState<string | null>(null);
  const [conjuntoPadraoId, setConjuntoPadraoId] = useState<string | null>(null);
  const [conjuntosPadrao, setConjuntosPadrao] = useState<number>(1);
  const [avulsos, setAvulsos] = useState<(number | string)[]>([]);
  const [confirmarAvulso, setConfirmarAvulso] = useState(false);
  const [pesoMedioG, setPesoMedioG] = useState<number | string>('');
  const [volumes, setVolumes] = useState<{ tipoVolume: TipoVolumeExtrusao; pesoKg: number | string }[]>([
    { tipoVolume: 'SACO', pesoKg: '' },
  ]);
  const [operador, setOperador] = useState('');
  const [indiceFluidez, setIndiceFluidez] = useState<number | string>('');
  const [produtosDestino, setProdutosDestino] = useState<string[]>([]);
  const [tipoPerdaId, setTipoPerdaId] = useState<string | null>(null);
  const [pesoKg, setPesoKg] = useState<number | string>('');
  const [quantidadePecas, setQuantidadePecas] = useState<number | string>('');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState<number | string>('');
  const [divisaoDestinoId, setDivisaoDestinoId] = useState<string | null>(null);
  const [cavidade, setCavidade] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const { data: motivos = [] } = useLista('motivos-parada', true);
  const { data: tiposPerda = [] } = useLista('tipos-perda', true);
  const { data: produtos = [] } = useLista('produtos', true);
  const { data: conjuntos = [] } = useLista('conjuntos-padrao', true);
  const destinos = useQuery({
    queryKey: ['turnos', 'divisoes-abertas'],
    queryFn: () =>
      api.get<
        {
          id: string;
          codigo: string;
          maquinaId: string;
          maquina: { codigo: string };
          ordem: { produto: { codigo: string } };
        }[]
      >('/turnos/divisoes-abertas'),
    enabled: tipo === 'TRANSFERENCIA',
  });

  const divisao = maquina.divisoes.find((d) => d.id === divisaoId);
  const op = maquina.rodada.ops.find((o) => o.id === divisao?.rodadaOpId);
  const comMolde = usaMolde(maquina.maquina.tipo);
  const conjuntosDoProduto = conjuntos.filter((c) => c.produtoId === op?.ordem.produto.id);
  const conjunto =
    conjuntosDoProduto.find((c) => c.id === conjuntoPadraoId) ??
    (conjuntosDoProduto.length === 1 ? conjuntosDoProduto[0] : undefined);
  const qtdConjunto = (conjunto?.quantidade as number | undefined) ?? 0;
  const avulsosNum = avulsos.map((a) => numeroOuNulo(a)).filter((a): a is number => a !== null);
  const totalPecas = conjuntosPadrao * qtdConjunto + avulsosNum.reduce((s, a) => s + a, 0);
  const peso = useMemo(
    () =>
      numeroOuNulo(pesoMedioG)
        ? avaliarPeso(Number(pesoMedioG), op?.fichaTecnica.pesoPadraoG, op?.fichaTecnica.toleranciaPesoPct)
        : null,
    [pesoMedioG, op],
  );
  const cavidadesRodada = maquina.rodada.ops
    .flatMap((o) => o.cavidades.map((c) => ({ c, produto: o.ordem.produto.codigo })))
    .sort((a, b) => a.c - b.c);
  const bloqueadas = new Set(maquina.cavidadesBloqueadas.map((b) => b.cavidade));

  const corpo = (): Record<string, unknown> => {
    const base = {
      id: idEvento,
      tipo,
      maquinaId: maquina.maquinaId,
      horaOcorrencia: !horaEditada ? new Date().toISOString() : hora ? deCampoHora(hora) : '',
      justificativa: justificativa || null,
    };
    switch (tipo) {
      case 'PARADA':
        return { ...base, motivoParadaId };
      case 'SAIDA_PRODUCAO':
        return comMolde
          ? {
              ...base,
              divisaoId,
              conjuntoPadraoId: conjunto?.id ?? null,
              conjuntosPadrao,
              avulsos: avulsosNum,
              confirmarAvulso,
              pesoMedioG: numeroOuNulo(pesoMedioG),
            }
          : {
              ...base,
              divisaoId,
              volumes: volumes.map((v) => ({ tipoVolume: v.tipoVolume, pesoKg: numeroOuNulo(v.pesoKg) })),
              operador: operador || null,
              indiceFluidez: numeroOuNulo(indiceFluidez),
              produtosDestino,
            };
      case 'PERDA':
        return {
          ...base,
          divisaoId,
          tipoPerdaId,
          pesoKg: numeroOuNulo(pesoKg),
          quantidadePecas: numeroOuNulo(quantidadePecas),
        };
      case 'ENTRADA_MATERIA_PRIMA':
      case 'DEVOLUCAO_MATERIA_PRIMA':
        return { ...base, divisaoId, leitura: lote, quantidadeKg: numeroOuNulo(quantidade) };
      case 'TRANSFERENCIA':
        return {
          ...base,
          divisaoId,
          leitura: lote,
          quantidadeKg: numeroOuNulo(quantidade),
          divisaoDestinoId,
        };
      case 'ENTRADA_SEMIACABADO':
        return { ...base, divisaoId, leitura: lote };
      case 'BLOQUEIO_CAVIDADE':
        return { ...base, cavidade, motivo };
      case 'DESBLOQUEIO_CAVIDADE':
        return { ...base, cavidade };
      default:
        return base;
    }
  };

  const enviar = useMutation({
    mutationFn: (c: Record<string, unknown>) =>
      api.post<{ avisos: string[]; etiquetas: { id: string; codigo: string }[] }>(
        `/turnos/${turno.id}/eventos`,
        c,
      ),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['turno', turno.id] });
      notificarSucesso('Lançamento registrado.');
      for (const a of r.avisos ?? []) notificarSucesso(a);
      aoConcluir();
      // Uma etiqueta por conjunto/volume/perda/devolução/transferência; falha deixa pendente.
      void imprimirComAviso(r.etiquetas ?? []).then(() =>
        cliente.invalidateQueries({ queryKey: ['etiquetas'] }),
      );
    },
    onError: (e) => setErros(errosApiPorCampo(e)),
  });

  const confirmar = () => {
    const c = corpo();
    const e = errosZod(esquemaEvento, c);
    if (tipo === 'SAIDA_PRODUCAO' && comMolde && peso?.naoConforme && !justificativa)
      e.justificativa = 'Justificativa obrigatória: peso fora da tolerância.';
    if (tipo === 'SAIDA_PRODUCAO' && avulsosNum.length && !confirmarAvulso)
      e.confirmarAvulso = 'Confirme o conjunto avulso.';
    setErros(e);
    if (Object.keys(e).length === 0) enviar.mutate(c);
  };

  const botoes = <T extends { id: string }>(
    lista: T[],
    valor: string | null,
    aoEscolher: (id: string) => void,
    rotulo: (x: T) => string,
  ) => (
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
      {lista.map((x) => (
        <Button
          key={x.id}
          size="lg"
          variant={valor === x.id ? 'filled' : 'default'}
          onClick={() => aoEscolher(x.id)}
          styles={{ label: { whiteSpace: 'normal', textAlign: 'center' } }}
          h="auto"
          py="sm"
        >
          {rotulo(x)}
        </Button>
      ))}
    </SimpleGrid>
  );

  return (
    <Stack>
      <CampoHora
        valor={hora}
        aoMudar={(v, editada) => {
          setHora(v);
          setHoraEditada(editada);
        }}
        erro={erros.horaOcorrencia}
      />

      {COM_DIVISAO.includes(tipo) && (
        <Stack gap={4}>
          <Text fw={500}>OP</Text>
          {maquina.divisoes.length === 0 ? (
            <Alert color="yellow">Crie a divisão da OP no turno antes de lançar.</Alert>
          ) : (
            botoes(
              maquina.divisoes,
              divisaoId,
              setDivisaoId,
              (d) =>
                `${d.codigo} · ${maquina.rodada.ops.find((o) => o.id === d.rodadaOpId)?.ordem.produto.codigo ?? ''}`,
            )
          )}
        </Stack>
      )}

      {tipo === 'PARADA' && (
        <Stack gap={4}>
          <Text fw={500}>Motivo</Text>
          {botoes(
            motivos,
            motivoParadaId,
            setMotivoParadaId,
            (m) => `${m.codigo} — ${m.descricao}${m.programada ? ' (programada)' : ''}`,
          )}
          {erros.motivoParadaId && (
            <Text c="red" size="sm">
              Escolha o motivo.
            </Text>
          )}
        </Stack>
      )}

      {tipo === 'SAIDA_PRODUCAO' && comMolde && (
        <>
          {conjuntosDoProduto.length > 1 && (
            <Select
              label="Conjunto padrão"
              size="lg"
              data={conjuntosDoProduto.map((c) => ({
                value: c.id,
                label: `${c.tipoEmbalagem} de ${c.quantidade}`,
              }))}
              value={conjunto?.id ?? null}
              onChange={setConjuntoPadraoId}
            />
          )}
          {conjuntosDoProduto.length === 0 && op && (
            <Alert color="red">Produto sem conjunto padrão cadastrado.</Alert>
          )}
          <Group align="flex-end">
            <Stack gap={4}>
              <Text fw={500}>
                Conjuntos padrão {conjunto ? `(${conjunto.tipoEmbalagem as string} de ${qtdConjunto})` : ''}
              </Text>
              <Group gap="xs">
                <ActionIcon
                  size={56}
                  variant="default"
                  aria-label="Menos um conjunto"
                  onClick={() => setConjuntosPadrao(Math.max(0, conjuntosPadrao - 1))}
                >
                  <IconMinus />
                </ActionIcon>
                <NumberInput
                  aria-label="Número de conjuntos"
                  size="xl"
                  w={110}
                  value={conjuntosPadrao}
                  onChange={(v) => setConjuntosPadrao(Math.max(0, Math.floor(Number(v) || 0)))}
                  allowDecimal={false}
                  hideControls
                  styles={{ input: { textAlign: 'center', fontWeight: 700 } }}
                />
                <ActionIcon
                  size={56}
                  variant="default"
                  aria-label="Mais um conjunto"
                  onClick={() => setConjuntosPadrao(conjuntosPadrao + 1)}
                >
                  <IconPlus />
                </ActionIcon>
              </Group>
            </Stack>
            <NumberInput
              label="Peso médio da peça"
              size="xl"
              w={200}
              rightSection={<Text c="dimmed">g</Text>}
              decimalSeparator=","
              hideControls
              value={pesoMedioG}
              onChange={setPesoMedioG}
              error={erros.pesoMedioG}
            />
          </Group>
          {avulsos.map((a, i) => (
            <Group key={i} align="flex-end">
              <NumberInput
                label={`Conjunto avulso ${i + 1} (peças)`}
                size="lg"
                value={a}
                onChange={(v) => setAvulsos(avulsos.map((x, j) => (j === i ? v : x)))}
                allowDecimal={false}
                hideControls
                w={220}
              />
              <ActionIcon
                size="xl"
                color="red"
                variant="subtle"
                aria-label="Remover avulso"
                onClick={() => setAvulsos(avulsos.filter((_, j) => j !== i))}
              >
                <IconTrash />
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            color="orange"
            w="fit-content"
            leftSection={<IconPlus size={16} />}
            onClick={() => setAvulsos([...avulsos, ''])}
          >
            Conjunto avulso (quantidade diferente do padrão)
          </Button>
          {avulsosNum.length > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="Conjunto AVULSO">
              <Checkbox
                size="md"
                label="Confirmo o fechamento de conjunto com quantidade diferente do padrão"
                checked={confirmarAvulso}
                onChange={(e) => setConfirmarAvulso(e.currentTarget.checked)}
                error={erros.confirmarAvulso}
              />
            </Alert>
          )}
          <Text size="xl" fw={700}>
            Total: {fmtNumero(totalPecas, 0)} peças em {conjuntosPadrao + avulsosNum.length} conjunto(s)
          </Text>
          {peso?.naoConforme && (
            <Alert color="red" icon={<IconAlertTriangle />} title="Peso fora da tolerância (NC)">
              Desvio de {fmtNumero(peso.desvioPct)}% sobre {fmtNumero(op?.fichaTecnica.pesoPadraoG)} g
              (tolerância {fmtNumero(op?.fichaTecnica.toleranciaPesoPct)}%). Informe a justificativa; o
              lançamento vai para aprovação do líder.
            </Alert>
          )}
        </>
      )}

      {tipo === 'SAIDA_PRODUCAO' && !comMolde && (
        <>
          {volumes.map((v, i) => (
            <Group key={i} align="flex-end" wrap="nowrap">
              <Select
                label={`Volume ${i + 1}`}
                size="lg"
                data={Object.entries(ROTULO_TIPO_VOLUME).map(([value, label]) => ({ value, label }))}
                value={v.tipoVolume}
                onChange={(t) =>
                  setVolumes(
                    volumes.map((x, j) =>
                      j === i ? { ...x, tipoVolume: (t ?? 'SACO') as TipoVolumeExtrusao } : x,
                    ),
                  )
                }
                w={170}
              />
              <NumberInput
                label="Peso"
                size="lg"
                rightSection={<Text c="dimmed">kg</Text>}
                decimalSeparator=","
                hideControls
                value={v.pesoKg}
                onChange={(p) => setVolumes(volumes.map((x, j) => (j === i ? { ...x, pesoKg: p } : x)))}
                style={{ flex: 1 }}
              />
              {volumes.length > 1 && (
                <ActionIcon
                  size="xl"
                  color="red"
                  variant="subtle"
                  aria-label="Remover volume"
                  onClick={() => setVolumes(volumes.filter((_, j) => j !== i))}
                >
                  <IconTrash />
                </ActionIcon>
              )}
            </Group>
          ))}
          <Button
            variant="subtle"
            w="fit-content"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              setVolumes([...volumes, { tipoVolume: volumes.at(-1)?.tipoVolume ?? 'SACO', pesoKg: '' }])
            }
          >
            Adicionar volume
          </Button>
          <TextInput
            label="Operador que produziu"
            size="lg"
            value={operador}
            onChange={(e) => setOperador(e.currentTarget.value)}
            error={erros.operador}
          />
          <Group grow align="flex-start">
            <NumberInput
              label="Média de fluidez (opcional)"
              size="lg"
              decimalSeparator=","
              hideControls
              value={indiceFluidez}
              onChange={setIndiceFluidez}
            />
            <MultiSelect
              label="Produtos a que se destina"
              size="lg"
              searchable
              data={produtos
                .filter((p) => ['ACABADO', 'SEMIACABADO'].includes(p.tipo as string))
                .map((p) => ({ value: p.id, label: p.codigo as string }))}
              value={produtosDestino}
              onChange={setProdutosDestino}
            />
          </Group>
        </>
      )}

      {tipo === 'PERDA' && (
        <>
          <Text fw={500}>Tipo de perda</Text>
          {botoes(tiposPerda, tipoPerdaId, setTipoPerdaId, (t) => t.descricao as string)}
          {erros.tipoPerdaId && (
            <Text c="red" size="sm">
              Escolha o tipo.
            </Text>
          )}
          <Group grow>
            <NumberInput
              label="Peso"
              size="lg"
              rightSection={<Text c="dimmed">kg</Text>}
              decimalSeparator=","
              hideControls
              value={pesoKg}
              onChange={setPesoKg}
              error={erros.pesoKg}
            />
            <NumberInput
              label="Quantidade"
              size="lg"
              rightSection={<Text c="dimmed">pç</Text>}
              allowDecimal={false}
              hideControls
              value={quantidadePecas}
              onChange={setQuantidadePecas}
            />
          </Group>
        </>
      )}

      {(tipo === 'ENTRADA_MATERIA_PRIMA' ||
        tipo === 'DEVOLUCAO_MATERIA_PRIMA' ||
        tipo === 'TRANSFERENCIA') && (
        <>
          <LeituraLote valor={lote} aoMudar={setLote} erro={erros.leitura} />
          <Group grow>
            <NumberInput
              label="Quantidade"
              size="lg"
              rightSection={<Text c="dimmed">kg</Text>}
              decimalSeparator=","
              hideControls
              value={quantidade}
              onChange={setQuantidade}
              error={erros.quantidadeKg}
            />
          </Group>
          {tipo === 'TRANSFERENCIA' && (
            <Select
              label="Máquina / OP de destino"
              size="lg"
              data={(destinos.data ?? [])
                .filter((d) => d.maquinaId !== maquina.maquinaId)
                .map((d) => ({
                  value: d.id,
                  label: `${d.maquina.codigo} · ${d.codigo} · ${d.ordem.produto.codigo}`,
                }))}
              value={divisaoDestinoId}
              onChange={setDivisaoDestinoId}
              error={erros.divisaoDestinoId && 'Escolha o destino.'}
            />
          )}
        </>
      )}

      {tipo === 'ENTRADA_SEMIACABADO' && (
        <TextInput
          label="Etiqueta do semiacabado"
          description="Leia o código de barras ou digite o código (ex.: T2-0000123)."
          size="xl"
          leftSection={<IconBarcode />}
          autoFocus
          value={lote}
          onChange={(e) => setLote(e.currentTarget.value)}
          error={erros.leitura}
        />
      )}

      {(tipo === 'BLOQUEIO_CAVIDADE' || tipo === 'DESBLOQUEIO_CAVIDADE') && (
        <>
          <Text fw={500}>Cavidade</Text>
          <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
            {cavidadesRodada.map(({ c, produto }) => {
              const habilitada = tipo === 'BLOQUEIO_CAVIDADE' ? !bloqueadas.has(c) : bloqueadas.has(c);
              return (
                <Button
                  key={c}
                  size="lg"
                  h="auto"
                  py="sm"
                  disabled={!habilitada}
                  variant={cavidade === c ? 'filled' : 'default'}
                  color={bloqueadas.has(c) ? 'red' : undefined}
                  onClick={() => setCavidade(c)}
                >
                  {c} · {produto}
                </Button>
              );
            })}
          </SimpleGrid>
          {erros.cavidade && (
            <Text c="red" size="sm">
              Escolha a cavidade.
            </Text>
          )}
          {tipo === 'BLOQUEIO_CAVIDADE' && (
            <TextInput
              label="Motivo do bloqueio"
              size="lg"
              value={motivo}
              onChange={(e) => setMotivo(e.currentTarget.value)}
              error={erros.motivo}
            />
          )}
        </>
      )}

      <Textarea
        label={
          tipo === 'SAIDA_PRODUCAO' && peso?.naoConforme
            ? 'Justificativa (obrigatória)'
            : 'Justificativa / observação (opcional)'
        }
        withAsterisk={tipo === 'SAIDA_PRODUCAO' && !!peso?.naoConforme}
        autosize
        minRows={2}
        value={justificativa}
        onChange={(e) => setJustificativa(e.currentTarget.value)}
        error={erros.justificativa}
      />
      <AlertaErroApi erro={enviar.error} />
      <Group grow>
        <Button size="xl" variant="default" onClick={aoConcluir}>
          Cancelar
        </Button>
        <Button size="xl" onClick={confirmar} loading={enviar.isPending}>
          Confirmar
        </Button>
      </Group>
    </Stack>
  );
}
