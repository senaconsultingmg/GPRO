#!/bin/sh
set -e
echo "Aplicando migrations do banco..."
npx prisma migrate deploy
if [ "${CARREGAR_DADOS_EXEMPLO:-false}" = "true" ]; then
  node dist/dados-exemplo/semente.js --se-vazio
fi
exec node dist/main.js
