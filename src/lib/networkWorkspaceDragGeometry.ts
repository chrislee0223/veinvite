export type NetworkDragPoint = {
  x: number;
  y: number;
};

export type NetworkDragView = {
  x: number;
  y: number;
  scale: number;
};

export type NetworkDropGroup = {
  id: string;
  members: readonly string[];
  x: number;
  y: number;
};

export const NETWORK_GROUP_DROP_HIT_SLOP_X = 18;
export const NETWORK_GROUP_DROP_HIT_SLOP_Y = 14;
export const NETWORK_GROUP_SCREEN_DROP_RADIUS = 58;
export const NETWORK_WORKSPACE_DRAG_INSET = 90;

export type NetworkClientRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type NetworkStageRect = Pick<
  NetworkClientRect,
  'left' | 'top'
>;

export function networkClientPointToWorld(
  clientPoint: NetworkDragPoint,
  stageRect: NetworkStageRect,
  view: NetworkDragView,
): NetworkDragPoint {
  return {
    x:
      (clientPoint.x -
        stageRect.left -
        view.x) /
      view.scale,
    y:
      (clientPoint.y -
        stageRect.top -
        view.y) /
      view.scale,
  };
}

export function networkDragPointFromClient(
  clientPoint: NetworkDragPoint,
  stageRect: NetworkStageRect,
  view: NetworkDragView,
  dragOffset: NetworkDragPoint,
  worldSize: {
    width: number;
    height: number;
  },
  inset = NETWORK_WORKSPACE_DRAG_INSET,
): NetworkDragPoint {
  const worldPoint = networkClientPointToWorld(
    clientPoint,
    stageRect,
    view,
  );

  return {
    x: Math.max(
      inset,
      Math.min(
        worldSize.width - inset,
        worldPoint.x - dragOffset.x,
      ),
    ),
    y: Math.max(
      inset,
      Math.min(
        worldSize.height - inset,
        worldPoint.y - dragOffset.y,
      ),
    ),
  };
}

export function isNetworkPointInsideExpandedRect(
  clientPoint: NetworkDragPoint,
  rect: NetworkClientRect,
  slopX = NETWORK_GROUP_DROP_HIT_SLOP_X,
  slopY = NETWORK_GROUP_DROP_HIT_SLOP_Y,
): boolean {
  return (
    clientPoint.x >= rect.left - slopX &&
    clientPoint.x <= rect.right + slopX &&
    clientPoint.y >= rect.top - slopY &&
    clientPoint.y <= rect.bottom + slopY
  );
}

export function findNearestNetworkGroupDropTarget<
  T extends NetworkDropGroup,
>(
  groups: readonly T[],
  clientPoint: NetworkDragPoint,
  stageRect: NetworkStageRect,
  view: NetworkDragView,
  sourceGroupId: string | undefined,
  maxMembers: number,
  radius = NETWORK_GROUP_SCREEN_DROP_RADIUS,
): T | null {
  let target: T | null = null;
  let nearestDistance = radius;

  for (const group of groups) {
    if (
      group.id === sourceGroupId ||
      group.members.length >=
        maxMembers
    ) {
      continue;
    }

    const screenX =
      stageRect.left +
      view.x +
      group.x * view.scale;
    const screenY =
      stageRect.top +
      view.y +
      group.y * view.scale;
    const candidateDistance = Math.hypot(
      clientPoint.x - screenX,
      clientPoint.y - screenY,
    );

    if (candidateDistance <= nearestDistance) {
      target = group;
      nearestDistance = candidateDistance;
    }
  }

  return target;
}
