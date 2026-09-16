import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [v71Source, groupSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/NetworkReleaseGroups.tsx', 'utf8'),
]);

test('release V71 composes real groups without reconnecting the QA radial stack', () => {
  assert.match(v71Source, /NetworkReleaseGroups/);
  assert.match(v71Source, /<NetworkReleaseSlots locale=\{locale\}>[\s\S]*?<NetworkReleaseGroups locale=\{locale\}>[\s\S]*?<NetworkReleaseGestureBoundary>[\s\S]*?<AppNetworkReleaseCanvas locale=\{locale\} \/>/);
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
