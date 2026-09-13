import type { NetworkChild, NetworkData } from './VeInviteNetworkCanvasV2';

export type Point = { x: number; y: number };
export type View = { x: number; y: number; scale: number };
export type DevicePoint = { desktop: Point; mobile: Point };
export type GraphNode = NetworkChild & {
  parentWallet?: string | null;
  generation?: number;
};
export type ExtendedNetworkData = NetworkData & { allNodes?: GraphNode[] };
export type UserGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  position: DevicePoint;
};
export type GroupForm = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  pendingMembers: string[];
};
export type PressState = {
  pointerId: number;
  nodeId: string;
  index: number;
  start: Point;
  last: Point;
  timer: number;
  mode: 'pending' | 'edit' | 'group';
  dragOffset?: Point;
};
export type PinchState = {
  startDistance: number;
  startZoom: number;
  worldAnchor: Point;
  nodeId: string | null;
  ratio: number;
};
export type GroupMove = {
  groupId: string;
  pointerId: number;
  start: Point;
  origin: Point;
  moved: boolean;
};
export type GroupDrag = {
  nodeId: string;
  pointerId: number;
  x: number;
  y: number;
  hover: string | 'new' | 'remove' | null;
};
export type UndoState = { groups: UserGroup[]; message: string } | null;

