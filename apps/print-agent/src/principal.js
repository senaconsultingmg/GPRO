import { configuracaoDoAmbiente, criarAgente, tlsDoAmbiente } from './agente.js';

const config = configuracaoDoAmbiente();
const tls = await tlsDoAmbiente();
const porta = Number(process.env.AGENTE_PORTA ?? 9180);
if (!config.token) console.warn('[agente] AGENTE_TOKEN não definido: qualquer um na rede poderá imprimir.');
criarAgente(config, tls).listen(porta, '0.0.0.0', () => {
  console.log(
    `[agente] ouvindo em ${tls ? 'https' : 'http'}://0.0.0.0:${porta} — portas de impressora: ${config.portas.join(', ')}` +
      (config.simularDir ? ` — SIMULAÇÃO (arquivos em ${config.simularDir})` : ''),
  );
});
