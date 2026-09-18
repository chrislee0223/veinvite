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

const MAX_GROUPS_PER_FOCUS = 24;
const MAX_MEMBERS_PER_GROUP = 80;

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
  return groups.filter((group) => group.members.length >= 2).slice(-MAX_GROUPS_PER_FOCUS);
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
      if (Array.isArray(workspace.groups)) {
        for (const groupRaw of workspace.groups.slice(0, MAX_GROUPS_PER_FOCUS)) {
          if (!groupRaw || typeof groupRaw !== 'object') continue;
          const group = groupRaw as Partial<NetworkWorkspaceGroup>;
          const point = finitePoint(group);
          const members = Array.from(new Set(
            Array.isArray(group.members)
              ? group.members.map(cleanWallet).filter((wallet): wallet is string => Boolean(wallet))
              : [],
          )).slice(0, MAX_MEMBERS_PER_GROUP);
          if (!point || members.length < 2 || typeof group.id !== 'string') continue;
          groups.push({
            id: group.id.slice(0, 80),
            label: typeof group.label === 'string' ? group.label.slice(0, 42) : '',
            members,
            x: point.x,
            y: point.y,
            collapsed: group.collapsed !== false,
          });
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
  const members = Array.from(new Set(group.members.map((wallet) => wallet.toLowerCase()))).slice(0, MAX_MEMBERS_PER_GROUP);
  if (members.length < 2) return workspace;
  const memberSet = new Set(members);
  const groups = keepValidGroups(workspace.groups.map((existing) => ({
    ...existing,
    members: existing.members.filter((wallet) => !memberSet.has(wallet.toLowerCase())),
  })));
  return {
    ...workspace,
    groups: [
      ...groups,
      { ...group, members, collapsed: group.collapsed !== false },
    ].slice(-MAX_GROUPS_PER_FOCUS),
  };
}

export function moveWorkspaceMemberToGroup(
  workspace: NetworkFocusWorkspace,
  wallet: string,
  targetGroupId: string,
): NetworkFocusWorkspace {
  const key = wallet.toLowerCase();
  const target = workspace.groups.find((group) => group.id === targetGroupId);
  if (!target || target.members.some((member) => member.toLowerCase() === key)) return workspace;

  const groups = workspace.groups.map((group) => {
    const members = group.members.filter((member) => member.toLowerCase() !== key);
    if (group.id === targetGroupId) members.push(key);
    return { ...group, members: Array.from(new Set(members)).slice(0, MAX_MEMBERS_PER_GROUP) };
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
    groups: keepValidGroups(workspace.groups.map((group) => ({
      ...group,
      members: group.members.filter((member) => member.toLowerCase() !== key),
    }))),
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
