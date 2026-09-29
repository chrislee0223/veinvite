import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NETWORK_HOLD_CANCEL_DISTANCE,
  createNetworkPinchState,
  networkGestureDistance,
  networkPanView,
  networkPointerMovedBeyond,
  resolveNetworkPinchFrame,
  shouldEnterNetworkPinchTarget,
  shouldReturnFromNetworkPinch,
} from '../src/lib/networkGestureGeometry.ts';

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test('pointer movement keeps the existing strict hold-cancel threshold', () => {
  const start = { x: 10, y: 20 };

  assert.equal(
    networkPointerMovedBeyond(
      start,
      { x: 10 + NETWORK_HOLD_CANCEL_DISTANCE, y: 20 },
    ),
    false,
  );
  assert.equal(
    networkPointerMovedBeyond(
      start,
      { x: 10 + NETWORK_HOLD_CANCEL_DISTANCE + 0.01, y: 20 },
    ),
    true,
  );
});

test('pan movement translates the camera without changing scale', () => {
  const next = networkPanView(
    { x: 100, y: 200, scale: 1.4 },
    { x: 50, y: 60 },
    { x: 82, y: 45 },
  );

  assert.deepEqual(next, {
    x: 132,
    y: 185,
    scale: 1.4,
  });
});

test('pinch state anchors the midpoint to the same world point', () => {
  const a = { x: 100, y: 100 };
  const b = { x: 300, y: 100 };
  const view = { x: 40, y: 20, scale: 2 };
  const stage = { left: 10, top: 5 };

  const pinch = createNetworkPinchState(
    a,
    b,
    view,
    stage,
  );

  assert.equal(pinch.startDistance, 200);
  assertClose(pinch.worldAnchor.x, 75, 'anchor x');
  assertClose(pinch.worldAnchor.y, 37.5, 'anchor y');
});

test('pinch frame preserves the world anchor and clamps scale', () => {
  const startA = { x: 100, y: 100 };
  const startB = { x: 300, y: 100 };
  const stage = { left: 10, top: 5 };
  const pinch = createNetworkPinchState(
    startA,
    startB,
    { x: 40, y: 20, scale: 2 },
    stage,
  );

  const currentA = { x: 50, y: 100 };
  const currentB = { x: 350, y: 100 };
  const frame = resolveNetworkPinchFrame(
    pinch,
    currentA,
    currentB,
    stage,
    0.5,
    2.5,
  );

  assert.equal(frame.rawScale, 3);
  assert.equal(frame.view.scale, 2.5);

  const midpoint = {
    x: (currentA.x + currentB.x) / 2 - stage.left,
    y: (currentA.y + currentB.y) / 2 - stage.top,
  };
  assertClose(
    frame.view.x + pinch.worldAnchor.x * frame.view.scale,
    midpoint.x,
    'anchored screen x',
  );
  assertClose(
    frame.view.y + pinch.worldAnchor.y * frame.view.scale,
    midpoint.y,
    'anchored screen y',
  );
});

test('pinch enter and return intent thresholds preserve the current gesture policy', () => {
  assert.equal(
    shouldEnterNetworkPinchTarget(1.17, 1, 1.1),
    false,
  );
  assert.equal(
    shouldEnterNetworkPinchTarget(1.18, 1, 1.1),
    true,
  );
  assert.equal(
    shouldEnterNetworkPinchTarget(1.49, 1, 1.5),
    false,
  );
  assert.equal(
    shouldEnterNetworkPinchTarget(1.5, 1, 1.5),
    true,
  );

  assert.equal(
    shouldReturnFromNetworkPinch(0.439, 0.5),
    true,
  );
  assert.equal(
    shouldReturnFromNetworkPinch(0.44, 0.5),
    false,
  );

  assertClose(
    networkGestureDistance({ x: 0, y: 0 }, { x: 3, y: 4 }),
    5,
    'gesture distance',
  );
});
