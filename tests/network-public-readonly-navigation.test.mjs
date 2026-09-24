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
  migration,
  emptyRootMigration,
  hubCopy,
  nativeReview,
  naturalnessPolish,
  networkIdentity,
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
  readFile('supabase/migrations/20260923034500_allow_empty_default_public_network_roots.sql', 'utf8'),
  readFile('src/lib/i18n/networkHubCopy.ts', 'utf8'),
  readFile('src/lib/i18n/networkNativeReview.ts', 'utf8'),
  readFile('src/lib/i18n/networkNaturalnessPolish.ts', 'utf8'),
  readFile('src/components/NetworkWalletIdentity.tsx', 'utf8'),
]);

test('leaderboard can hand a wallet into the Network tab without prop-drilling the leaderboard tree', () => {
  assert.match(leaderboard, /veinvite-open-public-network/);
  assert.match(leaderboard, /networkViewButton/);
  assert.match(leaderboard, /이 초대자의 네트워크 보기/);
  assert.doesNotMatch(leaderboard, /VeInvite · \{networkCopy\.exploreNetwork\}/);
  assert.match(home, /PUBLIC_NETWORK_TARGET_STORAGE_KEY/);
  assert.match(home, /veinvite-open-public-network/);
  assert.match(home, /setActiveTab\('guide'\)/);
  assert.match(hub, /PUBLIC_NETWORK_TARGET_STORAGE_KEY/);
  assert.match(hub, /publicRootWallet/);
});

