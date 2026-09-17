import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const guide = read('src/components/AppGuide.tsx');
const v75 = read('src/components/AppNetworkCanaryV75.tsx');
const v74 = read('src/components/AppNetworkCanaryV74.tsx');
const v72 = read('src/components/AppNetworkCanaryV72.tsx');

test('developer wallet routes through V75 while general users keep AppNetworkHub', () => {
  assert.match(guide, /import\('\.\/AppNetworkCanaryV75'\)/);
  assert.match(guide, /<AppNetworkCanaryV75 key=\{wallet\.toLowerCase\(\)\} locale=\{locale\} \/>/);
  assert.match(v75, /AppNetworkCanaryV74/);
  assert.match(v74, /AppNetworkCanaryV73/);
  assert.match(guide, /<AppNetworkHub locale=\{locale\} \/>/);
});

test('V72 preserves V71 and owns only narrow interaction hardening', () => {
  assert.match(v72, /import \{ AppNetworkCanaryV71 \} from '\.\/AppNetworkCanaryV71'/);
  assert.match(v72, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.doesNotMatch(v72, /fetch\s*\(/);
  assert.doesNotMatch(v72, /supabase/i);
  assert.doesNotMatch(v72, /reward/i);
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
  assert.match(v72, /const PARENT_RETURN_LAYOUT_QUIET_MS = 96/);
  assert.match(v72, /const PARENT_RETURN_FALLBACK_MS = 520/);
  assert.match(v72, /const ZOOM_STEP = 0\.12/);
  assert.match(v72, /button\?\.classList\.contains\('viewNetwork'\)/);
  assert.match(v72, /parentViews\.push\(snapshot\)/);
  assert.match(v72, /button\?\.closest\('\.navActions'\) && button\.textContent\?\.includes\('Inviter'\)/);
  assert.match(v72, /const snapshot = parentViews\.pop\(\) \?\? null/);
  assert.match(v72, /targetParentReturn\(root, snapshot\)/);
  assert.match(v72, /v72ParentReturnTarget/);
  assert.match(v72, /--v72-parent-return-transform/);
  assert.match(v72, /translate3d\(\$\{snapshot\.cameraX\}px,\$\{snapshot\.cameraY\}px,0\) scale\(\$\{targetZoom\}\)/);
});

test('parent return captures the complete painted parent visual state', () => {
  assert.match(v72, /type PaintedElementSnapshot = \{/);
  assert.match(v72, /hidden: boolean/);
  assert.match(v72, /const elementHidden = \(element: HTMLElement\)/);
  assert.match(v72, /element\.classList\.contains\('v42CollapsedMember'\)/);
  assert.match(v72, /people\[id\] = \{ transform, hidden: elementHidden\(node\) \}/);
  assert.match(v72, /const clusters = Array\.from\(root\.querySelectorAll<HTMLElement>\('\.clusterNode'\)\)/);
  assert.match(v72, /return \{ people, groups, slots, clusters \}/);
});

test('parent return locks the previously painted parent node layout until legacy layout mutations go quiet', () => {
  assert.match(v72, /const renderedTransform = \(element: HTMLElement\)/);
  assert.match(v72, /window\.getComputedStyle\(element\)\.transform/);
  assert.match(v72, /snapshot\.layout\.people\[id\]/);
  assert.match(v72, /snapshot\.layout\.groups\[id\]/);
  assert.match(v72, /snapshot\.layout\.slots\[index\]/);
  assert.match(v72, /snapshot\.layout\.clusters\[index\]/);
  assert.match(v72, /new MutationObserver\(\(mutations\) =>/);
  assert.match(v72, /parentLayoutLastMutationAt = performance\.now\(\)/);
  assert.match(v72, /parentLayoutObserver\.observe\(root, \{[\s\S]*attributes: true,[\s\S]*attributeFilter: \['class', 'style'\]/);
  assert.match(v72, /now - parentLayoutLastMutationAt >= PARENT_RETURN_LAYOUT_QUIET_MS/);
  assert.match(v72, /data-v72-parent-return-node/);
  assert.match(v72, /--v72-parent-node-transform/);
  assert.match(v72, /data-v72-parent-return-group/);
  assert.match(v72, /--v72-parent-group-transform/);
  assert.match(v72, /data-v72-parent-return-slot/);
  assert.match(v72, /--v72-parent-slot-transform/);
  assert.match(v72, /data-v72-parent-return-cluster/);
  assert.match(v72, /--v72-parent-cluster-transform/);
});

test('parent return suppresses stale scope elements until the captured parent visual state is restored', () => {
  assert.match(v72, /data-v72-parent-return-hidden/);
  assert.match(v72, /\.personNode:not\(\[data-v72-parent-return-node="1"\]\)/);
  assert.match(v72, /\.personNode\[data-v72-parent-return-hidden="1"\]/);
  assert.match(v72, /\.v42GroupHub:not\(\[data-v72-parent-return-group="1"\]\)/);
  assert.match(v72, /\.slotNode:not\(\[data-v72-parent-return-slot="1"\]\)/);
  assert.match(v72, /\.clusterNode:not\(\[data-v72-parent-return-cluster="1"\]\)/);
  assert.match(v72, /\.v42GroupEdges,\s*\.productionNetworkCanaryV45\.v72ParentReturnTarget \.v50GroupMemberEdges\{\s*opacity:0!important/s);
});

test('unlock cannot wake V39/V42 into one final visible layout pass', () => {
  assert.match(v72, /const guardLegacyObserversDuringUnlock = \(root: HTMLElement\)/);
  assert.match(v72, /groupRoot\.dataset\.v72ParentReturnRelease = '1'/);
  assert.match(v72, /groupRoot\.dataset\.v42TransientDrag = '1'/);
  assert.match(v72, /guardLegacyObserversDuringUnlock\(root\);[\s\S]*root\.classList\.remove\('v72ParentReturnTarget'\)/);
  assert.match(v72, /releaseGuardFrameOne = window\.requestAnimationFrame/);
  assert.match(v72, /releaseGuardFrameTwo = window\.requestAnimationFrame/);
  assert.match(v72, /delete groupRoot\.dataset\.v42TransientDrag/);
});

test('parent layout stays pinned through V50 restore and two paint boundaries after observers are quiet', () => {
  assert.match(v72, /document\.addEventListener\('pointerup', onPointerUpCapture, true\)/);
  assert.match(v72, /event\.isTrusted \|\| event\.pointerType !== 'mouse'/);
  assert.match(v72, /target\.classList\.contains\('stage'\)/);
  assert.match(v72, /releaseWhenInteractionSettles\(root\)/);
  assert.match(v72, /root\.classList\.contains\('veinviteInteracting'\)/);
  assert.match(v72, /layoutQuiet/);
  assert.match(v72, /releaseFrameOne = window\.requestAnimationFrame/);
  assert.match(v72, /releaseFrameTwo = window\.requestAnimationFrame/);
  assert.match(v72, /applyParentLayoutLocks\(root, activeParentSnapshot\)/);
  assert.match(v72, /transition:none!important/);
});

test('V72 deliberately leaves the existing V71 mobile save stabilization untouched', () => {
  assert.doesNotMatch(v72, /v42CreateActions/);
  assert.doesNotMatch(v72, /saveButton/);
  assert.doesNotMatch(v72, /v71MobileCommitFreezeLayer/);
});
