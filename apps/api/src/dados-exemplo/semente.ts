/**
 * Carga de dados de exemplo (idempotente): pode ser executada mais de uma vez.
 * 3 injetoras, 1 sopradora, 1 extrusora, moldes, produtos, conjuntos, fichas técnicas,
 * usuários de cada perfil, motivos de parada, tipos de perda, locais, escala e parâmetros.
 */
import * as argon2 from 'argon2';
import {
  calcularPhPadrao,
  gerarEscalaCentral,
  gerarEscalaRevezamento,
  PARAMETROS_INICIAIS,
  somarDias,
} from '@apontamento/shared';
import { criarPrismaClient } from '../prisma/prisma.service.js';
import { ADMIN_INICIAL } from '../configuracao.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export const SENHA_EXEMPLO = 'Senha@123';

export async function carregarDadosExemplo(
  prisma: PrismaClient,
  opcoes: { escala?: boolean } = {},
): Promise<void> {
  // ---------- Parâmetros (mantém valores já alterados) ----------
  for (const p of PARAMETROS_INICIAIS) {
    await prisma.parametroSistema.upsert({
      where: { chave: p.chave },
      create: {
        chave: p.chave,
        valor: p.valorInicial,
        tipo: p.tipo,
        opcoes: p.opcoes ?? [],
        descricao: p.descricao,
      },
      update: { tipo: p.tipo, opcoes: p.opcoes ?? [], descricao: p.descricao },
    });
  }

  // ---------- Equipes e horários ----------
  const equipes: Record<string, string> = {};
  for (const [letra, descricao] of [
    ['A', 'Equipe A'],
    ['B', 'Equipe B'],
    ['C', 'Equipe C'],
    ['D', 'Equipe D'],
    ['ADM', 'Horário central (administrativo)'],
  ]) {
    const e = await prisma.equipe.upsert({ where: { letra }, create: { letra, descricao }, update: {} });
    equipes[letra] = e.id;
  }
  const horarios: Record<string, string> = {};
  for (const h of [
    {
      nome: 'Dia',
      modalidade: 'REVEZAMENTO' as const,
      horaInicio: '07:00',
      horaFim: '19:00',
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      nome: 'Noite',
      modalidade: 'REVEZAMENTO' as const,
      horaInicio: '19:00',
      horaFim: '07:00',
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      nome: 'Central',
      modalidade: 'CENTRAL' as const,
      horaInicio: '08:00',
      horaFim: '17:48',
      diasSemana: [1, 2, 3, 4, 5],
    },
  ]) {
    const r = await prisma.horarioTurno.upsert({
      where: { nome: h.nome },
      create: { ...h, paradaProgramadaPrevistaMin: 60 },
      update: {},
    });
    horarios[h.nome] = r.id;
  }

  // ---------- Usuários ----------
  const hashExemplo = await argon2.hash(SENHA_EXEMPLO, { type: argon2.argon2id });
  const usuarios: Record<string, string> = {};
  const admin = await prisma.usuario.upsert({
    where: { login: ADMIN_INICIAL.login },
    create: {
      nome: ADMIN_INICIAL.nome,
      login: ADMIN_INICIAL.login,
      senhaHash: await argon2.hash(ADMIN_INICIAL.senha, { type: argon2.argon2id }),
      perfis: ['SUPERUSUARIO'],
      deveTrocarSenha: true,
    },
    update: {},
  });
  usuarios.admin = admin.id;
  for (const u of [
    { chave: 'pcp', nome: 'Paula Planejamento', login: 'pcp@exemplo.com.br', perfis: ['PCP' as const] },
    {
      chave: 'apontador',
      nome: 'João Apontador',
      login: 'apontador@exemplo.com.br',
      perfis: ['APONTADOR' as const],
      equipe: 'A',
    },
    {
      chave: 'apontador2',
      nome: 'Marina Apontadora',
      login: 'apontador2@exemplo.com.br',
      perfis: ['APONTADOR' as const],
      equipe: 'B',
    },
    {
      chave: 'lider',
      nome: 'Luís Líder',
      login: 'lider@exemplo.com.br',
      perfis: ['LIDER' as const],
      equipe: 'A',
    },
    {
      chave: 'estoque',
      nome: 'Ester Estoque',
      login: 'estoque@exemplo.com.br',
      perfis: ['ESTOQUE' as const],
    },
    {
      chave: 'mp',
      nome: 'Mateus Matéria-Prima',
      login: 'materiaprima@exemplo.com.br',
      perfis: ['MATERIA_PRIMA' as const],
    },
    {
      chave: 'manutencao',
      nome: 'Manuel Manutenção',
      login: 'manutencao@exemplo.com.br',
      perfis: ['MANUTENCAO' as const],
    },
  ]) {
    const r = await prisma.usuario.upsert({
      where: { login: u.login },
      create: {
        nome: u.nome,
        login: u.login,
        senhaHash: hashExemplo,
        perfis: u.perfis,
        equipeId: u.equipe ? equipes[u.equipe] : null,
      },
      update: {},
    });
    usuarios[u.chave] = r.id;
  }

  // ---------- Máquinas ----------
  const maquinas: Record<string, string> = {};
  const dadosMaquinas = [
    {
      codigo: 'INJ-01',
      descricao: 'Injetora 250 t',
      tipo: 'INJETORA' as const,
      forcaFechamentoT: 250,
      distanciaColunasHorizontalMm: 560,
      distanciaColunasVerticalMm: 560,
      alturaMoldeMinMm: 220,
      alturaMoldeMaxMm: 560,
      pesoMaxMoldeKg: 1500,
      pressaoInjecaoBar: 2100,
      capacidadeInjecaoG: 1200,
    },
    {
      codigo: 'INJ-02',
      descricao: 'Injetora 450 t',
      tipo: 'INJETORA' as const,
      forcaFechamentoT: 450,
      distanciaColunasHorizontalMm: 760,
      distanciaColunasVerticalMm: 710,
      alturaMoldeMinMm: 300,
      alturaMoldeMaxMm: 760,
      pesoMaxMoldeKg: 3500,
      pressaoInjecaoBar: 2000,
      capacidadeInjecaoG: 2800,
    },
    {
      codigo: 'INJ-03',
      descricao: 'Injetora 150 t',
      tipo: 'INJETORA' as const,
      forcaFechamentoT: 150,
      distanciaColunasHorizontalMm: 460,
      distanciaColunasVerticalMm: 410,
      alturaMoldeMinMm: 180,
      alturaMoldeMaxMm: 450,
      pesoMaxMoldeKg: 700,
      pressaoInjecaoBar: 2200,
      capacidadeInjecaoG: 450,
    },
    {
      codigo: 'SOP-01',
      descricao: 'Sopradora 2 estações',
      tipo: 'SOPRADORA' as const,
      forcaFechamentoT: 12,
      distanciaColunasHorizontalMm: 500,
      distanciaColunasVerticalMm: 450,
      alturaMoldeMinMm: 150,
      alturaMoldeMaxMm: 400,
      pesoMaxMoldeKg: 400,
      pressaoInjecaoBar: 10,
      capacidadeInjecaoG: 600,
    },
    {
      codigo: 'EXT-01',
      descricao: 'Extrusora recicladora 90 mm',
      tipo: 'EXTRUSORA' as const,
      capacidadeKgH: 120,
    },
  ];
  for (const m of dadosMaquinas) {
    const r = await prisma.maquina.upsert({ where: { codigo: m.codigo }, create: m, update: {} });
    maquinas[m.codigo] = r.id;
  }

  // ---------- Produtos ----------
  const produtos: Record<string, string> = {};
  const dadosProdutos = [
    {
      codigo: 'CAD-0031',
      descricao: 'Cadeira plástica sem braço branca',
      tipo: 'ACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Branca',
    },
    {
      codigo: 'CAD-0032',
      descricao: 'Cadeira plástica sem braço azul',
      tipo: 'ACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Azul',
    },
    {
      codigo: 'CAD-0033',
      descricao: 'Cadeira plástica sem braço preta',
      tipo: 'ACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Preta',
    },
    {
      codigo: 'MES-0010',
      descricao: 'Tampo de mesa quadrada 70 cm',
      tipo: 'SEMIACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Branca',
    },
    {
      codigo: 'BAL-0005',
      descricao: 'Balde 10 litros',
      tipo: 'ACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Preta',
    },
    {
      codigo: 'FRA-0002',
      descricao: 'Frasco 1 litro PEAD',
      tipo: 'ACABADO' as const,
      unidade: 'PECA' as const,
      cor: 'Natural',
    },
    {
      codigo: 'PP-H103',
      descricao: 'Polipropileno homopolímero H103',
      tipo: 'MATERIA_PRIMA' as const,
      unidade: 'KG' as const,
      cor: 'Natural',
    },
    {
      codigo: 'PEAD-5502',
      descricao: 'Polietileno de alta densidade 5502',
      tipo: 'MATERIA_PRIMA' as const,
      unidade: 'KG' as const,
      cor: 'Natural',
    },
    {
      codigo: 'MB-BR01',
      descricao: 'Masterbatch branco',
      tipo: 'ADITIVO' as const,
      unidade: 'KG' as const,
      cor: 'Branca',
    },
    {
      codigo: 'MB-AZ01',
      descricao: 'Masterbatch azul',
      tipo: 'ADITIVO' as const,
      unidade: 'KG' as const,
      cor: 'Azul',
    },
    {
      codigo: 'MB-PR01',
      descricao: 'Masterbatch preto',
      tipo: 'ADITIVO' as const,
      unidade: 'KG' as const,
      cor: 'Preta',
    },
    { codigo: 'MOI-PP', descricao: 'PP moído', tipo: 'MOIDO' as const, unidade: 'KG' as const, cor: 'Mista' },
    {
      codigo: 'EXT-PP-REC',
      descricao: 'PP reciclado extrusado (granulado)',
      tipo: 'EXTRUSADO' as const,
      unidade: 'KG' as const,
      cor: 'Preta',
    },
  ];
  for (const p of dadosProdutos) {
    const r = await prisma.produto.upsert({ where: { codigo: p.codigo }, create: p, update: {} });
    produtos[p.codigo] = r.id;
  }

  // ---------- Conjuntos padrão ----------
  for (const [codigo, tipoEmbalagem, quantidade] of [
    ['CAD-0031', 'PILHA', 30],
    ['CAD-0032', 'PILHA', 30],
    ['CAD-0033', 'PILHA', 30],
    ['MES-0010', 'PALLET', 20],
    ['BAL-0005', 'CAIXOTE', 50],
    ['FRA-0002', 'GAIOLA', 200],
  ] as const) {
    await prisma.conjuntoPadrao.upsert({
      where: { produtoId_tipoEmbalagem: { produtoId: produtos[codigo], tipoEmbalagem } },
      create: { produtoId: produtos[codigo], tipoEmbalagem, quantidade },
      update: {},
    });
  }

  // ---------- Moldes e cavidades ----------
  const moldes: Record<string, string> = {};
  const dadosMoldes = [
    {
      codigo: 'MOL-CAD-3',
      descricao: 'Molde cadeira 3 cavidades (família)',
      larguraMm: 520,
      comprimentoMm: 540,
      alturaMm: 480,
      pesoKg: 1350,
      numeroCavidades: 3,
      forcaFechamentoT: 240,
      pressaoBar: 1800,
      pesoInjetadoG: 1150,
      podeGirar: false,
      cavidades: ['CAD-0031', 'CAD-0032', 'CAD-0033'],
    },
    {
      codigo: 'MOL-MES-1',
      descricao: 'Molde tampo de mesa 1 cavidade',
      larguraMm: 720,
      comprimentoMm: 690,
      alturaMm: 650,
      pesoKg: 3100,
      numeroCavidades: 1,
      forcaFechamentoT: 420,
      pressaoBar: 1700,
      pesoInjetadoG: 2400,
      podeGirar: true,
      cavidades: ['MES-0010'],
    },
    {
      codigo: 'MOL-BAL-2',
      descricao: 'Molde balde 10 L 2 cavidades',
      larguraMm: 400,
      comprimentoMm: 450,
      alturaMm: 420,
      pesoKg: 650,
      numeroCavidades: 2,
      forcaFechamentoT: 140,
      pressaoBar: 1600,
      pesoInjetadoG: 420,
      podeGirar: true,
      cavidades: ['BAL-0005', 'BAL-0005'],
    },
    {
      codigo: 'MOL-FRA-4',
      descricao: 'Molde sopro frasco 1 L 4 cavidades',
      larguraMm: 420,
      comprimentoMm: 380,
      alturaMm: 300,
      pesoKg: 280,
      numeroCavidades: 4,
      forcaFechamentoT: 10,
      pressaoBar: 8,
      pesoInjetadoG: 360,
      podeGirar: false,
      cavidades: ['FRA-0002', 'FRA-0002', 'FRA-0002', 'FRA-0002'],
    },
  ];
  for (const { cavidades, ...m } of dadosMoldes) {
    const r = await prisma.molde.upsert({ where: { codigo: m.codigo }, create: m, update: {} });
    moldes[m.codigo] = r.id;
    for (let i = 0; i < cavidades.length; i++) {
      await prisma.cavidadeMolde.upsert({
        where: { moldeId_numero: { moldeId: r.id, numero: i + 1 } },
        create: { moldeId: r.id, numero: i + 1, produtoId: produtos[cavidades[i]] },
        update: {},
      });
    }
  }

  // ---------- Fichas técnicas vigentes ----------
  const agora = new Date();
  const fichas = [
    {
      produto: 'CAD-0031',
      molde: 'MOL-CAD-3',
      maquina: 'INJ-01',
      cicloS: 60,
      cavidades: 1,
      pesoPadraoG: 1150 / 3,
      toleranciaPesoPct: 3,
      composicao: [
        { material: 'PP-H103', consumoGPorPeca: 375 },
        { material: 'MB-BR01', consumoGPorPeca: 8 },
      ],
    },
    {
      produto: 'CAD-0032',
      molde: 'MOL-CAD-3',
      maquina: 'INJ-01',
      cicloS: 60,
      cavidades: 1,
      pesoPadraoG: 1150 / 3,
      toleranciaPesoPct: 3,
      composicao: [
        { material: 'PP-H103', consumoGPorPeca: 375 },
        { material: 'MB-AZ01', consumoGPorPeca: 8 },
      ],
    },
    {
      produto: 'CAD-0033',
      molde: 'MOL-CAD-3',
      maquina: 'INJ-01',
      cicloS: 60,
      cavidades: 1,
      pesoPadraoG: 1150 / 3,
      toleranciaPesoPct: 3,
      composicao: [
        { material: 'PP-H103', consumoGPorPeca: 300 },
        { material: 'MOI-PP', consumoGPorPeca: 75 },
        { material: 'MB-PR01', consumoGPorPeca: 8 },
      ],
    },
    {
      produto: 'MES-0010',
      molde: 'MOL-MES-1',
      maquina: 'INJ-02',
      cicloS: 90,
      cavidades: 1,
      pesoPadraoG: 2400,
      toleranciaPesoPct: 2,
      composicao: [
        { material: 'PP-H103', consumoGPorPeca: 2350 },
        { material: 'MB-BR01', consumoGPorPeca: 50 },
      ],
    },
    {
      produto: 'BAL-0005',
      molde: 'MOL-BAL-2',
      maquina: 'INJ-03',
      cicloS: 30,
      cavidades: 2,
      pesoPadraoG: 210,
      toleranciaPesoPct: 3,
      composicao: [
        { material: 'EXT-PP-REC', consumoGPorPeca: 205 },
        { material: 'MB-PR01', consumoGPorPeca: 5 },
      ],
    },
    {
      produto: 'FRA-0002',
      molde: 'MOL-FRA-4',
      maquina: 'SOP-01',
      cicloS: 18,
      cavidades: 4,
      pesoPadraoG: 90,
      toleranciaPesoPct: 4,
      composicao: [{ material: 'PEAD-5502', consumoGPorPeca: 90 }],
    },
    {
      produto: 'EXT-PP-REC',
      molde: null,
      maquina: 'EXT-01',
      cicloS: null,
      cavidades: 1,
      phPadrao: 100,
      pesoPadraoG: null,
      toleranciaPesoPct: null,
      composicao: [
        { material: 'MOI-PP', percentual: 98 },
        { material: 'MB-PR01', percentual: 2 },
      ],
    },
  ];
  for (const f of fichas) {
    const combinacao = {
      produtoId: produtos[f.produto],
      moldeId: f.molde ? moldes[f.molde] : null,
      maquinaId: maquinas[f.maquina],
    };
    if (await prisma.fichaTecnica.findFirst({ where: combinacao })) continue;
    const phPadrao = 'phPadrao' in f && f.phPadrao ? f.phPadrao : calcularPhPadrao(f.cicloS!, f.cavidades);
    await prisma.fichaTecnica.create({
      data: {
        ...combinacao,
        versao: 1,
        situacao: 'VIGENTE',
        cicloS: f.cicloS,
        cavidades: f.cavidades,
        phPadrao,
        phCalculado: !('phPadrao' in f),
        pesoPadraoG: f.pesoPadraoG ? Math.round(f.pesoPadraoG * 100) / 100 : null,
        toleranciaPesoPct: f.toleranciaPesoPct,
        parametrosProcesso: f.molde
          ? [
              { nome: 'Temperatura zona 1', valor: '210', unidade: '°C' },
              { nome: 'Temperatura zona 2', valor: '220', unidade: '°C' },
              { nome: 'Pressão de recalque', valor: '650', unidade: 'bar' },
              { nome: 'Tempo de resfriamento', valor: '25', unidade: 's' },
            ]
          : [
              { nome: 'Temperatura do cabeçote', valor: '230', unidade: '°C' },
              { nome: 'Rotação da rosca', valor: '85', unidade: 'rpm' },
            ],
        criadoPorId: usuarios.pcp,
        aprovadorId: usuarios.admin,
        vigenteDesde: agora,
        composicao: {
          create: f.composicao.map((c) => ({
            materialId: produtos[c.material],
            consumoGPorPeca: 'consumoGPorPeca' in c ? c.consumoGPorPeca : null,
            percentual: 'percentual' in c ? c.percentual : null,
          })),
        },
      },
    });
  }

  // ---------- Motivos de parada ----------
  for (const m of [
    {
      codigo: 'SET',
      descricao: 'Setup / troca de molde',
      programada: true,
      geraSolicitacaoManutencao: false,
    },
    { codigo: 'REF', descricao: 'Refeição', programada: true, geraSolicitacaoManutencao: false },
    { codigo: 'SPR', descricao: 'Sem programação', programada: true, geraSolicitacaoManutencao: false },
    { codigo: 'MPV', descricao: 'Manutenção preventiva', programada: true, geraSolicitacaoManutencao: false },
    { codigo: 'MEC', descricao: 'Quebra mecânica', programada: false, geraSolicitacaoManutencao: true },
    { codigo: 'ELE', descricao: 'Falha elétrica', programada: false, geraSolicitacaoManutencao: true },
    { codigo: 'MOL', descricao: 'Problema no molde', programada: false, geraSolicitacaoManutencao: true },
    {
      codigo: 'FMP',
      descricao: 'Falta de matéria-prima',
      programada: false,
      geraSolicitacaoManutencao: false,
    },
    { codigo: 'AJP', descricao: 'Ajuste de processo', programada: false, geraSolicitacaoManutencao: false },
    { codigo: 'FEN', descricao: 'Falta de energia', programada: false, geraSolicitacaoManutencao: false },
  ]) {
    await prisma.motivoParada.upsert({ where: { codigo: m.codigo }, create: m, update: {} });
  }

  // ---------- Tipos de perda (RN-11) ----------
  for (const t of [
    { descricao: 'Borra', contaComoRefugo: false },
    { descricao: 'Canal', contaComoRefugo: false },
    { descricao: 'Varredura', contaComoRefugo: false },
    { descricao: 'Rebarba', contaComoRefugo: false },
    { descricao: 'Peça refugada', contaComoRefugo: true },
    { descricao: 'Outros', contaComoRefugo: false },
  ]) {
    await prisma.tipoPerda.upsert({ where: { descricao: t.descricao }, create: t, update: {} });
  }

  // ---------- Locais, impressoras e dispositivos ----------
  for (const l of [
    { nome: 'Expedição', tipo: 'PRODUTO_ACABADO' as const },
    { nome: 'Depósito de produto acabado', tipo: 'PRODUTO_ACABADO' as const },
    { nome: 'Almoxarifado de matéria-prima', tipo: 'MATERIA_PRIMA' as const },
    { nome: 'Silos', tipo: 'MATERIA_PRIMA' as const },
  ]) {
    await prisma.localEstoque.upsert({ where: { nome: l.nome }, create: l, update: {} });
  }
  for (const i of [
    { nome: 'Zebra Injeção', enderecoIp: '192.168.0.50', porta: 9100, resolucaoDpi: 203 },
    { nome: 'Zebra Matéria-prima', enderecoIp: '192.168.0.51', porta: 9100, resolucaoDpi: 203 },
  ]) {
    await prisma.impressora.upsert({ where: { nome: i.nome }, create: i, update: {} });
  }
  for (const d of [
    { nome: 'Tablet Injeção 1', prefixo: 'T1', descricao: 'Linha das injetoras' },
    { nome: 'Tablet Injeção 2', prefixo: 'T2', descricao: 'Linha das injetoras' },
    { nome: 'Tablet Sopro/Extrusão', prefixo: 'T3', descricao: 'Sopradora e extrusora' },
    { nome: 'PC Matéria-prima', prefixo: 'MP', descricao: 'Setor de matéria-prima' },
  ]) {
    await prisma.dispositivo.upsert({ where: { prefixo: d.prefixo }, create: d, update: {} });
  }

  // ---------- Ordens de produção e rodadas (Fase 2) ----------
  const ordens: Record<string, string> = {};
  for (const o of [
    { chave: 'CAD1', numeroErp: '04508401001', produto: 'CAD-0031', quantidade: 3000 },
    { chave: 'CAD2', numeroErp: '04508401002', produto: 'CAD-0032', quantidade: 3000 },
    { chave: 'CAD3', numeroErp: '04508401003', produto: 'CAD-0033', quantidade: 1500 },
    { chave: 'MES', numeroErp: '04508501001', produto: 'MES-0010', quantidade: 800 },
    { chave: 'BAL', numeroErp: '04508601001', produto: 'BAL-0005', quantidade: 5000 },
    { chave: 'FRA', numeroErp: '04508701001', produto: 'FRA-0002', quantidade: 20000 },
  ]) {
    const r = await prisma.ordemProducao.upsert({
      where: { numeroErp: o.numeroErp },
      create: {
        numeroErp: o.numeroErp,
        tipo: 'PRODUCAO',
        produtoId: produtos[o.produto],
        quantidade: o.quantidade,
        unidade: 'PECA',
        origem: 'EXEMPLO',
        criadoPorId: usuarios.pcp,
      },
      update: {},
    });
    ordens[o.chave] = r.id;
  }
  const extrusao =
    (await prisma.ordemProducao.findFirst({ where: { tipo: 'EXTRUSAO', origem: 'EXEMPLO' } })) ??
    (await prisma.ordemProducao.create({
      data: {
        tipo: 'EXTRUSAO',
        produtoId: produtos['EXT-PP-REC'],
        quantidade: 2000,
        unidade: 'KG',
        origem: 'EXEMPLO',
        observacao: 'Reciclagem de PP moído',
        criadoPorId: usuarios.pcp,
      },
    }));
  ordens.EXT = extrusao.id;

  if ((await prisma.rodada.count()) === 0) {
    const ficha = async (produto: string, molde: string | null, maquina: string) =>
      (
        await prisma.fichaTecnica.findFirstOrThrow({
          where: {
            produtoId: produtos[produto],
            moldeId: molde ? moldes[molde] : null,
            maquinaId: maquinas[maquina],
            situacao: 'VIGENTE',
          },
        })
      ).id;
    const rodadas = [
      {
        maquina: 'INJ-01',
        molde: 'MOL-CAD-3',
        ops: [
          { ordem: 'CAD1', produto: 'CAD-0031', cavidades: [1] },
          { ordem: 'CAD2', produto: 'CAD-0032', cavidades: [2] },
          { ordem: 'CAD3', produto: 'CAD-0033', cavidades: [3] },
        ],
      },
      {
        maquina: 'INJ-03',
        molde: 'MOL-BAL-2',
        ops: [{ ordem: 'BAL', produto: 'BAL-0005', cavidades: [1, 2] }],
      },
      {
        maquina: 'SOP-01',
        molde: 'MOL-FRA-4',
        ops: [{ ordem: 'FRA', produto: 'FRA-0002', cavidades: [1, 2, 3, 4] }],
      },
      {
        maquina: 'EXT-01',
        molde: null,
        ops: [{ ordem: 'EXT', produto: 'EXT-PP-REC', cavidades: [] as number[] }],
      },
    ];
    for (const r of rodadas) {
      const ops = [];
      for (const o of r.ops) {
        ops.push({
          ordemId: ordens[o.ordem],
          fichaTecnicaId: await ficha(o.produto, r.molde, r.maquina),
          cavidades: o.cavidades,
        });
      }
      await prisma.rodada.create({
        data: {
          maquinaId: maquinas[r.maquina],
          moldeId: r.molde ? moldes[r.molde] : null,
          criadoPorId: usuarios.pcp,
          ops: { create: ops },
        },
      });
    }
  }

  // ---------- Escala (próximos 60 dias, sem sobrescrever) ----------
  if (opcoes.escala !== false) {
    const hoje = new Date().toISOString().slice(0, 10);
    const inicio = somarDias(hoje, -7);
    const fim = somarDias(hoje, 60);
    const linhas = [
      ...gerarEscalaRevezamento({
        dataInicial: inicio,
        dataFinal: fim,
        ciclo: [
          [
            { horarioTurnoId: horarios.Dia, equipeId: equipes.A },
            { horarioTurnoId: horarios.Noite, equipeId: equipes.B },
          ],
          [
            { horarioTurnoId: horarios.Dia, equipeId: equipes.C },
            { horarioTurnoId: horarios.Noite, equipeId: equipes.D },
          ],
        ],
      }),
      ...gerarEscalaCentral({
        dataInicial: inicio,
        dataFinal: fim,
        horarioTurnoId: horarios.Central,
        equipeId: equipes.ADM,
        diasSemana: [1, 2, 3, 4, 5],
      }),
    ];
    await prisma.escala.createMany({
      data: linhas.map((l) => ({
        data: new Date(`${l.data}T00:00:00Z`),
        horarioTurnoId: l.horarioTurnoId,
        equipeId: l.equipeId,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.registroAuditoria.create({
    data: {
      entidade: 'Sistema',
      acao: 'CARGA_DADOS_EXEMPLO',
      valorNovo: { executadoEm: new Date().toISOString() },
    },
  });
}

const executadoDiretamente =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (executadoDiretamente) {
  const prisma = criarPrismaClient();
  // Com --se-vazio, só carrega quando ainda não há máquinas cadastradas (primeira subida).
  const seVazio = process.argv.includes('--se-vazio');
  (async () => {
    if (seVazio && (await prisma.maquina.count()) > 0) {
      console.log('Banco já possui cadastros; dados de exemplo não foram carregados.');
      return;
    }
    await carregarDadosExemplo(prisma);
    console.log('Dados de exemplo carregados.');
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
