import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  guideSource,
  networkSource,
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
  readFile('src/lib/networkWorkspace.ts', 'utf8'),
  readFile('src/lib/i18n/networkWorkspaceCopy.ts', 'utf8'),
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/app/api/network/route.ts', 'utf8'),
  readFile('src/app/api/network/summary/route.ts', 'utf8'),
  readFile('src/app/api/network/slots/route.ts', 'utf8'),
  readFile('src/lib/networkCanaryFixture.ts', 'utf8'),
]);

const networkWarmupSource = await readFile('src/components/NetworkIdleWarmup.tsx', 'utf8');

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

test('Network runtime has no DOM observer or global viewport ownership', () => {
  assert.doesNotMatch(networkSource, /MutationObserver/);
  assert.doesNotMatch(workspaceSource, /MutationObserver/);
  assert.doesNotMatch(networkSource, /document\.documentElement\.style\.touchAction/);
  assert.doesNotMatch(networkSource, /meta\[name=["']viewport/);
  assert.match(networkSource, /touch-action:none/);
  assert.match(networkSource, /stage\.addEventListener\('gesturestart'/);
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

test('group creation is a draft-first interaction and preserves member positions for ungrouping', () => {
  assert.match(networkSource, /type GroupDraft/);
  assert.match(networkSource, /groupDropRef/);
  assert.match(networkSource, /groupDraft\.members\.length < 2/);
  assert.match(networkSource, /addWorkspaceGroup\(workspace/);
  assert.match(networkSource, /removeWorkspaceGroup\(current, selectedGroup\.id\)/);
  assert.match(networkSource, /moveWorkspaceMemberToGroup/);
  assert.match(networkSource, /withWorkspaceGroupCollapsed/);
  assert.match(networkSource, /groupsOpen/);
  assert.match(networkSource, /continuationEdge/);
  const removeStart = workspaceSource.indexOf('export function removeWorkspaceGroup');
  const removeEnd = workspaceSource.indexOf('export function groupContainingWallet', removeStart);
  assert.ok(removeStart >= 0 && removeEnd > removeStart);
  const removeGroupSource = workspaceSource.slice(removeStart, removeEnd);
  assert.match(removeGroupSource, /groups: workspace\.groups\.filter/);
  assert.doesNotMatch(removeGroupSource, /positions\s*:/);
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

test('Network first paint is immediate, warmed, and never swaps to a blocking loading card', () => {
  assert.match(networkRouteSource, /fastInitial = request\.nextUrl\.searchParams\.get\('fast'\) === '1'/);
  assert.match(networkRouteSource, /const round = fastInitial \? null : await readCurrentRoundContext\(\)/);
  assert.match(networkSource, /if \(options\.fast\) params\.set\('fast', '1'\)/);
  assert.match(networkSource, /getCachedNetworkRoot\(wallet\)/);
  assert.match(networkSource, /provisionalNetworkData\(wallet\)/);
  assert.match(networkSource, /rememberNetworkRoot\(requestWallet, payload\)/);
  assert.match(networkSource, /setLoadState\('ready'\)[\s\S]*void fetchNetwork\(requestWallet\)\.then/);
  assert.match(networkWarmupSource, /prefetchNetworkRoot\(wallet\)/);
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
  assert.match(networkSource, /const \[inviteSlots, setInviteSlots\] = useState<InviteSlotState\[\]>\(\[\]\)/);
  assert.match(networkSource, /positionedInviteSlots/);
  assert.doesNotMatch(networkSource, /2 - currentData\.children\.length/);
});

test('available and in-progress invite slots are movable like ordinary nodes', () => {
  assert.match(workspaceSource, /function cleanPositionKey/);
  assert.match(workspaceSource, /\^slot:\[12\]\$/);
  assert.match(networkSource, /kind: 'node' \| 'slot' \| 'group'/);
  assert.match(networkSource, /beginWorkspaceDrag\(event, 'slot', slot\.key, point\)/);
  assert.match(networkSource, /beginHoldDrag\(event, slot\.key, point, 'slot'\)/);
  assert.match(networkSource, /withNodePosition\(current, workspaceDrag\.key, nextPoint\)/);
  assert.match(networkSource, /progressInviteNode/);
  assert.match(networkSource, /--slot-progress/);
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
  assert.match(networkSource, /if \(!inviteSlotsReady && !introReadyFallback\) return/);
  assert.doesNotMatch(networkSource, /INTRO_SESSION_PREFIX|veinvite-network-intro-v5/);
  assert.match(networkSource, /breadcrumbs\.rootOnly\{display:none\}/);
  assert.match(networkSource, /width:min\(100%,520px\)/);
  assert.doesNotMatch(networkSource, /\.personNode\{min-width:92px;padding:7px/);
  assert.doesNotMatch(networkSource, /background-size:auto,28px 28px,28px 28px/);
});

test('Network entry repeats a stable YOU-to-fit motion on every mount without stale session camera restore', () => {
  assert.doesNotMatch(networkSource, /sessionStorage/);
  assert.doesNotMatch(networkSource, /StoredRuntimeState|runtimeSessionKey|readStoredRuntimeState/);
  assert.match(networkSource, /const \[rootTopologyReady, setRootTopologyReady\] = useState\(false\)/);
  assert.match(networkSource, /const \[inviteSlotsReady, setInviteSlotsReady\] = useState\(false\)/);
  assert.match(networkSource, /const \[stageStable, setStageStable\] = useState\(false\)/);
  assert.match(networkSource, /requestAnimationFrame[\s\S]*requestAnimationFrame/);
  assert.match(networkSource, /setView\(centeredView\(stageSize, 1\)\)[\s\S]*setIntroActive\(true\)[\s\S]*fitNetwork\(\)/);
  assert.match(networkSource, /const stopIntroForInteraction = useCallback/);
  assert.match(networkSource, /onPointerDownCapture[\s\S]*stopIntroForInteraction\(\)/);
  assert.match(networkSource, /onWheel[\s\S]*stopIntroForInteraction\(\)/);
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
  assert.match(networkSource, /hold\.armed = true;\s*triggerHoldHaptic\(\);\s*setDraggingWorkspaceKey/);
});

test('final Network gestures are coordinate-owned and deliberate', () => {
  assert.match(networkSource, /const HOLD_TO_MOVE_MS = 500/);
  assert.match(networkSource, /const MIN_SCALE = 0\.32/);
  assert.match(networkSource, /const MAX_SCALE = 2\.5/);
  assert.match(networkSource, /nearestVisibleChild/);
  assert.match(networkSource, /nearestVisibleGroup/);
  assert.match(networkSource, /beginHoldDrag/);
  assert.match(networkSource, /holdDrag\.armed/);
  assert.match(networkSource, /persistNodePosition/);
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
  assert.match(networkSource, /className=\{\`editLayoutButton labeledControl/);
  assert.doesNotMatch(networkSource, /className="resetLayoutButton"/);
  assert.doesNotMatch(networkSource, /className="saveLayoutButton"/);
  assert.doesNotMatch(networkSource, /className="cancelLayoutButton"/);
  assert.doesNotMatch(networkSource, /groupBuilderAnchor/);
  assert.match(networkSource, /continuationEdge/);
  assert.doesNotMatch(networkSource, /hidden descendants|\+N|\+15/);
});

test('edit-mode drag commits only on completed drop and provisional group drops restore the original node position', () => {
  assert.match(networkSource, /originalWorkspace: cloneNetworkFocusWorkspace\(workspace\)/);
  assert.match(networkSource, /setDraftWorkspace\(\(current\) => \{[\s\S]*draftWorkspaceRef\.current = next/);
  assert.match(networkSource, /if \(event\.type !== 'pointerup'\) \{[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)\)/);
  assert.match(networkSource, /insideDraft[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)\)/);
  assert.match(networkSource, /commitCurrentDraftWorkspace\(\)/);
  assert.match(networkSource, /moveWorkspaceMemberToGroup\(drag\.originalWorkspace, drag\.key, targetGroup\.id\)/);
});

test('edit drag cancellation restores the pre-drag workspace for multitouch and provisional grouping', () => {
  assert.match(networkSource, /const activeWorkspaceDrag = workspaceDragRef\.current/);
  assert.match(networkSource, /setEditingWorkspace\(cloneNetworkFocusWorkspace\(activeWorkspaceDrag\.originalWorkspace\)\)/);
  assert.match(networkSource, /groupingTimerRef\.current = window\.setTimeout\(\(\) => \{[\s\S]*setEditingWorkspace\(cloneNetworkFocusWorkspace\(drag\.originalWorkspace\)\)[\s\S]*setGroupDraft/);
  assert.match(networkSource, /const finishLayoutEdit = useCallback[\s\S]*window\.clearTimeout\(groupingTimerRef\.current\)/);
});

test('group transfers are unique, same-group drops are no-ops, and long-press native UI stays blocked', () => {
  assert.match(workspaceSource, /target\.members\.some\(\(member\) => member\.toLowerCase\(\) === key\)\) return workspace/);
  assert.match(workspaceSource, /const members = group\.members\.filter\(\(member\) => member\.toLowerCase\(\) !== key\)/);
  assert.match(workspaceSource, /Array\.from\(new Set\(members\)\)/);
  assert.match(networkSource, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
});
