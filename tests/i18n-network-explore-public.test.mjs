import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  legacyMigration,
  auditMigration,
  defaultPublicMigration,
  emptyRootMigration,
  runtime,
  privateRoute,
  summaryRoute,
  publicRoute,
  discoverRoute,
  hub,
  explorer,
  exploreCopy,
  hubCopy,
] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260909051843_network_explore_public_v1.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260909053519_audit_network_public_visibility_and_runtime.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260923023000_make_network_default_public_readonly.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260923034500_allow_empty_default_public_network_roots.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/networkRuntimeServer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/summary/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/network/public/discover/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppNetworkHub.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PublicNetworkExplorer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkExploreCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/networkHubCopy.ts', import.meta.url), 'utf8'),
]);

test('historical opt-in rollout remains historical while the current reader is default-public', () => {
  assert.match(legacyMigration, /create table if not exists public\.network_public_profiles/i);
  assert.match(auditMigration, /network_public_profile_events/i);
  assert.doesNotMatch(defaultPublicMigration, /join public\.network_public_profiles/i);
  assert.doesNotMatch(defaultPublicMigration, /public_enabled|discoverable/i);
  assert.match(defaultPublicMigration, /qualified_referral_network_edges/i);
  assert.match(defaultPublicMigration, /FOCUS_NOT_FOUND/i);

  assert.doesNotMatch(emptyRootMigration, /root_known|NETWORK_NOT_FOUND/i);
  assert.match(emptyRootMigration, /qualified_referral_network_edges/i);
  assert.ok(
    emptyRootMigration.includes("p.root_wallet ~ '^0x[0-9a-f]{40}$'"),
    'current public reader must allow a valid empty root without invitation metadata',
  );
});

