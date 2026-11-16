import { notifications } from '@mantine/notifications';
import {
  calcularMeta,
  codigoDivisao,
  codigoEtiqueta,
  esquemaEvento,
  horasDisponiveisSugeridas,
  numeroLoteExtrusao,
  planejarEtiquetas,
  preencherModeloZpl,
  usaMolde,
  valoresImpressao,
  type EventoEntrada,
} from '@apontamento/shared';
import { ErroApi } from '../api/cliente';
import { enviarAoAgente } from '../api/impressao';
import { lerPosto } from '../api/posto';
import { imprimirComAviso } from '../componentes/notificarImpressao';
import { banco, type EtiquetaLocal } from './db';
import { enfileirar, enviarAgora, itensDoUsuario } from './fila';
import { atualizarPacote, lerPacote, reservarSequencias, type Pacote } from './pacote';
import type { MaquinaNoTurno, OpDaRodada, TurnoDetalhe } from '../paginas/apontamento/tipos';

/**
 * Ações do apontador (seção 11): tudo é gravado primeiro no tablet e enviado em seguida. Com
 * conexão, a resposta do servidor volta para a tela na hora; sem conexão, o item fica na fila.
 */

export type Resultado<T = unknown> = { enviado: true; corpo: T } | { enviado: false };

const avisoOffline = (texto: string) =>
  notifications.show({
    color: 'yellow',
    title: 'Salvo no tablet',
    message: `${texto} Será enviado quando a conexão voltar.`,
    autoClose: 5000,
  });

export async function abrirTurno(dados: { data: string; horarioTurnoId: string; equipeId: string }) {
  const id = crypto.randomUUID();
  const item = await enfileirar({
    id: crypto.randomUUID(),
    tipo: 'ABRIR_TURNO',
    rota: '/turnos',
    corpo: { ...dados, id, abertoEm: new Date().toISOString() },
    turnoId: id,
    posto: lerPosto().postoId,
  });
  const r = await enviarAgora<TurnoDetalhe>(item);
  if (!r.enviado) avisoOffline('Turno aberto.');
  void atualizarPacote();
  return { turnoId: id, ...r };
}

export async function ligarMaquina(
  turnoId: string,
  corpo: {
    eventoId: string;
    maquinaId: string;
    rodadaId: string;
    horaOcorrencia: string;
    iniciarParadaMotivoId: string | null;
  },
) {
  const item = await enfileirar({
    id: crypto.randomUUID(),
    tipo: 'LIGAR_MAQUINA',
    rota: `/turnos/${turnoId}/maquinas`,
    corpo,
    turnoId,
    posto: lerPosto().postoId,
  });
  const r = await enviarAgora(item);
  if (!r.enviado) avisoOffline('Máquina ligada.');
  return r;
}

export async function criarDivisao(
  turnoId: string,
  corpo: {
    rodadaOpId: string;
    maquinaId: string;
    horasDisponiveis: number | undefined;
    saldoRecebido: number | null;
  },
  local: { codigo: string; meta: number },
) {
  const item = await enfileirar({
    id: crypto.randomUUID(),
    tipo: 'CRIAR_DIVISAO',
    rota: `/turnos/${turnoId}/divisoes`,
    corpo: { ...corpo, id: crypto.randomUUID() },
    turnoId,
    posto: lerPosto().postoId,
    local,
  });
  const r = await enviarAgora<{ codigo: string }>(item);
  if (!r.enviado) avisoOffline(`Divisão ${local.codigo} criada (código provisório).`);
  return r;
}

export async function fecharTurno(turnoId: string, corpo: { maquinas: unknown[]; saldos: unknown[] }) {
  const item = await enfileirar({
    id: crypto.randomUUID(),
    tipo: 'FECHAR_TURNO',
    rota: `/turnos/${turnoId}/fechar`,
    corpo: { ...corpo, horaFechamento: new Date().toISOString() },
    turnoId,
    posto: lerPosto().postoId,
  });
  const r = await enviarAgora(item);
  if (!r.enviado) avisoOffline('Turno fechado.');
  return r;
}

