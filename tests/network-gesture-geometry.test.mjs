import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NETWORK_HOLD_CANCEL_DISTANCE,
  createNetworkPinchState,
  networkGestureDistance,
  isNetworkBlankCanvasTap,
  networkPanView,
  networkPointerMovedBeyond,
  resolveNetworkPinchFrame,
  resolveNetworkPointerEndAction,
  resolveNetworkWheelEnterIntent,
  resolveNetworkWheelReturnIntent,
  shouldEnterNetworkPinchTarget,
  shouldReturnFromNetworkPinch,
  NETWORK_WHEEL_RETURN_DISTANCE,
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


test('wheel return intent preserves the existing accumulated-distance policy', () => {
  const first = resolveNetworkWheelReturnIntent({
    editingLayout: false,
    deltaY: 60,
    scale: 0.5,
    minScale: 0.5,
    hasParent: true,
    accumulatedDistance: 0,
  });

  assert.deepEqual(first, {
    distance: 60,
    shouldReturn: false,
    consume: true,
  });

  const beforeThreshold = resolveNetworkWheelReturnIntent({
    editingLayout: false,
    deltaY: NETWORK_WHEEL_RETURN_DISTANCE - 61,
    scale: 0.5,
    minScale: 0.5,
    hasParent: true,
    accumulatedDistance: first.distance,
  });

  assert.equal(beforeThreshold.distance, NETWORK_WHEEL_RETURN_DISTANCE - 1);
  assert.equal(beforeThreshold.shouldReturn, false);
  assert.equal(beforeThreshold.consume, true);

  const atThreshold = resolveNetworkWheelReturnIntent({
    editingLayout: false,
    deltaY: 1,
    scale: 0.5,
    minScale: 0.5,
    hasParent: true,
    accumulatedDistance: beforeThreshold.distance,
  });

  assert.deepEqual(atThreshold, {
    distance: 0,
    shouldReturn: true,
    consume: true,
  });

  const reversed = resolveNetworkWheelReturnIntent({
    editingLayout: false,
    deltaY: -1,
    scale: 0.5,
    minScale: 0.5,
    hasParent: true,
    accumulatedDistance: 75,
  });

  assert.deepEqual(reversed, {
    distance: 0,
    shouldReturn: false,
    consume: false,
  });
});

test('wheel enter intent accumulates only for the same eligible child', () => {
  const first = resolveNetworkWheelEnterIntent({
    editingLayout: false,
    deltaY: -40,
    nextScale: 1.6,
    enterScale: 1.5,
    candidateWalletKey: 'wallet-a',
    activeWalletKey: null,
    accumulatedDistance: 0,
    enterDistance: 100,
  });

  assert.deepEqual(first, {
    distance: 40,
    walletKey: 'wallet-a',
    shouldEnter: false,
  });

  const sameWallet = resolveNetworkWheelEnterIntent({
    editingLayout: false,
    deltaY: -30,
    nextScale: 1.7,
    enterScale: 1.5,
    candidateWalletKey: 'wallet-a',
    activeWalletKey: first.walletKey,
    accumulatedDistance: first.distance,
    enterDistance: 100,
  });

  assert.deepEqual(sameWallet, {
    distance: 70,
    walletKey: 'wallet-a',
    shouldEnter: false,
  });

  const switchedWallet = resolveNetworkWheelEnterIntent({
    editingLayout: false,
    deltaY: -25,
    nextScale: 1.8,
    enterScale: 1.5,
    candidateWalletKey: 'wallet-b',
    activeWalletKey: sameWallet.walletKey,
    accumulatedDistance: sameWallet.distance,
    enterDistance: 100,
  });

  assert.deepEqual(switchedWallet, {
    distance: 25,
    walletKey: 'wallet-b',
    shouldEnter: false,
  });

  const entered = resolveNetworkWheelEnterIntent({
    editingLayout: false,
    deltaY: -75,
    nextScale: 1.9,
    enterScale: 1.5,
    candidateWalletKey: 'wallet-b',
    activeWalletKey: switchedWallet.walletKey,
    accumulatedDistance: switchedWallet.distance,
    enterDistance: 100,
  });

  assert.deepEqual(entered, {
    distance: 0,
    walletKey: null,
    shouldEnter: true,
  });
});

test('wheel enter intent resets when direction, scale eligibility, or edit mode changes', () => {
  const base = {
    nextScale: 1.6,
    enterScale: 1.5,
    candidateWalletKey: 'wallet-a',
    activeWalletKey: 'wallet-a',
    accumulatedDistance: 70,
    enterDistance: 100,
  };

  for (const input of [
    { ...base, editingLayout: false, deltaY: 1 },
    { ...base, editingLayout: false, deltaY: -1, nextScale: 1.49 },
    { ...base, editingLayout: true, deltaY: -1 },
    { ...base, editingLayout: false, deltaY: -1, candidateWalletKey: null },
  ]) {
    assert.deepEqual(
      resolveNetworkWheelEnterIntent(input),
      {
        distance: 0,
        walletKey: null,
        shouldEnter: false,
      },
    );
  }
});


test('blank canvas tap requires an unblocked unmoved final pointerup', () => {
  const backgroundTap = {
    pointerId: 7,
    moved: false,
    blocked: false,
  };

  assert.equal(
    isNetworkBlankCanvasTap({
      backgroundTap,
      endingPointerId: 7,
      eventType: 'pointerup',
      activePointerCount: 1,
    }),
    true,
  );

  for (const input of [
    { backgroundTap: null, endingPointerId: 7, eventType: 'pointerup', activePointerCount: 1 },
    { backgroundTap, endingPointerId: 8, eventType: 'pointerup', activePointerCount: 1 },
    { backgroundTap, endingPointerId: 7, eventType: 'pointercancel', activePointerCount: 1 },
    { backgroundTap: { ...backgroundTap, moved: true }, endingPointerId: 7, eventType: 'pointerup', activePointerCount: 1 },
    { backgroundTap: { ...backgroundTap, blocked: true }, endingPointerId: 7, eventType: 'pointerup', activePointerCount: 1 },
    { backgroundTap, endingPointerId: 7, eventType: 'pointerup', activePointerCount: 2 },
  ]) {
    assert.equal(isNetworkBlankCanvasTap(input), false);
  }
});

test('pointer end action preserves edit, enter, and return precedence', () => {
  assert.equal(
    resolveNetworkPointerEndAction({
      blankCanvasTap: true,
      editingLayout: true,
      hasGroupDraft: false,
      enterWallet: 'wallet-a',
      returnIntent: true,
    }),
    'finish-layout-edit',
  );

  assert.equal(
    resolveNetworkPointerEndAction({
      blankCanvasTap: false,
      editingLayout: false,
      hasGroupDraft: false,
      enterWallet: 'wallet-a',
      returnIntent: true,
    }),
    'enter-wallet',
  );

  assert.equal(
    resolveNetworkPointerEndAction({
      blankCanvasTap: false,
      editingLayout: true,
      hasGroupDraft: false,
      enterWallet: 'wallet-a',
      returnIntent: true,
    }),
    'return-parent',
  );

  assert.equal(
    resolveNetworkPointerEndAction({
      blankCanvasTap: true,
      editingLayout: true,
      hasGroupDraft: true,
      enterWallet: null,
      returnIntent: false,
    }),
    'none',
  );
});
