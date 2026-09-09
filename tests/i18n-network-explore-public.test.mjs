import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  migration,
  auditMigration,
  runtime,
  privateRoute,
  summaryRoute,
  publicRoute,
  discoverRoute,
  visibilityRoute,
  hub,
  explorer,
  exploreCopy,
  hubCopy,
] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260909051843_network_explore_public_v1.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909053519_audit_network_public_visibility_and_runtime.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/networkRuntimeServer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/summary/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/discover/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/visibility/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetworkHub.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PublicNetworkExplorer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkExploreCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkHubCopy.ts', import.meta.url), 'utf8'),
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
  assert.match(auditMigration, /alter column enabled set default false/i);
});

test('Production visibility/runtime audit migration is tracked and append-only to service-role callers', () => {
  assert.match(auditMigration, /create table if not exists public\.network_public_profile_events/i);
  assert.match(auditMigration, /create table if not exists public\.network_runtime_config_events/i);
  assert.match(auditMigration, /generated always as identity primary key/i);
  assert.match(auditMigration, /audit_network_public_profile_change_trigger/i);
  assert.match(auditMigration, /audit_network_runtime_config_change_trigger/i);
  assert.match(auditMigration, /revoke all on table public\.network_public_profile_events from public, anon, authenticated, service_role/i);
  assert.match(auditMigration, /grant select on table public\.network_public_profile_events to service_role/i);
  assert.match(auditMigration, /revoke all on table public\.network_runtime_config_events from public, anon, authenticated, service_role/i);
  assert.match(auditMigration, /grant select on table public\.network_runtime_config_events to service_role/i);
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
  assert.doesNotMatch(migration, /i\.status/i);
  assert.doesNotMatch(migration, /sybil_status/i);
  assert.doesNotMatch(migration, /reward_status/i);
  assert.doesNotMatch(migration, /apps_completed/i);
  assert.doesNotMatch(migration, /vot3_converted/i);
  assert.doesNotMatch(migration, /vote_completed/i);
  assert.match(publicRoute, /Private-branch existence is intentionally not part of the browser payload/i);
  assert.match(publicRoute, /safeChildren/i);
});

test('My Network and Public Network use independent staged runtime gates with viewer-based Public canary', () => {
  assert.match(runtime, /NetworkRuntimeSurface = 'my' \| 'public'/i);
  assert.match(runtime, /readNetworkRuntimeMode/i);
  assert.match(runtime, /isNetworkCanaryWallet/i);

  const privateSwitch = privateRoute.indexOf("canUseNetworkSurface('my', rootWallet)");
  const privateRound = privateRoute.indexOf('const round = await readCurrentRoundContext();');
  const privateRpc = privateRoute.indexOf("'read_referral_network_focus_v2'");
  assert.ok(privateSwitch >= 0);
  assert.ok(privateRound > privateSwitch);
  assert.ok(privateRpc > privateRound);

  assert.match(publicRoute, /readNetworkRuntimeMode\('public'\)/i);
  assert.match(publicRoute, /requireWalletSession\(\{ request \}\)/i);
  assert.match(publicRoute, /isNetworkCanaryWallet\(session\.walletAddress\)/i);
  const viewerGate = publicRoute.indexOf('canCurrentViewerUsePublicNetwork(request)');
  const publicRound = publicRoute.indexOf('const round = await readCurrentRoundContext();');
  const publicRpc = publicRoute.indexOf("'read_public_referral_network_focus_v1'");
  assert.ok(viewerGate >= 0);
  assert.ok(publicRound > viewerGate);
  assert.ok(publicRpc > publicRound);
});

test('Public discovery distinguishes rollout maintenance from a valid empty list', () => {
  assert.match(discoverRoute, /readNetworkRuntimeMode\('public'\)/i);
  assert.match(discoverRoute, /requireWalletSession\(\{ request \}\)/i);
  assert.match(discoverRoute, /PUBLIC_NETWORK_DISABLED/i);
  const gate = discoverRoute.indexOf('canCurrentViewerDiscoverPublicNetwork(request)');
  const rpc = discoverRoute.indexOf("'read_public_network_discovery_v1'");
  assert.ok(gate >= 0);
  assert.ok(rpc > gate);
});