test('other-user Network stays read-only while matching My Network chrome', () => {
  assert.match(hub, /publicRootWallet \? \(/);
  assert.match(hub, /<PublicNetworkExplorer/);
  assert.match(hub, /<AppNetwork locale=\{locale\} \/>/);
  assert.match(hub, /setPublicRootWallet\(null\);[\s\S]*\}, \[wallet\]\);/);
  assert.doesNotMatch(publicExplorer, /moveWorkspaceMemberToGroup|beginLayoutEdit|groupBuilder|localStorage\.setItem/);
  assert.match(publicExplorer, /className="networkUtilityRow"/);
  assert.match(publicExplorer, /className="otherNetworkBadge"/);
  assert.match(publicExplorer, /className="publicControls topControls"/);
  assert.match(publicExplorer, /onClick=\{returnToViewedRoot\}>◎<\/button>/);
  assert.match(publicExplorer, /const returnToViewedRoot = useCallback/);
  assert.match(publicExplorer, /void activate\(root, 0, 'back'\)/);
  assert.doesNotMatch(publicExplorer, /onClick=\{onBackToMine \?\? onBack\}>◎<\/button>/);
  assert.match(publicExplorer, /searchOpen \? \(/);
  assert.doesNotMatch(publicExplorer, /className="publicSummary"|className="backMine"|className="publicCluster"/);
  assert.doesNotMatch(publicExplorer, /thisRound|publicSummary|backMine|publicCluster/);
  assert.match(publicExplorer, /publicRootBreath/);
  assert.match(publicExplorer, /onPointerMove/);
  assert.match(publicExplorer, /const branchCount = visual\.root[\s\S]*focusData\?\.summary\.network[\s\S]*data\?\.summary\.network \?\? member\?\.network \?\? 0/);
  assert.doesNotMatch(publicExplorer, /1 \+ \(data\?\.summary\.network \?\? member\?\.network \?\? 0\)/);
  assert.match(publicExplorer, /<NetworkCountGlyph \/>/);
  assert.match(publicExplorer, /className="profileAddress"/);
  assert.match(publicExplorer, /getVeChainExplorerAddressUrl\(selected\)/);
  assert.match(publicExplorer, /profileDirection === 'rtl' \? '›' : '‹'/);
  assert.match(publicExplorer, /className=\{\`breadcrumbs\$\{activePath\.length === 1 \? ' rootOnly' : ''\}\`\}/);
  assert.match(publicExplorer, /const breadcrumbStart = Math\.max\(0, activePath\.length - 4\)/);
  assert.doesNotMatch(publicExplorer, /className="publicPath"|\.publicPath\{/);
  assert.match(publicExplorer, /function publicEdgePath\(x1: number, y1: number, x2: number, y2: number\)/);
  assert.match(publicExplorer, /Math\.min\(58, Math\.abs\(dx\) \* 0\.16\)/);
  assert.match(network, /function edgePath\(x1: number, y1: number, x2: number, y2: number\)/);
  assert.match(network, /Math\.min\(58, Math\.abs\(dx\) \* 0\.16\)/);
  assert.match(publicExplorer, /d=\{publicEdgePath\(edge\.x1, edge\.y1, edge\.x2, edge\.y2\)\}/);
  assert.match(publicExplorer, /const factor = direction > 0 \? 1\.16 : 0\.86/);
  assert.match(publicExplorer, /zoomAt\([\s\S]*stageSize\.width \/ 2[\s\S]*stageSize\.height \/ 2/);
  assert.match(publicExplorer, /if \(searchOpen\) closeSearch\(\)/);
  assert.match(publicExplorer, /if \(suppressClickRef\.current\) return/);
  assert.match(publicExplorer, /setSelected\(null\); if \(searchOpen\) closeSearch\(\)/);
  assert.match(publicExplorer, /event\.deltaY < 0 \? 1\.09 : 0\.91/);
  assert.match(network, /event\.deltaY < 0 \? 1\.09 : 0\.91/);
  assert.match(publicExplorer, /WHEEL_ENTER_DISTANCE = 120/);
  assert.match(network, /WHEEL_ENTER_DISTANCE = 120/);
  assert.match(publicExplorer, /NODE_ENTER_SCALE = 1\.85/);
  assert.match(network, /NODE_ENTER_SCALE = 1\.85/);
  assert.match(publicExplorer, /pinchEnterIntentRef/);
  assert.match(publicExplorer, /pinchReturnIntentRef/);
  assert.match(publicExplorer, /gesturestart/);
  assert.match(publicExplorer, /gesturechange/);
  assert.match(publicExplorer, /gestureend/);
  assert.match(publicExplorer, /viewByFocusRef/);
  assert.match(publicExplorer, /returnViewByChildRef/);
  assert.doesNotMatch(publicExplorer, /sessionStorage|PUBLIC_SESSION_PREFIX|readSavedState|clearSavedState/);
});

test('other-user Network first paint keeps the viewed root centered after real mobile sizing', () => {
  assert.match(publicExplorer, /useState\(\{ width: 0, height: 0 \}\)/);
  assert.match(publicExplorer, /const \[stageStable, setStageStable\] = useState\(false\)/);
  assert.match(publicExplorer, /getBoundingClientRect\(\)/);
  assert.match(publicExplorer, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => setStageStable\(true\)\)/);
  assert.match(publicExplorer, /function publicRootCenteredFittedView/);
  assert.match(publicExplorer, /return publicCenteredView\(stage, scale\);/);
  assert.match(publicExplorer, /const introCancelledRef = useRef\(false\)/);
  assert.match(
    publicExplorer,
    /if \(!stageStable \|\| introCancelledRef\.current\) return;/,
  );
  assert.match(
    publicExplorer,
    /const introKey = `\$\{root\}:\$\{stageSize\.width\}x\$\{stageSize\.height\}`;/,
  );
  assert.match(
    publicExplorer,
    /if \(introRootRef\.current === introKey\) return;[\s\S]*setView\(publicCenteredView\(stageSize, 1\)\);/,
  );
  assert.match(
    publicExplorer,
    /const stopIntroForInteraction = useCallback\(\(\) => \{[\s\S]*introCancelledRef\.current = true/,
  );
  assert.match(
    publicExplorer,
    /if \(reducedMotion\) \{[\s\S]*fitViewedRootInPlace\(false\)/,
  );
  assert.match(
    publicExplorer,
    /introFitTimerRef\.current = window\.setTimeout\([\s\S]*if \(introCancelledRef\.current\) return;[\s\S]*fitViewedRootInPlace\(true\)/,
  );
  assert.match(
    publicExplorer,
    /const fitPublicNetwork = useCallback[\s\S]*setView\(publicFittedView\(stageSize, points\)\)/,
  );
  assert.match(
    publicExplorer,
    /onClick=\{\(\) => \{ stopIntroForInteraction\(\); fitPublicNetwork\(true\); \}\}>⛶<\/button>/,
  );
  assert.match(
    publicExplorer,
    /const centerViewedNetwork = useCallback[\s\S]*stageSize\.width \/ 2 - CENTER_X \* current\.scale/,
  );
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

test('public Network display keeps one mobile-width shell, overlay search, and shared identities', () => {
  assert.match(publicExplorer, /\.publicCanvasPage\{width:min\(100%,520px\)[^}]*position:relative/);
  assert.match(publicExplorer, /\.publicStage\{position:relative;flex:1 1 auto;min-height:0;height:auto/);
  assert.match(publicExplorer, /NetworkWalletLabel/);
  assert.match(publicExplorer, /NetworkWalletIdentity/);
  assert.match(networkIdentity, /getPicassoImage\(address\)/);
  assert.match(networkIdentity, /useGetAvatar\(domain\)/);
  assert.match(publicExplorer, /ref=\{searchInputRef\}/);
  assert.match(publicExplorer, /searchInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(publicExplorer, /\.publicSearchBar\{[^}]*position:absolute[^}]*top:44px/);
  assert.match(publicExplorer, /publicLoadingCanvas networkCard/);
  assert.match(publicExplorer, /loadingNetworkBadge/);
  assert.match(publicExplorer, /inlineNetworkLoading/);
  assert.doesNotMatch(publicExplorer, /<span aria-hidden="true">↗<\/span>[\s\S]*NetworkWalletLabel address=\{root\}/);
  assert.match(publicExplorer, /aria-label="VeChain Explorer">↗<\/a>/);
  assert.doesNotMatch(publicExplorer, /e\.viewing|publicLoadingHeader/);
  assert.doesNotMatch(publicExplorer, /sessionStorage|PUBLIC_SESSION_PREFIX|readSavedState|clearSavedState/);
});

test('old Network privacy opt-in cannot return through current Settings, API, or copy layers', async () => {
  assert.doesNotMatch(settings, /NETWORK_EXPLORE_COPY/);
  assert.doesNotMatch(settings, /network\/public\/visibility/);
  assert.doesNotMatch(settings, /publicEnabled/);
  assert.doesNotMatch(settings, /discoverable/);
  assert.doesNotMatch(publicExplorer, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC|NETWORK_NOT_FOUND/);
  assert.doesNotMatch(publicApi, /NETWORK_PRIVATE|FOCUS_NOT_PUBLIC|NETWORK_NOT_FOUND|hasPrivateBranches/);
  assert.doesNotMatch(migration, /join public\.network_public_profiles/i);

  for (const source of [hubCopy, nativeReview, naturalnessPolish]) {
    assert.doesNotMatch(
      source,
      /publicConfirm|visibilityLoading|visibilityUnknown|publicEnabled|discoverableNote|networkPrivate|privateBranchesHidden/,
    );
  }

  await assert.rejects(
    access('src/app/api/network/public/visibility/route.ts'),
  );
});

test('default-public reader stays graph-only while exposing only exact empty capacity-slot IDs', () => {
  assert.match(migration, /qualified_referral_network_edges/);
  assert.match(emptyRootMigration, /qualified_referral_network_edges/);
  assert.doesNotMatch(
    emptyRootMigration,
    /root_known|NETWORK_NOT_FOUND|invitations|reward_status|sybil_status|identity_link|mission_/i,
  );
  assert.ok(
    emptyRootMigration.includes("p.root_wallet ~ '^0x[0-9a-f]{40}$'"),
    'empty public Network roots must still require a valid VeChain address',
  );
  assert.match(publicApi, /readPublicAvailableSlotIds/);
  assert.match(publicApi, /availableSlotIds/);
  assert.match(publicApi, /slotAvailabilityKnown/);
  assert.match(publicApi, /readPublicAvailableSlotIds\(focusWallet\)/);
  assert.match(publicApi, /\(\[1, 2\] as const\)\.filter/);
  assert.match(publicApi, /invitee identity\/progress/);
  assert.doesNotMatch(publicApi, /invitee_wallet|apps_completed|vot3_converted|vote_completed/);
  assert.match(publicExplorer, /publicInviteSlotPoint\(slot\)/);
  assert.match(publicExplorer, /data-slot-id=\{slot\.slot\}/);
  assert.match(publicExplorer, /className="publicSlotEdgeBase"/);
  assert.match(publicExplorer, /className="publicSlotEdgePulse"/);
  assert.match(publicExplorer, /@keyframes publicSlotFlow/);
  assert.match(publicExplorer, /prefers-reduced-motion:reduce[\s\S]*publicSlotEdgePulse/);
  assert.match(publicExplorer, /pointer-events:none/);
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


test('public slot metadata follows the currently centered wallet and never turns unknown into a false zero', () => {
  assert.match(publicApi, /const availableSlotIdsPromise = readPublicAvailableSlotIds\(focusWallet\)/);
  assert.doesNotMatch(publicApi, /focusWallet === rootWallet[\s\S]*readPublicAvailableSlotIds/);
  assert.match(publicApi, /payload\.slotAvailabilityKnown = availableSlotIds !== null/);
  assert.match(publicExplorer, /data\.slotAvailabilityKnown === false[\s\S]*previous\?\.slotAvailabilityKnown === true/);
  assert.match(publicExplorer, /slotRetryAttemptedRef/);
  assert.match(publicExplorer, /slotRetryControllerRef/);
  assert.match(publicExplorer, /fetchPublicNetwork\(root, focusKey, controller\.signal\)/);
  assert.match(publicExplorer, /focusData\.slotAvailabilityKnown !== true/);
});

test('public available slots keep exact owner-side positions and stay read-only', () => {
  assert.match(publicExplorer, /function publicInviteSlotPoint\(slot: 1 \| 2\)/);
  assert.match(publicExplorer, /slot === 1[\s\S]*CENTER_X - 58[\s\S]*CENTER_X \+ 64/);
  assert.match(publicExplorer, /publicEdgePath\(CENTER_X, ROOT_Y, slot\.x, slot\.y\)/);
  assert.match(publicExplorer, /public-slot-edge:\$\{slot\.slot\}/);
  assert.match(publicExplorer, /className="publicSlotNode"/);
  assert.match(publicExplorer, /\.publicSlotNode\{[^}]*pointer-events:none/);
});

test('viewed root center de-duplicates the top-left network total', () => {
  assert.match(publicExplorer, /const isViewedRoot = visual\.root && keyWallet\(focusWallet\) === root/);
  assert.match(publicExplorer, /\{!isViewedRoot \? <small className="nodeNetworkMetric">/);
  assert.match(publicExplorer, /rootIdentityOnly/);
});

test('prominent center identities preserve verified display state while revalidating VeWorld data', () => {
  assert.match(networkIdentity, /root \|\|/);
  assert.match(networkIdentity, /displayDomain === undefined/);
  assert.match(networkIdentity, /displayDomain === null && Boolean\(displayUrl\)/);
  assert.match(networkIdentity, /setDisplayDomain\(readCachedLeaderboardDomain\(address\)\)/);
  assert.match(networkIdentity, /readCachedProfileAvatar\(address\)/);
});
