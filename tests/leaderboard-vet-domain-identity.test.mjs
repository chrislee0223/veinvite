import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const leaderboard = readFileSync(
  new URL('../src/components/InviterLeaderboard.tsx', import.meta.url),
  'utf8',
);
const warmup = readFileSync(
  new URL('../src/components/LeaderboardAvatarWarmup.tsx', import.meta.url),
  'utf8',
);
const domainCache = readFileSync(
  new URL('../src/lib/leaderboardDomainCache.ts', import.meta.url),
  'utf8',
);
const layout = readFileSync(
  new URL('../src/components/SecondaryPageLayoutPolish.tsx', import.meta.url),
  'utf8',
);

test('leaderboard uses VET domain as display identity and wallet address as fallback', () => {
  assert.match(leaderboard, /function WalletIdentity/);
  assert.match(leaderboard, /useVechainDomain\(/);
  assert.match(leaderboard, /const profileName = resolvedDomain;/);
  assert.match(
    leaderboard,
    /data-profile-name=\{profileName \? 'true' : undefined\}/,
  );
  assert.match(
    leaderboard,
    /\{profileName \?\? maskWallet\(address\)\}/,
  );
  assert.match(leaderboard, /title=\{profileName \?\? address\}/);
});

test('domain resolution is shared with avatar resolution instead of adding a second row lookup', () => {
  const rowComponent = leaderboard.slice(
    leaderboard.indexOf('function WalletIdentity'),
    leaderboard.indexOf('export function PublicLeaderboard'),
  );
  assert.equal(
    (rowComponent.match(/useVechainDomain\(/g) ?? []).length,
    1,
  );
  assert.match(rowComponent, /useGetAvatar\(domain\)/);
});

test('resolved and missing VET domains are cached so scrolling does not repeatedly query them', () => {
  assert.match(domainCache, /DOMAIN_CACHE_TTL_MS = 15 \* 60_000/);
  assert.match(
    domainCache,
    /DOMAIN_CACHE_KEY = 'veinvite_leaderboard_profile_domain_v1'/,
  );
  assert.match(
    domainCache,
    /export function readCachedLeaderboardDomain/,
  );
  assert.match(
    domainCache,
    /export function rememberLeaderboardDomain/,
  );
  assert.match(domainCache, /domain: string \| null/);
  assert.match(warmup, /rememberLeaderboardDomain\(address, queriedDomain\)/);
});

test('long VET domain names remain inside the inviter column with ellipsis', () => {
  assert.match(
    layout,
    /\.walletCell > \.walletText\[data-profile-name='true'\][\s\S]*width:auto !important[\s\S]*min-width:0 !important[\s\S]*max-width:calc\(100% - 31px\) !important[\s\S]*text-overflow:ellipsis !important/,
  );
  assert.match(
    layout,
    /\.walletCell > \.walletText \{[\s\S]*width:9ch !important[\s\S]*text-overflow:clip !important/,
  );
});


test('wallet details title keeps rank while preferring VET domain identity', () => {
  assert.match(leaderboard, /function WalletDetailIdentity/);
  assert.match(
    leaderboard,
    /entry\.rank > 0 \? `#\$\{entry\.rank\}` : '—'/,
  );
  assert.match(
    leaderboard,
    /\{profileName \?\? maskWallet\(address\)\}/,
  );
  assert.match(
    leaderboard,
    /<WalletDetailIdentity[\s\S]*entry=\{selectedEntry\}/,
  );
  assert.match(
    leaderboard,
    /\.walletIdentityName \{[\s\S]*overflow:hidden;[\s\S]*text-overflow:ellipsis;[\s\S]*white-space:nowrap;/,
  );
  assert.match(
    leaderboard,
    /<label>\{t\.fullAddress\}<\/label>[\s\S]*<code>\{selectedEntry\.walletAddress\}<\/code>/,
  );
});
