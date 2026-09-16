import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [v71Source, slotSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/NetworkReleaseSlots.tsx', 'utf8'),
]);

test('release V71 wraps the real canvas with authenticated invite slots', () => {
  assert.match(v71Source, /NetworkReleaseSlots/);
  assert.match(v71Source, /<NetworkReleaseSlots locale=\{locale\}>[\s\S]*?<NetworkReleasePositionReset locale=\{locale\}>[\s\S]*?<NetworkReleaseGroupInteractionGuard>[\s\S]*?<NetworkReleaseGroups locale=\{locale\}>[\s\S]*?<NetworkReleaseGestureBoundary>[\s\S]*?<AppNetworkReleaseCanvas locale=\{locale\} \/>/);
  assert.match(slotSource, /fetch\(`\/api\/referral-links\?inviter=\$\{encodeURIComponent\(address\)\}`/);
  assert.match(slotSource, /credentials:\s*'include'/);
  assert.match(slotSource, /cache:\s*'no-store'/);
});

test('invite slots appear only on the wallet root and never guess more than two', () => {
  assert.match(slotSource, /setIsRoot\(Boolean\(center\?\.classList\.contains\('root'\)\)\)/);
  assert.match(slotSource, /const slotCount = isRoot \? slotsAvailable : 0/);
  assert.match(slotSource, /Math\.max\(0, Math\.min\(2, Math\.trunc\(count!\)\)\)/);
  assert.match(slotSource, /setSlotsAvailable\(0\);[\s\S]*?if \(!wallet\) return/);
});

test('slot placement avoids visible moved nodes and group hubs instead of using fixed overlapping coordinates', () => {
  assert.match(slotSource, /querySelectorAll<HTMLElement>\('\.releasePerson'\)/);
  assert.match(slotSource, /querySelectorAll<HTMLElement>\('\.releaseGroupHub'\)/);
  assert.match(slotSource, /--release-node-offset-x/);
  assert.match(slotSource, /--release-node-offset-y/);
  assert.match(slotSource, /!node\.classList\.contains\('releaseGroupHidden'\)/);
  assert.match(slotSource, /chooseSlotPoints\(slotCount, occupiedPoints\)/);
  assert.match(slotSource, /Math\.hypot\(candidate\.x - point\.x, candidate\.y - point\.y\)/);
  assert.doesNotMatch(slotSource, /index === 0 \? \{ x: -68, y: 118 \}/);
});

test('slot geometry observer ignores group-selection paint when geometry did not change', () => {
  assert.match(slotSource, /function geometrySignature\(boundary: HTMLElement\)/);
  assert.match(slotSource, /const nextSignature = geometrySignature\(boundary\)/);
  assert.match(slotSource, /if \(nextSignature === signature\) return/);
  assert.match(slotSource, /target\.matches\('\.releaseCenter,\.releasePerson'\)/);
  assert.match(slotSource, /containsGeometryNode/);
});
