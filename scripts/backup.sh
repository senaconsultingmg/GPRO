#!/bin/sh
# Backup do banco (seção 4): roda dentro do serviço "backup" do docker-compose.
# Uma cópia por dia na hora de BACKUP_HORA (fuso TZ), mantendo os últimos RETENCAO_DIAS arquivos.
# Uso manual imediato: docker compose exec backup /scripts/backup.sh agora
set -eu

DIR="${BACKUP_DIR:-/backups}"
RETENCAO="${RETENCAO_DIAS:-14}"
HORA="${BACKUP_HORA:-02:00}"
export PGPASSWORD="$POSTGRES_PASSWORD"
mkdir -p "$DIR"

fazer_backup() {
  ARQ="$DIR/apontamento-$(date +%Y%m%d-%H%M%S).dump"
  echo "[backup] $(date '+%d/%m/%Y %H:%M:%S') gerando $ARQ"
  pg_dump -h "${POSTGRES_HOST:-db}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$ARQ.parcial"
  mv "$ARQ.parcial" "$ARQ"
  # Mantém só os RETENCAO arquivos mais recentes.
  ls -1t "$DIR"/apontamento-*.dump 2>/dev/null | tail -n +"$((RETENCAO + 1))" | while read -r velho; do
    echo "[backup] removendo $velho"
    rm -f "$velho"
  done
  echo "[backup] concluído: $(du -h "$ARQ" | cut -f1)"
}

if [ "${1:-}" = "agora" ]; then
  fazer_backup
  exit 0
fi

echo "[backup] agendado todo dia às $HORA ($TZ), retenção de $RETENCAO arquivos em $DIR"
while true; do
  if [ "$(date +%H:%M)" = "$HORA" ]; then
    fazer_backup || echo "[backup] FALHOU — verifique a conexão com o banco"
    sleep 61
  fi
  sleep 30
done