test('current public reader keeps graph data service-role-only and exposes only empty slot identifiers', () => {
  assert.match(defaultPublicMigration, /revoke all on function public\.read_public_referral_network_focus_v1\([\s\S]*from public, anon, authenticated/i);
  assert.match(defaultPublicMigration, /grant execute on function public\.read_public_referral_network_focus_v1\([\s\S]*to service_role/i);
  assert.match(defaultPublicMigration, /revoke all on function public\.read_public_network_discovery_v1\(integer\)[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(emptyRootMigration, /reward_status|sybil_status|apps_completed|vot3_converted|vote_completed|identity_link|mission_|invitations/i);
  assert.match(publicRoute, /readPublicAvailableSlotIds\(focusWallet\)/i);
  assert.match(publicRoute, /availableSlotIds/i);
  assert.match(publicRoute, /slotAvailabilityKnown/i);
  assert.match(publicRoute, /invite_slot, slot_released_at, sybil_status/i);
  assert.doesNotMatch(publicRoute, /invitee_wallet|apps_completed|vot3_converted|vote_completed/i);
  assert.match(publicRoute, /Mission,[\s\S]*reward,[\s\S]*anti-Sybil,[\s\S]*security/i);
  assert.doesNotMatch(publicRoute, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC|NETWORK_NOT_FOUND|hasPrivateBranches/i);
});

test('My Network and read-only public Network keep independent runtime rollout gates', () => {
  assert.match(runtime, /NetworkRuntimeSurface = 'my' \| 'public'/i);
  assert.match(runtime, /readNetworkRuntimeMode/i);
  assert.match(runtime, /isNetworkCanaryWallet/i);

  const privateSwitch = privateRoute.indexOf("canUseNetworkSurface('my', rootWallet)");
  const privateRpc = privateRoute.indexOf("'read_referral_network_focus_v2'");
  assert.ok(privateSwitch >= 0);
  assert.ok(privateRpc > privateSwitch);

  assert.match(publicRoute, /readNetworkRuntimeMode\('public'\)/i);
  const viewerGate = publicRoute.indexOf('canCurrentViewerUsePublicNetwork(request)');
  const publicRpc = publicRoute.indexOf("'read_public_referral_network_focus_v1'");
  assert.ok(viewerGate >= 0);
  assert.ok(publicRpc > viewerGate);
});

test('Public discovery remains bounded and only returns root locators', () => {
  assert.match(discoverRoute, /readNetworkRuntimeMode\('public'\)/i);
  assert.match(discoverRoute, /PUBLIC_NETWORK_DISABLED/i);
  assert.match(discoverRoute, /network_public_discover_ip/i);
  assert.match(discoverRoute, /Do not expose unrelated metadata/i);
  assert.match(discoverRoute, /return typeof wallet === 'string' \? \[\{ wallet \}\] : \[\]/i);
  assert.doesNotMatch(discoverRoute, /return noStoreJson\(\{ networks: data \}/i);
});

test('Guest public Network reads stay throttled, bounded, and no-store', () => {
  assert.match(publicRoute, /getClientIpSubject/i);
  assert.match(publicRoute, /network_public_ip/i);
  assert.match(publicRoute, /network_public_target/i);
  assert.match(publicRoute, /PUBLIC_NETWORK_RPC_TIMEOUT_MS\s*=\s*5_000/i);
  assert.match(publicRoute, /AbortController\(\)/i);
  assert.match(publicRoute, /\.abortSignal\(controller\.signal\)/i);
  assert.match(publicRoute, /Cache-Control': 'no-store'/i);
});

test('obsolete per-wallet visibility API and settings flow stay deleted', async () => {
  await assert.rejects(
    access(new URL('../src/app/api/network/public/visibility/route.ts', import.meta.url)),
  );
  assert.doesNotMatch(hub, /fetchVisibility|saveVisibility|publicConfirm|visibilityUnknown|publicSettings/i);
  assert.doesNotMatch(explorer, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC|NETWORK_NOT_FOUND|hasPrivateBranches/i);
  assert.doesNotMatch(exploreCopy, /publicEnabled|discoverableNote|networkPrivate|privateBranchesHidden|visibilityError/i);
  assert.doesNotMatch(hubCopy, /publicConfirm|visibilityLoading|visibilityUnknown/i);
});

test('Network summary stays lightweight and zero-member wallets continue into the real canvas', () => {
  assert.match(summaryRoute, /qualified_referral_network_edges/i);
  assert.match(summaryRoute, /\.limit\(1\)/i);
  assert.doesNotMatch(summaryRoute, /read_referral_network_focus_v2/i);
  assert.match(hub, /function NetworkGlyph/i);
  assert.doesNotMatch(hub, /probe\.summary\.network === 0/i);
  const maintenanceIndex = hub.indexOf("probeState === 'maintenance'");
  const canvasIndex = hub.indexOf('<AppNetwork locale={locale} />');
  assert.ok(maintenanceIndex >= 0 && canvasIndex > maintenanceIndex);
});

test('My Network and other-user read-only explorer stay isolated', () => {
  assert.match(hub, /<AppNetwork locale=\{locale\} \/>/i);
  assert.match(hub, /<PublicNetworkExplorer/i);
  assert.match(hub, /publicRootWallet/i);
  assert.doesNotMatch(explorer, /PUBLIC_SESSION_PREFIX|sessionStorage|readSavedState|clearSavedState/i);
  assert.match(explorer, /requestSerialRef/i);
  assert.match(explorer, /branchRequestRef/i);
  assert.match(explorer, /onPointerMove/i);
  assert.match(explorer, /pinchRef/i);
  assert.doesNotMatch(explorer, /moveWorkspaceMemberToGroup|beginLayoutEdit|groupBuilder/i);
  assert.doesNotMatch(explorer, /IN_PROGRESS|QUALIFIED|REWARDED|sybil/i);
  assert.match(explorer, /className="networkUtilityRow"/i);
  assert.match(explorer, /className="otherNetworkBadge"/i);
  assert.doesNotMatch(explorer, /className="publicSummary"|className="backMine"|className="publicCluster"/i);
});

test('Korean Network Explore wording stays concise', () => {
  assert.match(exploreCopy, /exploreNetwork:'다른 네트워크 보기'/);
  assert.match(exploreCopy, /exploreTitle:'다른 네트워크 보기'/);
  assert.doesNotMatch(exploreCopy, /다른 네트워크 둘러보기|공개 네트워크 둘러보기/);
});

test('Network Explore and maintenance copy cover every supported locale', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha','el','cs',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(exploreCopy, pattern, `missing Network Explore copy for ${locale}`);
    assert.match(hubCopy, pattern, `missing Network Hub copy for ${locale}`);
  }
});
