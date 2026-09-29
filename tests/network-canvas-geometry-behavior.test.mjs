import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NETWORK_CANVAS_CENTER_X,
  NETWORK_CANVAS_MAX_SCALE,
  NETWORK_CANVAS_MIN_SCALE,
  NETWORK_CANVAS_ROOT_Y,
  networkCanvasCenteredView,
  networkCanvasZoomViewAt,
} from '../src/lib/networkCanvasGeometry.ts';

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test('zoom keeps the same world point under the screen anchor', () => {
  const view = { x: 120, y: 80, scale: 1.25 };
  const screenPoint = { x: 310, y: 260 };

  const worldBefore = {
    x: (screenPoint.x - view.x) / view.scale,
    y: (screenPoint.y - view.y) / view.scale,
  };

  const next = networkCanvasZoomViewAt(
    view,
    screenPoint,
    2,
  );

  const worldAfter = {
    x: (screenPoint.x - next.x) / next.scale,
    y: (screenPoint.y - next.y) / next.scale,
  };

  assertClose(worldAfter.x, worldBefore.x, 'world x');
  assertClose(worldAfter.y, worldBefore.y, 'world y');
});

test('zoom clamps scale to the shared Network camera bounds', () => {
  const view = { x: 0, y: 0, scale: 1 };
  const anchor = { x: 200, y: 160 };

  assert.equal(
    networkCanvasZoomViewAt(
      view,
      anchor,
      NETWORK_CANVAS_MIN_SCALE / 10,
    ).scale,
    NETWORK_CANVAS_MIN_SCALE,
  );

  assert.equal(
    networkCanvasZoomViewAt(
      view,
      anchor,
      NETWORK_CANVAS_MAX_SCALE * 10,
    ).scale,
    NETWORK_CANVAS_MAX_SCALE,
  );
});

test('centered view keeps the root anchored to the visual stage center', () => {
  const stage = { width: 520, height: 680 };
  const scale = 1.4;
  const view = networkCanvasCenteredView(stage, scale);

  assertClose(
    view.x + NETWORK_CANVAS_CENTER_X * scale,
    stage.width / 2,
    'root screen x',
  );
  assertClose(
    view.y + NETWORK_CANVAS_ROOT_Y * scale,
    Math.max(88, stage.height * 0.5),
    'root screen y',
  );
  assert.equal(view.scale, scale);
});
