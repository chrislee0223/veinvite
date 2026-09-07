import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const backup = read('scripts/backup-production-db.sh');
const restore = read('scripts/restore-db-drill.sh');
const runbook = read('docs/DISASTER_RECOVERY_KO.md');
const gitignore = read('.gitignore');

for (const [pattern, message] of [
  [/set -euo pipefail/, 'Backup helper must remain fail-fast.'],
  [/umask 077/, 'Backup helper must create private files.'],
  [/Refusing to write a production backup inside the Git repository/, 'Backup helper must refuse repository-local production dumps.'],
  [/pg_dump[\s\S]*--format=custom/, 'Backup helper must keep using a validated PostgreSQL custom archive.'],
  [/pg_restore --list/, 'Backup helper must structurally validate the archive before success.'],
  [/sha256sum/, 'Backup helper must emit an integrity checksum.'],
]) {
  if (!pattern.test(backup)) failures.push(message);
}

for (const [pattern, message] of [
  [/PRODUCTION_DB_HOST="db\.upfjvkidaqtnbmmnhupz\.supabase\.co"/, 'Restore drill must retain the explicit VeInvite Production host denylist.'],
  [/ALLOW_NONPRODUCTION_RESTORE:-}" != "YES"/, 'Restore drill must require explicit non-production confirmation.'],
  [/mode="dry-run"/, 'Restore drill must default to non-mutating dry-run mode.'],
  [/pg_restore --list/, 'Restore drill must validate archive readability before any write.'],
  [/--exit-on-error/, 'Restore drill must fail on the first restore error.'],
]) {
  if (!pattern.test(restore)) failures.push(message);
}

if (!/Free 플랜/.test(runbook) || !/db dump/.test(runbook)) {
  failures.push('Disaster recovery runbook must preserve the current Free-plan logical-backup caveat.');
}
if (!/Production 데이터 dump를 Git 저장소에 commit하지 않는다/.test(runbook)) {
  failures.push('Runbook must explicitly prohibit committing Production data to Git.');
}
if (!/첫 실제 B3TR 자동 지급/.test(runbook)) {
  failures.push('Runbook must keep the first-real-payout backup/PITR review trigger.');
}

if (!/^\.backups\/$/m.test(gitignore) || !/^\*\.dump$/m.test(gitignore)) {
  failures.push('Gitignore must keep common local backup paths/artifacts out of version control.');
}

if (failures.length > 0) {
  console.error('Disaster recovery gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Disaster recovery gate passed.');
