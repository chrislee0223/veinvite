import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  migration,
  runtime,
  privateRoute,
  publicRoute,
  discoverRoute,
  visibilityRoute,
  experience,
  exploreCopy,
] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260909051843_network_explore_public_v1.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/networkRuntimeServer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/discover/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/visibility/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetworkExperience.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkExploreCopy.ts', import.meta.url), 'utf8'),
]);

test('Public Network preferences default private and rollout modes fail closed', () => {
  assert.match(migration, /my_mode text not null default 'off'/i);
  assert.match(migration, /public_mode text not null default 'off'/i);
  assert.match(migration, /my_mode in \('off', 'canary', 'on'\)/i);
  assert.match(migration, /public_mode in \('off', 'canary', 'on'\)/i);
  assert.match(migration, /create table if not exists public\.network_runtime_canary_wallets/i);
  assert.match(migration, /create table if not exists public\.network_public_profiles/i);
  assert.match(migration, /public_enabled boolean not null default false/i);
  assert.match(migration, /discoverable boolean not null default false/i);
  assert.match(migration, /check \(not discoverable or public_enabled\)/i);
  assert.match(migration, /enabled = false,[\s\S]*my_mode = 'off',[\s\S]*public_mode = 'off'/i);
});

test('Public Network tables and readers are service-role-only', () => {
  assert.match(migration, /revoke all on table public\.network_public_profiles from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.network_runtime_canary_wallets from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.match(migration, /revoke all on function public\.read_public_referral_network_focus_v1\([\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.read_public_referral_network_focus_v1\([\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.read_public_network_discovery_v1\(integer\)[\s\S]*from public, anon, authenticated/i);
});

test('Public graph traversal only follows explicitly public wallets and excludes private mission/reward evidence', () => {
  assert.match(migration, /join public\.network_public_profiles np[\s\S]*np\.public_enabled is true/i);
  assert.match(migration, /left join public\.network_public_profiles hidden_profile/i);
  assert.match(migration, /coalesce\(hidden_profile\.public_enabled, false\) is false/i);
  assert.doesNotMatch(migration, /i\.status/i);
  assert.doesNotMatch(migration, /sybil_status/i);
  assert.doesNotMatch(migration, /reward_status/i);
  assert.doesNotMatch(migration, /apps_completed/i);
  assert.doesNotMatch(migration, /vot3_converted/i);
  assert.doesNotMatch(migration, /vote_completed/i);
});

test('My Network and Public Network use independent staged runtime gates', () => {
  assert.match(runtime, /NetworkRuntimeSurface = 'my' \| 'public'/i);
  assert.match(runtime, /mode === 'on'/i);
  assert.match(runtime, /mode === 'off' \|\| !walletAddress/i);
  assert.match(runtime, /network_runtime_canary_wallets/i);

  const privateSwitch = privateRoute.indexOf("canUseNetworkSurface('my', rootWallet)");
  const privateRound = privateRoute.indexOf('const round = await readCurrentRoundContext();');
  const privateRpc = privateRoute.indexOf("'read_referral_network_focus_v2'");
  assert.ok(privateSwitch >= 0);
  assert.ok(privateRound > privateSwitch);
  assert.ok(privateRpc > privateRound);

  const publicSwitch = publicRoute.indexOf("canUseNetworkSurface('public', rootWallet)");
  const publicRound = publicRoute.indexOf('const round = await readCurrentRoundContext();');
  const publicRpc = publicRoute.indexOf("'read_public_referral_network_focus_v1'");
  assert.ok(publicSwitch >= 0);
  assert.ok(publicRound > publicSwitch);
  assert.ok(publicRpc > publicRound);
});

test('Guest Public Network reads have target and privacy-safe client throttles plus bounded recursive work', () => {
  assert.match(publicRoute, /getClientIpSubject/i);
  assert.match(publicRoute, /network_public_ip/i);
  assert.match(publicRoute, /network_public_target/i);
  assert.match(publicRoute, /PUBLIC_NETWORK_RPC_TIMEOUT_MS\s*=\s*5_000/i);
  assert.match(publicRoute, /AbortController\(\)/i);
  assert.match(publicRoute, /\.abortSignal\(controller\.signal\)/i);
  assert.match(publicRoute, /Cache-Control': 'no-store'/i);
  assert.doesNotMatch(publicRoute, /requireWalletSession/i);

  assert.match(discoverRoute, /network_public_discover_ip/i);
  assert.match(discoverRoute, /read_public_network_discovery_v1/i);
});

test('Public visibility changes require an authenticated same-origin wallet request and cannot leave discoverable on while private', () => {
  assert.match(visibilityRoute, /requireWalletSession/i);
  assert.match(visibilityRoute, /sameOrigin\(request\)/i);
  assert.match(visibilityRoute, /const discoverable = publicEnabled \? requestedDiscoverable : false/i);
  assert.match(visibilityRoute, /network_public_profiles/i);
});

test('Network Empty State uses the shared Network glyph instead of loading a wallet profile', () => {
  assert.match(experience, /function networkGlyph/i);
  assert.match(experience, /<StateGlyph \/>/i);
  assert.match(experience, /probe\.summary\.network === 0/i);
  assert.match(experience, /goHomeWithoutReload/i);
  assert.match(experience, /data-veinvite-tab="home"/i);
  assert.match(experience, /e\.exploreNetwork/i);
  assert.doesNotMatch(experience, /NetworkIdentity/i);
  assert.doesNotMatch(experience, /useGetAvatar/i);
  assert.doesNotMatch(experience, /useVechainDomain/i);
});

test('Explore reuses the mature My Network canvas while keeping a separate public canvas session and no sensitive statuses', () => {
  assert.match(experience, /<AppNetwork locale=\{locale\} \/>/i);
  assert.match(experience, /PUBLIC_SESSION_PREFIX\s*=\s*'veinvite-network-public-v1:'/i);
  assert.match(experience, /PublicNetworkCanvas/i);
  assert.match(experience, /onPointerMove/i);
  assert.match(experience, /pinchRef/i);
  assert.match(experience, /privateBranchesHidden/i);
  assert.doesNotMatch(experience, /IN_PROGRESS/i);
  assert.doesNotMatch(experience, /QUALIFIED/i);
  assert.doesNotMatch(experience, /REWARDED/i);
  assert.doesNotMatch(experience, /sybil/i);
});

test('Network Explore copy covers every supported locale', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(exploreCopy, pattern, `missing Network Explore copy for ${locale}`);
  }
});
