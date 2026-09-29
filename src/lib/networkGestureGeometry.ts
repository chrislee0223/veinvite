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
