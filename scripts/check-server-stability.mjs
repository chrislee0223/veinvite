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

function assertSafeInviteCodePattern(path, label) {
  const source = read(path);

  if (!/INVITE_CODE_PATTERN\s*=\s*\/\^\[A-HJ-NP-Z2-9\]\{7\}\$\//.test(source)) {
    failures.push(
      `${label} invite-code validation is not aligned with the ambiguity-safe public format.`,
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

assertSafeInviteCodePattern(
  'src/app/api/admin/sybil/onchain/route.ts',
  'On-chain Sybil analytics',
);
assertSafeInviteCodePattern(
  'src/app/api/admin/sybil/review/route.ts',
  'Manual Sybil review',
);

const inviteCodeMigration = read(
  'supabase/migrations/20260830083500_align_invite_code_constraint.sql',
);

if (!/\^\[A-HJ-NP-Z2-9\]\{7\}\$/.test(inviteCodeMigration)) {
  failures.push(
    'Database invite-code constraint is not aligned with the ambiguity-safe API format.',
  );
}

const authChallengeRoute = read(
  'src/app/api/auth/challenge/route.ts',
);

if (
  !/insertError\.code\s*===\s*'23505'/.test(authChallengeRoute) ||
  !/loadActiveChallenge\(/.test(authChallengeRoute)
) {
  failures.push(
    'Wallet challenge creation must recover the existing challenge after a concurrent unique-index race.',
  );
}

const authVerifyRoute = read(
  'src/app/api/auth/verify/route.ts',
);

if (!/issue_wallet_session_after_verified_challenge/.test(authVerifyRoute)) {
  failures.push(
    'Wallet verification must atomically consume the challenge and issue its replacement session.',
  );
}

const authMigration = read(
  'supabase/migrations/20260830090238_harden_wallet_auth_atomicity.sql',
);

if (
  !/wallet_auth_challenges_one_unused_per_context_idx/.test(authMigration) ||
  !/issue_wallet_session_after_verified_challenge/.test(authMigration) ||
  !/revoke all on function public\.issue_wallet_session_after_verified_challenge[\s\S]*from authenticated;/.test(authMigration) ||
  !/grant execute on function public\.issue_wallet_session_after_verified_challenge[\s\S]*to service_role;/.test(authMigration)
) {
  failures.push(
    'Wallet authentication migration is missing its concurrency, atomicity, or privilege hardening.',
  );
}

const cronRoute = read(
  'src/app/api/cron/reconcile/route.ts',
);

if (
  !/failedStages/.test(cronRoute) ||
  !/ALLOCATION_SYNC/.test(cronRoute) ||
  !/RECONCILIATION/.test(cronRoute) ||
  !/if \(summary\)/.test(cronRoute) ||
  !/status:\s*hasCoreFailure\s*\?\s*500\s*:\s*200/.test(cronRoute)
) {
  failures.push(
    'Scheduled reconciliation must isolate independent stage failures, gate growth reporting on successful reconciliation, and surface partial core failures as HTTP 500.',
  );
}

const rewardClaimRoute = read(
  'src/app/api/rewards/claims/route.ts',
);

if (
  !/INVITE_CODE_PATTERN\s*=\s*\/\^\[A-HJ-NP-Z2-9\]\{7\}\$\//.test(rewardClaimRoute) ||
  !/scope:\s*'reward_claim_wallet'/.test(rewardClaimRoute) ||
  !/scope:\s*'reward_claim_invite'/.test(rewardClaimRoute)
) {
  failures.push(
    'Legacy reward claims must reject malformed invite codes before DB work and remain throttled by authenticated wallet and invite code.',
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
