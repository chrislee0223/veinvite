import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [layoutSource, visualSource, dragGhostSource, stabilitySource, parentReturnSource, parentVisualSource] = await Promise.all([
  readFile('src/qa/QaNetworkRadialPlaygroundV39.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV74.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV72.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV73.tsx', 'utf8'),
]);

test('V39 zoom density changes no longer switch node geometry compression at the detail threshold', () => {
  assert.match(layoutSource, /const midZoom = !clustered && zoom < DETAIL_ZOOM/);
  assert.match(layoutSource, /const compression = compact \? \.89 : \.9/);
  assert.doesNotMatch(layoutSource, /const compression = midZoom/);
  assert.doesNotMatch(layoutSource, /midZoom \? \(compact \? \.82 : \.84\)/);
});

test('V66 removes idle painted-position drift completely', () => {
  assert.match(visualSource, /animation-name:\s*none\s*!important/);
  assert.match(visualSource, /translate:\s*none\s*!important/);
  assert.doesNotMatch(visualSource, /@keyframes\s+v66AmbientFloat/);
});

test('V69 yields ordinary two-finger gestures back to the canvas unless a real create drag already owns them', () => {
  assert.match(dragGhostSource, /const ownsCreateGesture = Boolean\(activeDrag\?\.moved \|\| activeDrag\?\.ghost\)/);
  assert.match(dragGhostSource, /if \(activeDrag\) cancelActiveDrag\(\)/);
  assert.match(dragGhostSource, /if \(ownsCreateGesture\) \{[\s\S]*?multiTouchBlocked = true;[\s\S]*?event\.preventDefault\(\)/);
  assert.doesNotMatch(dragGhostSource, /if \(touchPointers\.size > 1\) \{\s*multiTouchBlocked = true;/);
});

test('V69 clears stale touch ownership if the app is hidden or loses focus mid-gesture', () => {
  assert.match(dragGhostSource, /const resetTouchOwnership = \(\) => \{[\s\S]*?touchPointers\.clear\(\);[\s\S]*?multiTouchBlocked = false;/);
  assert.match(dragGhostSource, /document\.visibilityState !== 'hidden'/);
  assert.match(dragGhostSource, /const onBlur = \(\) => \{[\s\S]*?resetTouchOwnership\(\)/);
  assert.match(dragGhostSource, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
});

test('V74 remeasures the natural mobile stage so a previous shrink cannot become the next resize ceiling', () => {
  assert.match(stabilitySource, /measureNaturalStage/);
  assert.match(stabilitySource, /stage\.style\.removeProperty\('height'\)/);
  assert.match(stabilitySource, /stage\.style\.removeProperty\('min-height'\)/);
  assert.match(stabilitySource, /Math\.min\(Math\.round\(naturalRect\.height\), availableHeight\)/);
  assert.match(stabilitySource, /window\.visualViewport/);
  assert.match(stabilitySource, /visualViewport\?\.addEventListener\('resize'/);
});

test('V74 never resizes the stage underneath an active gesture, navigation transition, or parent-return handoff', () => {
  for (const busyState of [
    'veinviteInteracting',
    'v50NetworkTransition',
    'v72ParentReturnTarget',
    'v73LiveReturnHidden',
    'v69CreateDragSource',
  ]) {
    assert.ok(stabilitySource.includes(busyState), `missing V74 busy-state guard: ${busyState}`);
  }
  assert.match(stabilitySource, /RESIZE_RETRY_MS = 96/);
  assert.match(stabilitySource, /window\.setTimeout\([\s\S]*?scheduleStageSize\(\)/);
});

test('V74 removes inherited 90ms camera chasing but preserves explicit navigation transition ownership', () => {
  assert.match(stabilitySource, /:not\(\.v50NetworkTransition\)/);
  assert.match(stabilitySource, /\.stage:not\(\.cameraTransition\) \.scene/);
  assert.match(stabilitySource, /transition:\s*none\s*!important/);
  assert.match(parentReturnSource, /v72ParentReturnTarget \.scene[\s\S]*?transition:none!important/);
});

test('V72 and V73 parent-return protections remain present under V74', () => {
  assert.match(stabilitySource, /AppNetworkCanaryV73/);
  assert.match(parentReturnSource, /--v72-parent-return-transform/);
  assert.match(parentReturnSource, /applyParentLayoutLocks/);
  assert.match(parentVisualSource, /v73ParentVisualOverlay/);
  assert.match(parentVisualSource, /v73LiveReturnHidden/);
});
