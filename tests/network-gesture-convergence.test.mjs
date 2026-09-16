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

test('safety boundary blocks non-primary mouse input and third touch before inner canvas handlers', () => {
  assert.match(safetySource, /event\.pointerType === 'mouse' && event\.button !== 0/);
  assert.match(safetySource, /activeTouchCount >= 2/);
  assert.match(safetySource, /ignoredPointers\.current\.add\(event\.pointerId\)/);
  assert.match(safetySource, /event\.stopPropagation\(\)/);
});

test('interrupted active gestures remount the Network interaction stack', () => {
  assert.match(safetySource, /activePointers\.current\.size === 0 && ignoredPointers\.current\.size === 0/);
  assert.match(safetySource, /setEpoch\(\(value\) => value \+ 1\)/);
  assert.match(safetySource, /<Fragment key=\{epoch\}>/);
  assert.match(safetySource, /window\.addEventListener\('blur'/);
  assert.match(safetySource, /window\.addEventListener\('pagehide'/);
  assert.match(safetySource, /document\.addEventListener\('visibilitychange'/);
});

test('V47 direct group drag composes every later persisted and transient node offset', () => {
  for (const variable of [
    '--v42-group-dx', '--v42-group-dy',
    '--v50-adjust-x', '--v50-adjust-y',
    '--v52-adjust-x', '--v52-adjust-y',
    '--v63-adjust-x', '--v63-adjust-y',
    '--v50-drag-dx', '--v50-drag-dy',
    '--v52-drag-dx', '--v52-drag-dy',
    '--v63-drag-x', '--v63-drag-y',
    '--v47-drag-dx', '--v47-drag-dy',
  ]) {
    assert.match(v47Source, new RegExp(variable.replaceAll('-', '\\-')));
  }
  assert.match(v47Source, /nodeCoordinate\(node, 'x'\)/);
  assert.match(v47Source, /nodeCoordinate\(node, 'y'\)/);
});

test('existing-group drop has one primary synthetic owner and verification-only later layers', () => {
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
