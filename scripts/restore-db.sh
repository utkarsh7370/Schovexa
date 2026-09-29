#!/usr/bin/env bash
# Restores a pg_dump custom-format archive (produced by backup-db.sh)
# into the database at DATABASE_URL. The target database must already
# exist and be empty — this does not create or drop databases, since
# doing that from a script against a possibly-production DATABASE_URL
# is exactly the kind of destructive action a human should type out by
# hand, not automate.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/restore-db.sh path/to/backup.dump

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "usage: DATABASE_URL=... ./scripts/restore-db.sh path/to/backup.dump" >&2
  exit 1
fi

# Strip Prisma's ?schema=... query param — pg_restore doesn't understand
# it either (see the matching note in backup-db.sh).
PG_URL="${DATABASE_URL%%\?*}"

echo "Restoring $DUMP_FILE into $PG_URL ..."
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PG_URL" "$DUMP_FILE"

echo "Restore complete."
