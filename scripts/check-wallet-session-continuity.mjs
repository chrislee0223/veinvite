import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const walletAuth = read('src/hooks/useWalletAuthentication.ts');
const walletControl = read('src/components/WalletControl.tsx');
const walletSessionGate = read('src/components/WalletSessionGate.tsx');
const walletResumeState = read('src/lib/walletConnectionResume.ts');
const walletSwitchCopy = read('src/lib/i18n/walletSwitchCopy.ts');
const walletSessionRoute = read('src/app/api/auth/session/route.ts');
const walletVerifyRoute = read('src/app/api/auth/verify/route.ts');
const multiDeviceMigration = read(
  'supabase/migrations/20260902090000_allow_multi_device_wallet_sessions.sql',
);
const migrationManifest = read('supabase/production-migration-manifest.txt');

const authDeleteCount =
  walletAuth.match(/method:\s*['"]DELETE['"]/g)?.length ?? 0;

if (authDeleteCount !== 1) {
  failures.push(
    'Wallet authentication must not delete a valid session from the automatic verification path; DELETE is reserved for explicit session clearing.',
  );
}

if (
  !/session\.authenticated[\s\S]*connected wallet changed while a verified VeInvite session is active/i.test(
    walletAuth,
  ) ||
  /Could not clear the previous wallet verification/.test(walletAuth)
) {
  failures.push(
    'A transient provider wallet mismatch must stop before challenge/signing instead of clearing the known-good browser session.',
  );
}

if (
  !walletAuth.includes('confirmedDisconnected?: boolean') ||
  !walletAuth.includes('!options.confirmedDisconnected') ||
  !walletSessionGate.includes('confirmedDisconnected: true')
) {
  failures.push(
    'Passive provider churn must stay non-destructive, while a wallet that remains disconnected after the visible grace period must be able to clear the stale browser session.',
  );
}

if (
  !walletAuth.includes('SESSION_CLEAR_RETRY_DELAYS_MS') ||
  !walletAuth.includes('index < SESSION_CLEAR_RETRY_DELAYS_MS.length') ||
  !walletAuth.includes('if (response.ok)')
) {
  failures.push(
    'Explicit browser-session clearing must retry bounded transient DELETE failures before any provider disconnect is allowed.',
  );
}

const sessionClearedEventIndex =
  walletAuth.lastIndexOf('veinvite-wallet-session-cleared');
const authoritativeClearIndex =
  walletAuth.lastIndexOf('await clearServerSession();');
if (
  sessionClearedEventIndex < 0 ||
  authoritativeClearIndex < 0 ||
  sessionClearedEventIndex < authoritativeClearIndex
) {
  failures.push(
    'The session-cleared event must only be emitted after the authoritative server DELETE has completed successfully.',
  );
}

if (
  !walletControl.includes('const performDisconnect') ||
  !/await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*settleExplicitWalletDisconnect/.test(
    walletControl,
  ) ||
  walletControl.includes('ignoreSessionCleanupError')
) {
  failures.push(
    'Explicit disconnect/switch must keep the provider connected when server-session cleanup fails, and only start provider teardown after the browser session is gone.',
  );
}

if (
  !walletResumeState.includes('settleExplicitWalletDisconnect') ||
  (walletResumeState.match(/clearPersistedVeWorldConnectionState\(\);/g)?.length ?? 0) < 2 ||
  !walletResumeState.includes('WALLET_RELEASE_TIMEOUT_MS') ||
  !walletResumeState.includes('WALLET_TRANSPORT_SETTLE_MS') ||
  !walletResumeState.includes('Promise<boolean>')
) {
  failures.push(
    'VeWorld disconnect settlement must wait for the old account to release, clear persisted provider evidence both before and after transport settlement, and report incomplete disconnects.',
  );
}

if (
  !walletSessionGate.includes('isWalletSessionMismatch') ||
  !/const retryVerification[\s\S]*await clearWalletSession\(\);[\s\S]*await verify\(\);/.test(
    walletSessionGate,
  ) ||
  !walletSessionGate.includes('WALLET_SWITCH_COPY') ||
  !walletSessionGate.includes('switchT.continueCurrent') ||
  !walletSessionGate.includes('switchT.chooseAnother')
) {
  failures.push(
    'A real A-to-B VeWorld switch must render a dedicated wallet-changed surface and let the user explicitly continue with B without disconnecting it.',
  );
}

if (
  !/const chooseAnotherWallet[\s\S]*await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*settleExplicitWalletDisconnect[\s\S]*markWalletConnectIntent\(\);[\s\S]*openConnectModal\(\);/.test(
    walletSessionGate,
  )
) {
  failures.push(
    'Choosing another wallet from the mismatch surface must clear the old browser session, finish provider teardown, and only then open a fresh wallet handshake.',
  );
}

if (
  !/disconnectFromVerification[\s\S]*await clearWalletSession\(\);[\s\S]*catch \(error\)[\s\S]*return;[\s\S]*await disconnect\(\)/.test(
    walletSessionGate,
  )
) {
  failures.push(
    'Verification-screen disconnect must stop before provider teardown when browser-session revocation fails.',
  );
}

if (
  !/handleSessionCleared[\s\S]*data-veinvite-session-bootstrap[\s\S]*setAttribute\([\s\S]*data-veinvite-session-bootstrap[\s\S]*['"]none['"]/.test(
    walletSessionGate,
  )
) {
  failures.push(
    'Clearing a browser wallet session must also invalidate the server bootstrap marker so startup readiness does not wait on a session that no longer exists.',
  );
}

if (
  !walletSessionGate.includes('PASSIVE_DISCONNECT_GRACE_MS = 7_000') ||
  !walletSessionGate.includes("window.addEventListener(\n      'pageshow'") ||
  !walletSessionGate.includes("document.addEventListener(\n      'visibilitychange'")
) {
  failures.push(
    'A VeWorld disconnect that occurs while the page is backgrounded must be re-evaluated on visible return instead of leaving the startup shield waiting forever.',
  );
}

if (
  !walletSwitchCopy.includes("ko: {") ||
  !walletSwitchCopy.includes("title: 'VeWorld에서 지갑이 변경되었어요'") ||
  !walletSwitchCopy.includes('Record<\n  SupportedLocale')
) {
  failures.push(
    'The wallet-changed surface must use reviewed localized copy rather than the generic signature-failure message.',
  );
}

if (
  !/SESSION_LIFETIME_DAYS\s*=\s*30/.test(walletVerifyRoute) ||
  !/maxAge:\s*SESSION_LIFETIME_SECONDS/.test(walletVerifyRoute)
) {
  failures.push(
    'A newly verified wallet session must start with the reviewed 30-day persistent lifetime.',
  );
}

if (
  !/revokeWalletSession\(request\)/.test(walletSessionRoute) ||
  !/readWalletSessionTokens/.test(walletSessionRoute)
) {
  failures.push(
    'Explicit logout must remain scoped to the session token(s) presented by this browser rather than every session for the wallet.',
  );
}

if (
  !/drop index if exists public\.wallet_auth_sessions_one_unrevoked_per_wallet_idx/i.test(
    multiDeviceMigration,
  ) ||
  !/row_number\(\) over/i.test(multiDeviceMigration) ||
  !/session_rank > 5/.test(multiDeviceMigration) ||
  !/pg_advisory_xact_lock/.test(multiDeviceMigration)
) {
  failures.push(
    'The database must allow a bounded set of five serialized active browser/device sessions per wallet.',
  );
}

if (
  /update public\.wallet_auth_sessions\s+set revoked_at = p_used_at\s+where wallet_address = p_wallet_address\s+and revoked_at is null;/i.test(
    multiDeviceMigration,
  )
) {
  failures.push(
    'Issuing a new wallet session must never blanket-revoke every other active device session.',
  );
}

if (
  !/20260902090000_allow_multi_device_wallet_sessions\.sql/.test(
    migrationManifest,
  )
) {
  failures.push(
    'The production migration manifest must include the multi-device wallet-session migration.',
  );
}

if (
  /reward_|referral_|invitation_|payout_/i.test(multiDeviceMigration)
) {
  failures.push(
    'Wallet-session continuity migration must not modify reward, referral, invitation, or payout data paths.',
  );
}

if (failures.length > 0) {
  console.error('Wallet session continuity gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Wallet session continuity gate passed.');
