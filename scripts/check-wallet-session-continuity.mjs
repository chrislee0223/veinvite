import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const walletAuth = read('src/hooks/useWalletAuthentication.ts');
const walletAuthServer = read('src/lib/walletAuthServer.ts');
const walletControl = read('src/components/WalletControl.tsx');
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
  !/const connectedWallet\s*=[\s\S]*account\?\.address/.test(walletAuth) ||
  !/!connectedWallet\s*\|\|[\s\S]*!WALLET_PATTERN\.test\(connectedWallet\)[\s\S]*return;/.test(
    walletAuth,
  ) ||
  !/veinvite-wallet-session-cleared/.test(walletAuth)
) {
  failures.push(
    'Passive WalletConnect/VeWorld disconnect churn must be a no-op before any server-session clear or session-cleared event is emitted.',
  );
}

if (!/\}, \[account\?\.address\]\);/.test(walletAuth)) {
  failures.push(
    'Explicit session clearing must track the live connected account so passive disconnects cannot revoke a persistent login.',
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
  !/SESSION_ABSOLUTE_LIFETIME_DAYS\s*=\s*30/.test(walletAuthServer) ||
  !/\.gt\('created_at',\s*absoluteCreatedAfter\)/.test(walletAuthServer)
) {
  failures.push(
    'Server-side wallet session validation must reject sessions more than 30 days after the original ownership proof even if expires_at was previously extended.',
  );
}

if (
  !/SESSION_ABSOLUTE_LIFETIME_DAYS\s*=\s*30/.test(walletSessionRoute) ||
  !/\.select\('token_hash, created_at'\)/.test(walletSessionRoute) ||
  !/absoluteExpiresAt[\s\S]*Math\.min\([\s\S]*SLIDING_SESSION_LIFETIME_SECONDS[\s\S]*absoluteExpiresAt\.getTime\(\)/.test(
    walletSessionRoute,
  ) ||
  !/maxAge:\s*remainingLifetimeSeconds/.test(walletSessionRoute)
) {
  failures.push(
    'Silent session renewal must be capped by the original 30-day ownership-proof lifetime and the browser cookie must use only the remaining absolute lifetime.',
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
