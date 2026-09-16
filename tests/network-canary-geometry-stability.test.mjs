import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [layoutSource, shellSource, visualSource, dragGhostSource] = await Promise.all([
  readFile('src/qa/QaNetworkRadialPlaygroundV39.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV45.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV66.tsx', 'utf8'),
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
]);

test('pinch zoom never rewrites V39 node anchors or crosses a layout compression threshold', () => {
  assert.match(layoutSource, /const compression = compact \? \.89 : \.9;/);
  assert.doesNotMatch(layoutSource, /DETAIL_ZOOM/);
  assert.doesNotMatch(layoutSource, /readZoom\(/);
  assert.doesNotMatch(layoutSource, /v39MidZoom|v39DetailZoom/);
  assert.doesNotMatch(layoutSource, /zoomValue/);
  assert.doesNotMatch(layoutSource, /const compression = midZoom \?/);
});

test('mobile browser height-only resize cannot recenter the Network stage', () => {
  assert.match(shellSource, /MOBILE_STAGE_WIDTH_EPSILON_PX = 8/);
  assert.match(shellSource, /const handleViewportResize = \(\) =>/);
  assert.match(shellSource, /Math\.abs\(nextWidth - lastViewportWidth\) >= MOBILE_STAGE_WIDTH_EPSILON_PX/);
  assert.match(shellSource, /if \(!crossedBreakpoint && !widthChanged\) return;/);
  assert.match(shellSource, /window\.addEventListener\('resize', handleViewportResize\)/);
  assert.match(shellSource, /window\.removeEventListener\('resize', handleViewportResize\)/);
  assert.doesNotMatch(shellSource, /window\.addEventListener\('resize', applyMobileSafeStage\)/);
});

test('ambient presentation cannot translate Network anchors between user actions', () => {
  assert.doesNotMatch(visualSource, /v66AmbientFloat/);
  assert.doesNotMatch(visualSource, /--v66-f[xy]\d/);
  assert.match(visualSource, /translate:\s*none\s*!important/);
});

test('group-create multi-touch cancellation yields to the Network pinch owner', () => {
  assert.match(dragGhostSource, /relevantCreateTouch/);
  assert.doesNotMatch(dragGhostSource, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(dragGhostSource, /stopPropagation\(\)/);
  assert.doesNotMatch(dragGhostSource, /event\.preventDefault\(\)/);
});
