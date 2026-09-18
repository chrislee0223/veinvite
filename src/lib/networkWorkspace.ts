export type NetworkWorkspacePoint = {
  x: number;
  y: number;
};

export type NetworkWorkspaceGroup = {
  id: string;
  label: string;
  members: string[];
  x: number;
  y: number;
  collapsed?: boolean;
  memberOffsets?: Record<string, NetworkWorkspacePoint>;
};

export type NetworkFocusWorkspace = {
  positions: Record<string, NetworkWorkspacePoint>;
  groups: NetworkWorkspaceGroup[];
};

export type NetworkWorkspaceStore = {
  version: 1;
  focus: Record<string, NetworkFocusWorkspace>;
};

export const EMPTY_NETWORK_FOCUS_WORKSPACE: NetworkFocusWorkspace = {
  positions: {},
  groups: [],
};

export const EMPTY_NETWORK_WORKSPACE_STORE: NetworkWorkspaceStore = {
  version: 1,
  focus: {},
};

export const MAX_GROUPS_PER_FOCUS = 24;
export const MAX_MEMBERS_PER_GROUP = 80;

function finitePoint(value: unknown): NetworkWorkspacePoint | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NetworkWorkspacePoint>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;
  return { x: Number(candidate.x), y: Number(candidate.y) };
}

function cleanWallet(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const wallet = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(wallet) ? wallet : null;
}

function cleanPositionKey(value: unknown): string | null {
  const wallet = cleanWallet(value);
  if (wallet) return wallet;
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return /^slot:[12]$/.test(key) ? key : null;
}

function keepValidGroups(groups: NetworkWorkspaceGroup[]): NetworkWorkspaceGroup[] {
  return groups.filter((group) => group.members.length >= 1).slice(-MAX_GROUPS_PER_FOCUS);
}

export function cloneNetworkFocusWorkspace(
  source: NetworkFocusWorkspace | null | undefined,
): NetworkFocusWorkspace {
  if (!source) return { positions: {}, groups: [] };
  return {
    positions: Object.fromEntries(
      Object.entries(source.positions).map(([wallet, point]) => [wallet, { ...point }]),
    ),
    groups: source.groups.map((group) => ({
      ...group,
      members: [...group.members],
      collapsed: group.collapsed !== false,
      memberOffsets: group.memberOffsets
        ? Object.fromEntries(
            Object.entries(group.memberOffsets).map(([wallet, point]) => [wallet, { ...point }]),
          )
        : undefined,
    })),
  };
}

export function parseNetworkWorkspaceStore(raw: string | null): NetworkWorkspaceStore {
  if (!raw) return { version: 1, focus: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<NetworkWorkspaceStore>;
    if (parsed.version !== 1 || !parsed.focus || typeof parsed.focus !== 'object') {
      return { version: 1, focus: {} };
    }

    const focus: Record<string, NetworkFocusWorkspace> = {};
    for (const [focusWalletRaw, workspaceRaw] of Object.entries(parsed.focus)) {
      const focusWallet = cleanWallet(focusWalletRaw);
      if (!focusWallet || !workspaceRaw || typeof workspaceRaw !== 'object') continue;
      const workspace = workspaceRaw as Partial<NetworkFocusWorkspace>;
      const positions: Record<string, NetworkWorkspacePoint> = {};
      if (workspace.positions && typeof workspace.positions === 'object') {
        for (const [positionKeyRaw, pointRaw] of Object.entries(workspace.positions)) {
          const positionKey = cleanPositionKey(positionKeyRaw);
          const point = finitePoint(pointRaw);
          if (positionKey && point) positions[positionKey] = point;
        }
      }

      const groups: NetworkWorkspaceGroup[] = [];
      const seenGroupIds = new Set<string>();
      const assignedMembers = new Set<string>();
      if (Array.isArray(workspace.groups)) {
        for (const groupRaw of workspace.groups.slice(0, MAX_GROUPS_PER_FOCUS)) {
          if (!groupRaw || typeof groupRaw !== 'object') continue;
          const group = groupRaw as Partial<NetworkWorkspaceGroup>;
          const point = finitePoint(group);
          const groupId = typeof group.id === 'string' ? group.id.slice(0, 80) : '';
          if (!point || !groupId || seenGroupIds.has(groupId)) continue;
          const members = Array.from(new Set(
            Array.isArray(group.members)
              ? group.members
                  .map(cleanWallet)
                  .filter((wallet): wallet is string => wallet !== null && !assignedMembers.has(wallet))
              : [],
          )).slice(0, MAX_MEMBERS_PER_GROUP);
          if (members.length < 1) continue;
          const memberSet = new Set(members);
          const memberOffsets: Record<string, NetworkWorkspacePoint> = {};
          if (group.memberOffsets && typeof group.memberOffsets === 'object') {
            for (const [memberRaw, offsetRaw] of Object.entries(group.memberOffsets)) {
              const member = cleanWallet(memberRaw);
              const offset = finitePoint(offsetRaw);
              if (member && memberSet.has(member) && offset) memberOffsets[member] = offset;
            }
          }
          groups.push({
            id: groupId,
            label: typeof group.label === 'string' ? group.label.slice(0, 42) : '',
            members,
            x: point.x,
            y: point.y,
            collapsed: group.collapsed !== false,
            memberOffsets: Object.keys(memberOffsets).length ? memberOffsets : undefined,
          });
          seenGroupIds.add(groupId);
          members.forEach((member) => assignedMembers.add(member));
        }
      }
      focus[focusWallet] = { positions, groups };
    }
    return { version: 1, focus };
  } catch {
    return { version: 1, focus: {} };
  }
}

