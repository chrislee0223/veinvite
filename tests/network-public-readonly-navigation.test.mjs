import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  leaderboard,
  home,
  hub,
  network,
  publicExplorer,
  settings,
  domainCache,
  publicApi,
  migration
] = await Promise.all([
  readFile('src/components/InviterLeaderboard.tsx', 'utf8'),
  readFile('src/components/HomeClient.tsx', 'utf8'),
  readFile('src/components/AppNetworkHub.tsx', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/components/PublicNetworkExplorer.tsx', 'utf8'),
  readFile('src/components/AppSettings.tsx', 'utf8'),
  readFile('src/lib/leaderboardDomainCache.ts', 'utf8'),
  readFile('src/app/api/network/public/route.ts', 'utf8'),
  readFile('supabase/migrations/20260923023000_make_network_default_public_readonly.sql', 'utf8'),
]);

test('leaderboard can hand a wallet into the Network tab without prop-drilling the leaderboard tree', () => {
  assert.match(leaderboard, /veinvite-open-public-network/);
  assert.match(leaderboard, /networkViewButton/);
  assert.match(home, /PUBLIC_NETWORK_TARGET_STORAGE_KEY/);
  assert.match(home, /veinvite-open-public-network/);
  assert.match(home, /setActiveTab\('guide'\)/);
  assert.match(hub, /PUBLIC_NETWORK_TARGET_STORAGE_KEY/);
  assert.match(hub, /publicRootWallet/);
});

test('other-user Network uses a separate read-only explorer instead of AppNetwork edit controls', () => {
  assert.match(hub, /publicRootWallet \? \(/);
  assert.match(hub, /<PublicNetworkExplorer/);
  assert.match(hub, /<AppNetwork locale=\{locale\} \/>/);
  assert.doesNotMatch(publicExplorer, /moveWorkspaceMemberToGroup/);
  assert.doesNotMatch(publicExplorer, /beginLayoutEdit/);
  assert.doesNotMatch(publicExplorer, /groupBuilder/);
  assert.doesNotMatch(publicExplorer, /localStorage\.setItem/);
  assert.match(publicExplorer, /onPointerMove/);
  assert.match(publicExplorer, /zoomIn/);
  assert.match(publicExplorer, /zoomOut/);
});

test('Network search resolves .vet domains and opens default-public read-only roots', () => {
  assert.match(network, /domainSearchInput/);
  assert.match(network, /useVechainDomain\(domainSearchInput\)/);
  assert.match(network, /resolvedSearchAddress/);
  assert.match(network, /\/api\/network\/public\?wallet=/);
  assert.match(network, /publicSearchWallet/);
  assert.match(network, /veinvite-open-public-network/);
  assert.match(publicExplorer, /domainSearchInput/);
  assert.match(publicExplorer, /resolvedSearchWallet/);
  assert.match(publicExplorer, /fetchPublicNetwork\(\s*root,\s*resolvedSearchWallet/);
});

test('public Network display remains mobile-width and does not gain editing persistence', () => {
  assert.match(publicExplorer, /\.publicCanvasPage\{width:min\(100%,520px\)/);
  assert.match(publicExplorer, /\.publicStage\{position:relative;flex:1 1 auto;min-height:0;height:auto/);
  assert.match(publicExplorer, /PublicNodeLabel/);
  assert.match(publicExplorer, /formatCompactVechainDomain/);
});

test('old Network privacy opt-in cannot return through Settings, API, or database code', async () => {
  assert.doesNotMatch(settings, /NETWORK_EXPLORE_COPY/);
  assert.doesNotMatch(settings, /network\/public\/visibility/);
  assert.doesNotMatch(settings, /publicEnabled/);
  assert.doesNotMatch(settings, /discoverable/);
  assert.doesNotMatch(publicExplorer, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC/);
  assert.doesNotMatch(publicApi, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC|hasPrivateBranches/);
  assert.doesNotMatch(migration, /join public\.network_public_profiles/i);
  await assert.rejects(
    access('src/app/api/network/public/visibility/route.ts'),
  );
});

test('default-public reader remains graph-only and does not expose mission, reward, or security state', () => {
  assert.match(migration, /qualified_referral_network_edges/);
  assert.match(migration, /operator_referral_leaderboard/);
  assert.doesNotMatch(migration, /reward_status|sybil_status|identity_link|mission_/i);
  assert.match(publicApi, /Mission, reward,/);
});

test('partial domain autocomplete reuses only domains already cached in the current session', () => {
  assert.match(domainCache, /readCachedLeaderboardDomainSuggestions/);
  assert.match(domainCache, /sessionStorage\.getItem\(DOMAIN_CACHE_KEY\)/);
  assert.match(domainCache, /startsWith\(normalizedQuery\)/);
  assert.match(domainCache, /DOMAIN_SUGGESTION_MIN_CHARS\s*=\s*3/);
  assert.match(network, /cachedDomainSuggestions/);
  assert.match(network, /openCachedDomainSuggestion/);
  assert.match(network, /fetchNetwork\(wallet/);
  assert.match(network, /formatVechainDomainLabel\(suggestion\.domain\)/);
  assert.match(publicExplorer, /cachedDomainSuggestions/);
  assert.match(publicExplorer, /focusCachedDomainSuggestion/);
  assert.match(publicExplorer, /fetchPublicNetwork\(\s*root,\s*suggestion\.wallet/);
  assert.doesNotMatch(domainCache, /fetch\(/);
});
