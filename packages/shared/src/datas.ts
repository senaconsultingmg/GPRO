/** Fuso de exibição. O banco grava tudo em UTC. */
export const FUSO_EXIBICAO = 'America/Sao_Paulo';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_EXIBICAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_EXIBICAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** dd/mm/aaaa hh:mm no fuso de São Paulo. */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  return fmtDataHora.format(new Date(valor)).replace(',', '');
}

/** dd/mm/aaaa no fuso de São Paulo (para instantes). */
export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  return fmtData.format(new Date(valor));
}

/** Converte data civil "AAAA-MM-DD" em "dd/mm/aaaa" sem aplicar fuso. */
export function formatarDataCivil(valor: string | null | undefined): string {
  if (!valor) return '';
  const [a, m, d] = valor.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
