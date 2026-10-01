import {
  NETWORK_CANVAS_HEIGHT,
  NETWORK_CANVAS_WIDTH,
  clampNetworkCanvas,
} from '@/lib/networkCanvasGeometry';
import {
  MAX_GROUPS_PER_FOCUS,
  MAX_MEMBERS_PER_GROUP,
  cloneNetworkFocusWorkspace,
  type NetworkFocusWorkspace,
  type NetworkWorkspaceGroup,
  type NetworkWorkspacePoint,
} from '@/lib/networkWorkspace';

export type PublishedNetworkLayoutSnapshot = {
  revision: number;
  schemaVersion: 1;
  updatedAt: string;
  workspace: NetworkFocusWorkspace;
};

type MaterializePoint = {
  key: string;
  x: number;
  y: number;
};

const GROUP_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,80}$/u;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/gu;

function clampPoint(
  point: NetworkWorkspacePoint,
): NetworkWorkspacePoint {
  return {
    x: clampNetworkCanvas(
      point.x,
      0,
      NETWORK_CANVAS_WIDTH,
    ),
    y: clampNetworkCanvas(
      point.y,
      0,
      NETWORK_CANVAS_HEIGHT,
    ),
  };
}

function finitePoint(
  value: unknown,
  {
    offset = false,
  }: {
    offset?: boolean;
  } = {},
): NetworkWorkspacePoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate =
    value as Partial<NetworkWorkspacePoint>;
  if (
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y)
  ) {
    return null;
  }

  if (offset) {
    return {
      x: clampNetworkCanvas(
        Number(candidate.x),
        -NETWORK_CANVAS_WIDTH,
        NETWORK_CANVAS_WIDTH,
      ),
      y: clampNetworkCanvas(
        Number(candidate.y),
        -NETWORK_CANVAS_HEIGHT,
        NETWORK_CANVAS_HEIGHT,
      ),
    };
  }

  return clampPoint({
    x: Number(candidate.x),
    y: Number(candidate.y),
  });
}

function cleanGroupLabel(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(CONTROL_CHAR_PATTERN, '')
    .trim()
    .slice(0, 42);
}

export function networkWorkspaceIsEmpty(
  workspace: NetworkFocusWorkspace,
): boolean {
  return (
    Object.keys(workspace.positions).length === 0 &&
    workspace.groups.length === 0
  );
}

export function materializeNetworkWorkspaceForPublish({
  workspace,
  childPoints,
  slotPoints,
}: {
  workspace: NetworkFocusWorkspace;
  childPoints: MaterializePoint[];
  slotPoints: MaterializePoint[];
}): NetworkFocusWorkspace {
  const next = cloneNetworkFocusWorkspace(
    workspace,
  );
  const positions: Record<
    string,
    NetworkWorkspacePoint
  > = {};

  for (const item of [
    ...childPoints,
    ...slotPoints,
  ]) {
    positions[item.key.toLowerCase()] =
      clampPoint({
        x: item.x,
        y: item.y,
      });
  }

  return {
    ...next,
    positions,
  };
}

export function sanitizePublishedNetworkWorkspace({
  value,
  allowedWallets,
  allowedSlotIds,
}: {
  value: unknown;
  allowedWallets: Iterable<string>;
  allowedSlotIds: Iterable<1 | 2>;
}): NetworkFocusWorkspace {
  const allowedWalletSet = new Set(
    Array.from(
      allowedWallets,
      (wallet) => wallet.toLowerCase(),
    ),
  );
  const allowedPositionKeys =
    new Set<string>(allowedWalletSet);

  for (const slot of allowedSlotIds) {
    allowedPositionKeys.add(`slot:${slot}`);
  }

  const raw =
    value && typeof value === 'object'
      ? value as {
          positions?: unknown;
          groups?: unknown;
        }
      : {};

  const positions: Record<
    string,
    NetworkWorkspacePoint
  > = {};
  if (
    raw.positions &&
    typeof raw.positions === 'object' &&
    !Array.isArray(raw.positions)
  ) {
    for (const [
      rawKey,
      rawPoint,
    ] of Object.entries(raw.positions)) {
      const key = rawKey.toLowerCase();
      if (!allowedPositionKeys.has(key)) {
        continue;
      }

      const point = finitePoint(rawPoint);
      if (point) {
        positions[key] = point;
      }
    }
  }

  const groups: NetworkWorkspaceGroup[] = [];
  const assignedMembers = new Set<string>();
  const seenIds = new Set<string>();

  if (Array.isArray(raw.groups)) {
    for (const candidate of raw.groups.slice(
      0,
      MAX_GROUPS_PER_FOCUS,
    )) {
      if (
        !candidate ||
        typeof candidate !== 'object'
      ) {
        continue;
      }

      const group =
        candidate as Partial<NetworkWorkspaceGroup>;
      const id =
        typeof group.id === 'string'
          ? group.id.trim()
          : '';
      const point = finitePoint(group);

      if (
        !GROUP_ID_PATTERN.test(id) ||
        seenIds.has(id) ||
        !point
      ) {
        continue;
      }

      const members = Array.from(
        new Set(
          Array.isArray(group.members)
            ? group.members
                .filter(
                  (
                    member,
                  ): member is string =>
                    typeof member === 'string',
                )
                .map((member) =>
                  member.toLowerCase(),
                )
                .filter(
                  (member) =>
                    allowedWalletSet.has(member) &&
                    !assignedMembers.has(member),
                )
            : [],
        ),
      ).slice(0, MAX_MEMBERS_PER_GROUP);

      if (members.length === 0) {
        continue;
      }

      const memberSet = new Set(members);
      const memberOffsets: Record<
        string,
        NetworkWorkspacePoint
      > = {};

      if (
        group.memberOffsets &&
        typeof group.memberOffsets ===
          'object' &&
        !Array.isArray(group.memberOffsets)
      ) {
        for (const [
          rawMember,
          rawOffset,
        ] of Object.entries(
          group.memberOffsets,
        )) {
          const member =
            rawMember.toLowerCase();
          if (!memberSet.has(member)) {
            continue;
          }

          const offset = finitePoint(
            rawOffset,
            { offset: true },
          );
          if (offset) {
            memberOffsets[member] = offset;
          }
        }
      }

      groups.push({
        id,
        label: cleanGroupLabel(group.label),
        members,
        x: point.x,
        y: point.y,
        collapsed: group.collapsed !== false,
        memberOffsets:
          Object.keys(memberOffsets).length
            ? memberOffsets
            : undefined,
      });

      seenIds.add(id);
      members.forEach((member) =>
        assignedMembers.add(member),
      );
    }
  }

  return {
    positions,
    groups,
  };
}
