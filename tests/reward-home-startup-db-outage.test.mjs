import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  home,
  referral,
  bootstrap,
  sessionAuth,
  restriction,
  sybilRollout,
] = await Promise.all([
  read('src/app/page.tsx'),
  read('src/app/r/[key]/page.tsx'),
  read('src/lib/walletSessionBootstrapServer.ts'),
  read('src/lib/walletAuthServer.ts'),
  read('src/lib/sybil/v2/restrictions.ts'),
  read('src/lib/sybil/v2/rollout.ts'),
]);

test('public Home and invite pages use only a bounded first-render bootstrap', () => {
  assert.match(home, /readWalletSessionBootstrapForFirstPaint\(\)/);
  assert.match(referral, /readWalletSessionBootstrapForFirstPaint\(\)/);
  assert.match(bootstrap, /FIRST_RENDER_BOOTSTRAP_BUDGET_MS = 3_500/);
  assert.match(bootstrap, /new AbortController\(\)/);
  assert.match(bootstrap, /controller\.abort\(\)/);
  assert.match(bootstrap, /controller\.signal\.aborted/);
  assert.match(bootstrap, /clearTimeout\(timer\)/);
});

test('timed-out startup never grants authorization or mutates a wallet session', () => {
  assert.match(bootstrap, /initialSessionWallet: null,\s*initialRestrictionKind: null,\s*initialLegalConsentStatus: null/);
  assert.match(bootstrap, /getWalletSessionFromTokens\(sessionTokens, signal\)/);
  assert.match(sessionAuth, /signal \? query\.abortSignal\(signal\) : query/);
  assert.doesNotMatch(bootstrap, /delete\(|setAll\(|revoke|signMessage|sendTransaction/);
  assert.match(bootstrap, /loadActiveSybilV2Restriction\(\{[\s\S]*signal,/);
});

test('security and legal checks abort their real PostgREST transport under deadline', () => {
  assert.match(sybilRollout, /isSybilV2EnforcementEnabled\(\s*signal\?: AbortSignal/);
  assert.match(sybilRollout, /signal \? query\.abortSignal\(signal\) : query/);
  assert.match(restriction, /isSybilV2EnforcementEnabled\(signal\)/);
  assert.equal(
    (restriction.match(/\.abortSignal\(signal \?\? AbortSignal\.timeout\(60_000\)\)/g) ?? []).length,
    2,
  );
  assert.match(bootstrap, /readInitialLegalConsentStatus\(\s*initialSessionWallet,\s*signal,/);
});
