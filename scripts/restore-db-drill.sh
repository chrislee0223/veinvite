#!/usr/bin/env bash
set -euo pipefail

# VeInvite restore-drill helper. It is intentionally fail-closed.
# Default mode validates and lists the archive only.
# A destructive restore requires BOTH:
#   1) --execute
#   2) ALLOW_NONPRODUCTION_RESTORE=YES
# and it refuses the known Production database host.

PRODUCTION_DB_HOST="db.upfjvkidaqtnbmmnhupz.supabase.co"
mode="dry-run"
if [[ "${1:-}" == "--execute" ]]; then
  mode="execute"
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--execute]" >&2
  exit 2
fi

if [[ -z "${RESTORE_ARCHIVE:-}" ]]; then
  echo "RESTORE_ARCHIVE is required." >&2
  exit 2
fi
if [[ ! -f "$RESTORE_ARCHIVE" ]]; then
  echo "Restore archive not found: $RESTORE_ARCHIVE" >&2
  exit 2
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required." >&2
  exit 3
fi

# Always verify archive readability first.
pg_restore --list "$RESTORE_ARCHIVE" >/dev/null

if [[ "$mode" == "dry-run" ]]; then
  echo "Archive is structurally readable. No database changes were made."
  echo "Run with --execute only against an isolated non-production database."
  exit 0
fi

required=(PGHOST PGUSER PGPASSWORD PGDATABASE)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
done

if [[ "${ALLOW_NONPRODUCTION_RESTORE:-}" != "YES" ]]; then
  echo "Refusing restore: set ALLOW_NONPRODUCTION_RESTORE=YES explicitly." >&2
  exit 4
fi

if [[ "${PGHOST,,}" == "${PRODUCTION_DB_HOST,,}" ]]; then
  echo "Refusing restore against the VeInvite Production database host." >&2
  exit 5
fi

export PGPORT="${PGPORT:-5432}"
export PGSSLMODE="${PGSSLMODE:-require}"

cat >&2 <<EOF
WARNING: destructive restore drill requested.
Target host: $PGHOST
Target database: $PGDATABASE
Archive: $RESTORE_ARCHIVE
Production host guard: ACTIVE
EOF

# The target must be a disposable/non-production database. The restore is
# intentionally complete so migrations, triggers, functions, RLS and evidence
# tables are exercised together rather than restoring only a hand-picked subset.
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$PGDATABASE" \
  "$RESTORE_ARCHIVE"

echo "Restore drill completed against non-production target: $PGHOST/$PGDATABASE"
