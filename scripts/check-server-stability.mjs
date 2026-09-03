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

const nextConfig = read('next.config.mjs');
if (
  !/X-Content-Type-Options/.test(nextConfig) ||
  !/strict-origin-when-cross-origin/.test(nextConfig) ||
  !/Permissions-Policy/.test(nextConfig) ||
  !/camera=\(\), microphone=\(\), geolocation=\(\)/.test(nextConfig)
) {
  failures.push(
    'Reviewed low-risk browser security headers must remain enabled without adding wallet-breaking CSP or cross-origin opener restrictions.',
  );
}

const proxySource = read('src/proxy.ts');
if (
  !/pathname\.startsWith\('\/ui-test'\)/.test(proxySource) ||
  !/'\/ui-test\/:path\*'/.test(proxySource) ||
  !/!uiTestAllowed\(\)/.test(proxySource)
) {
  failures.push(
    'Production must block the entire /ui-test route family at the proxy boundary while keeping reviewed preview/development access.',
  );
}

const notificationSurface = read(
  'src/components/InAppInviteNotifications.tsx',
);
const walletSessionGate = read(
  'src/components/WalletSessionGate.tsx',
);
if (
  !/response\.status\s*===\s*401/.test(notificationSurface) ||
  !/veinvite-wallet-session-invalid/.test(notificationSurface) ||
  !/dispatchEvent/.test(notificationSurface) ||
  !/veinvite-wallet-session-invalid/.test(walletSessionGate) ||
  !/handleInvalidWalletSession/.test(walletSessionGate) ||
  !/void verify\(\)/.test(walletSessionGate)
) {
  failures.push(
    'Expired wallet sessions must stop protected notification polling and return control to WalletSessionGate for re-verification.',
  );
}

const languagePreferenceSync = read(
  'src/components/WalletLanguagePreferenceSync.tsx',
);
if (
  /SESSION_RETRY_MS|SESSION_RETRY_LIMIT|waitForWalletSession/.test(
    languagePreferenceSync,
  ) ||
  !/veinvite-wallet-session-ready/.test(languagePreferenceSync) ||
  !/handleWalletSessionReady/.test(languagePreferenceSync) ||
  !/veinvite-wallet-session-ready/.test(walletSessionGate) ||
  !/WALLET_SESSION_READY_EVENT/.test(walletSessionGate)
) {
  failures.push(
    'Wallet language preference synchronization must remain event-driven after session verification instead of repeatedly polling /api/auth/session.',
  );
}

const healthRoute = read('src/app/api/health/route.ts');
if (
  !/VERCEL_GIT_COMMIT_SHA/.test(healthRoute) ||
  !/gitCommitShortSha/.test(healthRoute) ||
  !/deployment,/.test(healthRoute)
) {
  failures.push(
    'Health responses must expose the running deployment revision so stale production builds can be detected immediately.',
  );
}
if (!/Cache-Control': 'no-store'/.test(healthRoute)) {
  failures.push('Health responses must remain uncached.');
}
if (
  /readRewardOperationsHealth|readVeInviteRewardPoolStatus|readPredictiveRewardPlanning|readAutomaticRewardDistributorReadiness/.test(
    healthRoute,
  ) ||
  /count:\s*'exact'/.test(healthRoute) ||
  !/\.select\('invite_code'\)[\s\S]*\.limit\(1\)/.test(
    healthRoute,
  )
) {
  failures.push(
    'Public health must stay a lightweight database/network readiness probe; detailed reward, gas, queue, signer and planning diagnostics belong behind operator authorization.',
  );
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

const leaderboardRoute = read(
  'src/app/api/leaderboard/route.ts',
);
if (!/scope:\s*'public_leaderboard_ip'/.test(leaderboardRoute)) {
  failures.push(
    'Public leaderboard is missing its per-IP RPC throttle.',
  );
}
if (!/getClientIpSubject\(request\)/.test(leaderboardRoute)) {
  failures.push(
    'Public leaderboard is not deriving the reviewed client-IP rate-limit subject before expensive public reads.',
  );
}

const fundedOneWayMigration = read(
  'supabase/migrations/20260831231500_lock_mainnet_funded_rewards_one_way.sql',
);
if (
  !/guard_mainnet_funded_rewards_one_way/.test(fundedOneWayMigration) ||
  !/old\.mainnet_funded_rewards_enabled\s*=\s*true/.test(fundedOneWayMigration) ||
  !/new\.mainnet_funded_rewards_enabled\s*=\s*false/.test(fundedOneWayMigration)
) {
  failures.push(
    'Mainnet funded-reward activation must remain one-way after activation.',
  );
}

const emergencyPauseAuditMigration = read(
  'supabase/migrations/20260901003500_require_emergency_pause_audit_metadata.sql',
);
if (
  !/guard_reward_emergency_pause_audit_metadata/.test(emergencyPauseAuditMigration) ||
  !/emergency_pause_changed_by/.test(emergencyPauseAuditMigration) ||
  !/emergency_pause_reason/.test(emergencyPauseAuditMigration) ||
  !/emergency_pause_network/.test(emergencyPauseAuditMigration) ||
  !/emergency_pause_changed_at/.test(emergencyPauseAuditMigration) ||
  !/before update of emergency_rewards_paused/i.test(emergencyPauseAuditMigration)
) {
  failures.push(
    'Emergency reward-pause mutations must require complete audit metadata at the database layer.',
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

const authPredeployMigration = read(
  'supabase/migrations/20260830085000_prepare_wallet_auth_rpc_predeploy.sql',
);

if (
  !/issue_wallet_session_after_verified_challenge/.test(authPredeployMigration) ||
  !/pg_advisory_xact_lock/.test(authPredeployMigration) ||
  !/veinvite_wallet_session_/.test(authPredeployMigration) ||
  /create\s+unique\s+index/i.test(authPredeployMigration)
) {
  failures.push(
    'Wallet authentication predeploy migration must provide the serialized RPC without introducing uniqueness constraints before the compatible app code is live.',
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
    'Wallet authentication migration must serialize challenge use, enforce one live challenge per context, and keep the RPC service-role only.',
  );
}

const multiDeviceMigration = read(
  'supabase/migrations/20260902090000_allow_multi_device_wallet_sessions.sql',
);

if (
  !/MAX_ACTIVE_SESSIONS_PER_WALLET|5/.test(multiDeviceMigration) &&
  !/limit\s+5/i.test(multiDeviceMigration)
) {
  failures.push(
    'The reviewed multi-device wallet-session policy must remain present and capped at five active sessions per wallet.',
  );
}

const walletAuthServer = read(
  'src/lib/walletAuthServer.ts',
);
if (
  !/__Host-veinvite_session/.test(walletAuthServer) ||
  !/httpOnly:\s*true/.test(walletAuthServer) ||
  !/sameSite:\s*'lax'/.test(walletAuthServer) ||
  !/secure:\s*isProduction/.test(walletAuthServer)
) {
  failures.push(
    'Production wallet sessions must retain the hardened __Host- cookie boundary.',
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
