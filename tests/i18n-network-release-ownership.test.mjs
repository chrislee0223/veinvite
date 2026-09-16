import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const v46 = read('src/components/AppNetworkCanaryV46.tsx');
const v49 = read('src/components/AppNetworkCanaryV49.tsx');
const v50 = read('src/components/AppNetworkCanaryV50.tsx');
const v52 = read('src/components/AppNetworkCanaryV52.tsx');
const v63 = read('src/components/AppNetworkCanaryV63.tsx');

test('V46 stays presentation-only and cannot revive the retired drag-preview owner', () => {
  assert.match(v46, /function NetworkViewportPolish\(\)/);
  assert.match(v46, /function NetworkSlotLineOverlay\(\)/);
  assert.doesNotMatch(v46, /type DragPreview/);
  assert.doesNotMatch(v46, /veinviteNodeDragGhost/);
  assert.doesNotMatch(v46, /onDocumentPointerDown/);
  assert.doesNotMatch(v46, /document\.addEventListener\('pointer(?:down|move|up|cancel)'/);
});

test('pinch navigation remains single-owner while the mature pinch bridge stays intact', () => {
  assert.match(v50, /const PINCH_ENTER_RATIO = 1\.28/);
  assert.match(v50, /const PINCH_PARENT_RATIO = 0\.65/);
  assert.match(v50, /const onTouchStart = \(event: TouchEvent\)/);
  assert.match(v50, /const finishPinch = \(event: TouchEvent\)/);
  assert.match(v49, /holdIntermediatePinchEnd/);
  assert.doesNotMatch(v52, /addEventListener\('touchstart'/);
  assert.doesNotMatch(v52, /addEventListener\('touchmove'/);
  assert.doesNotMatch(v52, /addEventListener\('wheel'/);
});

test('final node movement remains owned by the unified V63 transform layer', () => {
  assert.match(v63, /function NetworkUnifiedNodeDragV63\(\)/);
  assert.match(v63, /--v63-drag-x/);
  assert.match(v63, /--v63-drag-y/);
  assert.match(v63, /classList\.add\('v63DirectDragging'\)/);
});
