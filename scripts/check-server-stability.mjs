import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assertAuthBeforePool(path, label) {
  const source = read(path);
  const authIndex = source.indexOf(
    'await requireWalletSession',
  );
  const poolIndex = source.indexOf(
    'await readVeInviteRewardPoolStatus',
  );

  if (
    authIndex < 0 ||
    poolIndex < 0 ||
    authIndex > poolIndex
  ) {
    failures.push(
      `${label} must authenticate before starting VeChain reward-pool RPC reads.`,
    );
  }
}

assertAuthBeforePool(
  'src/app/api/admin/monitoring/route.ts',
  'Operator monitoring',
);
assertAuthBeforePool(
  'src/app/api/admin/analytics/route.ts',
  'Operator analytics',
);
assertAuthBeforePool(
  'src/app/api/admin/participants/route.ts',
  'Participant overview',
);
assertAuthBeforePool(
  'src/app/api/admin/reports/growth-round/route.ts',
  'Round growth reporting',
);
assertAuthBeforePool(
  'src/app/api/admin/sybil/onchain/route.ts',
  'On-chain Sybil analytics',
);

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

const sybilRoute = read(
  'src/app/api/admin/sybil/onchain/route.ts',
);

if (!/INVITE_CODE_PATTERN\s*=\s*\/\^\[A-HJ-NP-Z2-9\]\{7\}\$\//.test(sybilRoute)) {
  failures.push(
    'On-chain Sybil analytics invite-code validation is not aligned with the ambiguity-safe public format.',
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
