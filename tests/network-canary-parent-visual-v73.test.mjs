import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const guide = read('src/components/AppGuide.tsx');
const v75 = read('src/components/AppNetworkCanaryV75.tsx');
const v74 = read('src/components/AppNetworkCanaryV74.tsx');
const v73 = read('src/components/AppNetworkCanaryV73.tsx');

test('efcb developer canary routes through V75 while V75 preserves V74, V73 and V72 underneath', () => {
  assert.match(guide, /0xeff325935b63299e9eeda79931bed6ec119aefcb/);
  assert.match(guide, /import\('\.\/AppNetworkCanaryV75'\)/);
  assert.match(guide, /<AppNetworkCanaryV75 key=\{wallet\.toLowerCase\(\)\} locale=\{locale\} \/>/);
  assert.match(v75, /import \{ AppNetworkCanaryV74 \} from '\.\/AppNetworkCanaryV74'/);
  assert.match(v75, /<AppNetworkCanaryV74 locale=\{locale\} \/>/);
  assert.match(v74, /import \{ AppNetworkCanaryV73 \} from '\.\/AppNetworkCanaryV73'/);
  assert.match(v74, /<AppNetworkCanaryV73 locale=\{locale\} \/>/);
  assert.match(v73, /import \{ AppNetworkCanaryV72 \} from '\.\/AppNetworkCanaryV72'/);
  assert.match(v73, /<AppNetworkCanaryV72 locale=\{locale\} \/>/);
});

test('V73 stores the actual rendered parent DOM instead of reconstructing node geometry', () => {
  assert.match(v73, /root\.cloneNode\(true\) as HTMLElement/);
  assert.match(v73, /parentVisuals\.push\(captureParentVisual\(root\)\)/);
  assert.match(v73, /button\.classList\.contains\('viewNetwork'\)/);
  assert.match(v73, /const snapshot = parentVisuals\.pop\(\) \?\? null/);
  assert.match(v73, /showPreservedParent\(root, snapshot\)/);
  assert.doesNotMatch(v73, /cameraX|cameraY|ZOOM_STEP|restoredZoom/);
});

test('V73 hides the live React Network before parent replacement can paint', () => {
  assert.match(v73, /root\.classList\.add\('v73LiveReturnHidden'\)/);
  assert.match(v73, /document\.body\.appendChild\(activeOverlay\)/);
  assert.match(v73, /\.productionNetworkCanaryV45\.v73LiveReturnHidden\{\s*visibility:hidden!important/s);
  assert.match(v73, /\.productionNetworkCanaryV45\.v73ParentVisualOverlay\{/);
  assert.match(v73, /z-index:2147483000!important/);
  assert.match(v73, /pointer-events:none!important/);
});

test('V73 waits for V50 and V72 to settle under the preserved parent visual', () => {
  assert.match(v73, /RETURN_SETTLE_QUIET_MS = 140/);
  assert.match(v73, /activeRoot\.classList\.contains\('veinviteInteracting'\)/);
  assert.match(v73, /activeRoot\.classList\.contains\('v50NetworkTransition'\)/);
  assert.match(v73, /activeRoot\.classList\.contains\('v72ParentReturnTarget'\)/);
  assert.match(v73, /new MutationObserver\(\(\) => \{/);
  assert.match(v73, /lastLiveMutationAt = performance\.now\(\)/);
  assert.match(v73, /attributeFilter: \['class', 'style'\]/);
});

test('V73 freezes decorative node motion across the overlay-to-live handoff', () => {
  assert.match(v73, /clone\.classList\.add\('v73ParentVisualOverlay', 'v73ReturnMotionFrozen'\)/);
  assert.match(v73, /root\.classList\.add\('v73ReturnMotionFrozen'\)/);
  assert.match(v73, /\.productionNetworkCanaryV45\.v73ReturnMotionFrozen :is\(/);
  assert.match(v73, /animation:none!important/);
  assert.match(v73, /animation-delay:0s!important/);
  assert.match(v73, /translate:none!important/);
  assert.match(v73, /root\.classList\.remove\('v73ReturnMotionFrozen'\)/);
});

test('V73 reveals the final live parent underneath the overlay before removing the overlay', () => {
  const revealIndex = v73.indexOf("activeRoot.classList.remove('v73LiveReturnHidden')");
  const removeIndex = v73.indexOf('activeOverlay?.remove()');
  assert.ok(revealIndex >= 0);
  assert.ok(removeIndex >= 0);
  assert.ok(revealIndex < removeIndex);
  assert.match(v73, /RETURN_REVEAL_QUIET_MS = 120/);
  assert.match(v73, /finishOverlayAfterTwoPaints/);
  assert.match(v73, /removeFrameOne = window\.requestAnimationFrame/);
  assert.match(v73, /removeFrameTwo = window\.requestAnimationFrame/);
});

test('V73 snapshot is visual-only and cannot mutate network, reward, API, or database state', () => {
  assert.doesNotMatch(v73, /fetch\s*\(/);
  assert.doesNotMatch(v73, /supabase/i);
  assert.doesNotMatch(v73, /reward/i);
  assert.doesNotMatch(v73, /localStorage\.setItem/);
  assert.doesNotMatch(v73, /sessionStorage\.setItem/);
});
