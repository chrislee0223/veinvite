import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { HELD_MISSION_PROGRESS_COPY } from '../src/lib/i18n/heldMissionProgressCopy.ts';
import { LOCALE_DEFINITIONS } from '../src/lib/i18n/locales.ts';

const gate = await readFile('src/components/WalletSessionGate.tsx', 'utf8');
const panel = await readFile('src/components/HeldMissionProgressPanel.tsx', 'utf8');
const endpoint = await readFile('src/app/api/sybil/hold-progress/route.ts', 'utf8');

test('only verified PRE_CLAIM_HOLD wallet sees read-only progress', () => {
  assert.match(gate, /state === 'verified' &&\s*verifiedWallet === walletAddress &&\s*restrictionKind/u);
  assert.match(gate, /restrictionKind === 'PRE_CLAIM_HOLD' \? \(/u);
  assert.match(gate, /<HeldMissionProgressPanel\s+key=\{walletAddress\}\s+walletAddress=\{walletAddress\}/u);
  assert.match(gate, /<WalletRestrictionSurface\s+locale=\{locale\}\s+walletAddress=\{verifiedWallet\}/u);
  assert.match(gate, /restrictionKind === 'BLACKLIST'/u);
  assert.match(gate, /<RestrictedApprovedRewardClaims/u);
});

test('progress fetch discards stale data and aborts during wallet switches', () => {
  assert.match(panel, /useEffect\(\(\) => \{/u);
  assert.match(panel, /setState\(\{ status: 'loading', progress: null \}\)/u);
  assert.match(panel, /const controller = new AbortController\(\)/u);
  assert.match(panel, /if \(cancelled\) return;/u);
  assert.match(panel, /controller\.abort\(\)/u);
  assert.match(panel, /\[walletAddress, requestVersion\]/u);
  assert.match(panel, /cache: 'no-store'/u);
  assert.match(panel, /credentials: 'same-origin'/u);
  assert.match(panel, /'x-veinvite-session-wallet': walletAddress/u);
  assert.match(endpoint, /expectedWallet !== session\.walletAddress/u);
  assert.match(endpoint, /get\('x-veinvite-session-wallet'\)/u);
});

test('restrict UI to status values, without transaction and invite buttons', () => {
  assert.match(panel, /data-veinvite-held-progress="read-only"/u);
  assert.match(panel, /rewardBlocked/u);
  assert.match(panel, /reviewPending/u);
  assert.doesNotMatch(panel, /sendTransaction|writeContract|claimReward|reserveReward|createInvitation|issueReferral/u);
  assert.match(endpoint, /finalRestriction\.related_invite_code !== inviteCode/u);
  assert.match(endpoint, /const finalRestriction = await loadActiveSybilV2Restriction/u);
});

test('all supported locales have every status label and explanatory warning', () => {
  const supported = LOCALE_DEFINITIONS.map((item) => item.locale);
  assert.deepEqual(Object.keys(HELD_MISSION_PROGRESS_COPY).sort(), [...supported].sort());
  for (const locale of supported) {
    const strings = HELD_MISSION_PROGRESS_COPY[locale];
    assert.equal(Object.keys(strings).length, 12, locale);
    for (const [key, value] of Object.entries(strings)) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, locale + ':' + key);
    }
    assert.match(strings.restrictionNote, /HOLD/u);
  }
});
