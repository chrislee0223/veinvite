import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const guide = read('src/components/AppGuide.tsx');
const v72 = read('src/components/AppNetworkCanaryV72.tsx');

test('developer wallet routes through V72 while general users keep AppNetworkHub', () => {
  assert.match(guide, /import\('\.\/AppNetworkCanaryV72'\)/);
  assert.match(guide, /<AppNetworkCanaryV72 key=\{wallet\.toLowerCase\(\)\} locale=\{locale\} \/>/);
  assert.match(guide, /<AppNetworkHub locale=\{locale\} \/>/);
});

test('V72 preserves V71 and owns only narrow interaction hardening', () => {
  assert.match(v72, /import \{ AppNetworkCanaryV71 \} from '\.\/AppNetworkCanaryV71'/);
  assert.match(v72, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.doesNotMatch(v72, /fetch\s*\(/);
  assert.doesNotMatch(v72, /supabase/i);
  assert.doesNotMatch(v72, /reward/i);
  assert.doesNotMatch(v72, /MutationObserver/);
  assert.doesNotMatch(v72, /requestAnimationFrame/);
  assert.doesNotMatch(v72, /cloneNode/);
  assert.doesNotMatch(v72, /v71MobileCommitFreezeLayer/);
  assert.doesNotMatch(v72, /v72GroupCommitTransition/);
});

test('group editor swallows the later node click before profile selection can repaint it', () => {
  assert.match(v72, /document\.addEventListener\('click', onClickCapture, true\)/);
  assert.match(v72, /const editorActive = Boolean\(/);
  assert.match(v72, /clearCanvasSelection\(root\)/);
  assert.match(v72, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*event\.stopImmediatePropagation\(\);/s);
});

test('Create rejects already-grouped nodes before V71 optimistic mobile paint', () => {
  assert.match(v72, /creating &&\s*\(node\.classList\.contains\('v42LockedMember'\) \|\| node\.classList\.contains\('v42GroupedMember'\)\)/s);
  assert.match(v72, /document\.addEventListener\('pointerdown', onPointerDownCapture, true\)/);
  assert.match(v72, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*event\.stopImmediatePropagation\(\);/s);
});

test('parent return targets the final restored parent camera before React swaps network content', () => {
  assert.match(v72, /const PARENT_RETURN_RELEASE_POLL_MS = 16/);
  assert.match(v72, /const PARENT_RETURN_FALLBACK_MS = 220/);
  assert.match(v72, /const ZOOM_STEP = 0\.12/);
  assert.match(v72, /button\?\.classList\.contains\('viewNetwork'\)/);
  assert.match(v72, /parentViews\.push\(snapshot\)/);
  assert.match(v72, /button\?\.closest\('\.navActions'\) && button\.textContent\?\.includes\('Inviter'\)/);
  assert.match(v72, /const snapshot = parentViews\.pop\(\) \?\? null/);
  assert.match(v72, /targetParentReturn\(root, snapshot\)/);
  assert.match(v72, /v72ParentReturnTarget/);
  assert.match(v72, /--v72-parent-return-transform/);
  assert.match(v72, /translate3d\(\$\{snapshot\.cameraX\}px,\$\{snapshot\.cameraY\}px,0\) scale\(\$\{targetZoom\}\)/);
  assert.doesNotMatch(v72, /getComputedStyle\(scene\)\.transform/);
});

test('parent target stays pinned through V50 restore and the mobile interaction transition-none window', () => {
  assert.match(v72, /document\.addEventListener\('pointerup', onPointerUpCapture, true\)/);
  assert.match(v72, /event\.isTrusted \|\| event\.pointerType !== 'mouse'/);
  assert.match(v72, /target\.classList\.contains\('stage'\)/);
  assert.match(v72, /releaseWhenInteractionSettles\(root\)/);
  assert.match(v72, /root\.classList\.contains\('veinviteInteracting'\)/);
  assert.match(v72, /PARENT_RETURN_RELEASE_POLL_MS/);
  assert.match(v72, /transition:none!important/);
  assert.doesNotMatch(v72, /visibility/);
  assert.doesNotMatch(v72, /opacity/);
});

test('V72 deliberately leaves the existing V71 mobile save stabilization untouched', () => {
  assert.doesNotMatch(v72, /v42CreateActions/);
  assert.doesNotMatch(v72, /saveButton/);
  assert.doesNotMatch(v72, /v71MobileCommitFreezeLayer/);
});
