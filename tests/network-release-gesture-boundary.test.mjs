import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [v71Source, boundarySource] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV71.tsx', 'utf8'),
  readFile('src/components/NetworkReleaseGestureBoundary.tsx', 'utf8'),
]);

test('V71 wraps the API-backed release canvas in the release gesture boundary', () => {
  assert.match(v71Source, /NetworkReleaseGestureBoundary/);
  assert.match(v71Source, /<NetworkReleaseGestureBoundary>[\s\S]*?<AppNetworkReleaseCanvas locale=\{locale\} \/>[\s\S]*?<\/NetworkReleaseGestureBoundary>/);
});

test('every release touch pointer is captured to the actual stage', () => {
  assert.match(boundarySource, /event\.pointerType !== 'touch'/);
  assert.match(boundarySource, /closest<HTMLElement>\('\.releaseStage'\)/);
  assert.match(boundarySource, /stage\.setPointerCapture\(event\.pointerId\)/);
});

test('pointer cancellation cannot be interpreted as a completed release pinch', () => {
  assert.match(boundarySource, /onPointerCancelCapture/);
  assert.match(boundarySource, /event\.stopPropagation\(\)/);
  assert.match(boundarySource, /setEpoch\(\(value\) => value \+ 1\)/);
  assert.doesNotMatch(boundarySource, /loadFocus|goParent|openFocus/);
});
