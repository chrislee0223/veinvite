import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  boundary,
  bootstrap,
  permanentPage,
  invitePage,
] = await Promise.all([
  readFile(
    new URL('../src/components/ReferralWalletBootstrapBoundary.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/lib/walletSessionBootstrapServer.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/app/r/[key]/page.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/app/i/[code]/page.tsx', import.meta.url),
    'utf8',
  ),
]);

test('direct referral routes bootstrap the verified server session before client wallet restoration', () => {
  for (const source of [permanentPage, invitePage]) {
    assert.match(source, /readWalletSessionBootstrap\(\)/);
    assert.match(
      source,
      /initialSessionWallet=\{bootstrap\.initialSessionWallet\}/,
    );
    assert.match(
      source,
      /initialRestrictionKind=\{bootstrap\.initialRestrictionKind\}/,
    );
    assert.match(source, /<ReferralWalletBootstrapBoundary(?:\s|>)/);
  }

  assert.match(bootstrap, /getWalletSessionFromTokens/);
  assert.match(bootstrap, /LEGACY_WALLET_SESSION_COOKIE_NAME/);
  assert.match(bootstrap, /WALLET_SESSION_COOKIE_NAME/);
  assert.match(bootstrap, /loadActiveSybilV2Restriction/);
  assert.match(
    bootstrap,
    /initialRestriction\?\.restriction_kind \?\? null/,
  );
});

test('referral wallet bootstrap waits through initial VeWorld restoration but never re-arms after release', () => {
  assert.match(
    boundary,
    /BROWSER_WALLET_BOOTSTRAP_SETTLE_MS\s*=\s*350/,
  );
  assert.match(
    boundary,
    /VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS\s*=\s*3_500/,
  );
  assert.match(
    boundary,
    /REFERRAL_WALLET_BOOTSTRAP_MAX_HOLD_MS\s*=\s*5_000/,
  );
  assert.match(boundary, /readPersistedDappKitAccount\(\)/);
  assert.match(boundary, /connection\?\.isInAppBrowser/);
  assert.match(boundary, /connection\?\.isLoading/);
  assert.match(boundary, /if \(settled\) \{\s*return;/s);
  assert.doesNotMatch(boundary, /setSettled\(false\)/);
  assert.match(
    boundary,
    /data-veinvite-referral-wallet-bootstrap="pending"/,
  );
});

test('the startup stabilization stays outside referral business logic', () => {
  assert.doesNotMatch(boundary, /fetch\(|claim|reward|sybil/i);
  assert.doesNotMatch(bootstrap, /insert\(|update\(|delete\(/i);
  assert.doesNotMatch(permanentPage, /\/api\/referral-links/);
  assert.doesNotMatch(invitePage, /\/api\/invites/);
});