export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 2.4;
export const LONG_PRESS_MS = 520;
export const MOVE_CANCEL_PX = 10;
export const MAX_GROUP_NAME = 24;
export const EDGE_PAN_PX = 44;
export const EDGE_PAN_STEP = 9;
export const MAX_DOM_NODES = 1200;
export function keyWallet(value: string) {
  return value.trim().toLowerCase();
}
export function shortWallet(value: string) {
  return value.length < 13 ? value : `${value.slice(0, 6)}…${value.slice(-4).toUpperCase()}`;
}
export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function cloneGroups(groups: UserGroup[]) {
  return groups.map((group) => ({
    ...group,
    members: [...group.members],
    position: {
      desktop: { ...group.position.desktop },
      mobile: { ...group.position.mobile },
    },
  }));
}
function hash(value: string) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function safeSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local visual preference only.
  }
}
export function uniqueGroupName(raw: string, groups: UserGroup[], ignoreId?: string) {
  const clean = raw.trim().slice(0, MAX_GROUP_NAME);
  if (!clean) return '';
  const used = new Set(
    groups
      .filter((group) => group.id !== ignoreId)
      .map((group) => group.name.trim().toLocaleLowerCase()),
  );
  if (!used.has(clean.toLocaleLowerCase())) return clean;
  for (let number = 2; number < 1000; number += 1) {
    const suffix = ` (${number})`;
    const base = clean.slice(0, Math.max(1, MAX_GROUP_NAME - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return clean;
}
export function pointForGroup(index: number, compact: boolean): Point {
  const angle = -Math.PI / 2 + index * 2.399963229728653;
  const radius = (compact ? 245 : 350) + Math.floor(index / 7) * (compact ? 78 : 105);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.86 };
}
export function slotPoint(index: number, compact: boolean): Point {
  const base = compact ? 200 : 280;
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  const angle = Math.PI / 2 + side * (0.5 + row * 0.08);
  const radius = base + row * (compact ? 60 : 78);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.88 };
}
export function curveBetween(from: Point, to: Point) {
  const dx = to.x - from.x;
  const bend = Math.sign(dx || 1) * Math.min(72, Math.abs(dx) * 0.18);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y + (to.y - from.y) * 0.25}, ${to.x - bend} ${from.y + (to.y - from.y) * 0.75}, ${to.x} ${to.y}`;
}
function deriveGeneration(nodes: GraphNode[], focusWallet: string) {
  const parent = new Map<string, string | null>();
  const nodeMap = new Map<string, GraphNode>();
  nodes.forEach((node) => {
    const id = keyWallet(node.wallet);
    nodeMap.set(id, node);
    parent.set(id, node.parentWallet ? keyWallet(node.parentWallet) : null);
  });
  const memo = new Map<string, number>();
  const resolve = (id: string): number => {
    const existing = memo.get(id);
    if (existing !== undefined) return existing;
    const node = nodeMap.get(id);
    if (typeof node?.generation === 'number' && node.generation > 0) {
      memo.set(id, node.generation);
      return node.generation;
    }
    const p = parent.get(id);
    if (!p || p === focusWallet || !parent.has(p)) {
      memo.set(id, 1);
      return 1;
    }
    const value = resolve(p) + 1;
    memo.set(id, value);
    return value;
  };
  nodes.forEach((node) => resolve(keyWallet(node.wallet)));
  return memo;
}
export function buildStableLayout(
  nodes: GraphNode[],
  focusWallet: string,
  compact: boolean,
  manual: Record<string, Point>,
): Record<string, Point> {
  const normalizedFocus = keyWallet(focusWallet);
  const generation = deriveGeneration(nodes, normalizedFocus);
  const nodeMap = new Map(nodes.map((node) => [keyWallet(node.wallet), node]));
  const branchMemo = new Map<string, string>();
  const branchRoot = (id: string): string => {
    const saved = branchMemo.get(id);
    if (saved) return saved;
    const node = nodeMap.get(id);
    const parent = node?.parentWallet ? keyWallet(node.parentWallet) : normalizedFocus;
    if (!parent || parent === normalizedFocus || !nodeMap.has(parent)) {
      branchMemo.set(id, id);
      return id;
    }
    const root = branchRoot(parent);
    branchMemo.set(id, root);
    return root;
  };

  const ordered = [...nodes].sort((left, right) => {
    const lg = generation.get(keyWallet(left.wallet)) ?? 1;
    const rg = generation.get(keyWallet(right.wallet)) ?? 1;
    if (lg !== rg) return lg - rg;
    const lj = left.joinedAt ? Date.parse(left.joinedAt) : Number.MAX_SAFE_INTEGER;
    const rj = right.joinedAt ? Date.parse(right.joinedAt) : Number.MAX_SAFE_INTEGER;
    if (lj !== rj) return lj - rj;
    return keyWallet(left.wallet).localeCompare(keyWallet(right.wallet));
  });

  const minGap = compact ? 62 : 74;
  const cellSize = minGap;
  const grid = new Map<string, Point[]>();
  const result: Record<string, Point> = {};
  const bucket = (point: Point) => `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
  const add = (point: Point) => {
    const key = bucket(point);
    const values = grid.get(key) ?? [];
    values.push(point);
    grid.set(key, values);
  };
  const collides = (point: Point) => {
    const gx = Math.floor(point.x / cellSize);
    const gy = Math.floor(point.y / cellSize);
    for (let x = gx - 1; x <= gx + 1; x += 1) {
      for (let y = gy - 1; y <= gy + 1; y += 1) {
        const values = grid.get(`${x}:${y}`) ?? [];
        if (values.some((candidate) => distance(candidate, point) < minGap)) return true;
      }
    }
    return false;
  };

  Object.values(manual).forEach(add);
  const generationOrdinal = new Map<number, number>();

  ordered.forEach((node) => {
    const id = keyWallet(node.wallet);
    const manualPoint = manual[id];
    if (manualPoint) {
      result[id] = manualPoint;
      return;
    }
    const level = Math.max(1, generation.get(id) ?? 1);
    const ordinal = generationOrdinal.get(level) ?? 0;
    generationOrdinal.set(level, ordinal + 1);
    const branch = branchRoot(id);
    const branchAngle = (hash(branch) / 0xffffffff) * Math.PI * 2 - Math.PI / 2;
    const jitter = ((hash(id) % 10000) / 10000 - 0.5) * Math.min(1.35, 0.46 + level * 0.13);
    const baseRadius = (compact ? 170 : 230) + (level - 1) * (compact ? 118 : 158);
    const estimatedCapacity = Math.max(10, Math.floor((Math.PI * 2 * baseRadius) / minGap));
    const ring = Math.floor(ordinal / estimatedCapacity);
    const radius = baseRadius + ring * (compact ? 62 : 78) + ordinal * 0.12;
    let angle = branchAngle + jitter;
    let candidate = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.86 };
    for (let attempt = 0; attempt < 24 && collides(candidate); attempt += 1) {
      angle += (attempt % 2 === 0 ? 1 : -1) * (0.04 + attempt * 0.012);
      const pushed = radius + (attempt + 1) * (compact ? 18 : 22);
      candidate = { x: Math.cos(angle) * pushed, y: Math.sin(angle) * pushed * 0.86 };
    }
    result[id] = candidate;
    add(candidate);
  });
  return result;
}

export function scopedManualPositions(
  positions: Record<string, Point>,
  scope: string,
  device: 'desktop' | 'mobile',
) {
  const result: Record<string, Point> = {};
  const prefix = `${scope}|${device}|`;
  Object.entries(positions).forEach(([key, point]) => {
    if (key.startsWith(prefix)) result[key.slice(prefix.length)] = point;
  });
  return result;
}

export function groupFocusLayout(members: string[], compact: boolean) {
  const result: Record<string, Point> = {};
  const base = compact ? 170 : 225;
  members.forEach((id, index) => {
    const ring = Math.floor(index / (compact ? 9 : 12));
    const radius = base + ring * (compact ? 76 : 96);
    const angle = -Math.PI / 2 + index * 2.399963229728653;
    result[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.88 };
  });
  return result;
}
