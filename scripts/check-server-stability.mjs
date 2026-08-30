import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

const monitoringRoute = read(
  'src/app/api/admin/monitoring/route.ts',
);
const authIndex = monitoringRoute.indexOf(
  'await requireWalletSession',
);
const poolIndex = monitoringRoute.indexOf(
  'await readVeInviteRewardPoolStatus',
);

if (authIndex < 0 || poolIndex < 0 || authIndex > poolIndex) {
  failures.push(
    'Operator monitoring must authenticate before starting VeChain reward-pool RPC reads.',
  );
}

const fundingRoute = read(
  'src/app/api/admin/funding-config/route.ts',
);

if (!/scope:\s*'admin_funding_config_ip'/.test(fundingRoute)) {
  failures.push(
    'Funding configuration endpoint is missing its per-IP RPC throttle.',
  );
}
if (!/getClientIpSubject\(request\)/.test(fundingRoute)) {
  failures.push(
    'Funding configuration endpoint is not deriving the reviewed client-IP rate-limit subject.',
  );
}

const inviteCodeMigration = read(
  'supabase/migrations/20260830083500_align_invite_code_constraint.sql',
);

if (!/\^\[A-HJ-NP-Z2-9\]\{7\}\$/.test(inviteCodeMigration)) {
  failures.push(
    'Database invite-code constraint is not aligned with the ambiguity-safe API format.',
  );
}

if (failures.length > 0) {
  console.error('Server stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Server stability gate passed.');
