import { Badge, Group, Text } from '@mantine/core';
import {
  esquemaConjuntoPadrao,
  esquemaDispositivo,
  esquemaEquipe,
  esquemaHorarioTurno,
  esquemaImpressora,
  esquemaLayoutEtiqueta,
  esquemaLocalEstoque,
  esquemaMaquina,
  esquemaMolde,
  esquemaMotivoParada,
  esquemaProduto,
  esquemaTipoPerda,
  esquemaUsuarioAtualizar,
  esquemaUsuarioCriar,
  ROTULO_DIA_SEMANA,
  ROTULO_MODALIDADE_TURNO,
  ROTULO_PERFIL,
  ROTULO_TIPO_EMBALAGEM,
  ROTULO_TIPO_ETIQUETA,
  ROTULO_TIPO_LOCAL_ESTOQUE,
  ROTULO_TIPO_MAQUINA,
  ROTULO_TIPO_PRODUTO,
  ROTULO_UNIDADE,
  usaMolde,
  type Perfil,
  type TipoEmbalagem,
  type TipoEtiqueta,
  type TipoLocalEstoque,
  type TipoMaquina,
  type TipoProduto,
  type Unidade,
} from '@apontamento/shared';
import type { ConfigCadastro, Registro, Valores } from '../componentes/PaginaCadastro';
import { Ativo, fmtNumero, SimNao } from '../componentes/utilitarios';

const semDatas = (r: Registro): Valores => {
  const { id: _i, criadoEm: _c, atualizadoEm: _a, ...resto } = r;
  return resto;
};

export const configMaquinas: ConfigCadastro = {
  titulo: 'Máquinas',
  singular: 'Máquina',
  rota: 'maquinas',
  descricao: 'Injetoras e sopradoras (peças, com molde) e extrusoras (kg).',
  esquema: esquemaMaquina,
  campoAtivo: 'ativa',
  valoresIniciais: {
    codigo: '',
    descricao: '',
    tipo: 'INJETORA',
    ativa: true,
    forcaFechamentoT: '',
    distanciaColunasHorizontalMm: '',
    distanciaColunasVerticalMm: '',
    alturaMoldeMinMm: '',
    alturaMoldeMaxMm: '',
    pesoMaxMoldeKg: '',
    pressaoInjecaoBar: '',
    capacidadeInjecaoG: '',
    capacidadeKgH: '',
    parametrosAdicionais: [],
  },
  paraFormulario: (r) => {
    const v = semDatas(r);
    for (const k of Object.keys(v)) if (v[k] === null) v[k] = '';
    return v;
  },
  paraEnvio: (v) => {
    const comMolde = usaMolde(v.tipo as TipoMaquina);
    const campos = [
      'forcaFechamentoT',
      'distanciaColunasHorizontalMm',
      'distanciaColunasVerticalMm',
      'alturaMoldeMinMm',
      'alturaMoldeMaxMm',
      'pesoMaxMoldeKg',
      'pressaoInjecaoBar',
      'capacidadeInjecaoG',
    ];
    const r = { ...v };
    for (const c of campos) if (!comMolde) r[c] = null;
    if (comMolde) r.capacidadeKgH = null;
    return r;
  },
  campos: [
    { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'enum', opcoes: ROTULO_TIPO_MAQUINA, obrigatorio: true },
    { nome: 'ativa', rotulo: 'Ativa', tipo: 'booleano' },
    ...(
      [
        ['forcaFechamentoT', 'Força de fechamento', 't'],
        ['pressaoInjecaoBar', 'Pressão de injeção', 'bar'],
        ['distanciaColunasHorizontalMm', 'Distância entre colunas — horizontal', 'mm'],
        ['distanciaColunasVerticalMm', 'Distância entre colunas — vertical', 'mm'],
        ['alturaMoldeMinMm', 'Altura de molde mínima', 'mm'],
        ['alturaMoldeMaxMm', 'Altura de molde máxima', 'mm'],
        ['pesoMaxMoldeKg', 'Peso máximo de molde', 'kg'],
        ['capacidadeInjecaoG', 'Capacidade de injeção', 'g'],
      ] as const
    ).map(([nome, rotulo, unidade]) => ({
      nome,
      rotulo,
      unidade,
      tipo: 'numero' as const,
      obrigatorio: true,
      visivel: (v: Valores) => usaMolde(v.tipo as TipoMaquina),
    })),
    {
      nome: 'capacidadeKgH',
      rotulo: 'Capacidade',
      tipo: 'numero',
      unidade: 'kg/h',
      obrigatorio: true,
      visivel: (v) => v.tipo === 'EXTRUSORA',
    },
    { nome: 'parametrosAdicionais', rotulo: 'Parâmetros adicionais', tipo: 'parametrosLivres' },
  ],
  colunas: [
    { rotulo: 'Código', valor: (r) => <Text fw={600}>{r.codigo as string}</Text> },
    { rotulo: 'Descrição', valor: (r) => r.descricao as string },
    { rotulo: 'Tipo', valor: (r) => ROTULO_TIPO_MAQUINA[r.tipo as TipoMaquina] },
    {
      rotulo: 'Capacidade',
      valor: (r) =>
        r.tipo === 'EXTRUSORA'
          ? `${fmtNumero(r.capacidadeKgH as number)} kg/h`
          : `${fmtNumero(r.forcaFechamentoT as number)} t · ${fmtNumero(r.capacidadeInjecaoG as number)} g`,
    },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativa as boolean} /> },
  ],
};

