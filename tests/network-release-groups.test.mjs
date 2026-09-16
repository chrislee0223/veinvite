import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [v71Source, groupSource, guardSource, resetSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/NetworkReleaseGroups.tsx', 'utf8'),
  readFile('src/components/NetworkReleaseGroupInteractionGuard.tsx', 'utf8'),
  readFile('src/components/NetworkReleasePositionReset.tsx', 'utf8'),
]);

test('release V71 composes real groups and position recovery without reconnecting the QA radial stack', () => {
  assert.match(v71Source, /NetworkReleaseGroups/);
  assert.match(v71Source, /NetworkReleaseGroupInteractionGuard/);
  assert.match(v71Source, /NetworkReleasePositionReset/);
  assert.match(v71Source, /<NetworkReleaseSlots locale=\{locale\}>[\s\S]*?<NetworkReleasePositionReset locale=\{locale\}>[\s\S]*?<NetworkReleaseGroupInteractionGuard>[\s\S]*?<NetworkReleaseGroups locale=\{locale\}>[\s\S]*?<NetworkReleaseGestureBoundary>[\s\S]*?<AppNetworkReleaseCanvas locale=\{locale\} \/>/);
  assert.doesNotMatch(v71Source, /AppNetworkCanaryV70|QaNetworkRadialPlayground/);
});

test('release groups are wallet-scoped and focus-scoped local presentation state', () => {
  assert.match(groupSource, /const STORAGE_PREFIX = 'veinvite-network-release-groups-v1:';/);
  assert.match(groupSource, /localStorage\.getItem\(`\$\{STORAGE_PREFIX\}\$\{walletKey\}`\)/);
  assert.match(groupSource, /hydratedWallet !== walletKey/);
  assert.match(groupSource, /localStorage\.setItem\(`\$\{STORAGE_PREFIX\}\$\{walletKey\}`/);
  assert.match(groupSource, /groups\.filter\(\(group\) => group\.scope === focusWallet\)/);
  assert.doesNotMatch(groupSource, /\/api\/.+group/i);
});

test('group edit visual selection updates on the first click', () => {
  assert.match(groupSource, /addEventListener\('click', onClickCapture, true\)/);
  assert.match(groupSource, /selected:\s*exists[\s\S]*?current\.selected\.filter\(\(value\) => value !== address\)[\s\S]*?\[\.\.\.current\.selected, address\]/);
  assert.match(groupSource, /releasePerson\.releaseGroupDraftUnselected\{opacity:\.42!important/);
  assert.match(groupSource, /releasePerson\.releaseGroupDraftSelected\{opacity:1!important/);
});

test('group editor clears stale canvas selection so group membership is the only active highlight owner', () => {
  assert.match(guardSource, /releasePerson\.selected/);
  assert.match(guardSource, /releaseCenter\[data-release-interactive="true"\]/);
  assert.match(guardSource, /requestAnimationFrame\(clearCanvasSelection\)/);
  assert.match(guardSource, /networkReleaseGroupsBoundary\.releaseGroupEditing \.releasePerson\.releaseGroupDraftUnselected/);
  assert.match(guardSource, /networkReleaseGroupsBoundary\.releaseGroupEditing \.releasePerson\.releaseGroupDraftSelected/);
  assert.doesNotMatch(v71Source, /canarySelectedNode|v42SelectedMember/);
  assert.doesNotMatch(guardSource, /canarySelectedNode|v42SelectedMember/);
});

test('saving an edited group preserves selected members that are clustered out of the DOM', () => {
  assert.match(groupSource, /editor\.selected\.map\(keyWallet\)\.filter\(validWallet\)/);
  assert.doesNotMatch(groupSource, /visible\.has\(address\)/);
});

test('collapsed groups hide only their represented people and matching direct edges', () => {
  assert.match(groupSource, /const hidden = Boolean\(group\?\.collapsed/);
  assert.match(groupSource, /classList\.toggle\('releaseGroupHidden', hidden\)/);
  assert.match(groupSource, /classList\.toggle\('releaseGroupHiddenEdge', hidden\)/);
});

test('group hub drag is scale-aware, commits the ref-owned last point, and cancels when a pinch begins', () => {
  assert.match(groupSource, /currentSceneScale\(scene\)/);
  assert.match(groupSource, /dxScreen \/ scale/);
  assert.match(groupSource, /previewPosition:\s*startPosition/);
  assert.match(groupSource, /drag\.previewPosition = previewPosition/);
  assert.match(groupSource, /const committedPosition = drag\.previewPosition/);
  assert.match(groupSource, /touchPointersRef\.current\.size > 1[\s\S]*?groupDragRef\.current = null/);
});

test('pointer cancellation clears a release group drag before the inner gesture boundary stops propagation', () => {
  assert.match(groupSource, /const onPointerCancelCapture = \(event: PointerEvent\) =>/);
  assert.match(groupSource, /groupDragRef\.current\?\.pointerId === event\.pointerId[\s\S]*?groupDragRef\.current = null;[\s\S]*?setDragPreview\(null\)/);
  assert.match(groupSource, /addEventListener\('pointercancel', onPointerCancelCapture, true\)/);
});

test('node-position reset clears only the currently focused network for the active root wallet', () => {
  assert.match(resetSource, /const NODE_POSITION_PREFIX = 'veinvite-network-release-node-positions-v1:';/);
  assert.match(resetSource, /const storageKey = `\$\{NODE_POSITION_PREFIX\}\$\{walletKey\}`/);
  assert.match(resetSource, /const prefix = `\$\{focus\}\|`/);
  assert.match(resetSource, /if \(!key\.startsWith\(prefix\)\) return;/);
  assert.match(resetSource, /window\.localStorage\.setItem\(storageKey, JSON\.stringify\(current\)\)/);
  assert.match(resetSource, /window\.location\.reload\(\)/);
});
