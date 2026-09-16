import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  guideSource,
  safetySource,
  v47Source,
  v50Source,
  v61Source,
  v63Source,
  v68Source,
] = await Promise.all([
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/NetworkInteractionSafety.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV47.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV50.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV61.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV63.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV68.tsx', 'utf8'),
]);

test('both canary and normal Network paths use the interaction safety boundary', () => {
  const uses = guideSource.match(/<NetworkInteractionSafety/g) ?? [];
  assert.equal(uses.length, 2);
  assert.match(guideSource, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.match(guideSource, /<AppNetworkHub locale=\{locale\} \/>/);
});

test('safety boundary rejects non-primary mouse input and marks third-touch input for suppression', () => {
  assert.match(safetySource, /event\.pointerType === 'mouse' && event\.button !== 0/);
  assert.match(safetySource, /previousTouchCount >= 2/);
  assert.match(safetySource, /ignoredPointers\.current\.add\(event\.pointerId\)/);
  assert.match(safetySource, /event\.stopPropagation\(\)/);
});

test('interrupted active gestures are observed at window capture and remount the Network stack', () => {
  assert.match(safetySource, /window\.addEventListener\('pointerdown', observePointerDown, true\)/);
  assert.match(safetySource, /activePointers\.current\.set\(event\.pointerId/);
  assert.match(safetySource, /activePointers\.current\.size === 0 && ignoredPointers\.current\.size === 0/);
  assert.match(safetySource, /setEpoch\(\(value\) => value \+ 1\)/);
  assert.match(safetySource, /<Fragment key=\{epoch\}>/);
  assert.match(safetySource, /window\.addEventListener\('blur'/);
  assert.match(safetySource, /window\.addEventListener\('pagehide'/);
  assert.match(safetySource, /document\.addEventListener\('visibilitychange'/);
});

test('V47 direct group drag composes persisted offsets exactly once', () => {
  for (const variable of [
    '--v42-group-dx', '--v42-group-dy',
    '--v50-adjust-x', '--v50-adjust-y',
    '--v52-adjust-x', '--v52-adjust-y',
    '--v63-adjust-x', '--v63-adjust-y',
    '--v47-drag-dx', '--v47-drag-dy',
  ]) {
    assert.match(v47Source, new RegExp(variable.replaceAll('-', '\\-')));
  }
  assert.match(v47Source, /nodeCoordinate\(node, 'x'\)/);
  assert.match(v47Source, /nodeCoordinate\(node, 'y'\)/);
  assert.doesNotMatch(v47Source, /getPropertyValue\(`--v50-drag-d\$\{suffix\}`\)/);
  assert.doesNotMatch(v47Source, /getPropertyValue\(`--v52-drag-d\$\{suffix\}`\)/);
  assert.doesNotMatch(v47Source, /getPropertyValue\(`--v63-drag-\$\{suffix\}`\)/);
  assert.doesNotMatch(v47Source, /var\(--v50-drag-d[xy],0px\)/);
  assert.doesNotMatch(v47Source, /var\(--v52-drag-d[xy],0px\)/);
  assert.doesNotMatch(v47Source, /var\(--v63-drag-[xy],0px\)/);
});

test('V63 reset stays authoritative for the session when localStorage rejects the write', () => {
  assert.match(v63Source, /const runtimeResetPrefixes = new Set<string>\(\)/);
  assert.match(v63Source, /maskRuntimeResetPositions\(readJson<PositionStore>/);
  assert.match(v63Source, /runtimeResetPrefixes\.add\(prefix\)/);
  assert.match(v63Source, /Positions reset for this session; couldn’t update saved positions\./);
  assert.match(v63Source, /runtimeResetPrefixes\.clear\(\)/);
  const resetStart = v63Source.indexOf('const resetCurrentPositions = () =>');
  const resetEnd = v63Source.indexOf('const onPointerDown =', resetStart);
  const resetBlock = v63Source.slice(resetStart, resetEnd);
  assert.doesNotMatch(resetBlock, /positionStore = readJson/);
});

test('existing-group drop keeps V50/V61 mutation owners separated by panel state while later layers verify or fallback', () => {
  assert.match(v50Source, /dispatchSyntheticDrop\(current\.node, target\.element\)/);
  assert.match(v61Source, /if \(!panelOpen\) \{[\s\S]*?dispatchSyntheticDrop\(current\.node, target\)/);
  assert.doesNotMatch(v63Source, /function dispatchSyntheticDrop|const dispatchSyntheticDrop/);
  assert.match(v63Source, /verifyTransfer\(current\.nodeId, current\.sourceGroupId, targetGroupId\)/);
});

test('V68 fallback replays only after membership confirmation fails', () => {
  const confirmation = v68Source.indexOf('if (membershipConfirmed(root, nodeId, targetGroupId)) return;');
  const replay = v68Source.indexOf('dispatchFallbackDrop(node, target);', confirmation);
  assert.ok(confirmation >= 0);
  assert.ok(replay > confirmation);
  assert.match(v68Source, /FALLBACK_DELAY_MS = 180/);
});
