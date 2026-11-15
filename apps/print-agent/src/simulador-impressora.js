/**
 * Impressora Zebra simulada para desenvolvimento e testes: aceita conexões TCP (como a porta 9100
 * de uma Zebra) e grava cada etiqueta recebida em um arquivo .zpl. Não envia nada para fora.
 */
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function criarSimulador(diretorio) {
  let n = 0;
  return createServer((socket) => {
    const partes = [];
    socket.on('data', (c) => partes.push(c));
    socket.on('end', async () => {
      await mkdir(diretorio, { recursive: true });
      await writeFile(join(diretorio, `${Date.now()}-${++n}.zpl`), Buffer.concat(partes));
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(process.env.SIMULADOR_PORTA ?? 9100);
  const dir = process.env.SIMULADOR_DIR ?? './etiquetas-simuladas';
  criarSimulador(dir).listen(porta, () =>
    console.log(`[simulador] impressora simulada na porta ${porta}, gravando em ${dir}`),
  );
}