export function serializeNetworkWorkspaceStore(store: NetworkWorkspaceStore): string {
  return JSON.stringify(store);
}

export function workspaceForFocus(
  store: NetworkWorkspaceStore,
  focusWallet: string,
): NetworkFocusWorkspace {
  return store.focus[focusWallet.toLowerCase()] ?? EMPTY_NETWORK_FOCUS_WORKSPACE;
}

export function withFocusWorkspace(
  store: NetworkWorkspaceStore,
  focusWallet: string,
  workspace: NetworkFocusWorkspace,
): NetworkWorkspaceStore {
  return {
    version: 1,
    focus: {
      ...store.focus,
      [focusWallet.toLowerCase()]: cloneNetworkFocusWorkspace(workspace),
    },
  };
}

export function withNodePosition(
  workspace: NetworkFocusWorkspace,
  wallet: string,
  point: NetworkWorkspacePoint,
): NetworkFocusWorkspace {
  return {
    ...workspace,
    positions: {
      ...workspace.positions,
      [wallet.toLowerCase()]: { ...point },
    },
  };
}

export function withoutNodePositions(
  workspace: NetworkFocusWorkspace,
): NetworkFocusWorkspace {
  return {
    ...workspace,
    positions: {},
  };
}

export function withGroupPosition(
  workspace: NetworkFocusWorkspace,
  groupId: string,
  point: NetworkWorkspacePoint,
): NetworkFocusWorkspace {
  return {
    ...workspace,
    groups: workspace.groups.map((group) => (
      group.id === groupId ? { ...group, ...point } : group
    )),
  };
}

export function withWorkspaceGroupMemberOffset(
  workspace: NetworkFocusWorkspace,
  groupId: string,
  wallet: string,
  offset: NetworkWorkspacePoint,
): NetworkFocusWorkspace {
  const key = wallet.toLowerCase();
  return {
    ...workspace,
    groups: workspace.groups.map((group) => {
      if (
        group.id !== groupId ||
        !group.members.some((member) => member.toLowerCase() === key)
      ) return group;
      return {
        ...group,
        memberOffsets: {
          ...(group.memberOffsets ?? {}),
          [key]: { ...offset },
        },
      };
    }),
  };
}

export function withWorkspaceGroupCollapsed(
  workspace: NetworkFocusWorkspace,
  groupId: string,
  collapsed: boolean,
): NetworkFocusWorkspace {
  return {
    ...workspace,
    groups: workspace.groups.map((group) => (
      group.id === groupId ? { ...group, collapsed } : group
    )),
  };
}

