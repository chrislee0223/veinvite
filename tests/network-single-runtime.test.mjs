import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const [guideSource, networkSource, networkRouteSource] = await Promise.all([
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/app/api/network/route.ts', 'utf8'),
]);

const componentFiles = await readdir('src/components');
const qaFiles = await readdir('src/qa');

test('Network has exactly one production component path and no version wrapper chain', () => {
  assert.match(guideSource, /<AppNetworkHub locale=\{locale\} \/>/);
  assert.doesNotMatch(guideSource, /AppNetworkCanaryV\d+/);
  assert.doesNotMatch(guideSource, /NETWORK_CANARY_WALLET/);
  assert.equal(componentFiles.some((name) => /^AppNetworkCanaryV\d+\.tsx$/.test(name)), false);
  assert.equal(qaFiles.some((name) => /^QaNetworkRadialPlaygroundV\d+\.tsx$/.test(name)), false);
});

test('Network runtime has no DOM observer or global viewport ownership', () => {
  assert.doesNotMatch(networkSource, /MutationObserver/);
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
  assert.match(networkSource, /const exactParentView = returnViewByChildRef\.current\.get\(current\)/);
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

test('single runtime keeps the authenticated read-only Network API contract', () => {
  assert.match(networkRouteSource, /requireWalletSession/);
  assert.match(networkRouteSource, /canUseNetworkSurface\('my'/);
  assert.match(networkRouteSource, /read_referral_network_focus_v2/);
  assert.doesNotMatch(networkSource, /supabaseAdmin/);
  assert.doesNotMatch(networkSource, /\/api\/rewards/);
  assert.doesNotMatch(networkSource, /request_reward_claim/);
});

test('navigation animation honors reduced motion and does not animate idle nodes', () => {
  assert.match(networkSource, /worldContent\.nav-forward/);
  assert.match(networkSource, /worldContent\.nav-back/);
  assert.match(networkSource, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(networkSource, /ambient.*translate/i);
  assert.doesNotMatch(networkSource, /setInterval\(/);
});
