#!/bin/sh
# Restaura um backup gerado pelo serviço "backup" (ver docs/INSTALACAO.md).
# Uso, na pasta do projeto:  sh scripts/restaurar.sh backups/apontamento-AAAAMMDD-HHMMSS.dump
# ATENÇÃO: substitui todo o conteúdo atual do banco pelo do arquivo.
set -eu

ARQ="${1:-}"
if [ -z "$ARQ" ] || [ ! -f "$ARQ" ]; then
  echo "Informe o arquivo de backup. Ex.: sh scripts/restaurar.sh backups/apontamento-20261116-020000.dump"
  exit 1
fi
NOME="$(basename "$ARQ")"
PASTA="$(cd "$(dirname "$ARQ")" && pwd)"

echo "1/5 Parando a API e o site (o banco continua no ar)…"
docker compose stop api web

echo "2/5 Garantindo o banco no ar…"
docker compose up -d db
until docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do sleep 2; done

echo "3/5 Recriando o banco vazio…"
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "4/5 Restaurando $NOME…"
docker compose cp "$PASTA/$NOME" db:/tmp/restaurar.dump
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error /tmp/restaurar.dump && rm -f /tmp/restaurar.dump'

echo "5/5 Subindo a API e o site…"
docker compose up -d api web
echo "Restauração concluída. Confira o acesso em http://localhost:${PORTA_WEB:-8080}"
