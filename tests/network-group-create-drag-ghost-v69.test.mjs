import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, guideSource, v44Source] = await Promise.all([
  readFile('src/components/AppNetworkCanaryV69.tsx', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/qa/QaNetworkRadialPlaygroundV44.tsx', 'utf8'),
]);

test('V69 is the active canary wrapper and preserves the V68 chain', () => {
  assert.match(guideSource, /AppNetworkCanaryV69/);
  assert.match(source, /AppNetworkCanaryV68/);
  assert.match(source, /<AppNetworkCanaryV68 locale=\{locale\} \/>/);
});

test('create-group drag ghost only activates for the existing V44 create drop editor', () => {
  assert.match(source, /\.v44CreateDropMore/);
  assert.match(source, /\.v42GroupPanel input/);
  assert.match(source, /DRAG_THRESHOLD_PX = 10/);
  assert.match(v44Source, /toggleCreateSelection\(drag\.nodeId\)/);
});

test('drag ghost follows screen coordinates without mutating Network geometry or persistence', () => {
  assert.match(source, /position:\s*fixed/);
  assert.match(source, /pointer-events:\s*none\s*!important/);
  assert.match(source, /clientX - current\.grabX/);
  assert.match(source, /clientY - current\.grabY/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /--cameraX|--cameraY|--networkZoom/);
  assert.doesNotMatch(source, /--v42-group-d[xy]|--v50-(?:adjust|drag)-[dxy]|--v52-(?:adjust|drag)-[dxy]|--v63-(?:adjust|drag)-[xy]/);
  assert.doesNotMatch(source, /MutationObserver/);
});

test('drag ghost keeps pointer ownership and cleans transient state on every exit path', () => {
  assert.match(source, /setPointerCapture/);
  assert.match(source, /releasePointerCapture/);
  assert.match(source, /pointercancel/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /window\.addEventListener\('blur'/);
  assert.match(source, /touchPointers\.size > 1/);
  assert.match(source, /cancelUnderlyingCreateDrag/);
  assert.match(source, /\.v69CreateDragSource/);
  assert.match(source, /current\.ghost\?\.remove\(\)/);
});
