#!/usr/bin/env bash
# Dumps the database at DATABASE_URL to a timestamped, gzip-compressed
# custom-format pg_dump archive. Restore with scripts/restore-db.sh.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup-db.sh [output-dir]
#
# For scheduled backups, run this on a cron/systemd timer and ship the
# resulting file to off-server storage (e.g. the same S3-compatible
# bucket configured via STORAGE_* — see docs/architecture.md §8) rather
# than leaving backups only on the database host.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

# Prisma's DATABASE_URL carries a ?schema=... query param that pg_dump
# doesn't understand ("invalid URI query parameter"). Strip it — this
# app only ever uses the "public" schema, which is pg_dump's default.
PG_URL="${DATABASE_URL%%\?*}"

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/schovexa-$TIMESTAMP.dump"

echo "Backing up to $OUT_FILE ..."
pg_dump --format=custom --no-owner --no-acl --file="$OUT_FILE" "$PG_URL"

echo "Backup complete: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
