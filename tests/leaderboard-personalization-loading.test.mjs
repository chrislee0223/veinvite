import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hub = readFileSync(
  new URL('../src/components/PublicLeaderboardHub.tsx', import.meta.url),
  'utf8',
);

test('public leaderboard paints independently from current-wallet personalization', () => {
  assert.match(hub, /const initialPublic = getCachedPublicLeaderboard\(null\)/);
  assert.match(hub, /loadPublicLeaderboard\(null\)/);
  assert.match(hub, /confirmed: false/);
  assert.match(hub, /setPublicState\(\{ data, confirmed: true, failed: false \}\)/);
});

test('wallet already present in public top 100 resolves locally without a private request', () => {
  assert.match(
    hub,
    /const publicMatch = publicData\.leaders\.find\([\s\S]*entry\.walletAddress\.toLowerCase\(\) === walletKey/,
  );
  assert.match(
    hub,
    /if \(publicMatch\) \{[\s\S]*status: 'resolved'[\s\S]*isCurrentWallet: true/,
  );
});

test('absence from a non-full public ranking proves unranked without private loading', () => {
  assert.match(
    hub,
    /if \(publicData\.leaders\.length < PUBLIC_RANK_LIMIT\) \{[\s\S]*status: 'resolved'[\s\S]*currentUser: null/,
  );
});

test('only a full top 100 may trigger the private current-wallet lookup', () => {
  const privateLookupIndex = hub.indexOf('void loadPublicLeaderboard(walletKey)');
  const nonFullGuardIndex = hub.indexOf(
    'if (publicData.leaders.length < PUBLIC_RANK_LIMIT)',
  );
  assert.ok(nonFullGuardIndex >= 0);
  assert.ok(privateLookupIndex > nonFullGuardIndex);
});

test('private response never replaces the public ranking snapshot', () => {
  assert.match(hub, /sameLeaderboardSnapshot\(publicData, personalizedData\)/);
  assert.match(hub, /const currentUser = personalizedData\.currentUser/);
  assert.doesNotMatch(hub, /setPublicState\(\{\s*data: personalizedData/);
  assert.match(
    hub,
    /currentUser && currentUser\.rank <= PUBLIC_RANK_LIMIT[\s\S]*refreshPublicSnapshot\(\)/,
  );
});

test('pending or unavailable personalization cannot fabricate a rank-zero current user', () => {
  assert.match(
    hub,
    /const displayWallet = personalizationPending \? null : wallet/,
  );
  assert.match(
    hub,
    /leaderboardHub\.personalizationPending \.rankContextNote \{\s*display:none !important;/,
  );
});