export function addWorkspaceGroup(
  workspace: NetworkFocusWorkspace,
  group: NetworkWorkspaceGroup,
): NetworkFocusWorkspace {
  const members = Array.from(new Set(group.members.map((wallet) => wallet.toLowerCase())));
  if (members.length < 1 || members.length > MAX_MEMBERS_PER_GROUP) return workspace;
  const memberSet = new Set(members);
  const groups = keepValidGroups(workspace.groups.map((existing) => {
    const existingMembers = existing.members.filter((wallet) => !memberSet.has(wallet.toLowerCase()));
    const existingMemberSet = new Set(existingMembers.map((wallet) => wallet.toLowerCase()));
    const memberOffsets = existing.memberOffsets
      ? Object.fromEntries(
          Object.entries(existing.memberOffsets)
            .filter(([wallet]) => existingMemberSet.has(wallet.toLowerCase()))
            .map(([wallet, point]) => [wallet.toLowerCase(), { ...point }]),
        )
      : undefined;
    return {
      ...existing,
      members: existingMembers,
      memberOffsets: memberOffsets && Object.keys(memberOffsets).length ? memberOffsets : undefined,
    };
  }));
  if (groups.length >= MAX_GROUPS_PER_FOCUS) return workspace;
  const memberOffsets = group.memberOffsets
    ? Object.fromEntries(
        Object.entries(group.memberOffsets)
          .filter(([wallet]) => memberSet.has(wallet.toLowerCase()))
          .map(([wallet, point]) => [wallet.toLowerCase(), { ...point }]),
      )
    : undefined;
  return {
    ...workspace,
    groups: [
      ...groups,
      {
        ...group,
        members,
        collapsed: group.collapsed !== false,
        memberOffsets: memberOffsets && Object.keys(memberOffsets).length ? memberOffsets : undefined,
      },
    ],
  };
}

export function moveWorkspaceMemberToGroup(
  workspace: NetworkFocusWorkspace,
  wallet: string,
  targetGroupId: string,
): NetworkFocusWorkspace {
  const key = wallet.toLowerCase();
  const target = workspace.groups.find((group) => group.id === targetGroupId);
  if (
    !target ||
    target.members.some((member) => member.toLowerCase() === key) ||
    target.members.length >= MAX_MEMBERS_PER_GROUP
  ) return workspace;

  const groups = workspace.groups.map((group) => {
    const members = group.members.filter((member) => member.toLowerCase() !== key);
    if (group.id === targetGroupId) members.push(key);
    const normalizedMembers = Array.from(new Set(members)).slice(0, MAX_MEMBERS_PER_GROUP);
    const memberSet = new Set(normalizedMembers);
    const memberOffsets = group.memberOffsets
      ? Object.fromEntries(
          Object.entries(group.memberOffsets)
            .filter(([member]) => memberSet.has(member.toLowerCase()))
            .map(([member, point]) => [member.toLowerCase(), { ...point }]),
        )
      : undefined;
    return {
      ...group,
      members: normalizedMembers,
      memberOffsets: memberOffsets && Object.keys(memberOffsets).length ? memberOffsets : undefined,
    };
  });

  return {
    ...workspace,
    groups: keepValidGroups(groups),
  };
}

export function removeWorkspaceMemberFromGroup(
  workspace: NetworkFocusWorkspace,
  wallet: string,
): NetworkFocusWorkspace {
  const key = wallet.toLowerCase();
  return {
    ...workspace,
    groups: keepValidGroups(workspace.groups.map((group) => {
      const members = group.members.filter((member) => member.toLowerCase() !== key);
      const memberSet = new Set(members);
      const memberOffsets = group.memberOffsets
        ? Object.fromEntries(
            Object.entries(group.memberOffsets)
              .filter(([member]) => memberSet.has(member.toLowerCase()))
              .map(([member, point]) => [member.toLowerCase(), { ...point }]),
          )
        : undefined;
      return {
        ...group,
        members,
        memberOffsets: memberOffsets && Object.keys(memberOffsets).length ? memberOffsets : undefined,
      };
    })),
  };
}

export function removeWorkspaceGroup(
  workspace: NetworkFocusWorkspace,
  groupId: string,
): NetworkFocusWorkspace {
  return {
    ...workspace,
    groups: workspace.groups.filter((group) => group.id !== groupId),
  };
}

export function groupContainingWallet(
  workspace: NetworkFocusWorkspace,
  wallet: string,
): NetworkWorkspaceGroup | null {
  const key = wallet.toLowerCase();
  return workspace.groups.find((group) => (
    group.members.some((member) => member.toLowerCase() === key)
  )) ?? null;
}
