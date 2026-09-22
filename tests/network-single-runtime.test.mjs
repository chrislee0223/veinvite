import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  guideSource,
  networkSource,
  homeSource,
  bottomNavigationSource,
  networkHubSource,
  workspaceSource,
  workspaceCopySource,
  localesSource,
  networkRouteSource,
  networkSummaryRouteSource,
  networkSlotsRouteSource,
  canaryFixtureSource,
] = await Promise.all([
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/components/HomeClient.tsx', 'utf8'),
  readFile('src/components/AppBottomNavigation.tsx', 'utf8'),
  readFile('src/components/AppNetworkHub.tsx', 'utf8'),
  readFile('src/lib/networkWorkspace.ts', 'utf8'),
  readFile('src/lib/i18n/networkWorkspaceCopy.ts', 'utf8'),
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/app/api/network/route.ts', 'utf8'),
  readFile('src/app/api/network/summary/route.ts', 'utf8'),
  readFile('src/app/api/network/slots/route.ts', 'utf8'),
  readFile('src/lib/networkCanaryFixture.ts', 'utf8'),
]);

const networkWarmupSource = await readFile('src/components/NetworkIdleWarmup.tsx', 'utf8');
const networkSlotCacheSource = await readFile('src/lib/networkInviteSlotsClientCache.ts', 'utf8');
const leaderboardDomainCacheSource = await readFile('src/lib/leaderboardDomainCache.ts', 'utf8');
const leaderboardSource = await readFile('src/components/InviterLeaderboard.tsx', 'utf8');
const networkMigrationSource = await readFile(
  'supabase/migrations/20260909040000_harden_network_runtime_and_round_context.sql',
  'utf8',
);

const componentFiles = await readdir('src/components');
const qaFiles = await readdir('src/qa');

const TEST_WALLET_LITERAL = '0xeff325935b63299e9eeda79931bed6ec119aefcb';

test('Network has exactly one production component path and no version wrapper chain', () => {
  assert.match(guideSource, /<AppNetworkHub locale=\{locale\} \/>/);
  assert.doesNotMatch(guideSource, /AppNetworkCanaryV\d+/);
  assert.doesNotMatch(guideSource, /NETWORK_CANARY_WALLET/);
  assert.equal(componentFiles.some((name) => /^AppNetworkCanaryV\d+\.tsx$/.test(name)), false);
  assert.equal(qaFiles.some((name) => /^QaNetworkRadialPlaygroundV\d+\.tsx$/.test(name)), false);
});

test('zero-member wallets still enter the real Network canvas so invite slots remain visible', () => {
  assert.doesNotMatch(networkHubSource, /probe\.summary\.network === 0/);
  assert.doesNotMatch(networkHubSource, /t\.emptyTitle|t\.emptyDescription|t\.inviteFriend/);
  const maintenance = networkHubSource.indexOf("probeState === 'maintenance'");
  const canvas = networkHubSource.indexOf('<AppNetwork locale={locale} />');
  assert.ok(maintenance >= 0 && canvas > maintenance);
});