export const configMoldes: ConfigCadastro = {
  titulo: 'Moldes',
  singular: 'Molde',
  rota: 'moldes',
  descricao:
    'Dimensões e exigências do molde, usadas na verificação de compatibilidade com as máquinas (RN-02).',
  esquema: esquemaMolde,
  campoAtivo: 'ativo',
  valoresIniciais: {
    codigo: '',
    descricao: '',
    larguraMm: '',
    comprimentoMm: '',
    alturaMm: '',
    pesoKg: '',
    numeroCavidades: 1,
    forcaFechamentoT: '',
    pressaoBar: '',
    pesoInjetadoG: '',
    podeGirar: false,
    ativo: true,
  },
  paraFormulario: (r) => {
    const { cavidades: _c, ...v } = semDatas(r);
    return v;
  },
  campos: [
    { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
    {
      nome: 'larguraMm',
      rotulo: 'Largura',
      tipo: 'numero',
      unidade: 'mm',
      obrigatorio: true,
      ajuda: 'Comparada à distância horizontal entre colunas.',
    },
    {
      nome: 'comprimentoMm',
      rotulo: 'Comprimento',
      tipo: 'numero',
      unidade: 'mm',
      obrigatorio: true,
      ajuda: 'Comparado à distância vertical entre colunas.',
    },
    { nome: 'alturaMm', rotulo: 'Altura', tipo: 'numero', unidade: 'mm', obrigatorio: true },
    { nome: 'pesoKg', rotulo: 'Peso', tipo: 'numero', unidade: 'kg', obrigatorio: true },
    { nome: 'numeroCavidades', rotulo: 'Número de cavidades', tipo: 'inteiro', obrigatorio: true },
    {
      nome: 'forcaFechamentoT',
      rotulo: 'Força de fechamento exigida',
      tipo: 'numero',
      unidade: 't',
      obrigatorio: true,
    },
    { nome: 'pressaoBar', rotulo: 'Pressão exigida', tipo: 'numero', unidade: 'bar', obrigatorio: true },
    {
      nome: 'pesoInjetadoG',
      rotulo: 'Peso injetado por ciclo',
      tipo: 'numero',
      unidade: 'g',
      obrigatorio: true,
    },
    {
      nome: 'podeGirar',
      rotulo: 'Pode ser montado girado 90°',
      tipo: 'booleano',
      ajuda: 'Marque somente se o molde puder ser instalado girado entre as colunas.',
    },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Código', valor: (r) => <Text fw={600}>{r.codigo as string}</Text> },
    { rotulo: 'Descrição', valor: (r) => r.descricao as string },
    {
      rotulo: 'Dimensões (L × C × A)',
      valor: (r) =>
        `${fmtNumero(r.larguraMm as number)} × ${fmtNumero(r.comprimentoMm as number)} × ${fmtNumero(r.alturaMm as number)} mm`,
    },
    { rotulo: 'Cavidades', valor: (r) => r.numeroCavidades as number },
    {
      rotulo: 'Exige',
      valor: (r) =>
        `${fmtNumero(r.forcaFechamentoT as number)} t · ${fmtNumero(r.pesoInjetadoG as number)} g`,
    },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configProdutos: ConfigCadastro = {
  titulo: 'Produtos',
  singular: 'Produto',
  rota: 'produtos',
  descricao: 'O código deve ser igual ao do ERP.',
  esquema: esquemaProduto,
  campoAtivo: 'ativo',
  valoresIniciais: { codigo: '', descricao: '', tipo: 'ACABADO', unidade: 'PECA', cor: '', ativo: true },
  paraFormulario: (r) => ({ ...semDatas(r), cor: r.cor ?? '' }),
  campos: [
    { nome: 'codigo', rotulo: 'Código (ERP)', tipo: 'texto', obrigatorio: true },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'enum', opcoes: ROTULO_TIPO_PRODUTO, obrigatorio: true },
    { nome: 'unidade', rotulo: 'Unidade', tipo: 'enum', opcoes: ROTULO_UNIDADE, obrigatorio: true },
    { nome: 'cor', rotulo: 'Cor', tipo: 'texto' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Código', valor: (r) => <Text fw={600}>{r.codigo as string}</Text> },
    { rotulo: 'Descrição', valor: (r) => r.descricao as string },
    { rotulo: 'Tipo', valor: (r) => ROTULO_TIPO_PRODUTO[r.tipo as TipoProduto] },
    { rotulo: 'Unidade', valor: (r) => ROTULO_UNIDADE[r.unidade as Unidade] },
    { rotulo: 'Cor', valor: (r) => (r.cor as string) ?? '' },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

const rotuloProduto = (r: Registro) => `${r.codigo} — ${r.descricao}`;

export const configConjuntos: ConfigCadastro = {
  titulo: 'Conjuntos padrão',
  singular: 'Conjunto padrão',
  rota: 'conjuntos-padrao',
  descricao: 'Quantidade de peças por embalagem; cada conjunto gera uma etiqueta na saída de produção.',
  esquema: esquemaConjuntoPadrao,
  campoAtivo: 'ativo',
  valoresIniciais: { produtoId: null, tipoEmbalagem: 'PALLET', quantidade: '', ativo: true },
  paraFormulario: (r) => {
    const { produto: _p, ...v } = semDatas(r);
    return v;
  },
  campos: [
    {
      nome: 'produtoId',
      rotulo: 'Produto',
      tipo: 'referencia',
      obrigatorio: true,
      inteiro: true,
      referencia: { rota: 'produtos', rotulo: rotuloProduto, filtro: (r) => r.ativo === true },
    },
    {
      nome: 'tipoEmbalagem',
      rotulo: 'Tipo de embalagem',
      tipo: 'enum',
      opcoes: ROTULO_TIPO_EMBALAGEM,
      obrigatorio: true,
    },
    { nome: 'quantidade', rotulo: 'Quantidade por conjunto', tipo: 'numero', obrigatorio: true },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Produto', valor: (r) => rotuloProduto(r.produto as Registro) },
    { rotulo: 'Embalagem', valor: (r) => ROTULO_TIPO_EMBALAGEM[r.tipoEmbalagem as TipoEmbalagem] },
    {
      rotulo: 'Quantidade',
      valor: (r) =>
        `${fmtNumero(r.quantidade as number)} ${ROTULO_UNIDADE[(r.produto as Registro).unidade as Unidade]}`,
    },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configMotivosParada: ConfigCadastro = {
  titulo: 'Motivos de parada',
  singular: 'Motivo de parada',
  rota: 'motivos-parada',
  esquema: esquemaMotivoParada,
  campoAtivo: 'ativo',
  valoresIniciais: {
    codigo: '',
    descricao: '',
    programada: false,
    geraSolicitacaoManutencao: false,
    ativo: true,
  },
  paraFormulario: semDatas,
  campos: [
    { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
    {
      nome: 'programada',
      rotulo: 'Parada programada',
      tipo: 'booleano',
      ajuda: 'Paradas programadas saem do tempo planejado no OEE.',
    },
    { nome: 'geraSolicitacaoManutencao', rotulo: 'Gera solicitação de manutenção', tipo: 'booleano' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Código', valor: (r) => <Text fw={600}>{r.codigo as string}</Text> },
    { rotulo: 'Descrição', valor: (r) => r.descricao as string },
    { rotulo: 'Programada', valor: (r) => <SimNao valor={r.programada as boolean} /> },
    { rotulo: 'Gera manutenção', valor: (r) => <SimNao valor={r.geraSolicitacaoManutencao as boolean} /> },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configTiposPerda: ConfigCadastro = {
  titulo: 'Tipos de perda',
  singular: 'Tipo de perda',
  rota: 'tipos-perda',
  esquema: esquemaTipoPerda,
  campoAtivo: 'ativo',
  valoresIniciais: { descricao: '', contaComoRefugo: false, ativo: true },
  paraFormulario: semDatas,
  campos: [
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true },
    {
      nome: 'contaComoRefugo',
      rotulo: 'Conta como refugo de peça',
      tipo: 'booleano',
      ajuda: 'Entra no fator Qualidade do OEE.',
    },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Descrição', valor: (r) => <Text fw={600}>{r.descricao as string}</Text> },
    { rotulo: 'Refugo de peça', valor: (r) => <SimNao valor={r.contaComoRefugo as boolean} /> },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configLocaisEstoque: ConfigCadastro = {
  titulo: 'Locais de estoque',
  singular: 'Local de estoque',
  rota: 'locais-estoque',
  esquema: esquemaLocalEstoque,
  campoAtivo: 'ativo',
  valoresIniciais: { nome: '', tipo: 'PRODUTO_ACABADO', ativo: true },
  paraFormulario: semDatas,
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'enum', opcoes: ROTULO_TIPO_LOCAL_ESTOQUE, obrigatorio: true },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (r) => <Text fw={600}>{r.nome as string}</Text> },
    { rotulo: 'Tipo', valor: (r) => ROTULO_TIPO_LOCAL_ESTOQUE[r.tipo as TipoLocalEstoque] },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configImpressoras: ConfigCadastro = {
  titulo: 'Impressoras',
  singular: 'Impressora',
  rota: 'impressoras',
  descricao: 'Impressoras Zebra de rede (ZPL pela porta 9100).',
  esquema: esquemaImpressora,
  campoAtivo: 'ativa',
  valoresIniciais: { nome: '', enderecoIp: '', porta: 9100, resolucaoDpi: '203', ativa: true },
  paraFormulario: (r) => ({ ...semDatas(r), resolucaoDpi: String(r.resolucaoDpi) }),
  paraEnvio: (v) => ({ ...v, resolucaoDpi: Number(v.resolucaoDpi) }),
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    { nome: 'enderecoIp', rotulo: 'Endereço IP', tipo: 'texto', obrigatorio: true },
    { nome: 'porta', rotulo: 'Porta', tipo: 'inteiro', obrigatorio: true },
    {
      nome: 'resolucaoDpi',
      rotulo: 'Resolução',
      tipo: 'enum',
      opcoes: { '152': '152 dpi', '203': '203 dpi', '300': '300 dpi', '600': '600 dpi' },
      obrigatorio: true,
    },
    { nome: 'ativa', rotulo: 'Ativa', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (r) => <Text fw={600}>{r.nome as string}</Text> },
    { rotulo: 'Endereço', valor: (r) => `${r.enderecoIp}:${r.porta}` },
    { rotulo: 'Resolução', valor: (r) => `${r.resolucaoDpi} dpi` },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativa as boolean} /> },
  ],
};

export const configLayouts: ConfigCadastro = {
  titulo: 'Layouts de etiqueta',
  singular: 'Layout de etiqueta',
  rota: 'layouts-etiqueta',
  descricao:
    'Modelo ZPL com campos substituíveis, por exemplo {{codigo}}, {{produto}}, {{quantidade}}. A impressão de teste chega na Fase 3.',
  esquema: esquemaLayoutEtiqueta,
  campoAtivo: 'ativo',
  valoresIniciais: {
    nome: '',
    tipoEtiqueta: 'PRODUTO',
    larguraMm: 100,
    alturaMm: 150,
    modeloZpl: '^XA\n^FO40,40^A0N,40,40^FD{{codigo}}^FS\n^XZ',
    impressoraPadraoId: null,
    ativo: true,
  },
  paraFormulario: (r) => {
    const { impressoraPadrao: _i, ...v } = semDatas(r);
    return v;
  },
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    {
      nome: 'tipoEtiqueta',
      rotulo: 'Tipo de etiqueta',
      tipo: 'enum',
      opcoes: ROTULO_TIPO_ETIQUETA,
      obrigatorio: true,
    },
    { nome: 'larguraMm', rotulo: 'Largura', tipo: 'numero', unidade: 'mm', obrigatorio: true },
    { nome: 'alturaMm', rotulo: 'Altura', tipo: 'numero', unidade: 'mm', obrigatorio: true },
    {
      nome: 'impressoraPadraoId',
      rotulo: 'Impressora padrão',
      tipo: 'referencia',
      referencia: { rota: 'impressoras', rotulo: (r) => r.nome as string, filtro: (r) => r.ativa === true },
    },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
    { nome: 'modeloZpl', rotulo: 'Modelo ZPL', tipo: 'textoLongo', obrigatorio: true },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (r) => <Text fw={600}>{r.nome as string}</Text> },
    { rotulo: 'Tipo', valor: (r) => ROTULO_TIPO_ETIQUETA[r.tipoEtiqueta as TipoEtiqueta] },
    {
      rotulo: 'Tamanho',
      valor: (r) => `${fmtNumero(r.larguraMm as number)} × ${fmtNumero(r.alturaMm as number)} mm`,
    },
    {
      rotulo: 'Impressora padrão',
      valor: (r) => ((r.impressoraPadrao as Registro | null)?.nome as string) ?? '—',
    },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configDispositivos: ConfigCadastro = {
  titulo: 'Dispositivos (postos)',
  singular: 'Dispositivo',
  rota: 'dispositivos',
  descricao: 'O prefixo de 2 caracteres compõe o código das etiquetas emitidas pelo posto (ex.: T3-0001245).',
  esquema: esquemaDispositivo,
  campoAtivo: 'ativo',
  valoresIniciais: { nome: '', prefixo: '', descricao: '', ativo: true },
  paraFormulario: (r) => ({ ...semDatas(r), descricao: r.descricao ?? '' }),
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    {
      nome: 'prefixo',
      rotulo: 'Prefixo',
      tipo: 'texto',
      obrigatorio: true,
      ajuda: '2 letras ou números, único.',
    },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    {
      rotulo: 'Prefixo',
      valor: (r) => (
        <Badge size="lg" variant="outline">
          {r.prefixo as string}
        </Badge>
      ),
    },
    { rotulo: 'Nome', valor: (r) => r.nome as string },
    { rotulo: 'Descrição', valor: (r) => (r.descricao as string) ?? '' },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configHorarios: ConfigCadastro = {
  titulo: 'Horários de turno',
  singular: 'Horário de turno',
  rota: 'horarios-turno',
  descricao:
    'Horário central (ex.: 08:00 às 17:48, segunda a sexta) ou revezamento por turnos de letra (ex.: 07–19 e 19–07).',
  esquema: esquemaHorarioTurno,
  campoAtivo: 'ativo',
  valoresIniciais: {
    nome: '',
    modalidade: 'REVEZAMENTO',
    horaInicio: '07:00',
    horaFim: '19:00',
    diasSemana: [0, 1, 2, 3, 4, 5, 6],
    ativo: true,
  },
  paraFormulario: semDatas,
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, ajuda: 'Ex.: Dia, Noite, Central.' },
    {
      nome: 'modalidade',
      rotulo: 'Modalidade',
      tipo: 'enum',
      opcoes: ROTULO_MODALIDADE_TURNO,
      obrigatorio: true,
    },
    { nome: 'horaInicio', rotulo: 'Hora de início', tipo: 'hora', obrigatorio: true },
    {
      nome: 'horaFim',
      rotulo: 'Hora de fim',
      tipo: 'hora',
      obrigatorio: true,
      ajuda: 'Pode ser menor que o início (turno atravessa a meia-noite).',
    },
    { nome: 'diasSemana', rotulo: 'Dias da semana', tipo: 'diasSemana', inteiro: true },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (r) => <Text fw={600}>{r.nome as string}</Text> },
    {
      rotulo: 'Modalidade',
      valor: (r) => ROTULO_MODALIDADE_TURNO[r.modalidade as 'CENTRAL' | 'REVEZAMENTO'],
    },
    { rotulo: 'Horário', valor: (r) => `${r.horaInicio} às ${r.horaFim}` },
    {
      rotulo: 'Dias',
      valor: (r) =>
        (r.diasSemana as number[]).length === 7
          ? 'Todos'
          : (r.diasSemana as number[]).map((d) => ROTULO_DIA_SEMANA[d]).join(', '),
    },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configEquipes: ConfigCadastro = {
  titulo: 'Equipes',
  singular: 'Equipe',
  rota: 'equipes',
  esquema: esquemaEquipe,
  campoAtivo: 'ativo',
  valoresIniciais: { letra: '', descricao: '', ativo: true },
  paraFormulario: (r) => ({ ...semDatas(r), descricao: r.descricao ?? '' }),
  campos: [
    { nome: 'letra', rotulo: 'Letra', tipo: 'texto', obrigatorio: true, ajuda: 'Ex.: A, B, C, D ou ADM.' },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
    { nome: 'ativo', rotulo: 'Ativa', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Letra', valor: (r) => <Badge size="lg">{r.letra as string}</Badge> },
    { rotulo: 'Descrição', valor: (r) => (r.descricao as string) ?? '' },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};

export const configUsuarios: ConfigCadastro = {
  titulo: 'Usuários',
  singular: 'Usuário',
  rota: 'usuarios',
  descricao: 'Um usuário pode acumular mais de um perfil.',
  esquema: esquemaUsuarioCriar,
  esquemaEdicao: esquemaUsuarioAtualizar,
  campoAtivo: 'ativo',
  permissaoEscrita: 'usuarios.escrever',
  valoresIniciais: { nome: '', login: '', senha: '', perfis: [], equipeId: null, ativo: true },
  paraFormulario: (r) => ({
    nome: r.nome,
    login: r.login,
    senha: '',
    perfis: r.perfis,
    equipeId: r.equipeId,
    ativo: r.ativo,
  }),
  paraEnvio: (v, edicao) => ({ ...v, senha: edicao && !v.senha ? null : v.senha }),
  campos: [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
    { nome: 'login', rotulo: 'Login', tipo: 'texto', obrigatorio: true, ajuda: 'Pode ser um e-mail.' },
    {
      nome: 'senha',
      rotulo: 'Senha',
      tipo: 'senha',
      ajuda:
        'Mínimo de 8 caracteres. Na edição, deixe em branco para manter. O usuário deverá trocá-la no próximo acesso.',
    },
    { nome: 'perfis', rotulo: 'Perfis', tipo: 'multienum', opcoes: ROTULO_PERFIL, obrigatorio: true },
    {
      nome: 'equipeId',
      rotulo: 'Equipe',
      tipo: 'referencia',
      referencia: {
        rota: 'equipes',
        rotulo: (r) => `${r.letra}${r.descricao ? ` — ${r.descricao}` : ''}`,
        filtro: (r) => r.ativo === true,
      },
    },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (r) => <Text fw={600}>{r.nome as string}</Text> },
    { rotulo: 'Login', valor: (r) => r.login as string },
    {
      rotulo: 'Perfis',
      valor: (r) => (
        <Group gap={4}>
          {(r.perfis as Perfil[]).map((p) => (
            <Badge key={p} variant="light">
              {ROTULO_PERFIL[p]}
            </Badge>
          ))}
        </Group>
      ),
    },
    { rotulo: 'Equipe', valor: (r) => ((r.equipe as Registro | null)?.letra as string) ?? '—' },
    { rotulo: 'Situação', valor: (r) => <Ativo valor={r.ativo as boolean} /> },
  ],
};
