import { describe, expect, it } from 'vitest';
import {
  avaliarCompatibilidade,
  type DadosMaquinaCompatibilidade,
  type DadosMoldeCompatibilidade,
} from './compatibilidade.js';

const maquina: DadosMaquinaCompatibilidade = {
  tipo: 'INJETORA',
  forcaFechamentoT: 250,
  distanciaColunasHorizontalMm: 560,
  distanciaColunasVerticalMm: 510,
  alturaMoldeMinMm: 220,
  alturaMoldeMaxMm: 550,
  pesoMaxMoldeKg: 1200,
  pressaoInjecaoBar: 2000,
  capacidadeInjecaoG: 900,
};
const molde: DadosMoldeCompatibilidade = {
  larguraMm: 500,
  comprimentoMm: 450,
  alturaMm: 400,
  pesoKg: 800,
  forcaFechamentoT: 200,
  pressaoBar: 1500,
  pesoInjetadoG: 600,
  podeGirar: false,
};

describe('RN-02 — compatibilidade molde × máquina', () => {
  it('aceita molde que atende a todos os critérios', () => {
    const r = avaliarCompatibilidade(molde, maquina);
    expect(r).toEqual({ compativel: true, exigeGiro: false, falhas: [] });
  });

  it('aceita valores exatamente no limite', () => {
    const r = avaliarCompatibilidade(
      {
        ...molde,
        larguraMm: 560,
        comprimentoMm: 510,
        alturaMm: 550,
        pesoKg: 1200,
        forcaFechamentoT: 250,
        pressaoBar: 2000,
        pesoInjetadoG: 900,
      },
      maquina,
    );
    expect(r.compativel).toBe(true);
  });

  it.each([
    ['COLUNAS', { larguraMm: 600 }],
    ['ALTURA_MOLDE', { alturaMm: 200 }],
    ['ALTURA_MOLDE', { alturaMm: 600 }],
    ['PESO_MOLDE', { pesoKg: 1500 }],
    ['FORCA_FECHAMENTO', { forcaFechamentoT: 300 }],
    ['PRESSAO_INJECAO', { pressaoBar: 2100 }],
    ['CAPACIDADE_INJECAO', { pesoInjetadoG: 1000 }],
  ])('recusa pelo critério %s', (criterio, alteracao) => {
    const r = avaliarCompatibilidade({ ...molde, ...alteracao }, maquina);
    expect(r.compativel).toBe(false);
    expect(r.falhas.map((f) => f.criterio)).toEqual([criterio]);
    expect(r.falhas[0].mensagem.length).toBeGreaterThan(10);
  });

  it('lista todos os critérios que falharam', () => {
    const r = avaliarCompatibilidade({ ...molde, pesoKg: 2000, pesoInjetadoG: 2000 }, maquina);
    expect(r.falhas.map((f) => f.criterio)).toEqual(['PESO_MOLDE', 'CAPACIDADE_INJECAO']);
  });

  it('molde que só cabe girado é recusado quando não permite giro', () => {
    const r = avaliarCompatibilidade({ ...molde, larguraMm: 500, comprimentoMm: 540 }, maquina);
    expect(r.compativel).toBe(false);
    expect(r.falhas[0].criterio).toBe('COLUNAS');
    expect(r.falhas[0].mensagem).toContain('não permite giro');
  });

  it('molde que só cabe girado é aceito quando o cadastro permite giro', () => {
    const r = avaliarCompatibilidade(
      { ...molde, larguraMm: 500, comprimentoMm: 540, podeGirar: true },
      maquina,
    );
    expect(r).toEqual({ compativel: true, exigeGiro: true, falhas: [] });
  });

  it('extrusora nunca recebe molde', () => {
    const r = avaliarCompatibilidade(molde, { tipo: 'EXTRUSORA' });
    expect(r.falhas[0].criterio).toBe('TIPO_MAQUINA');
  });

  it('dado da máquina ausente conta como falha', () => {
    const r = avaliarCompatibilidade(molde, { ...maquina, pesoMaxMoldeKg: null });
    expect(r.falhas.map((f) => f.criterio)).toEqual(['PESO_MOLDE']);
  });
});
