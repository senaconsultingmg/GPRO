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
} from '@apontamento/shared';
import type { DefinicaoCadastro } from './cadastro-generico.js';
import { sincronizarCavidades } from '../moldes/moldes.service.js';
import { ErroNegocio } from '../comum/erros.js';

/** Cadastros com CRUD genérico (seção 6). */
export const DEFINICOES_CADASTRO: DefinicaoCadastro<object>[] = [
  {
    rota: 'horarios-turno',
    modelo: 'horarioTurno',
    entidade: 'HorarioTurno',
    rotulo: 'Horário de turno',
    esquema: esquemaHorarioTurno,
    camposBusca: ['nome'],
    ordenarPor: { horaInicio: 'asc' },
  },
  {
    rota: 'equipes',
    modelo: 'equipe',
    entidade: 'Equipe',
    rotulo: 'Equipe',
    esquema: esquemaEquipe,
    camposBusca: ['letra', 'descricao'],
    ordenarPor: { letra: 'asc' },
  },
  {
    rota: 'maquinas',
    modelo: 'maquina',
    entidade: 'Maquina',
    rotulo: 'Máquina',
    esquema: esquemaMaquina,
    camposBusca: ['codigo', 'descricao'],
    campoAtivo: 'ativa',
    ordenarPor: { codigo: 'asc' },
  },
  {
    rota: 'moldes',
    modelo: 'molde',
    entidade: 'Molde',
    rotulo: 'Molde',
    esquema: esquemaMolde,
    camposBusca: ['codigo', 'descricao'],
    ordenarPor: { codigo: 'asc' },
    incluir: {
      cavidades: {
        orderBy: { numero: 'asc' },
        include: { produto: { select: { id: true, codigo: true, descricao: true } } },
      },
    },
    aposSalvar: sincronizarCavidades,
    validar: async (prisma, dados, id) => {
      if (!id) return;
      const total = (dados as { numeroCavidades: number }).numeroCavidades;
      const r = await prisma.fichaTecnica.aggregate({
        where: { moldeId: id, situacao: { in: ['RASCUNHO', 'VIGENTE'] } },
        _max: { cavidades: true },
      });
      if ((r._max.cavidades ?? 0) > total) {
        throw new ErroNegocio(
          `Há ficha técnica vigente ou em rascunho usando ${r._max.cavidades} cavidades deste molde.`,
          [{ campo: 'numeroCavidades', mensagem: `Mínimo de ${r._max.cavidades}.` }],
        );
      }
    },
  },
  {
    rota: 'produtos',
    modelo: 'produto',
    entidade: 'Produto',
    rotulo: 'Produto',
    esquema: esquemaProduto,
    camposBusca: ['codigo', 'descricao'],
    ordenarPor: { codigo: 'asc' },
  },
  {
    rota: 'conjuntos-padrao',
    modelo: 'conjuntoPadrao',
    entidade: 'ConjuntoPadrao',
    rotulo: 'Conjunto padrão',
    esquema: esquemaConjuntoPadrao,
    camposBusca: [],
    incluir: { produto: { select: { id: true, codigo: true, descricao: true, unidade: true } } },
  },
  {
    rota: 'motivos-parada',
    modelo: 'motivoParada',
    entidade: 'MotivoParada',
    rotulo: 'Motivo de parada',
    esquema: esquemaMotivoParada,
    camposBusca: ['codigo', 'descricao'],
    ordenarPor: { codigo: 'asc' },
  },
  {
    rota: 'tipos-perda',
    modelo: 'tipoPerda',
    entidade: 'TipoPerda',
    rotulo: 'Tipo de perda',
    esquema: esquemaTipoPerda,
    camposBusca: ['descricao'],
    ordenarPor: { descricao: 'asc' },
  },
  {
    rota: 'locais-estoque',
    modelo: 'localEstoque',
    entidade: 'LocalEstoque',
    rotulo: 'Local de estoque',
    esquema: esquemaLocalEstoque,
    camposBusca: ['nome'],
    ordenarPor: { nome: 'asc' },
  },
  {
    rota: 'impressoras',
    modelo: 'impressora',
    entidade: 'Impressora',
    rotulo: 'Impressora',
    esquema: esquemaImpressora,
    camposBusca: ['nome', 'enderecoIp'],
    campoAtivo: 'ativa',
    ordenarPor: { nome: 'asc' },
  },
  {
    rota: 'layouts-etiqueta',
    modelo: 'layoutEtiqueta',
    entidade: 'LayoutEtiqueta',
    rotulo: 'Layout de etiqueta',
    esquema: esquemaLayoutEtiqueta,
    camposBusca: ['nome'],
    ordenarPor: { nome: 'asc' },
    incluir: { impressoraPadrao: { select: { id: true, nome: true } } },
  },
  {
    rota: 'dispositivos',
    modelo: 'dispositivo',
    entidade: 'Dispositivo',
    rotulo: 'Dispositivo (posto)',
    esquema: esquemaDispositivo,
    camposBusca: ['nome', 'prefixo'],
    ordenarPor: { prefixo: 'asc' },
  },
];

// Os esquemas Zod com .refine() ainda são ZodType, o que permite usá-los no CRUD genérico.
export type { DefinicaoCadastro };