// ---------- lançamentos e etiquetas ----------

/** Escolhe o layout (primeiro ativo do tipo, por nome) e a impressora padrão, como o servidor. */
function layoutDoTipo(pacote: Pacote, tipo: string) {
  const layout = pacote.layouts.find((l) => l.tipoEtiqueta === tipo);
  if (!layout) return null;
  const impressora =
    pacote.impressoras.find((i) => i.id === layout.impressoraPadraoId) ?? pacote.impressoras[0];
  return impressora ? { layout, impressora } : null;
}

/** Imprime no agente da rede local com o ZPL montado no tablet (sem servidor). */
export async function imprimirLocal(etiquetas: EtiquetaLocal[], segundaVia = false) {
  const pacote = await lerPacote();
  const impressas: string[] = [];
  const pendentes: string[] = [];
  let mensagem = '';
  for (const e of etiquetas) {
    const alvo = pacote ? layoutDoTipo(pacote, e.tipo) : null;
    let sucesso = false;
    let msg: string | null = 'Layout ou impressora não disponível no tablet.';
    if (alvo) {
      const zpl = preencherModeloZpl(
        alvo.layout.modeloZpl,
        valoresImpressao(e, {
          segundaVia,
          larguraMm: alvo.layout.larguraMm,
          alturaMm: alvo.layout.alturaMm,
          dpi: alvo.impressora.resolucaoDpi,
        }),
      );
      const envio = await enviarAoAgente({ zpl, impressora: alvo.impressora });
      sucesso = envio.sucesso;
      msg = envio.mensagem;
    }
    await banco.impressoes.add({
      id: crypto.randomUUID(),
      itemId: e.itemId,
      codigo: e.codigo,
      layoutId: alvo?.layout.id ?? null,
      impressoraId: alvo?.impressora.id ?? null,
      sucesso,
      mensagem: msg,
      em: new Date().toISOString(),
    });
    if (sucesso) {
      impressas.push(e.codigo);
      await banco.etiquetas.update(e.codigo, { impressa: true });
    } else {
      pendentes.push(e.codigo);
      mensagem = msg ?? '';
    }
  }
  if (impressas.length)
    notifications.show({
      color: 'green',
      title: 'Etiquetas impressas',
      message: impressas.join(', '),
      autoClose: 4000,
    });
  if (pendentes.length)
    notifications.show({
      color: 'orange',
      title: `${pendentes.length} etiqueta(s) com impressão pendente`,
      message: `${pendentes.join(', ')} — ${mensagem}`,
      autoClose: 10000,
    });
}

