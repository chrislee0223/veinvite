export type NetworkGesturePoint = {
  x: number;
  y: number;
};

export type NetworkGestureView = {
  x: number;
  y: number;
  scale: number;
};

export type NetworkGestureStageOffset = {
  left: number;
  top: number;
};

export type NetworkPinchState = {
  startDistance: number;
  startView: NetworkGestureView;
  worldAnchor: NetworkGesturePoint;
};

export const NETWORK_HOLD_CANCEL_DISTANCE = 8;
export const NETWORK_PINCH_ENTER_SCALE_MULTIPLIER = 1.18;
export const NETWORK_PINCH_RETURN_SCALE_MULTIPLIER = 0.88;
export const NETWORK_WHEEL_RETURN_DISTANCE = 160;
export const NETWORK_WHEEL_MIN_SCALE_TOLERANCE = 0.01;

export type NetworkWheelReturnDecision = {
  distance: number;
  shouldReturn: boolean;
  consume: boolean;
};

export type NetworkWheelEnterDecision = {
  distance: number;
  walletKey: string | null;
  shouldEnter: boolean;
};

export function networkGestureDistance(
  a: NetworkGesturePoint,
  b: NetworkGesturePoint,
): number {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
  );
}

export function networkGestureMidpoint(
  a: NetworkGesturePoint,
  b: NetworkGesturePoint,
): NetworkGesturePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function networkPointerMovedBeyond(
  start: NetworkGesturePoint,
  current: NetworkGesturePoint,
  threshold = NETWORK_HOLD_CANCEL_DISTANCE,
): boolean {
  return networkGestureDistance(
    start,
    current,
  ) > threshold;
}

export function createNetworkPinchState(
  a: NetworkGesturePoint,
  b: NetworkGesturePoint,
  startView: NetworkGestureView,
  stageOffset: NetworkGestureStageOffset,
): NetworkPinchState {
  const center = networkGestureMidpoint(a, b);

  return {
    startDistance: Math.max(
      1,
      networkGestureDistance(a, b),
    ),
    startView,
    worldAnchor: {
      x:
        (center.x -
          stageOffset.left -
          startView.x) /
        startView.scale,
      y:
        (center.y -
          stageOffset.top -
          startView.y) /
        startView.scale,
    },
  };
}

export function resolveNetworkPinchFrame(
  pinch: NetworkPinchState,
  a: NetworkGesturePoint,
  b: NetworkGesturePoint,
  stageOffset: NetworkGestureStageOffset,
  minScale: number,
  maxScale: number,
): {
  rawScale: number;
  view: NetworkGestureView;
} {
  const center = networkGestureMidpoint(a, b);
  const nextDistance = networkGestureDistance(a, b);
  const rawScale =
    pinch.startView.scale *
    (nextDistance / pinch.startDistance);
  const nextScale = Math.max(
    minScale,
    Math.min(maxScale, rawScale),
  );
  const localCenter = {
    x: center.x - stageOffset.left,
    y: center.y - stageOffset.top,
  };

  return {
    rawScale,
    view: {
      x:
        localCenter.x -
        pinch.worldAnchor.x * nextScale,
      y:
        localCenter.y -
        pinch.worldAnchor.y * nextScale,
      scale: nextScale,
    },
  };
}

export function networkPanView(
  view: NetworkGestureView,
  previous: NetworkGesturePoint,
  current: NetworkGesturePoint,
): NetworkGestureView {
  return {
    ...view,
    x: view.x + current.x - previous.x,
    y: view.y + current.y - previous.y,
  };
}

export function shouldEnterNetworkPinchTarget(
  rawScale: number,
  startScale: number,
  enterScale: number,
): boolean {
  return rawScale >= Math.max(
    enterScale,
    startScale *
      NETWORK_PINCH_ENTER_SCALE_MULTIPLIER,
  );
}

export function shouldReturnFromNetworkPinch(
  rawScale: number,
  minScale: number,
): boolean {
  return rawScale <
    minScale *
      NETWORK_PINCH_RETURN_SCALE_MULTIPLIER;
}

export function resolveNetworkWheelReturnIntent({
  editingLayout,
  deltaY,
  scale,
  minScale,
  hasParent,
  accumulatedDistance,
}: {
  editingLayout: boolean;
  deltaY: number;
  scale: number;
  minScale: number;
  hasParent: boolean;
  accumulatedDistance: number;
}): NetworkWheelReturnDecision {
  const atMinimumScale =
    scale <= minScale + NETWORK_WHEEL_MIN_SCALE_TOLERANCE;
  const shouldAccumulate =
    !editingLayout &&
    deltaY > 0 &&
    atMinimumScale &&
    hasParent;

  if (shouldAccumulate) {
    const distance =
      accumulatedDistance +
      Math.abs(deltaY);
    const shouldReturn =
      distance >= NETWORK_WHEEL_RETURN_DISTANCE;

    return {
      distance: shouldReturn ? 0 : distance,
      shouldReturn,
      consume: true,
    };
  }

  return {
    distance:
      deltaY <= 0 || !atMinimumScale
        ? 0
        : accumulatedDistance,
    shouldReturn: false,
    consume: false,
  };
}

export function resolveNetworkWheelEnterIntent({
  editingLayout,
  deltaY,
  nextScale,
  enterScale,
  candidateWalletKey,
  activeWalletKey,
  accumulatedDistance,
  enterDistance,
}: {
  editingLayout: boolean;
  deltaY: number;
  nextScale: number;
  enterScale: number;
  candidateWalletKey: string | null;
  activeWalletKey: string | null;
  accumulatedDistance: number;
  enterDistance: number;
}): NetworkWheelEnterDecision {
  if (
    !editingLayout &&
    deltaY < 0 &&
    candidateWalletKey &&
    nextScale >= enterScale
  ) {
    const distance =
      activeWalletKey === candidateWalletKey
        ? accumulatedDistance + Math.abs(deltaY)
        : Math.abs(deltaY);
    const shouldEnter =
      distance >= enterDistance;

    return {
      distance: shouldEnter ? 0 : distance,
      walletKey: shouldEnter
        ? null
        : candidateWalletKey,
      shouldEnter,
    };
  }

  return {
    distance: 0,
    walletKey: null,
    shouldEnter: false,
  };
}
