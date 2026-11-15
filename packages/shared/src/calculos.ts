/**
 * PH padrão (peças por hora) calculado pelo ciclo (RN-02):
 * PH = 3600 ÷ ciclo em segundos × cavidades do produto.
 * Resultado arredondado a 2 casas decimais.
 */
export function calcularPhPadrao(cicloSegundos: number, cavidades: number): number {
  if (!(cicloSegundos > 0)) throw new Error('O ciclo deve ser maior que zero.');
  if (!Number.isInteger(cavidades) || cavidades < 1)
    throw new Error('As cavidades devem ser um inteiro maior que zero.');
  return Math.round((3600 / cicloSegundos) * cavidades * 100) / 100;
}
