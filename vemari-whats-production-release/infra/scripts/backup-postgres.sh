#!/usr/bin/env sh
set -eu
: "${POSTGRES_DB:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${BACKUP_DIR:?}" "${BACKUP_ENCRYPTION_PASSPHRASE:?}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$BACKUP_DIR/vemari-${STAMP}.dump"
OUT="${TMP}.enc"
export PGPASSWORD="$POSTGRES_PASSWORD"
pg_dump -h "${POSTGRES_HOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$TMP"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$TMP" -out "$OUT" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
rm -f "$TMP"
sha256sum "$OUT" > "${OUT}.sha256"
find "$BACKUP_DIR" -type f -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
printf '%s\n' "$OUT"
