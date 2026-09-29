export type NetworkCanvasPoint = {
  x: number;
  y: number;
};

export type NetworkCanvasView = {
  x: number;
  y: number;
  scale: number;
};

export const NETWORK_CANVAS_WIDTH = 2600;
export const NETWORK_CANVAS_HEIGHT = 1900;
export const NETWORK_CANVAS_CENTER_X =
  NETWORK_CANVAS_WIDTH / 2;
export const NETWORK_CANVAS_ROOT_Y = 350;
export const NETWORK_CANVAS_MIN_SCALE = 0.32;
export const NETWORK_CANVAS_MAX_SCALE = 2.5;
export const NETWORK_CANVAS_READABLE_FIT_MIN = 0.46;
export const NETWORK_CANVAS_NODE_ENTER_SCALE = 1.85;
export const NETWORK_CANVAS_NODE_HIT_RADIUS = 58;
export const NETWORK_CANVAS_WHEEL_ENTER_DISTANCE = 120;

const GOLDEN_ANGLE =
  Math.PI * (3 - Math.sqrt(5));

export function normalizeNetworkWallet(
  wallet: string,
): string {
  return wallet.toLowerCase();
}

export function isValidNetworkWallet(
  wallet: string,
): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

export function clampNetworkCanvas(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(
    min,
    Math.min(max, value),
  );
}

export function networkCanvasMidpoint(
  a: NetworkCanvasPoint,
  b: NetworkCanvasPoint,
): NetworkCanvasPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function networkCanvasDistance(
  a: NetworkCanvasPoint,
  b: NetworkCanvasPoint,
): number {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
  );
}

export function networkCanvasZoomViewAt(
  view: NetworkCanvasView,
  screenPoint: NetworkCanvasPoint,
  nextScale: number,
): NetworkCanvasView {
  const scale = clampNetworkCanvas(
    nextScale,
    NETWORK_CANVAS_MIN_SCALE,
    NETWORK_CANVAS_MAX_SCALE,
  );
  const worldX =
    (screenPoint.x - view.x) /
    view.scale;
  const worldY =
    (screenPoint.y - view.y) /
    view.scale;

  return {
    x: screenPoint.x - worldX * scale,
    y: screenPoint.y - worldY * scale,
    scale,
  };
}

function stableNetworkHash(
  value: string,
): number {
  let hash = 2166136261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function networkCanvasChildPoint(
  wallet: string,
  index: number,
  compact: boolean,
): NetworkCanvasPoint {
  const jitter =
    ((stableNetworkHash(wallet) % 101) -
      50) /
    800;
  const angle =
    -Math.PI / 2 +
    index * GOLDEN_ANGLE +
    jitter;
  const radius = compact
    ? 118 + Math.sqrt(index) * 82
    : 208 + Math.sqrt(index) * 128;
  const yScale = compact ? 0.86 : 0.78;

  return {
    x:
      NETWORK_CANVAS_CENTER_X +
      Math.cos(angle) * radius,
    y:
      NETWORK_CANVAS_ROOT_Y +
      Math.sin(angle) *
        radius *
        yScale +
      (compact ? 18 : 26),
  };
}

export function networkCanvasInviteSlotPoint(
  index: number,
): NetworkCanvasPoint {
  if (index === 0) {
    return {
      x: NETWORK_CANVAS_CENTER_X - 58,
      y: NETWORK_CANVAS_ROOT_Y + 74,
    };
  }

  return {
    x: NETWORK_CANVAS_CENTER_X + 64,
    y: NETWORK_CANVAS_ROOT_Y + 62,
  };
}

export function networkCanvasInviteSlotPointById(
  slot: 1 | 2,
): NetworkCanvasPoint {
  return networkCanvasInviteSlotPoint(
    slot - 1,
  );
}

export function networkCanvasCenteredView(
  stage: {
    width: number;
    height: number;
  },
  scale = 1,
): NetworkCanvasView {
  return {
    x:
      stage.width / 2 -
      NETWORK_CANVAS_CENTER_X * scale,
    y:
      Math.max(
        88,
        stage.height * 0.5,
      ) -
      NETWORK_CANVAS_ROOT_Y * scale,
    scale,
  };
}

export function networkCanvasFittedView(
  stage: {
    width: number;
    height: number;
  },
  points: NetworkCanvasPoint[],
): NetworkCanvasView {
  if (!points.length) {
    return networkCanvasCenteredView(
      stage,
      1,
    );
  }

  const minX = Math.min(
    ...points.map((point) => point.x),
  );
  const maxX = Math.max(
    ...points.map((point) => point.x),
  );
  const minY = Math.min(
    ...points.map((point) => point.y),
  );
  const maxY = Math.max(
    ...points.map((point) => point.y),
  );
  const contentWidth = Math.max(
    220,
    maxX - minX + 190,
  );
  const contentHeight = Math.max(
    220,
    maxY - minY + 190,
  );
  const minimum =
    points.length < 16
      ? NETWORK_CANVAS_READABLE_FIT_MIN
      : NETWORK_CANVAS_MIN_SCALE;
  const scale = clampNetworkCanvas(
    Math.min(
      1,
      (stage.width - 34) /
        contentWidth,
      (stage.height - 50) /
        contentHeight,
    ),
    minimum,
    NETWORK_CANVAS_MAX_SCALE,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x:
      stage.width / 2 -
      centerX * scale,
    y:
      stage.height / 2 -
      centerY * scale,
    scale,
  };
}

export function networkCanvasRootCenteredFittedView(
  stage: {
    width: number;
    height: number;
  },
  points: NetworkCanvasPoint[],
): NetworkCanvasView {
  if (!points.length) {
    return networkCanvasCenteredView(
      stage,
      1,
    );
  }

  const minX = Math.min(
    ...points.map((point) => point.x),
  );
  const maxX = Math.max(
    ...points.map((point) => point.x),
  );
  const minY = Math.min(
    ...points.map((point) => point.y),
  );
  const maxY = Math.max(
    ...points.map((point) => point.y),
  );
  const horizontalExtent = Math.max(
    110,
    Math.max(
      NETWORK_CANVAS_CENTER_X - minX,
      maxX - NETWORK_CANVAS_CENTER_X,
    ) + 95,
  );
  const topExtent = Math.max(
    110,
    NETWORK_CANVAS_ROOT_Y -
      minY +
      95,
  );
  const bottomExtent = Math.max(
    110,
    maxY -
      NETWORK_CANVAS_ROOT_Y +
      95,
  );
  const screenCenterY = Math.max(
    88,
    stage.height * 0.5,
  );
  const minimum =
    points.length < 16
      ? NETWORK_CANVAS_READABLE_FIT_MIN
      : NETWORK_CANVAS_MIN_SCALE;
  const scale = clampNetworkCanvas(
    Math.min(
      1,
      Math.max(
        1,
        stage.width / 2 - 17,
      ) / horizontalExtent,
      Math.max(
        1,
        screenCenterY - 25,
      ) / topExtent,
      Math.max(
        1,
        stage.height -
          screenCenterY -
          25,
      ) / bottomExtent,
    ),
    minimum,
    NETWORK_CANVAS_MAX_SCALE,
  );

  return networkCanvasCenteredView(
    stage,
    scale,
  );
}
