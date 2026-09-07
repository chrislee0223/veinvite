#!/usr/bin/env bash
set -euo pipefail

# VeInvite production database logical backup helper.
#
# Security rules:
# - Never pass the database password as a CLI argument.
# - Never write backups into the Git repository.
# - Keep files private (umask 077).
# - Validate the archive with pg_restore before considering it successful.
#
# Required environment variables:
#   PGHOST PGUSER PGPASSWORD PGDATABASE BACKUP_OUTPUT_DIR
# Optional:
#   PGPORT (default 5432)
#   PGSSLMODE (default require)
#
# Example (values intentionally omitted):
#   PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=postgres \
#   BACKUP_OUTPUT_DIR=/secure/offsite/staging ./scripts/backup-production-db.sh

required=(PGHOST PGUSER PGPASSWORD PGDATABASE BACKUP_OUTPUT_DIR)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
done

export PGPORT="${PGPORT:-5432}"
export PGSSLMODE="${PGSSLMODE:-require}"
umask 077

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required." >&2
  exit 3
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required." >&2
  exit 3
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum is required." >&2
  exit 3
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
mkdir -p "$BACKUP_OUTPUT_DIR"
output_dir="$(cd "$BACKUP_OUTPUT_DIR" && pwd -P)"

if [[ -n "$repo_root" ]]; then
  repo_root="$(cd "$repo_root" && pwd -P)"
  case "$output_dir/" in
    "$repo_root/"*)
      echo "Refusing to write a production backup inside the Git repository." >&2
      exit 4
      ;;
  esac
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
archive="$output_dir/veinvite-production-$timestamp.dump"
tmp_archive="$archive.partial"
checksum="$archive.sha256"
manifest="$archive.meta"

cleanup() {
  rm -f "$tmp_archive"
}
trap cleanup EXIT

# Custom format is compressed and supports selective inspection/restore.
# --no-owner/--no-privileges makes non-production restore drills less brittle.
pg_dump \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$tmp_archive"

# An unreadable/truncated archive must never be promoted to a successful backup.
pg_restore --list "$tmp_archive" >/dev/null
mv "$tmp_archive" "$archive"
sha256sum "$archive" > "$checksum"

{
  echo "created_at_utc=$timestamp"
  echo "database=$PGDATABASE"
  echo "host=$PGHOST"
  echo "format=postgres_custom"
  echo "validated_with=pg_restore --list"
  echo "contains_secrets=no_connection_credentials_written"
} > "$manifest"

chmod 600 "$archive" "$checksum" "$manifest"

echo "Backup created and structurally validated: $archive"
echo "Checksum: $checksum"
echo "Metadata: $manifest"
echo "Move these files to an encrypted off-site location and test a restore regularly."