/** Monta as etiquetas do lançamento com os números do bloco do tablet (iguais às que o servidor grava). */
async function prepararEtiquetas(
  turno: TurnoDetalhe,
  maquina: MaquinaNoTurno,
  entrada: EventoEntrada,
  itemId: string,
  horaRegistro: string,
): Promise<{ sequencias: number[] | null; etiquetas: EtiquetaLocal[] }> {
  const pacote = await lerPacote();
  if (!pacote || !('divisaoId' in entrada)) return { sequencias: null, etiquetas: [] };
  const divisao = maquina.divisoes.find((d) => d.id === entrada.divisaoId);
  const op = maquina.rodada.ops.find((o) => o.id === divisao?.rodadaOpId);
  if (!divisao || !op) return { sequencias: null, etiquetas: [] };
  const conj =
    entrada.tipo === 'SAIDA_PRODUCAO'
      ? pacote.conjuntos.find((c) => c.id === entrada.conjuntoPadraoId)
      : undefined;
  const destino =
    entrada.tipo === 'TRANSFERENCIA'
      ? pacote.divisoesAbertas.find((d) => d.id === entrada.divisaoDestinoId)
      : undefined;
  const planejadas = planejarEtiquetas(entrada, {
    conjunto:
      usaMolde(maquina.maquina.tipo) && conj
        ? { quantidade: conj.quantidade, tipoEmbalagem: conj.tipoEmbalagem }
        : null,
    maquinaCodigo: maquina.maquina.codigo,
    divisaoCodigo: divisao.codigo,
    tipoPerda:
      entrada.tipo === 'PERDA'
        ? pacote.tiposPerda.find((t) => t.id === entrada.tipoPerdaId)?.descricao
        : undefined,
    destinos:
      entrada.tipo === 'SAIDA_PRODUCAO'
        ? entrada.produtosDestino
            .map((id) => pacote.produtos.find((p) => p.id === id)?.codigo ?? '')
            .join(', ')
        : undefined,
    maquinaDestino: destino?.maquina.codigo,
    divisaoDestinoCodigo: destino?.codigo,
  });
  if (!planejadas.length) return { sequencias: null, etiquetas: [] };
  const posto = lerPosto().postoId;
  if (!posto || pacote.posto?.id !== posto) {
    throw new ErroApi(
      422,
      'Este posto não está configurado. Em "Configurar este posto", escolha o dispositivo antes de emitir etiquetas.',
    );
  }
  let sequencias = await reservarSequencias(planejadas.length);
  if (!sequencias) {
    await atualizarPacote();
    sequencias = await reservarSequencias(planejadas.length);
  }
  if (!sequencias) return { sequencias: null, etiquetas: [] };
  const lote =
    entrada.tipo === 'DEVOLUCAO_MATERIA_PRIMA' || entrada.tipo === 'TRANSFERENCIA'
      ? pacote.lotes.find((l) => l.numero === entrada.leitura)
      : undefined;
  const produto = lote
    ? { codigo: lote.material.codigo, descricao: lote.material.descricao }
    : {
        codigo: op.ordem.produto.codigo,
        descricao: op.ordem.produto.descricao,
        cor: pacote.produtos.find((p) => p.id === op.ordem.produto.id)?.cor ?? null,
      };
  const etiquetas: EtiquetaLocal[] = planejadas.map((p, i) => ({
    ...p,
    itemId,
    impressa: false,
    codigo: codigoEtiqueta(pacote.posto!.prefixo, sequencias![i]),
    emitidaEm: horaRegistro,
    produto,
    lote: lote
      ? { numero: lote.numero }
      : p.tipo === 'EXTRUSAO'
        ? { numero: numeroLoteExtrusao(divisao.codigo) }
        : null,
    divisao: {
      codigo: divisao.codigo,
      ordem: { numeroErp: op.ordem.numeroErp, numeroInterno: op.ordem.numeroInterno },
      maquina: { codigo: maquina.maquina.codigo },
    },
    turno: { equipe: { letra: turno.equipe.letra }, horarioTurno: { nome: turno.horarioTurno.nome } },
    responsavel: { login: pacote.usuario.login },
  }));
  return { sequencias, etiquetas };
}

/**
 * Lançamento do apontador: grava no tablet, com os números de etiqueta do bloco reservado. Com
 * conexão o servidor responde na hora e as etiquetas saem pela API; sem conexão o tablet monta o
 * ZPL e imprime direto no agente da rede local.
 */
export async function lancarEvento(
  turno: TurnoDetalhe,
  maquina: MaquinaNoTurno,
  corpo: Record<string, unknown>,
) {
  const entrada = esquemaEvento.parse(corpo);
  const itemId = crypto.randomUUID();
  const horaRegistro = new Date().toISOString();
  const { sequencias, etiquetas } = await prepararEtiquetas(turno, maquina, entrada, itemId, horaRegistro);
  const item = await enfileirar({
    id: itemId,
    tipo: 'EVENTO',
    rota: `/turnos/${turno.id}/eventos`,
    corpo: { ...corpo, ...(sequencias ? { sequencias } : {}) },
    turnoId: turno.id,
    posto: lerPosto().postoId,
    horaRegistro,
  });
  if (etiquetas.length) await banco.etiquetas.bulkPut(etiquetas);
  const r = await enviarAgora<{ avisos: string[]; etiquetas: { id: string; codigo: string }[] }>(item);
  if (r.enviado) {
    await banco.etiquetas.where('itemId').equals(itemId).delete();
    void imprimirComAviso(r.corpo.etiquetas ?? []);
    return r;
  }
  avisoOffline('Lançamento registrado.');
  if (etiquetas.length) await imprimirLocal(etiquetas);
  return r;
}