test('Network runtime has no DOM observer or global viewport ownership', () => {
  assert.doesNotMatch(networkSource, /MutationObserver/);
  assert.doesNotMatch(workspaceSource, /MutationObserver/);
  assert.doesNotMatch(networkSource, /document\.documentElement\.style\.touchAction/);
  assert.doesNotMatch(networkSource, /meta\[name=["']viewport/);
  assert.match(networkSource, /touch-action:none/);
  assert.match(networkSource, /stage\.addEventListener\('gesturestart'/);
});


test('node profile stays compact, prefers cached VET identity, and keeps wallet truth visible', () => {
  assert.match(networkSource, /readCachedLeaderboardDomain/);
  assert.match(networkSource, /rememberLeaderboardDomain/);
  assert.match(networkSource, /shouldLoad && displayDomain === undefined/);
  assert.match(networkSource, /\(\) => readCachedLeaderboardDomain\(address\)/);
  assert.doesNotMatch(networkSource, /!showLabel \|\| displayDomain === undefined/);
  assert.doesNotMatch(networkSource, /showLabel \? readCachedLeaderboardDomain\(address\) : undefined/);
  assert.match(networkSource, /useVechainDomain\(\s*shouldResolveDomain \? address : undefined/);
  assert.match(networkSource, /<NetworkIdentity address=\{selectedAddress\} root size=\{34\} \/>/);
  assert.doesNotMatch(networkSource, /className=\{\`profileStatus/);
  assert.doesNotMatch(networkSource, /selectedStatus = selectedMember/);
  assert.doesNotMatch(networkSource, /compactSelectedPath|className="profilePath"|profilePathChevron/);
  assert.match(networkSource, /const profileDirection = getLocaleDirection\(locale\)/);
  assert.match(networkSource, /dir=\{profileDirection\}/);
  assert.match(networkSource, /className="profileAddress" dir="ltr"/);
  assert.match(networkSource, /getVeChainExplorerAddressUrl\(selectedAddress\)/);
  assert.match(networkSource, /const selectedNetwork = selectedIsFocus[\s\S]*currentData\?\.summary\.network[\s\S]*selectedData\?\.summary\.network \?\? selectedMember\?\.network \?\? 0/);
  assert.match(networkSource, /const selectedDirect = selectedIsFocus[\s\S]*currentData\?\.summary\.direct[\s\S]*selectedData\?\.summary\.direct \?\? selectedMember\?\.direct \?\? 0/);
  assert.match(networkSource, /const selectedQualified = selectedIsFocus[\s\S]*currentData\?\.summary\.qualified[\s\S]*selectedData\?\.summary\.qualified \?\? selectedMember\?\.qualified \?\? 0/);
  assert.match(networkSource, /const selectedRound = selectedIsFocus[\s\S]*currentData\?\.summary\.thisRound[\s\S]*selectedData\?\.summary\.thisRound \?\? selectedMember\?\.thisRound \?\? null/);
  assert.match(networkSource, /selectedRound === null \? '–' : \`\+\$\{selectedRound\.toLocaleString\(\)\}\`/);
  assert.match(networkSource, /\.profileCard\{[^}]*inset-inline:8px[^}]*bottom:8px/);
  assert.match(networkSource, /\.profileIdentity :global\(\.identityLabel\)\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(networkSource, /\.profileStats>div\{[^}]*padding:5px 6px/);
  assert.match(networkSource, /-webkit-line-clamp:2/);
  assert.doesNotMatch(networkSource, /scaleX\(-1\)/);
});

test('node profile remains non-blocking and desktop keeps the mobile-width Network card with a bounded height', () => {
  const profileStart = networkSource.indexOf('{selectedWallet && !editingLayout ? (');
  const profileEnd = networkSource.indexOf('{dragGhost && dragGhostChild', profileStart);
  assert.ok(profileStart >= 0 && profileEnd > profileStart);
  const profileSource = networkSource.slice(profileStart, profileEnd);
  assert.doesNotMatch(profileSource, /fetch\(/);
  assert.doesNotMatch(profileSource, /useVechainDomain\(/);
  assert.match(networkSource, /if \(!interactive && selectedWallet\) \{\s*setSelectedWallet\(null\);\s*\}/);
  assert.match(networkSource, /\.personNode\.selected \.nodeCircle\{[^}]*0 0 34px/);
  assert.match(networkSource, /\.profileCard\.hasParentReturn\{bottom:52px\}/);
  assert.match(homeSource, /@media \(min-width:561px\) \{\s*\.networkTabViewport \{ flex:0 0 auto; height:min\(720px,calc\(100svh - 160px\)\); \}\s*\}/);
  assert.doesNotMatch(networkSource, /@media\(max-width:560px\)/);
  assert.match(homeSource, /\.screen\.networkScreen \{[^}]*padding:14px 14px calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(homeSource, /\.networkScreen \.topActions \{ max-width:58%; align-items:flex-end; flex-direction:column-reverse; gap:7px; \}/);
  assert.match(bottomNavigationSource, /\.bottomNavigation\[data-veinvite-active-tab='guide'\] \{ padding-bottom: env\(safe-area-inset-bottom\); \}/);
  assert.match(bottomNavigationSource, /\.bottomNavigation\[data-veinvite-active-tab='guide'\] > div \{ min-height: 60px; padding: 4px; border-radius: 20px; \}/);
  assert.match(bottomNavigationSource, /\.bottomNavigation\[data-veinvite-active-tab='guide'\] button \{ min-height: 50px; padding: 4px 3px;/);
  assert.match(networkHubSource, /\.networkHubState\{[^}]*padding:27px 18px 25px/);
  assert.doesNotMatch(networkHubSource, /@media\(max-width:560px\)/);
  assert.doesNotMatch(bottomNavigationSource, /@media \(min-width: 561px\)/);
  assert.doesNotMatch(networkSource, /user-scalable|maximum-scale/);
});

test('ResizeObserver records size only and cannot auto-pan the camera', () => {
  const resizeStart = networkSource.indexOf('const observer = new ResizeObserver(update)');
  assert.ok(resizeStart >= 0);
  const effectStart = networkSource.lastIndexOf('  useEffect(() => {', resizeStart);
  const effectEnd = networkSource.indexOf('  // Initial placement', resizeStart);
  assert.ok(effectStart >= 0);
  assert.ok(effectEnd > resizeStart);
  const resizeEffect = networkSource.slice(effectStart, effectEnd);
  assert.match(resizeEffect, /setStageSize/);
  assert.match(resizeEffect, /new ResizeObserver\(update\)/);
  assert.doesNotMatch(resizeEffect, /setView/);
  assert.doesNotMatch(networkSource, /safeBottom/);
  assert.doesNotMatch(networkSource, /safeRight/);
});

test('parent return restores the exact camera captured before child entry', () => {
  assert.match(networkSource, /returnViewByChildRef\.current\.set\(target, view\)/);
  assert.match(networkSource, /const immediateParent = currentData\.breadcrumb\[currentData\.breadcrumb\.length - 2\] \?\? null/);
  assert.match(networkSource, /const exactParentView = immediateParent && keyWallet\(immediateParent\) === target/);
  assert.match(networkSource, /returnViewByChildRef\.current\.get\(current\)/);
  assert.match(networkSource, /exactParentView \?\?/);
  assert.match(networkSource, /const returnToParent = useCallback/);
});

test('blank-space pan and pinch own camera without making pinch a node click', () => {
  assert.match(networkSource, /pointersRef/);
  assert.match(networkSource, /pinchRef/);
  assert.match(networkSource, /suppressClickRef\.current = true/);
  assert.match(networkSource, /pinchReturnIntentRef/);
  assert.match(networkSource, /wheelReturnDistanceRef/);
});

test('layout editing is React-owned and changes workspace coordinates rather than camera state', () => {
  assert.match(networkSource, /const \[editingLayout, setEditingLayout\] = useState\(false\)/);
  assert.match(networkSource, /const \[draftWorkspace, setDraftWorkspace\]/);
  assert.match(networkSource, /withNodePosition\(current, workspaceDrag\.key, nextPoint\)/);
  assert.match(networkSource, /withGroupPosition\(current, workspaceDrag\.key, nextPoint\)/);
  assert.match(networkSource, /data-layout-editing=\{editingLayout \? 'true' : 'false'\}/);
  assert.doesNotMatch(workspaceSource, /setView|ResizeObserver|PointerEvent|document\./);
});

test('layout editing auto-saves completed actions and keeps camera state separate', () => {
  assert.match(networkSource, /const WORKSPACE_PREFIX = 'veinvite-network-workspace-v1:'/);
  assert.match(networkSource, /const commitEditingWorkspace = useCallback/);
  assert.match(networkSource, /const commitCurrentDraftWorkspace = useCallback/);
  assert.match(networkSource, /persistFocusWorkspace\(current\)/);
  assert.match(networkSource, /const finishLayoutEdit = useCallback/);
  assert.match(networkSource, /onClick=\{editingLayout \? finishLayoutEdit : beginLayoutEdit\}/);
  assert.doesNotMatch(networkSource, /const cancelLayoutEdit = useCallback/);
  assert.doesNotMatch(networkSource, /const resetLayoutEdit = useCallback/);
  assert.doesNotMatch(networkSource, /const saveLayoutEdit = useCallback/);
  assert.match(networkSource, /MIN_SCALE = 0\.32/);
  assert.match(networkSource, /MAX_SCALE = 2\.5/);
  assert.match(workspaceSource, /withFocusWorkspace/);
  assert.doesNotMatch(workspaceSource, /scale|focusWallet: string;\s*view/);
});

test('group creation is draft-first, supports one member, and preserves member positions for ungrouping', () => {
  assert.match(networkSource, /type GroupDraft/);
  assert.match(networkSource, /groupDropRef/);
  assert.match(networkSource, /groupDraft\.members\.length < 1/);
  assert.doesNotMatch(networkSource, /groupDraft\.members\.length < 2/);
  assert.match(networkSource, /addWorkspaceGroup\(workspace/);
  assert.match(networkSource, /removeWorkspaceGroupAtMemberPoints/);
  assert.match(networkSource, /removeWorkspaceMemberFromGroupAtPoint/);
  assert.match(networkSource, /moveWorkspaceMemberToGroup/);
  assert.match(networkSource, /withWorkspaceGroupCollapsed/);
  assert.match(networkSource, /groupsOpen/);
  assert.doesNotMatch(networkSource, /continuationEdge/);
  assert.match(workspaceSource, /group\.members\.length >= 1/);
  assert.match(workspaceSource, /members\.length < 1/);
  assert.doesNotMatch(workspaceSource, /members\.length < 2/);
  const removeStart = workspaceSource.indexOf('export function removeWorkspaceGroup');
  const removeEnd = workspaceSource.indexOf('export function removeWorkspaceMemberFromGroupAtPoint', removeStart);
  assert.ok(removeStart >= 0 && removeEnd > removeStart);
  const removeGroupSource = workspaceSource.slice(removeStart, removeEnd);
  assert.match(removeGroupSource, /groups: workspace\.groups\.filter/);
  assert.doesNotMatch(removeGroupSource, /positions\s*:/);
});

test('group builder is compact, edge-safe, animated, and keeps collapsed hubs visible', () => {
  assert.match(networkSource, /groupEligibleWalletKeys/);
  assert.match(networkSource, /activeWorkspace\.groups\.filter\(\(group\) =>[\s\S]*groupEligibleWalletKeys\.has/);
  assert.match(networkSource, /GROUP_DROP_HIT_SLOP_X = 18/);
  assert.match(networkSource, /GROUP_DROP_HIT_SLOP_Y = 14/);
  assert.match(networkSource, /className=\{\`groupDropZone\$\{groupDropActive \? ' active' : ''\}/);
  assert.match(networkSource, /\.groupDropZone\{min-height:42px[\s\S]*grid-template-columns:auto minmax\(0,1fr\) auto/);
  assert.match(networkSource, /\.groupsPanel,\.groupBuilder\{[^}]*left:auto;right:0/);
  assert.match(networkSource, /\.groupBuilder>input\{[^}]*font-size:16px/);
  assert.match(networkSource, /\.groupNode\.created\{animation:groupHubIn/);
  assert.match(networkSource, /\.personNode\.restoring\{animation:groupNodeRestore/);
  assert.match(networkSource, /prefers-reduced-motion:reduce[\s\S]*groupNode\.created/);
});

test('dragged Network nodes follow the pointer outside the clipped canvas and can seed a new group', () => {
  assert.match(networkSource, /import \{ createPortal \} from 'react-dom'/);
  assert.match(networkSource, /createPortal\([\s\S]*nodeDragGhost[\s\S]*document\.body/);
  assert.match(networkSource, /\.nodeDragGhost\{position:fixed;z-index:220/);
  assert.match(networkSource, /moveDragGhost\(event\.clientX, event\.clientY\)/);
  assert.match(networkSource, /dragGhost\?\.key === childKey \? ' dragGhostSource' : ''/);
  assert.match(networkSource, /ref=\{createFirstGroupRef\}/);
  assert.match(networkSource, /createFirstGroup\$\{newGroupDropActive \? ' dropActive' : ''\}/);
  assert.match(networkSource, /isInsideNewGroupDropTarget\(event\.clientX, event\.clientY\)/);
  assert.match(networkSource, /beginGroupCreationWithMember\(holdDrag\.key, holdDrag\.originalWorkspace\)/);
  assert.match(networkSource, /beginGroupCreationWithMember\(workspaceDrag\.key, workspaceDrag\.originalWorkspace\)/);
});

test('expanded group members keep movable offsets and group hubs move as one unit', () => {
  assert.match(workspaceSource, /memberOffsets\?: Record<string, NetworkWorkspacePoint>/);
  assert.match(workspaceSource, /withWorkspaceGroupMemberOffset/);
  assert.match(workspaceSource, /group\.memberOffsets && typeof group\.memberOffsets === 'object'/);
  assert.match(networkSource, /defaultGroupMemberOffset/);
  assert.match(networkSource, /group\.memberOffsets\?\.\[memberKey\]/);
  assert.match(networkSource, /dragKind: WorkspaceDragKind = expandedGroupMember \? 'group-member' : 'node'/);
  assert.match(networkSource, /updateGroupMemberPositionRuntime/);
  assert.match(networkSource, /updateGroupPositionRuntime/);
  assert.match(networkSource, /withWorkspaceGroupMemberOffset\([\s\S]*workspaceDrag\.groupId/);
  assert.match(networkSource, /beginHoldDrag\(event, group\.id, \{ x: group\.x, y: group\.y \}, 'group'\)/);
});

test('expanded group layout uses indexed child membership instead of repeated full scans', () => {
  assert.match(networkSource, /const positionedChildKeys = useMemo/);
  assert.match(networkSource, /new Set\(positionedChildren\.map\(\(child\) => keyWallet\(child\.wallet\)\)\)/);
  assert.match(networkSource, /positionedChildKeys\.has\(key\)/);
  const displayedStart = networkSource.indexOf('const displayedChildren = useMemo');
  const hiddenStart = networkSource.indexOf('const hiddenGroupMembers = useMemo', displayedStart);
  assert.ok(displayedStart >= 0 && hiddenStart > displayedStart);
  assert.doesNotMatch(networkSource.slice(displayedStart, hiddenStart), /positionedChildren\.some/);
});

test('group rendering and drag start use indexed wallet lookups at larger network sizes', () => {
  assert.match(networkSource, /const visibleChildByWallet = useMemo/);
  assert.match(networkSource, /new Map\(visibleChildren\.map\(\(child\) => \[keyWallet\(child\.wallet\), child\]\)\)/);
  assert.match(networkSource, /visibleChildByWallet\.get\(keyWallet\(member\)\)/);
  assert.match(networkSource, /const child = childByWallet\.get\(keyWallet\(key\)\)/);

  const edgesStart = networkSource.indexOf('{visibleGroups.filter((group) => group.collapsed === false).flatMap');
  const slotEdgesStart = networkSource.indexOf('{positionedInviteSlots.map((slot, index) => {', edgesStart);
  assert.ok(edgesStart >= 0 && slotEdgesStart > edgesStart);
  assert.doesNotMatch(networkSource.slice(edgesStart, slotEdgesStart), /visibleChildren\.find/);

  const workspaceDragStart = networkSource.indexOf('const beginWorkspaceDrag = useCallback');
  const finishDropStart = networkSource.indexOf('const finishWorkspaceDrop = useCallback', workspaceDragStart);
  assert.ok(workspaceDragStart >= 0 && finishDropStart > workspaceDragStart);
  assert.doesNotMatch(networkSource.slice(workspaceDragStart, finishDropStart), /positionedChildren\.find/);
});

test('blank tap dismisses transient Network UI and still exits layout editing safely', () => {
  assert.match(networkSource, /backgroundTapRef/);
  assert.match(networkSource, /backgroundTapRef\.current = !interactive/);
  assert.match(networkSource, /moved: false,[\s\S]*blocked: Boolean\(groupDraft\)/);
  assert.match(networkSource, /if \(backgroundTapRef\.current\) backgroundTapRef\.current\.blocked = true/);
  assert.match(networkSource, /const blankCanvasTap = Boolean/);
  assert.match(networkSource, /!backgroundTap\.moved/);
  assert.match(networkSource, /!backgroundTap\.blocked/);
  assert.match(networkSource, /if \(blankCanvasTap\) \{[\s\S]*setManagedGroupId\(null\);[\s\S]*setGroupsOpen\(false\);[\s\S]*if \(searchOpen\) closeSearch\(\)/);
  assert.match(networkSource, /const finishEditingFromBlankTap = blankCanvasTap && editingLayout && !groupDraft/);
  assert.match(networkSource, /finishLayoutEdit\(\)/);
});

test('group hubs have a distinct solid visual language from invite slots', () => {
  assert.match(networkSource, /<GroupsControlGlyph size=\{16\} \/>/);
  assert.match(networkSource, /\.edge\.groupEdge\{[^}]*stroke-width:1\.35\}/);
  assert.doesNotMatch(networkSource, /\.edge\.groupEdge\{[^}]*stroke-dasharray/);
  assert.match(networkSource, /\.groupMemberEdge\{[^}]*stroke-width:\.82\}/);
  assert.match(networkSource, /\.groupNode\{[^}]*border:1\.2px solid/);
  assert.doesNotMatch(networkSource, /\.groupNode\.expanded\{[^}]*border-style:dashed/);
  assert.match(networkSource, /\.slotEdgePulse\{[^}]*stroke-dasharray:5 38/);
  assert.match(networkSource, /\.slotCircle\{[^}]*border:1px dashed/);
});

test('group hubs use a refined fixed rounded-square visual without changing interaction geometry', () => {
  assert.match(networkSource, /\.groupNode\{width:60px;height:60px;min-width:60px;max-width:60px;padding:4px 3px/);
  assert.match(networkSource, /border-radius:13px/);
  assert.match(networkSource, /grid-template-columns:1fr;grid-template-rows:18px auto auto;row-gap:2px/);
  assert.match(networkSource, /align-content:center;justify-items:center;text-align:center/);
  assert.match(networkSource, /\.groupNode strong\{[^}]*max-width:52px;font-size:\.44rem;line-height:1\.1/);
  assert.match(networkSource, /\.groupNode small\{[^}]*max-width:52px[^}]*font-size:\.31rem;line-height:1\.1[^}]*text-overflow:ellipsis/);
  assert.match(networkSource, /\.groupGlyph\{width:18px;height:18px/);
  assert.match(networkSource, /GROUP_SCREEN_DROP_RADIUS = 58/);
  assert.match(networkSource, /GROUP_DROP_HIT_SLOP_X = 18/);
  assert.match(networkSource, /GROUP_DROP_HIT_SLOP_Y = 14/);
});

test('Network toolbar keeps navigation controls before edit and group controls', () => {
  const controlsStart = networkSource.indexOf('<div className="compactControls">');
  const controlsEnd = networkSource.indexOf('</div>\n      </div>', controlsStart);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  const controls = networkSource.slice(controlsStart, controlsEnd);
  const view = controls.indexOf('<div className="viewControls">');
  const layout = controls.indexOf('<div className="layoutControls">');
  assert.ok(view >= 0 && layout > view);
  const zoomOut = controls.indexOf('zoomByButton(-1)');
  const zoomIn = controls.indexOf('zoomByButton(1)');
  assert.ok(zoomOut >= 0 && zoomIn > zoomOut);
});

test('workspace copy covers every supported locale through a typed record', () => {
  assert.match(workspaceCopySource, /Record<SupportedLocale, NetworkWorkspaceCopy>/);
  const localeMatches = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
  for (const locale of localeMatches) {
    const escaped = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workspaceCopySource, new RegExp(`(?:^|\\n)\\s*(?:'${escaped}'|${escaped}):\\s*\\{`));
  }
});

test('single runtime keeps the authenticated read-only Network API contract', () => {
  assert.match(networkRouteSource, /requireWalletSession/);
  assert.match(networkRouteSource, /canUseNetworkSurface\('my'/);
  assert.match(networkRouteSource, /read_referral_network_focus_v2/);
  assert.doesNotMatch(networkSource, /supabaseAdmin/);
  assert.doesNotMatch(networkSource, /\/api\/rewards/);
  assert.doesNotMatch(networkSource, /request_reward_claim/);
  assert.doesNotMatch(workspaceSource, /supabase|fetch\(|\/api\//);
});

test('Network toolbar shows only the localized total count and does not expose round growth', () => {
  const utilityStart = networkSource.indexOf('className="networkUtilityRow"');
  const searchStart = networkSource.indexOf('className="networkSearchRow"', utilityStart);
  const utilitySource = networkSource.slice(utilityStart, searchStart);
  assert.match(utilitySource, /className="summaryTotal"/);
  assert.match(utilitySource, /NETWORK_TOTAL_COPY\[locale as SupportedLocale\]/);
  assert.match(utilitySource, /headerNetwork\.toLocaleString\(\)/);
  assert.doesNotMatch(utilitySource, /headerThisRound|t\.thisRound|className="growth"/);
  assert.doesNotMatch(networkSource, /const headerThisRound/);
});

test('Network localized content stays bounded and RTL overlays adapt without mirroring the graph', () => {
  assert.match(networkSource, /className="summaryTotal"/);
  assert.match(networkSource, /NETWORK_TOTAL_COPY\[locale as SupportedLocale\]/);
  assert.match(networkSource, /\.summaryTotal span\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(networkSource, /\.networkSearchRow\{[^}]*position:absolute[^}]*top:44px[^}]*inset-inline:6px/);
  assert.match(networkSource, /\.nodeProgressStatus\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(networkSource, /\.slotNode>strong\{[^}]*width:92px[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(networkSource, /\.workspaceNotice\{[^}]*max-width:calc\(100% - 28px\)[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  assert.match(networkSource, /className="searchResults" role="listbox" dir=\{profileDirection\}/);
  assert.match(networkSource, /className="groupBuilder" data-no-pan="true" dir=\{profileDirection\}/);
  assert.match(networkSource, /className="groupsPanel" data-no-pan="true" dir=\{profileDirection\}/);
  assert.match(networkSource, /profileDirection === 'rtl' \? '›' : '‹'/);
  assert.match(networkSource, /\.searchResults button\{[^}]*text-align:start/);
  assert.match(networkSource, /\.groupsList>button\{[^}]*text-align:start/);
  assert.match(networkSource, /\.groupManageTitleButton\{[^}]*text-align:start/);
  assert.doesNotMatch(networkSource, /direction:\s*rtl[^}]*\.world/);
  assert.doesNotMatch(networkSource, /scaleX\(-1\)/);
});


test('Network first paint is immediate, warmed, and never swaps to a blocking loading card', () => {
  assert.match(networkRouteSource, /fastInitial = request\.nextUrl\.searchParams\.get\('fast'\) === '1'/);
  assert.match(networkRouteSource, /const round = fastInitial \? null : await readCurrentRoundContext\(\)/);
  assert.match(networkSource, /if \(options\.fast\) params\.set\('fast', '1'\)/);
  assert.match(networkSource, /getCachedNetworkRoot\(wallet\)/);
  assert.match(networkSource, /provisionalNetworkData\(wallet\)/);
  assert.match(networkSource, /rememberNetworkRoot\(requestWallet, payload\)/);
  assert.match(networkSource, /const fastRequest = fetchNetwork\(requestWallet,[\s\S]*fast: true/);
  assert.match(networkSource, /const enrichedRequest = fetchNetwork\(requestWallet,[\s\S]*signal: controller\.signal/);
  const fastRequestIndex = networkSource.indexOf('const fastRequest = fetchNetwork');
  const enrichedRequestIndex = networkSource.indexOf('const enrichedRequest = fetchNetwork');
  const fastAwaitIndex = networkSource.indexOf('await fastRequest', fastRequestIndex);
  assert.ok(fastRequestIndex >= 0 && enrichedRequestIndex > fastRequestIndex);
  assert.ok(fastAwaitIndex > enrichedRequestIndex);
  assert.match(networkWarmupSource, /prefetchNetworkRoot\(wallet\)/);
  assert.match(networkWarmupSource, /prefetchEnrichedNetworkRoot\(wallet, \{ force: true \}\)/);
  assert.match(networkWarmupSource, /prefetchNetworkInviteSlots\(wallet\)/);
  assert.doesNotMatch(networkSource, /if \(loadState === 'loading' \|\| loadState === 'idle'\)[\s\S]{0,260}networkStateCard/);
});

test('canary test data is server-only and never creates a second frontend runtime', () => {
  assert.doesNotMatch(guideSource, /networkCanaryFixture|isNetworkCanaryWallet/);
  assert.doesNotMatch(networkSource, /networkCanaryFixture|isNetworkCanaryWallet|canaryFixture/);
  assert.doesNotMatch(guideSource, new RegExp(TEST_WALLET_LITERAL, 'i'));
  assert.doesNotMatch(networkSource, new RegExp(TEST_WALLET_LITERAL, 'i'));
  assert.doesNotMatch(networkRouteSource, new RegExp(TEST_WALLET_LITERAL, 'i'));
  assert.doesNotMatch(networkSummaryRouteSource, new RegExp(TEST_WALLET_LITERAL, 'i'));
  assert.doesNotMatch(canaryFixtureSource, new RegExp(TEST_WALLET_LITERAL, 'i'));
});

test('only allowlisted canary wallets receive the synthetic graph and normal wallets keep the real RPC path', () => {
  assert.match(networkRouteSource, /isNetworkCanaryWallet\(rootWallet\)/);
  assert.match(networkRouteSource, /buildNetworkCanaryFixture\(rootWallet, focusWallet, search, round\)/);
  assert.match(networkSummaryRouteSource, /isNetworkCanaryWallet\(walletAddress\)/);
  assert.match(networkSummaryRouteSource, /getNetworkCanarySummary\(\)/);

  const canaryCheck = networkRouteSource.indexOf('isNetworkCanaryWallet(rootWallet)');
  const fixtureBuild = networkRouteSource.indexOf('buildNetworkCanaryFixture(rootWallet, focusWallet, search, round)');
  const realRpc = networkRouteSource.indexOf(".rpc(\n        'read_referral_network_focus_v2'");
  assert.ok(canaryCheck >= 0 && fixtureBuild > canaryCheck && realRpc > fixtureBuild);
});

test('canary fixture supplies 500 varied lifetime branches instead of a binary tree', () => {
  assert.match(canaryFixtureSource, /NETWORK_CANARY_SAMPLE_SIZE = 500/);
  assert.match(canaryFixtureSource, /ROOT_DIRECT_COUNT = 10/);
  assert.match(canaryFixtureSource, /EARLY_BRANCH_COUNTS = \[0, 1, 2, 3, 5, 8, 4, 7, 2, 6\]/);
  assert.match(canaryFixtureSource, /BRANCHING_PATTERN/);
  assert.match(canaryFixtureSource, /function childCountFor/);
  assert.match(canaryFixtureSource, /function buildParentAssignments/);
  assert.match(canaryFixtureSource, /if \(index <= ROOT_DIRECT_COUNT\) return 'root'/);
  assert.match(canaryFixtureSource, /statusFor/);
  assert.match(canaryFixtureSource, /'REWARDED'/);
  assert.match(canaryFixtureSource, /'QUALIFIED'/);
  assert.match(canaryFixtureSource, /'IN_PROGRESS'/);
  assert.match(canaryFixtureSource, /roundOffsetHours/);
  assert.match(canaryFixtureSource, /Date\.parse\(round\.startAt\)/);
  assert.match(canaryFixtureSource, /Date\.parse\(round\.endAt\)/);
  assert.match(canaryFixtureSource, /canaryFixture: true/);
});

test('two invite slots are current capacity, not a lifetime two-branch limit', () => {
  assert.match(networkSlotsRouteSource, /requireWalletSession/);
  assert.match(networkSlotsRouteSource, /canUseNetworkSurface\('my', wallet\)/);
  assert.match(networkSlotsRouteSource, /slot_released_at/);
  assert.match(networkSlotsRouteSource, /invite_slot/);
  assert.match(networkSlotsRouteSource, /slots = \(\[1, 2\] as const\)\.map/);
  assert.match(networkSlotsRouteSource, /state: 'AVAILABLE'/);
  assert.match(networkSlotsRouteSource, /state: row\.invitee_wallet \? 'IN_PROGRESS'/);
  assert.match(networkSlotsRouteSource, /completedSteps/);
  assert.match(networkSource, /\/api\/network\/slots\?wallet=/);
  assert.match(networkSource, /getCachedNetworkInviteSlots\(wallet\)/);
  assert.match(networkSource, /rememberNetworkInviteSlots\(wallet, slots\)/);
  assert.match(networkSlotCacheSource, /STORAGE_KEY = 'veinvite_network_invite_slots_v1'/);
  assert.match(networkSlotCacheSource, /window\.sessionStorage/);
  assert.match(networkSlotCacheSource, /prefetchNetworkInviteSlots/);
  assert.match(networkSource, /positionedInviteSlots/);
  assert.doesNotMatch(networkSource, /2 - currentData\.children\.length/);
});

test('invite slot state retries transient failures and refreshes when the app resumes', () => {
  assert.match(networkSource, /SLOT_RETRY_DELAY_MS\s*=\s*650/);
  assert.match(networkSource, /SLOT_REFRESH_MIN_INTERVAL_MS\s*=\s*1_500/);
  assert.match(networkSource, /SLOT_REQUEST_TIMEOUT_MS\s*=\s*2_000/);
  assert.match(networkSource, /const fetchSlotResponse = async/);
  assert.match(networkSource, /signal: requestController\.signal/);
  assert.match(networkSource, /slots\.length === 2 \? slots : null/);
  assert.match(networkSource, /window\.addEventListener\('focus', handleResume\)/);
  assert.match(networkSource, /document\.addEventListener\('visibilitychange', handleResume\)/);
  assert.match(networkSource, /void refreshSlots\(false, false\)/);
  assert.match(networkSource, /setInviteSlotsReady\(true\)/);
  assert.doesNotMatch(networkSource, /introReadyFallback/);
  assert.doesNotMatch(networkSource, /setInterval\(/);
});

test('pending acceptance stays distinct from mission progress in Network slots', () => {
  assert.match(networkSource, /const pendingAcceptance = slot\.state === 'PENDING'/);
  assert.match(networkSource, /const slotStatusLabel = pendingAcceptance \? t\.pendingAcceptance : t\.inProgress/);
  assert.match(networkSource, /pendingAcceptance \? 'pendingInviteNode' : 'progressInviteNode'/);
  assert.match(networkSource, /pendingAcceptance[\s\S]*t\.pendingAcceptance[\s\S]*slot\.completedSteps/);
  assert.match(networkSource, /\.pendingInviteNode \.nodeCircle\{[^}]*border-style:dashed/);
});

test('available and in-progress invite slots are movable like ordinary nodes', () => {
  assert.match(workspaceSource, /function cleanPositionKey/);
  assert.match(workspaceSource, /\^slot:\[12\]\$/);
  assert.match(networkSource, /type WorkspaceDragKind = 'node' \| 'slot' \| 'group' \| 'group-member'/);
  assert.match(networkSource, /beginWorkspaceDrag\(event, 'slot', slot\.key, point\)/);
  assert.match(networkSource, /beginHoldDrag\(event, slot\.key, point, 'slot'\)/);
  assert.match(networkSource, /withNodePosition\(current, workspaceDrag\.key, nextPoint\)/);
  assert.match(networkSource, /progressInviteNode/);
  assert.match(networkSource, /--slot-progress/);
});

test('invite slot visual states keep one 52px body and restrained progress ring', () => {
  assert.match(networkSource, /\.personNode\{[^}]*width:52px;height:52px/);
  assert.match(networkSource, /\.slotNode\{width:52px;height:52px/);
  assert.match(networkSource, /\.childNode::before\{width:58px;height:58px/);
  assert.match(networkSource, /\.slotNode::before\{width:58px;height:58px/);
  assert.match(networkSource, /\.progressInviteNode::after\{[^}]*inset:-3px/);
  assert.doesNotMatch(networkSource, /continuationEdgePath|className="continuationEdge"|\.continuationEdge\{/);
});

test('single runtime keeps the approved radial Network visual and deliberate motion contract', () => {
  assert.match(networkSource, /function radialChildPoint/);
  assert.match(networkSource, /const GOLDEN_ANGLE/);
  assert.match(networkSource, /nodeCircle focusCircle/);
  assert.match(networkSource, /className="slotCircle"/);
  assert.match(networkSource, /\{u\.available\}/);
  assert.match(networkSource, /slotEdgeBase/);
  assert.match(networkSource, /slotEdgePulse/);
  assert.match(networkSource, /@keyframes networkSlotFlow/);
  assert.match(networkSource, /@keyframes networkYouIntro/);
  assert.match(networkSource, /@keyframes networkNodeBloom/);
  assert.match(networkSource, /setView\(centeredView\(stageSize, 1\)\)/);
  assert.match(networkSource, /if \(!rootTopologyReady\) return/);
  assert.match(networkSource, /if \(!inviteSlotsReady\) return/);
  assert.doesNotMatch(networkSource, /INTRO_SESSION_PREFIX|veinvite-network-intro-v5/);
  assert.match(networkSource, /breadcrumbs\.rootOnly\{display:none\}/);
  assert.match(networkSource, /width:min\(100%,520px\)/);
  assert.doesNotMatch(networkSource, /\.personNode\{min-width:92px;padding:7px/);
  assert.doesNotMatch(networkSource, /background-size:auto,28px 28px,28px 28px/);
});

test('Network hides the world until root topology and both invite slots form one complete scene', () => {
  assert.match(networkSource, /const rootSceneReady = rootTopologyReady && inviteSlotsReady/);
  assert.match(networkSource, /rootSceneReady \? 'sceneReady' : 'scenePending'/);
  assert.match(networkSource, /\.worldContent\.scenePending\{opacity:0;pointer-events:none\}/);
  assert.match(networkSource, /\.worldContent\.sceneReady\{opacity:1;transition:opacity 120ms ease-out\}/);
  assert.match(networkSource, /setInviteSlots\(cachedInviteSlots \?\? \[\]\)/);
});

test('Network top metric is a stable total-only value with no round placeholder transition', () => {
  assert.match(networkSource, /const headerNetwork =\s*headerMetrics\?\.network \?\? visibleRootData\.summary\.network/);
  assert.match(networkSource, /className="summaryTotal"/);
  assert.match(networkSource, /headerNetwork\.toLocaleString\(\)/);
  assert.doesNotMatch(networkSource, /headerMetricsReady|metricsPending|metricsReady/);
  assert.doesNotMatch(networkSource, /const headerThisRound/);
});

test('Network intro waits for the authoritative slot attempt to settle before YOU-to-fit motion', () => {
  const readinessGate = networkSource.indexOf('if (!inviteSlotsReady) return;');
  const introStart = networkSource.indexOf(
    'setView(centeredView(stageSize, 1))',
    readinessGate,
  );
  assert.ok(readinessGate >= 0 && introStart > readinessGate);
  assert.match(networkSource, /void refreshSlots\(false, false\)/);
  assert.match(networkSource, /setInviteSlots\(slots\);\s*setInviteSlotsReady\(true\);/);
  assert.doesNotMatch(networkSource, /introReadyFallback|fallbackTimer/);
});
test('Network entry repeats a stable YOU-to-fit motion on every mount without stale camera restore', () => {
  assert.doesNotMatch(networkSource, /StoredRuntimeState|runtimeSessionKey|readStoredRuntimeState/);
  assert.match(networkSource, /const \[rootTopologyReady, setRootTopologyReady\] = useState\(false\)/);
  assert.match(networkSource, /const \[inviteSlotsReady, setInviteSlotsReady\] = useState\([\s\S]*Boolean\(initialInviteSlots\)/);
  assert.match(networkSource, /const \[stageStable, setStageStable\] = useState\(false\)/);
  assert.match(networkSource, /requestAnimationFrame[\s\S]*requestAnimationFrame/);
  assert.match(networkSource, /setView\(centeredView\(stageSize, 1\)\)[\s\S]*setIntroActive\(true\)[\s\S]*fitNetwork\(\)/);
  assert.match(networkSource, /const stopIntroForInteraction = useCallback/);
  assert.match(networkSource, /onPointerDownCapture[\s\S]*stopIntroForInteraction\(\)/);
  assert.match(networkSource, /onWheel[\s\S]*stopIntroForInteraction\(\)/);
});

test('completed Network nodes show descendant counts below the node while active invitations keep progress status', () => {
  const childStart = networkSource.indexOf('{visibleChildren.map((child) => {');
  const groupStart = networkSource.indexOf('{visibleGroups.map((group) => {', childStart);
  assert.ok(childStart >= 0 && groupStart > childStart);
  const childMarkup = networkSource.slice(childStart, groupStart);

  assert.match(childMarkup, /child\.status === 'IN_PROGRESS'/);
  assert.match(childMarkup, /nodeProgressStatus/);
  assert.match(childMarkup, /<NetworkCountGlyph \/>/);
  assert.match(childMarkup, /child\.network\.toLocaleString\(\)/);
  assert.match(childMarkup, /<span className="nodeCircle"><NetworkIdentity address=\{child\.wallet\} showLabel=\{false\} \/><\/span>/);
  assert.match(childMarkup, /<span className="nodeMeta">[\s\S]*<strong><NetworkNodeLabel address=\{child\.wallet\} \/><\/strong>/);
  assert.doesNotMatch(childMarkup, /NetworkNodeIdentity/);
  assert.doesNotMatch(childMarkup, /statusLabel\(child\.status, locale\)/);

  assert.match(networkSource, /\.nodeMeta\{[^}]*gap:1px/);
  assert.match(networkSource, /\.childNode \.nodeMeta\{top:calc\(100% \+ 6px\)\}/);
  assert.match(networkSource, /\.nodeMeta strong\{[^}]*max-width:90px[^}]*font-size:\.46rem[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.doesNotMatch(networkSource, /\.childNode \.nodeMeta\{bottom:/);
  assert.match(networkMigrationSource, /count\(fn\.wallet\) filter \(where fn\.depth > 1\)::integer as network_count/);
  assert.match(canaryFixtureSource, /const childSummary = nodeSummary\(node\.wallet, round\)/);
  assert.match(canaryFixtureSource, /network: descendants\.length/);
});

test('node labels prefer VET domains while preserving the original scoped node DOM', () => {
  assert.match(networkSource, /wallet\.slice\(2, 5\)\.toUpperCase\(\)/);
  assert.match(networkSource, /wallet\.slice\(-3\)\.toUpperCase\(\)/);
  assert.match(networkSource, /const NetworkNodeLabel = memo/);
  assert.doesNotMatch(networkSource, /NetworkNodeIdentity/);
  const labelStart = networkSource.indexOf('const NetworkNodeLabel = memo');
  const labelEnd = networkSource.indexOf('function goHomeWithoutReload', labelStart);
  assert.ok(labelStart >= 0 && labelEnd > labelStart);
  const labelSource = networkSource.slice(labelStart, labelEnd);
  assert.match(labelSource, /readCachedLeaderboardDomain\(address\)/);
  assert.match(labelSource, /useVechainDomain\(\s*shouldResolveDomain \? address : undefined/);
  assert.match(labelSource, /rememberLeaderboardDomain\(address, queriedDomain\)/);
  assert.match(labelSource, /return <>\{formatCompactVechainDomain\(resolvedDomain\) \|\| nodeWallet\(address\)\}<\/>/);
  assert.doesNotMatch(labelSource, /className=|<span|<strong/);

  assert.match(networkSource, /<strong><NetworkNodeLabel address=\{currentData\.focusWallet\} \/><\/strong>/);
  assert.match(networkSource, /<strong><NetworkNodeLabel address=\{child\.wallet\} \/><\/strong>/);
  assert.match(networkSource, /slot\.inviteeWallet \? <NetworkNodeLabel address=\{slot\.inviteeWallet\} \/> : slotStatusLabel/);
  assert.match(networkSource, /<strong><NetworkNodeLabel address=\{dragGhost\.wallet\} \/><\/strong>/);
  assert.match(networkSource, /\.nodeMeta strong\{[^}]*max-width:90px[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
});

test('Network and Leaderboard share the same compact VET-domain display rule', () => {
  assert.match(leaderboardDomainCacheSource, /const VEWORLD_DOMAIN_SUFFIX = '\.veworld\.vet'/);
  assert.match(leaderboardDomainCacheSource, /const COMPACT_DOMAIN_VISIBLE_CHARS = 8/);
  assert.match(leaderboardDomainCacheSource, /normalized\.toLowerCase\(\)\.endsWith\(VEWORLD_DOMAIN_SUFFIX\)/);
  assert.match(leaderboardDomainCacheSource, /normalized\.slice\(0, -VEWORLD_DOMAIN_SUFFIX\.length\)/);
  assert.match(leaderboardDomainCacheSource, /visible\.slice\(0, COMPACT_DOMAIN_VISIBLE_CHARS\)/);
  assert.match(networkSource, /formatCompactVechainDomain\(resolvedDomain\) \|\| nodeWallet\(address\)/);
  assert.match(leaderboardSource, /const compactProfileName = formatCompactVechainDomain\(profileName\)/);
  assert.match(leaderboardSource, /\{compactProfileName \?\? maskWallet\(address\)\}/);
  assert.match(networkSource, /\.nodeMeta strong\{[^}]*max-width:90px[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(leaderboardSource, /\.walletText \{[\s\S]*overflow:hidden;[\s\S]*text-overflow:ellipsis;[\s\S]*white-space:nowrap;/);
});


test('root YOU identity lives inside the center node and the top return control stays icon-only', () => {
  const focusStart = networkSource.indexOf('focusNode${selectedWallet');
  const childrenStart = networkSource.indexOf('{visibleChildren.map((child) => {', focusStart);
  assert.ok(focusStart >= 0 && childrenStart > focusStart);
  const focusMarkup = networkSource.slice(focusStart, childrenStart);

  assert.match(focusMarkup, /focusIsRoot \? \([\s\S]*focusYouLabel[\s\S]*\{c\.you\}/);
  assert.match(focusMarkup, /<span className="nodeMeta">[\s\S]*<strong><NetworkNodeLabel address=\{currentData\.focusWallet\} \/><\/strong>/);
  assert.match(focusMarkup, /<NetworkCountGlyph \/>/);
  assert.match(focusMarkup, /currentData\.summary\.network\.toLocaleString\(\)/);
  assert.doesNotMatch(focusMarkup, /NetworkNodeIdentity/);

  const controlsStart = networkSource.indexOf('<div className="viewControls">');
  const fitStart = networkSource.indexOf('className="fitButton"', controlsStart);
  const controlsMarkup = networkSource.slice(controlsStart, fitStart);
  assert.match(controlsMarkup, /className="youControl"/);
  assert.match(controlsMarkup, /◎/);
  assert.doesNotMatch(controlsMarkup, /controlLabel/);
  assert.match(networkSource, /\.viewControls \.youControl\{width:28px!important;min-width:28px;max-width:28px/);
});

test('wallet search is magnifier-first and avoids iPhone focus zoom without disabling pinch zoom', () => {
  assert.match(networkSource, /const \[searchOpen, setSearchOpen\] = useState\(false\)/);
  assert.match(networkSource, /function SearchGlyph\(\)/);
  assert.match(networkSource, /className=\{\`searchToggle\$\{searchOpen \? ' active' : ''\}\`\}/);
  assert.match(networkSource, /ref=\{searchInputRef\}/);
  assert.match(networkSource, /searchInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(networkSource, /const closeSearch = useCallback/);
  assert.match(networkSource, /closeSearch\(\);[\s\S]*moveToFocus\(result\.wallet, 'forward'\)/);
  assert.match(networkSource, /\.searchField input\{[^}]*font-size:16px/);
  assert.match(networkSource, /\.networkSearchRow\{[^}]*position:absolute/);
  assert.doesNotMatch(networkSource, /\.networkSearchRow\{[^}]*flex:0 0 auto/);
  assert.doesNotMatch(networkSource, /@media\(max-width:560px\)/);
  assert.doesNotMatch(networkSource, /maximum-scale|user-scalable|document\.documentElement\.style\.touchAction/);
});
test('invite slot fallback geometry is stable before and after stage measurement', () => {
  const slotStart = networkSource.indexOf('function inviteSlotPoint');
  const slotEnd = networkSource.indexOf('function fittedView', slotStart);
  const slotSource = networkSource.slice(slotStart, slotEnd);
  assert.match(slotSource, /FOCUS_X - 58/);
  assert.match(slotSource, /FOCUS_X \+ 64/);
  assert.doesNotMatch(slotSource, /compact|isMobile/);
  assert.match(networkSource, /const saved = activeWorkspace\.positions\[key\]/);
  assert.match(networkSource, /x: saved\?\.x \?\? fallback\.x/);
});

test('navigation animation honors reduced motion and keeps idle geometry stationary', () => {
  assert.match(networkSource, /worldContent\.nav-forward/);
  assert.match(networkSource, /worldContent\.nav-back/);
  assert.match(networkSource, /networkSlotFlow/);
  assert.match(networkSource, /networkYouBreath/);
  assert.match(networkSource, /networkNodeBloom/);
  assert.match(networkSource, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(networkSource, /ambient.*translate/i);
  assert.doesNotMatch(networkSource, /setInterval\(/);
});

test('long-hold selection gives one optional haptic acknowledgement when drag arms', () => {
  assert.match(networkSource, /function triggerHoldHaptic\(\)/);
  assert.match(networkSource, /typeof navigator\.vibrate !== 'function'/);
  assert.match(networkSource, /navigator\.vibrate\(12\)/);
  assert.match(networkSource, /hold\.armed = true;[\s\S]{0,300}triggerHoldHaptic\(\);[\s\S]{0,1200}setDraggingWorkspaceKey/);
});

test('final Network gestures are coordinate-owned and deliberate', () => {
  assert.match(networkSource, /const HOLD_TO_MOVE_MS = 500/);
  assert.match(networkSource, /const MIN_SCALE = 0\.32/);
  assert.match(networkSource, /const MAX_SCALE = 2\.5/);
  assert.match(networkSource, /nearestVisibleChild/);
  assert.match(networkSource, /findGroupDropTarget/);
  assert.match(networkSource, /GROUP_SCREEN_DROP_RADIUS = 58/);
  assert.match(networkSource, /beginHoldDrag/);
  assert.match(networkSource, /holdDrag\.armed/);
  assert.match(networkSource, /updateNodePositionRuntime/);
  assert.match(networkSource, /flushWorkspaceStore/);
  assert.match(networkSource, /cancelHoldDrag\(true\)/);
  assert.match(networkSource, /screenDistance <= HOLD_CANCEL_DISTANCE && !holdDrag\.moved/);
  assert.match(networkSource, /pinchCandidateWalletRef/);
  assert.match(networkSource, /pinchEnterIntentRef/);
  assert.match(networkSource, /wheelEnterDistanceRef/);
  assert.doesNotMatch(networkSource, /elementFromPoint|elementsFromPoint/);
  assert.doesNotMatch(networkSource, /querySelectorAll<HTMLElement>/);
});

test('YOU return is separate from explicit Fit and multi-level back protects parent camera ownership', () => {
  assert.match(networkSource, /const returnToYou = useCallback/);
  assert.match(networkSource, /const fitNetwork = useCallback/);
  assert.match(networkSource, /className="fitButton" onClick=\{\(\) => \{ stopIntroForInteraction\(\); fitNetwork\(\); \}\}/);
  assert.match(networkSource, /onClick=\{returnToYou\}/);
  assert.match(networkSource, /immediateParent && keyWallet\(immediateParent\) === target/);
});

test('pinch navigation waits until every pointer is released', () => {
  const endStart = networkSource.indexOf('const onPointerEndCapture');
  const wheelStart = networkSource.indexOf('const onWheel', endStart);
  const endSource = networkSource.slice(endStart, wheelStart);
  const onePointerStart = endSource.indexOf('pointersRef.current.size === 1');
  const zeroPointerStart = endSource.indexOf('pointersRef.current.size === 0');
  assert.ok(onePointerStart >= 0 && zeroPointerStart > onePointerStart);
  assert.doesNotMatch(endSource.slice(onePointerStart, zeroPointerStart), /returnToParent\(|moveToFocus\(/);
  assert.match(endSource.slice(zeroPointerStart), /moveToFocus\(enterWallet, 'forward'\)/);
});

test('final group workspace keeps one React-owned membership path and one persistent Groups control', () => {
  assert.match(networkSource, /moveWorkspaceMemberToGroup/);
  assert.match(networkSource, /withWorkspaceGroupCollapsed/);
  assert.match(networkSource, /className="groupsPanel"/);
  assert.match(networkSource, /className="groupBuilder"/);
  assert.match(networkSource, /className=\{\`editLayoutButton\$\{editingLayout \? ' active' : ''\}\`\}/);
  assert.match(networkSource, /<LayoutControlGlyph done=\{editingLayout\} \/>/);
  assert.match(networkSource, /<GroupsControlGlyph \/>/);
  assert.doesNotMatch(networkSource, /'✦'|'◉'/);
  assert.doesNotMatch(networkSource, /className="resetLayoutButton"/);
  assert.doesNotMatch(networkSource, /className="saveLayoutButton"/);
  assert.doesNotMatch(networkSource, /className="cancelLayoutButton"/);
  assert.doesNotMatch(networkSource, /groupBuilderAnchor/);
  assert.doesNotMatch(networkSource, /continuationEdge/);
  assert.doesNotMatch(networkSource, /hidden descendants|\+N|\+15/);
});

test('edit-mode drag commits only on completed drop and provisional group drops restore the original node position', () => {
  assert.match(networkSource, /originalWorkspace: cloneNetworkFocusWorkspace\(workspace\)/);
  assert.match(networkSource, /setDraftWorkspace\(\(current\) => \{[\s\S]*draftWorkspaceRef\.current = next/);
  assert.match(networkSource, /if \(event\.type !== 'pointerup'\) \{[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)\)/);
  assert.match(networkSource, /isInsideGroupDropTarget\(event\.clientX, event\.clientY\)/);
  assert.match(networkSource, /if \(!insideDraft \|\| alreadyAdded \|\| atCapacity\) \{[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)\)/);
  assert.match(networkSource, /groupingRestoreWorkspaceRef\.current = cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)/);
  assert.match(networkSource, /setGroupDraft\(\(current\) => \{[\s\S]*members: \[\.\.\.current\.members, keyWallet\(drag\.key\)\]/);
  assert.match(networkSource, /commitCurrentDraftWorkspace\(\)/);
  assert.match(networkSource, /findGroupDropTarget\([\s\S]*drag\.groupId/);
  assert.match(networkSource, /moveMemberBetweenGroups\([\s\S]*drag\.originalWorkspace,[\s\S]*drag\.key,[\s\S]*drag\.groupId,[\s\S]*targetGroup\.id/);
});

test('edit drag cancellation restores the pre-drag workspace for multitouch and provisional grouping', () => {
  assert.match(networkSource, /const activeWorkspaceDrag = workspaceDragRef\.current/);
  assert.match(networkSource, /setEditingWorkspace\(cloneNetworkFocusWorkspace\(activeWorkspaceDrag\.originalWorkspace\)\)/);
  assert.match(networkSource, /groupingRestoreWorkspaceRef/);
  assert.match(networkSource, /const restorePendingGroupDrop = useCallback[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(restoreWorkspace\)\)/);
  assert.match(networkSource, /const finishLayoutEdit = useCallback[\s\S]*restorePendingGroupDrop\(\)/);
  assert.match(networkSource, /setGroupDropActive\(false\)/);
});

test('second touch cannot restart a node drag after pinch handoff begins', () => {
  const workspaceDragStart = networkSource.indexOf('const beginWorkspaceDrag = useCallback');
  const holdDragStart = networkSource.indexOf('const beginHoldDrag = useCallback');
  const dropStart = networkSource.indexOf('const finishWorkspaceDrop = useCallback');
  assert.ok(workspaceDragStart >= 0 && holdDragStart > workspaceDragStart && dropStart > holdDragStart);
  const workspaceDragSource = networkSource.slice(workspaceDragStart, holdDragStart);
  const holdDragSource = networkSource.slice(holdDragStart, dropStart);
  assert.match(workspaceDragSource, /pointersRef\.current\.size !== 1/);
  assert.match(workspaceDragSource, /pinchRef\.current/);
  assert.match(holdDragSource, /pointersRef\.current\.size !== 1/);
  assert.match(holdDragSource, /pinchRef\.current/);
});

test('group transfers are unique, bounded, and long-press native UI stays blocked', () => {
  assert.match(workspaceSource, /target\.members\.some\(\(member\) => member\.toLowerCase\(\) === key\)/);
  assert.match(workspaceSource, /target\.members\.length >= MAX_MEMBERS_PER_GROUP/);
  assert.match(workspaceSource, /const members = group\.members\.filter\(\(member\) => member\.toLowerCase\(\) !== key\)/);
  assert.match(workspaceSource, /Array\.from\(new Set\(members\)\)/);
  assert.match(workspaceSource, /if \(groups\.length >= MAX_GROUPS_PER_FOCUS\) return workspace/);
  assert.match(networkSource, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('canvas group clicks only expand or collapse while toolbar groups own management', () => {
  const groupNodeStart = networkSource.indexOf('{visibleGroups.map((group) => {');
  const slotsStart = networkSource.indexOf('{positionedInviteSlots.map((slot) => {', groupNodeStart);
  assert.ok(groupNodeStart >= 0 && slotsStart > groupNodeStart);
  const groupNodeSource = networkSource.slice(groupNodeStart, slotsStart);
  assert.match(groupNodeSource, /toggleGroupCollapsed\(group\.id\)/);
  assert.match(groupNodeSource, /aria-expanded=\{group\.collapsed === false\}/);
  assert.doesNotMatch(groupNodeSource, /setManagedGroupId\(group\.id\)/);
  assert.doesNotMatch(networkSource, /profileCard groupCard/);

  assert.match(networkSource, /className="groupsPanel"/);
  assert.match(networkSource, /onClick=\{\(\) => setManagedGroupId\(group\.id\)\}/);
  assert.match(networkSource, /className="groupManageMembers"/);
  assert.match(networkSource, /removeManagedGroupMember\(member\)/);
  assert.match(networkSource, /onClick=\{dissolveManagedGroup\}/);
});

test('managed group title supports direct inline rename without changing canvas group click semantics', () => {
  assert.match(networkSource, /const \[editingManagedGroupName, setEditingManagedGroupName\] = useState\(false\)/);
  assert.match(networkSource, /const \[managedGroupNameDraft, setManagedGroupNameDraft\] = useState\(''\)/);
  assert.match(networkSource, /managedGroupNameInputRef\.current\?\.select\(\)/);
  assert.match(networkSource, /const beginManagedGroupRename = useCallback/);
  assert.match(networkSource, /const commitManagedGroupRename = useCallback/);
  assert.match(networkSource, /groups: workspace\.groups\.map\(\(group\) =>[\s\S]*group\.id === managedGroup\.id \? \{ \.\.\.group, label \} : group/);
  assert.match(networkSource, /className="groupManageTitleButton"[\s\S]*onClick=\{beginManagedGroupRename\}/);
  assert.match(networkSource, /className="groupManageTitleInput"/);
  assert.match(networkSource, /onBlur=\{commitManagedGroupRename\}/);
  assert.match(networkSource, /event\.key === 'Enter'[\s\S]*event\.currentTarget\.blur\(\)/);
  assert.match(networkSource, /event\.key === 'Escape'[\s\S]*setEditingManagedGroupName\(false\)/);
  assert.match(networkSource, /\.groupManageTitleInput\{[^}]*font-size:16px/);
  assert.match(networkSource, /\.groupsPanelHead>button\{[^}]*width:27px;height:27px[^}]*display:grid;place-items:center/);
  assert.match(networkSource, /\.groupManageHead\{[^}]*grid-template-columns:27px minmax\(0,1fr\) 27px[^}]*align-items:center/);
  assert.match(networkSource, /\.groupManageTitle\{[^}]*width:100%/);
  assert.match(networkSource, /\.groupManageTitleButton\{[^}]*width:100%;height:auto[^}]*font-size:\.62rem/);
});

test('expanded members can move between groups with fixed screen-space targeting', () => {
  assert.match(networkSource, /GROUP_SCREEN_DROP_RADIUS = 58/);
  assert.match(networkSource, /const findGroupDropTarget = useCallback/);
  assert.match(networkSource, /rect\.left \+ view\.x \+ group\.x \* view\.scale/);
  assert.match(networkSource, /group\.members\.length >= MAX_MEMBERS_PER_GROUP/);
  assert.match(networkSource, /holdDrag\.kind === 'group-member'/);
  assert.match(networkSource, /const droppedToExistingGroup =/);
  assert.match(networkSource, /moveMemberBetweenGroups\([\s\S]*holdDrag\.originalWorkspace,[\s\S]*holdDrag\.key,[\s\S]*holdDrag\.groupId,[\s\S]*droppedToExistingGroup\.id/);
  assert.match(networkSource, /memberDropGroupId === group\.id \? ' dropTarget' : ''/);
});

test('group transfer targeting stays coordinate-owned and closes management overlays', () => {
  assert.doesNotMatch(networkSource, /elementFromPoint|elementsFromPoint/);
  assert.match(networkSource, /if \(kind === 'group-member'\) setGroupsOpen\(false\)/);
  assert.match(networkSource, /if \(kind === 'group-member'\) \{[\s\S]{0,220}setSelectedWallet\(null\);[\s\S]{0,220}setManagedGroupId\(null\);[\s\S]{0,220}setGroupsOpen\(false\)/);
  assert.match(networkSource, /\.groupsList\{max-height:216px;overflow-y:auto;overscroll-behavior:contain/);
  assert.match(networkSource, /\.groupManageMembers\{max-height:216px;overflow-y:auto;overscroll-behavior:contain/);
});

test('member removal and group dissolution preserve current visible node positions', () => {
  assert.match(workspaceSource, /export function removeWorkspaceMemberFromGroupAtPoint/);
  assert.match(workspaceSource, /point \? withNodePosition\(withoutMember, key, point\) : withoutMember/);
  assert.match(workspaceSource, /export function removeWorkspaceGroupAtMemberPoints/);
  assert.match(workspaceSource, /if \(point\) next = withNodePosition\(next, key, point\)/);
  assert.match(networkSource, /const displayedChildPointByWallet = useMemo/);
  assert.match(networkSource, /const materializeExpandedGroupOffsets = useCallback/);
  assert.match(networkSource, /materializeExpandedGroupOffsets\(workspace, managedGroup\.id\)/);
  assert.match(networkSource, /removeWorkspaceMemberFromGroupAtPoint\(prepared, key, point\)/);
  assert.match(networkSource, /removeWorkspaceGroupAtMemberPoints\(workspace, managedGroup\.id, memberPoints\)/);
});

test('long-press layout movement updates runtime state without synchronous storage churn', () => {
  const runtimeStart = networkSource.indexOf('const updateWorkspaceRuntime = useCallback');
  const flushStart = networkSource.indexOf('const flushWorkspaceStore = useCallback');
  const navigationStart = networkSource.indexOf('const beginNavigationMotion = useCallback');
  assert.ok(runtimeStart >= 0 && flushStart > runtimeStart && navigationStart > flushStart);
  const runtimeSource = networkSource.slice(runtimeStart, flushStart);
  const flushSource = networkSource.slice(flushStart, navigationStart);
  assert.doesNotMatch(runtimeSource, /localStorage\.setItem/);
  assert.match(flushSource, /localStorage\.setItem/);
  assert.match(networkSource, /else if \(holdDrag\.moved\) \{\s*flushWorkspaceStore\(\)/);
  assert.match(networkSource, /pointercancel[\s\S]{0,220}persistFocusWorkspace\(holdDrag\.originalWorkspace\)/);
});

test('stored group workspaces normalize duplicate group ids and duplicate member ownership', () => {
  assert.match(workspaceSource, /const seenGroupIds = new Set<string>\(\)/);
  assert.match(workspaceSource, /const assignedMembers = new Set<string>\(\)/);
  assert.match(workspaceSource, /seenGroupIds\.has\(groupId\)/);
  assert.match(workspaceSource, /!assignedMembers\.has\(wallet\)/);
  assert.match(workspaceSource, /seenGroupIds\.add\(groupId\)/);
  assert.match(workspaceSource, /members\.forEach\(\(member\) => assignedMembers\.add\(member\)\)/);
});
