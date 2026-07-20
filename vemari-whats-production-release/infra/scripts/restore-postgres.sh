#!/usr/bin/env sh
set -eu
: "${1:?Informe o arquivo .enc}" "${POSTGRES_DB:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${BACKUP_ENCRYPTION_PASSPHRASE:?}"
INPUT="$1"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sha256sum -c "${INPUT}.sha256"
openssl enc -d -aes-256-cbc -pbkdf2 -in "$INPUT" -out "$TMP" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
export PGPASSWORD="$POSTGRES_PASSWORD"
pg_restore -h "${POSTGRES_HOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner "$TMP"