// ---------- propostas montadas no tablet (sem servidor) ----------

export interface PropostaDivisao {
  codigo: string;
  sequencial: number;
  horasSugeridas: number;
  horasDisponiveis: number;
  paradaProgramadaPrevistaMin: number;
  phReferencia: number;
  produzidoOp: number;
  saldoOp: number;
  meta: number;
  saldoSoltoPendente: number;
  ordem: OpDaRodada['ordem'];
  provisoria?: boolean;
}

/** Mesma conta da API (RN-04) com os dados do pacote; o código fica provisório até subir. */
export async function propostaLocal(
  turno: TurnoDetalhe,
  maquina: MaquinaNoTurno,
  op: OpDaRodada,
  horasInformadas: number | null,
): Promise<PropostaDivisao> {
  const pacote = await lerPacote();
  const ordem = pacote?.ordens.find((o) => o.id === op.ordemId);
  const naFila = (await itensDoUsuario()).filter(
    (i) =>
      i.tipo === 'CRIAR_DIVISAO' &&
      maquina.rodada.ops.find((x) => x.id === i.corpo.rodadaOpId)?.ordemId === op.ordemId,
  ).length;
  const sequencial = (ordem?.ultimoSequencial ?? 0) + naFila + 1;
  const horario = pacote?.horarios.find((h) => h.nome === turno.horarioTurno.nome);
  const inicio = turno.eventos
    .filter(
      (e) => e.maquinaId === maquina.maquinaId && e.tipo === 'INICIO_MAQUINA' && e.situacao !== 'INCORRETO',
    )
    .map((e) => e.horaOcorrencia)
    .sort()[0];
  const horasSugeridas = horasDisponiveisSugeridas({
    inicioMaquina: inicio ? new Date(inicio) : new Date(),
    inicioNominal: new Date(turno.inicioNominal),
    fimNominal: new Date(turno.fimNominal),
    paradaProgramadaPrevistaMin: horario?.paradaProgramadaPrevistaMin ?? 0,
  });
  const horas = horasInformadas ?? horasSugeridas;
  const produzido = ordem?.produzido ?? 0;
  const saldoOp = Math.max(0, Math.round((op.ordem.quantidade - produzido) * 1000) / 1000);
  return {
    codigo: codigoDivisao(op.ordem.numeroErp ?? String(op.ordem.numeroInterno), sequencial),
    sequencial,
    horasSugeridas,
    horasDisponiveis: horas,
    paradaProgramadaPrevistaMin: horario?.paradaProgramadaPrevistaMin ?? 0,
    phReferencia: op.fichaTecnica.phPadrao,
    produzidoOp: produzido,
    saldoOp,
    meta: calcularMeta(horas, op.fichaTecnica.phPadrao, saldoOp, op.ordem.unidade),
    saldoSoltoPendente: naFila ? 0 : (ordem?.saldoSoltoPendente ?? 0),
    ordem: op.ordem,
    provisoria: true,
  };
}

/** Máquinas que podem ser ligadas, montadas com o pacote (sem servidor). */
export async function maquinasDisponiveisLocal(turno: TurnoDetalhe) {
  const pacote = await lerPacote();
  return (pacote?.maquinas ?? []).map((m) => ({
    maquina: m.maquina,
    rodadas: m.rodadas,
    noTurno: turno.maquinas.some((x) => x.maquinaId === m.maquina.id),
    emOutroTurno:
      m.ocupadaPor && m.ocupadaPor.turnoId !== turno.id ? { apontador: m.ocupadaPor.apontador } : null,
    sugestaoInicio: m.sugestaoInicio,
    sugestaoParadaMotivoId: m.sugestaoParadaMotivoId,
    rodadaAnteriorId: m.rodadaAnteriorId,
  }));
}
