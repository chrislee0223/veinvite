import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, dragGhostSource, localeLayoutSource, rootIdentitySource, interactionOwnershipSource, parentVisualSource, guideSource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV68.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV72.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV73.tsx', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
]);

test('V68 still wraps the stable V67 Network surface behind V73, V72, V71, V70 and V69', () => {
  assert.match(source, /AppNetworkCanaryV67/);
  assert.match(source, /<AppNetworkCanaryV67 locale=\{locale\} \/>/);
  assert.match(guideSource, /AppNetworkCanaryV73/);
  assert.match(parentVisualSource, /AppNetworkCanaryV72/);
  assert.match(parentVisualSource, /<AppNetworkCanaryV72 locale=\{locale\} \/>/);
  assert.match(interactionOwnershipSource, /AppNetworkCanaryV71/);
  assert.match(interactionOwnershipSource, /<AppNetworkCanaryV71 locale=\{locale\} \/>/);
  assert.match(rootIdentitySource, /AppNetworkCanaryV70/);
  assert.match(rootIdentitySource, /<AppNetworkCanaryV70 locale=\{locale\} \/>/);
  assert.match(localeLayoutSource, /AppNetworkCanaryV69/);
  assert.match(localeLayoutSource, /<AppNetworkCanaryV69 locale=\{locale\} \/>/);
  assert.match(dragGhostSource, /AppNetworkCanaryV68/);
  assert.match(dragGhostSource, /<AppNetworkCanaryV68 locale=\{locale\} \/>/);
});

test('V68 is an assurance layer and does not own Network geometry or persistence', () => {
  for (const forbidden of [
    'localStorage.setItem',
    'sessionStorage',
    'MutationObserver',
    'requestAnimationFrame',
    "style.setProperty('--x'",
    "style.setProperty('--y'",
    "style.setProperty('--gx'",
    "style.setProperty('--gy'",
    '--v63-adjust-',
    '--v63-drag-',
    '--v50-adjust-',
    '--v52-adjust-',
    '--v42-group-d',
  ]) {
    assert.ok(!source.includes(forbidden), `V68 must not take ownership of geometry/persistence: ${forbidden}`);
  }
});

test('V68 waits for the existing drop path before sending one fallback drop', () => {
  assert.match(source, /const FALLBACK_DELAY_MS = 180/);
  assert.match(source, /if \(membershipConfirmed\(root, nodeId, targetGroupId\)\) return;[\s\S]*?dispatchFallbackDrop\(node, target\)/);
  assert.match(source, /fallbackTimers\.add\(timer\)/);
  assert.match(source, /fallbackTimers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
});

test('V68 preserves the V63 drop-target priority contract', () => {
  const remove = source.indexOf("'.v42RemoveZone'");
  const create = source.indexOf("'.v44CreateDropMore'");
  const fresh = source.indexOf("'.v44NewGroupDrop'");
  const row = source.indexOf("'.v42GroupRow[data-v42-group-drop]'");
  const hub = source.indexOf("'.v42GroupHub[data-v42-group-drop]'");
  assert.ok(remove >= 0 && create > remove && fresh > create && row > fresh && hub > row);
  assert.match(source, /const hubPad = Math\.min\(30, Math\.max\(12, 15 \/ Math\.max\(\.5, zoom\)\)\)/);
});

test('V68 only assists a real moved node dropped on a different existing group', () => {
  assert.match(source, /Math\.hypot\(event\.clientX - current\.startX, event\.clientY - current\.startY\) >= DRAG_THRESHOLD_PX/);
  assert.match(source, /if \(action\?\.kind === 'existing'\)/);
  assert.match(source, /targetGroupId && targetGroupId !== sourceGroupId/);
  assert.doesNotMatch(source, /scheduleFallback\([^\n]*action\.kind === 'remove'/);
});

test('V68 ignores synthetic events and cancels on pinch or pointer cancellation', () => {
  assert.match(source, /if \(!event\.isTrusted \|\| pinchBlocked/);
  assert.match(source, /if \(touchPointers\.size > 1\)[\s\S]*?pinchBlocked = true;[\s\S]*?cancelDrag\(\)/);
  assert.match(source, /window\.addEventListener\('pointercancel', cancelPointer, true\)/);
  assert.match(source, /if \(touchPointers\.size === 0\) pinchBlocked = false/);
});

test('fallback still delegates the actual membership mutation to the mature V42 pointer contract', () => {
  assert.match(source, /circle\.dispatchEvent\(new PointerEvent\('pointerdown'/);
  assert.match(source, /circle\.dispatchEvent\(new PointerEvent\('pointermove'/);
  assert.match(source, /circle\.dispatchEvent\(new PointerEvent\('pointerup'/);
  assert.match(source, /pointerType: 'mouse'/);
  assert.doesNotMatch(source, /\.members\.(?:push|splice|pop|shift|unshift)\(/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
});