test('Guest Public Network reads have target and privacy-safe client throttles plus bounded recursive work', () => {
  assert.match(publicRoute, /getClientIpSubject/i);
  assert.match(publicRoute, /network_public_ip/i);
  assert.match(publicRoute, /network_public_target/i);
  assert.match(publicRoute, /PUBLIC_NETWORK_RPC_TIMEOUT_MS\s*=\s*5_000/i);
  assert.match(publicRoute, /AbortController\(\)/i);
  assert.match(publicRoute, /\.abortSignal\(controller\.signal\)/i);
  assert.match(publicRoute, /Cache-Control': 'no-store'/i);
  assert.match(discoverRoute, /network_public_discover_ip/i);
});

test('Public visibility changes require auth/origin, are throttled, and avoid redundant audit writes', () => {
  assert.match(visibilityRoute, /requireWalletSession/i);
  assert.match(visibilityRoute, /sameOrigin\(request\)/i);
  assert.match(visibilityRoute, /network_public_visibility_wallet/i);
  assert.match(visibilityRoute, /limit:\s*12/i);
  assert.match(visibilityRoute, /const discoverable = publicEnabled \? requestedDiscoverable : false/i);
  assert.match(visibilityRoute, /current\?\.public_enabled === publicEnabled/i);
  assert.match(visibilityRoute, /current\?\.discoverable === discoverable/i);
});

test('Network Empty State uses a lightweight direct-edge probe, shared Network glyph, and only invite/explore actions', () => {
  assert.match(summaryRoute, /qualified_referral_network_edges/i);
  assert.match(summaryRoute, /\.limit\(1\)/i);
  assert.doesNotMatch(summaryRoute, /read_referral_network_focus_v2/i);
  assert.match(hub, /function NetworkGlyph/i);
  assert.match(hub, /probe\.summary\.network === 0/i);
  assert.match(hub, /goHomeWithoutReload/i);
  assert.match(hub, /data-veinvite-tab="home"/i);
  assert.match(hub, /e\.exploreNetwork/i);
  const emptyBranch = hub.match(/if \(probe\.summary\.network === 0\)[\s\S]*?\n  }\n\n  return \(/i)?.[0] ?? '';
  assert.doesNotMatch(emptyBranch, /publicSettings/i);
  assert.doesNotMatch(hub, /useGetAvatar/i);
  assert.doesNotMatch(hub, /useVechainDomain/i);
});

test('Network runtime OFF is a dedicated maintenance state rather than a retry failure', () => {
  assert.match(hub, /probeState === 'maintenance'/i);
  assert.match(hub, /h\.maintenanceTitle/i);
  assert.match(hub, /h\.maintenanceDescription/i);
  const maintenanceBranch = hub.match(/if \(probeState === 'maintenance'\)[\s\S]*?\n  }\n\n  if \(probeState === 'error'/i)?.[0] ?? '';
  assert.doesNotMatch(maintenanceBranch, /t\.retry/i);
});

test('Public visibility UI never guesses OFF when state is unknown and confirms first enable', () => {
  assert.match(hub, /VisibilityLoadState = 'idle' \| 'loading' \| 'ready' \| 'error'/i);
  assert.match(hub, /visibilityUnknown/i);
  assert.match(hub, /window\.confirm\(h\.publicConfirm\)/i);
  assert.match(hub, /A response can be lost after a successful DB write/i);
  assert.match(hub, /const confirmed = await fetchVisibility\(\)/i);
});

test('Explore reuses mature My Network while Public canvas keeps separate state and true last-click-wins', () => {
  assert.match(hub, /<AppNetwork locale=\{locale\} \/>/i);
  assert.match(hub, /<PublicNetworkExplorer/i);
  assert.match(explorer, /PUBLIC_SESSION_PREFIX\s*=\s*'veinvite-network-public-v2:'/i);
  assert.match(explorer, /requestSerialRef/i);
  assert.match(explorer, /branchRequestRef/i);
  assert.match(explorer, /cancelNavigation/i);
  assert.match(explorer, /serial !== requestSerialRef\.current/i);
  assert.match(explorer, /onPointerMove/i);
  assert.match(explorer, /pinchRef/i);
  assert.doesNotMatch(explorer, /hasPrivateBranches/i);
  assert.doesNotMatch(explorer, /IN_PROGRESS/i);
  assert.doesNotMatch(explorer, /QUALIFIED/i);
  assert.doesNotMatch(explorer, /REWARDED/i);
  assert.doesNotMatch(explorer, /sybil/i);
});

test('Network Explore and rollout copy cover every supported locale', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(exploreCopy, pattern, `missing Network Explore copy for ${locale}`);
    assert.match(hubCopy, pattern, `missing Network Hub copy for ${locale}`);
  }
});
