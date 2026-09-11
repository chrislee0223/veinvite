'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import { useWalletLauncher } from '@/components/WalletControl';

type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };
type DeviceKey = 'desktop' | 'mobile';

type NetworkChild = {
  wallet: string;
  status: MemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type SearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

type NetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    qualified: number;
    thisRound: number | null;
    depth: number;
  };
  round: {
    id: number;
    startAt: string;
    endAt: string;
  } | null;
  children: NetworkChild[];
  searchResults: SearchResult[];
  depthLimitReached: boolean;
};

type SavedNodePoint = Point & { manual: boolean };
type LayoutDeviceStore = Record<string, SavedNodePoint>;
type LayoutScopeStore = { desktop?: LayoutDeviceStore; mobile?: LayoutDeviceStore };
type LayoutStore = Record<string, LayoutScopeStore>;

type DevicePoints = { desktop: Point; mobile: Point };
type UserGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  positions: DevicePoints;
  memberOffsets: DevicePoints;
};

type NodePointer = {
  pointerId: number;
  wallet: string;
  startClient: Point;
  startBase: Point;
  moved: boolean;
  mode: 'layout' | 'group';
};

type GroupPointer = {
  pointerId: number;
  groupId: string;
  startClient: Point;
  startPosition: Point;
  startOffset: Point;
  moved: boolean;
};

type PanPointer = {
  pointerId: number;
  last: Point;
  moved: boolean;
};

type PinchState = {
  distance: number;
  center: Point;
  nodeWallet: string | null;
  navigated: boolean;
};

type EditorState =
  | { kind: 'create'; name: string; selected: string[] }
  | { kind: 'edit'; groupId: string; name: string; selected: string[] }
  | null;

type ToastState = { message: string; undo?: UserGroup[] } | null;

const MIN_SCALE = 0.34;
const MAX_SCALE = 2.5;
const NODE_ENTER_SCALE = 1.72;
const PARENT_RETURN_SCALE = 0.42;
const MAX_GROUP_NAME = 24;
const SEARCH_DELAY_MS = 280;
const CENTER_SAFE_RADIUS_DESKTOP = 220;
const CENTER_SAFE_RADIUS_MOBILE = 150;
const EMPTY_DEVICE_POINTS: DevicePoints = {
  desktop: { x: 0, y: 0 },
  mobile: { x: 0, y: 0 },
};

function keyWallet(value: string): string {
  return value.toLowerCase();
}

function shortWallet(value: string): string {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function cloneDevicePoints(points: DevicePoints): DevicePoints {
  return { desktop: clonePoint(points.desktop), mobile: clonePoint(points.mobile) };
}

function cloneGroups(groups: UserGroup[]): UserGroup[] {
  return groups.map((group) => ({
    ...group,
    members: [...group.members],
    positions: cloneDevicePoints(group.positions),
    memberOffsets: cloneDevicePoints(group.memberOffsets),
  }));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function autoPoint(wallet: string, compact: boolean): Point {
  const hash = stableHash(wallet);
  const unit = hash / 0xffffffff;
  const angle = -Math.PI / 2 + unit * Math.PI * 2;
  const band = ((hash >>> 8) % 4);
  const jitter = ((hash >>> 16) % 61) - 30;
  const base = compact ? 168 : 255;
  const step = compact ? 88 : 130;
  const radius = base + band * step + jitter;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * (compact ? 0.86 : 0.8) + (compact ? 12 : 18),
  };
}

function defaultGroupPoint(index: number, compact: boolean): Point {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const ring = Math.floor(index / 7);
  const angle = -Math.PI / 2 + index * goldenAngle;
  const radius = (compact ? 230 : 340) + ring * (compact ? 74 : 96);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * (compact ? 0.86 : 0.8) };
}

function protectCenter(point: Point, compact: boolean): Point {
  const minimum = compact ? CENTER_SAFE_RADIUS_MOBILE : CENTER_SAFE_RADIUS_DESKTOP;
  const radius = Math.hypot(point.x, point.y);
  if (radius >= minimum) return point;
  const angle = radius > 2 ? Math.atan2(point.y, point.x) : -Math.PI / 2;
  return { x: Math.cos(angle) * minimum, y: Math.sin(angle) * minimum };
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function uniqueGroupName(rawName: string, existingNames: string[]): string {
  const raw = rawName.trim().slice(0, MAX_GROUP_NAME);
  if (!raw) return '';
  const used = new Set(existingNames.map(normalizeName));
  if (!used.has(normalizeName(raw))) return raw;
  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` (${index})`;
    const base = raw.slice(0, Math.max(1, MAX_GROUP_NAME - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`.slice(0, MAX_GROUP_NAME);
    if (!used.has(normalizeName(candidate))) return candidate;
  }
  return raw;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function layoutStorageKey(rootWallet: string) {
  return `veinvite:network:v46:${keyWallet(rootWallet)}:layout-v1`;
}

function groupStorageKey(rootWallet: string) {
  return `veinvite:network:v46:${keyWallet(rootWallet)}:groups-v1`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

async function fetchNetwork(
  rootWallet: string,
  options: { focus?: string; query?: string; signal?: AbortSignal } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (options.focus && keyWallet(options.focus) !== keyWallet(rootWallet)) params.set('focus', options.focus);
  if (options.query) params.set('q', options.query);
  const response = await fetch(`/api/network?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null) as NetworkData | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && 'error' in payload && payload.error ? payload.error : 'Failed to load network.');
  }
  if (!payload || !('focusWallet' in payload) || !payload.focusWallet || !Array.isArray(payload.children)) {
    throw new Error('Network response was incomplete.');
  }
  return payload as NetworkData;
}

function statusText(status: MemberStatus) {
  if (status === 'REWARDED') return 'Rewarded';
  if (status === 'QUALIFIED') return 'Qualified';
  return 'In progress';
}

function useCompact(stageRef: React.RefObject<HTMLDivElement | null>) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setCompact((stage.clientWidth || window.innerWidth) <= 640);
    sync();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [stageRef]);
  return compact;
}

export function QaNetworkProductionV46() {
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const rootWallet = wallet ? keyWallet(wallet) : '';
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef<AbortController | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const panRef = useRef<PanPointer | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const nodePointerRef = useRef<NodePointer | null>(null);
  const groupPointerRef = useRef<GroupPointer | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const compact = useCompact(stageRef);
  const device: DeviceKey = compact ? 'mobile' : 'desktop';

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [data, setData] = useState<NetworkData | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [layouts, setLayouts] = useState<LayoutStore>({});
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [newGroupHover, setNewGroupHover] = useState(false);
  const [removeHover, setRemoveHover] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const scope = data ? keyWallet(data.focusWallet) : rootWallet;
  const currentGroups = useMemo(
    () => groups.filter((group) => group.scope === scope),
    [groups, scope],
  );
  const ownerByMember = useMemo(() => {
    const map = new Map<string, UserGroup>();
    currentGroups.forEach((group) => group.members.forEach((member) => map.set(member, group)));
    return map;
  }, [currentGroups]);

  const loadFocus = useCallback(async (focus?: string) => {
    if (!rootWallet) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadState('loading');
    setError('');
    try {
      const next = await fetchNetwork(rootWallet, { focus, signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(next);
      setSelectedWallet(null);
      setEditMode(false);
      setView({ x: 0, y: 0, scale: 1 });
      setLoadState('ready');
    } catch (reason) {
      if (controller.signal.aborted) return;
      setLoadState('error');
      setError(reason instanceof Error ? reason.message : 'Failed to load network.');
    }
  }, [rootWallet]);

  useEffect(() => {
    requestRef.current?.abort();
    searchRequestRef.current?.abort();
    setData(null);
    setSearchQuery('');
    setSearchResults([]);
    setGroupsOpen(false);
    setEditor(null);
    setSelectedWallet(null);
    setEditMode(false);
    if (!rootWallet) {
      setLoadState('idle');
      setLayouts({});
      setGroups([]);
      return;
    }
    setLayouts(readJson<LayoutStore>(layoutStorageKey(rootWallet), {}));
    setGroups(readJson<UserGroup[]>(groupStorageKey(rootWallet), []));
    void loadFocus(rootWallet);
    return () => requestRef.current?.abort();
  }, [rootWallet, loadFocus]);

  useEffect(() => {
    if (!rootWallet) return;
    try { window.localStorage.setItem(layoutStorageKey(rootWallet), JSON.stringify(layouts)); } catch { /* local layout is best effort */ }
  }, [rootWallet, layouts]);

  useEffect(() => {
    if (!rootWallet) return;
    try { window.localStorage.setItem(groupStorageKey(rootWallet), JSON.stringify(groups)); } catch { /* local groups are best effort */ }
  }, [rootWallet, groups]);

  useEffect(() => {
    if (!data) return;
    const currentScope = keyWallet(data.focusWallet);
    setLayouts((current) => {
      let changed = false;
      const next: LayoutStore = { ...current };
      const scopeStore: LayoutScopeStore = { ...(next[currentScope] ?? {}) };
      const deviceStore: LayoutDeviceStore = { ...(scopeStore[device] ?? {}) };
      data.children.forEach((child) => {
        const id = keyWallet(child.wallet);
        if (deviceStore[id]) return;
        const point = protectCenter(autoPoint(id, compact), compact);
        deviceStore[id] = { ...point, manual: false };
        changed = true;
      });
      if (!changed) return current;
      scopeStore[device] = deviceStore;
      next[currentScope] = scopeStore;
      return next;
    });
  }, [data, device, compact]);

  useEffect(() => {
    if (!groupsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (draggingNode) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (panelRef.current?.contains(target) || toolbarRef.current?.contains(target)) return;
      if (editor && target.closest('[data-v46-person="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setGroupsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGroupsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [groupsOpen, draggingNode, editor]);

  useEffect(() => {
    const value = searchQuery.trim().toLowerCase();
    if (!rootWallet || value.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchRequestRef.current?.abort();
    const controller = new AbortController();
    searchRequestRef.current = controller;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetchNetwork(rootWallet, { query: value, signal: controller.signal })
        .then((payload) => {
          if (!controller.signal.aborted) setSearchResults(payload.searchResults ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [rootWallet, searchQuery]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (message: string, undo?: UserGroup[]) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, undo });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, undo ? 4300 : 1800);
  };

  const undoToast = () => {
    if (!toast?.undo) return;
    setGroups(cloneGroups(toast.undo));
    setToast(null);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  };

  const savedPoint = useCallback((walletAddress: string): SavedNodePoint => {
    const id = keyWallet(walletAddress);
    const stored = layouts[scope]?.[device]?.[id];
    if (stored) return stored;
    const point = protectCenter(autoPoint(id, compact), compact);
    return { ...point, manual: false };
  }, [layouts, scope, device, compact]);

  const groupOffsetFor = useCallback((walletAddress: string): Point => {
    const owner = ownerByMember.get(keyWallet(walletAddress));
    if (!owner) return { x: 0, y: 0 };
    return owner.memberOffsets[device] ?? { x: 0, y: 0 };
  }, [ownerByMember, device]);

  const displayPoint = useCallback((walletAddress: string): Point => {
    const base = savedPoint(walletAddress);
    const offset = groupOffsetFor(walletAddress);
    return { x: base.x + offset.x, y: base.y + offset.y };
  }, [savedPoint, groupOffsetFor]);

  const setNodeBasePoint = (walletAddress: string, point: Point, manual: boolean) => {
    const id = keyWallet(walletAddress);
    setLayouts((current) => {
      const next: LayoutStore = { ...current };
      const scopeStore: LayoutScopeStore = { ...(next[scope] ?? {}) };
      const deviceStore: LayoutDeviceStore = { ...(scopeStore[device] ?? {}) };
      deviceStore[id] = { ...point, manual };
      scopeStore[device] = deviceStore;
      next[scope] = scopeStore;
      return next;
    });
  };

  const resetMovedNodes = () => {
    if (!data) return;
    setLayouts((current) => {
      const next: LayoutStore = { ...current };
      const scopeStore: LayoutScopeStore = { ...(next[scope] ?? {}) };
      const deviceStore: LayoutDeviceStore = { ...(scopeStore[device] ?? {}) };
      let changed = false;
      data.children.forEach((child) => {
        const id = keyWallet(child.wallet);
        if (!deviceStore[id]?.manual) return;
        const point = protectCenter(autoPoint(id, compact), compact);
        deviceStore[id] = { ...point, manual: false };
        changed = true;
      });
      if (!changed) return current;
      scopeStore[device] = deviceStore;
      next[scope] = scopeStore;
      return next;
    });
  };

  const groupPosition = (group: UserGroup): Point => group.positions[device] ?? defaultGroupPoint(0, compact);

  const createGroup = () => {
    if (!editor || editor.kind !== 'create') return;
    const existing = currentGroups.map((group) => group.name);
    const name = uniqueGroupName(editor.name || 'New group', existing);
    const selected = Array.from(new Set(editor.selected.map(keyWallet)));
    const ownedSelected = selected.filter((member) => data?.children.some((child) => keyWallet(child.wallet) === member));
    const points = ownedSelected.map((member) => displayPoint(member));
    const index = currentGroups.length;
    const centroid = points.length
      ? {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        }
      : defaultGroupPoint(index, compact);
    const desktop = compact ? defaultGroupPoint(index, false) : protectCenter(centroid, false);
    const mobile = compact ? protectCenter(centroid, true) : defaultGroupPoint(index, true);
    const before = cloneGroups(groups);
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setGroups((current) => {
      const cleaned = current.map((group) => group.scope === scope
        ? { ...group, members: group.members.filter((member) => !ownedSelected.includes(member)) }
        : group);
      return [...cleaned, {
        id,
        scope,
        name,
        members: ownedSelected,
        collapsed: true,
        positions: { desktop, mobile },
        memberOffsets: cloneDevicePoints(EMPTY_DEVICE_POINTS),
      }];
    });
    setEditor(null);
    showToast(`${name} created`, before);
  };

  const saveGroup = () => {
    if (!editor || editor.kind !== 'edit') return;
    const target = currentGroups.find((group) => group.id === editor.groupId);
    if (!target) return;
    const existing = currentGroups.filter((group) => group.id !== target.id).map((group) => group.name);
    const name = uniqueGroupName(editor.name || target.name, existing);
    const selected = Array.from(new Set(editor.selected.map(keyWallet))).filter((member) =>
      data?.children.some((child) => keyWallet(child.wallet) === member),
    );
    const before = cloneGroups(groups);
    setGroups((current) => current.map((group) => {
      if (group.scope !== scope) return group;
      if (group.id === target.id) return { ...group, name, members: selected };
      const members = group.members.filter((member) => !selected.includes(member));
      return members.length === group.members.length ? group : { ...group, members };
    }));
    setEditor(null);
    showToast(`${name} updated`, before);
  };

  const dissolveGroup = (groupId: string) => {
    const target = currentGroups.find((group) => group.id === groupId);
    if (!target) return;
    const before = cloneGroups(groups);
    setGroups((current) => current.filter((group) => group.id !== groupId));
    if (editor?.kind === 'edit' && editor.groupId === groupId) setEditor(null);
    showToast(`${target.name} dissolved · people kept`, before);
  };

  const moveNodeToGroup = (walletAddress: string, groupId: string) => {
    const member = keyWallet(walletAddress);
    const target = currentGroups.find((group) => group.id === groupId);
    if (!target) return;
    const owner = ownerByMember.get(member);
    if (owner?.id === groupId) {
      showToast(`Already in ${target.name}`);
      return;
    }
    const before = cloneGroups(groups);
    setGroups((current) => current.map((group) => {
      if (group.scope !== scope) return group;
      const without = group.members.filter((item) => item !== member);
      return group.id === groupId ? { ...group, members: [...without, member] } : { ...group, members: without };
    }));
    showToast(owner ? `Moved to ${target.name}` : `Added to ${target.name}`, before);
  };

  const removeNodeFromGroup = (walletAddress: string) => {
    const member = keyWallet(walletAddress);
    const owner = ownerByMember.get(member);
    if (!owner) return;
    const before = cloneGroups(groups);
    setGroups((current) => current.map((group) => group.id === owner.id
      ? { ...group, members: group.members.filter((item) => item !== member) }
      : group));
    showToast(`Removed from ${owner.name}`, before);
  };

  const beginCreateWith = (walletAddress?: string) => {
    setGroupsOpen(true);
    setEditor({ kind: 'create', name: '', selected: walletAddress ? [keyWallet(walletAddress)] : [] });
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const beginEditGroup = (group: UserGroup) => {
    setEditor({ kind: 'edit', groupId: group.id, name: group.name, selected: [...group.members] });
  };

  const toggleEditorMember = (walletAddress: string) => {
    const id = keyWallet(walletAddress);
    setEditor((current) => {
      if (!current) return current;
      const selected = current.selected.includes(id)
        ? current.selected.filter((item) => item !== id)
        : [...current.selected, id];
      return { ...current, selected } as EditorState;
    });
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setGroups((current) => current.map((group) => group.id === groupId
      ? { ...group, collapsed: !group.collapsed }
      : group));
  };

  const updateGroupPosition = (groupId: string, position: Point, offset: Point) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        positions: { ...group.positions, [device]: position },
        memberOffsets: { ...group.memberOffsets, [device]: offset },
      };
    }));
  };

  const nodeDropTargetAt = (client: Point) => {
    const element = document.elementFromPoint(client.x, client.y);
    if (!element) return { kind: 'none' as const };
    if (element.closest('[data-v46-remove="true"]')) return { kind: 'remove' as const };
    if (element.closest('[data-v46-new-group="true"]')) return { kind: 'new' as const };
    const groupTarget = element.closest<HTMLElement>('[data-v46-group-drop]');
    const groupId = groupTarget?.dataset.groupId;
    return groupId ? { kind: 'group' as const, groupId } : { kind: 'none' as const };
  };

  const goParent = () => {
    if (!data?.invitedBy) return;
    void loadFocus(data.invitedBy);
  };

  const goYou = () => {
    if (!rootWallet) return;
    void loadFocus(rootWallet);
  };

  const enterNetwork = (walletAddress: string) => {
    if (editMode) return;
    void loadFocus(walletAddress);
  };

  const fitCurrent = () => {
    if (!data || !stageRef.current) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const visiblePoints = data.children
      .filter((child) => !ownerByMember.get(keyWallet(child.wallet))?.collapsed)
      .map((child) => displayPoint(child.wallet));
    currentGroups.forEach((group) => {
      if (group.collapsed) visiblePoints.push(groupPosition(group));
    });
    if (!visiblePoints.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const minX = Math.min(0, ...visiblePoints.map((point) => point.x));
    const maxX = Math.max(0, ...visiblePoints.map((point) => point.x));
    const minY = Math.min(0, ...visiblePoints.map((point) => point.y));
    const maxY = Math.max(0, ...visiblePoints.map((point) => point.y));
    const width = Math.max(240, maxX - minX + 240);
    const height = Math.max(240, maxY - minY + 250);
    const scale = clamp(Math.min((rect.width - 24) / width, (rect.height - 24) / height, 1.12), MIN_SCALE, MAX_SCALE);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setView({ x: -cx * scale, y: -cy * scale, scale });
  };

  const setZoomAround = (nextScaleValue: number, client: Point) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = client.x - rect.left - rect.width / 2;
    const py = client.y - rect.top - rect.height / 2;
    setView((current) => {
      const nextScale = clamp(nextScaleValue, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return {
        x: px - worldX * nextScale,
        y: py - worldY * nextScale,
        scale: nextScale,
      };
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (editMode) return;
    event.preventDefault();
    const node = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-v46-person="true"]') : null;
    const walletAddress = node?.dataset.wallet;
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    setZoomAround(nextScale, { x: event.clientX, y: event.clientY });
    if (walletAddress && event.deltaY < 0 && nextScale >= NODE_ENTER_SCALE) {
      enterNetwork(walletAddress);
      return;
    }
    if (!walletAddress && data?.invitedBy && event.deltaY > 0 && nextScale <= PARENT_RETURN_SCALE) {
      goParent();
    }
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editMode) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-v46-ui="true"]') || target.closest('[data-v46-group-hub="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    const startedOnPerson = Boolean(target.closest('[data-v46-person="true"]'));
    pointersRef.current.set(event.pointerId, point);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (pointersRef.current.size === 1) {
      panRef.current = startedOnPerson ? null : { pointerId: event.pointerId, last: point, moved: false };
      pinchRef.current = null;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const middleElement = document.elementFromPoint(center.x, center.y);
      const middleNode = middleElement?.closest<HTMLElement>('[data-v46-person="true"]');
      pinchRef.current = {
        center,
        distance: distance(a, b),
        nodeWallet: middleNode?.dataset.wallet ?? null,
        navigated: false,
      };
      panRef.current = null;
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1 && panRef.current?.pointerId === event.pointerId) {
      const next = { x: event.clientX, y: event.clientY };
      const dx = next.x - panRef.current.last.x;
      const dy = next.y - panRef.current.last.y;
      if (Math.hypot(dx, dy) > 0) panRef.current.moved = true;
      panRef.current.last = next;
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      return;
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const nextDistance = distance(a, b);
      const previous = pinchRef.current;
      if (previous.distance > 0) {
        const nextScale = clamp(view.scale * (nextDistance / previous.distance), MIN_SCALE, MAX_SCALE);
        setZoomAround(nextScale, center);
        if (!previous.navigated && previous.nodeWallet && nextScale >= NODE_ENTER_SCALE) {
          previous.navigated = true;
          enterNetwork(previous.nodeWallet);
        } else if (!previous.navigated && !previous.nodeWallet && data?.invitedBy && nextScale <= PARENT_RETURN_SCALE) {
          previous.navigated = true;
          goParent();
        }
      }
      pinchRef.current = { ...previous, center, distance: nextDistance };
    }
  };

  const onStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [remainingId, point] = Array.from(pointersRef.current.entries())[0];
      panRef.current = { pointerId: remainingId, last: point, moved: false };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      panRef.current = null;
      pinchRef.current = null;
    }
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, child: NetworkChild) => {
    const id = keyWallet(child.wallet);
    if (editor) return;
    if (!editMode && !groupsOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const base = savedPoint(id);
    nodePointerRef.current = {
      pointerId: event.pointerId,
      wallet: id,
      startClient: { x: event.clientX, y: event.clientY },
      startBase: { x: base.x, y: base.y },
      moved: false,
      mode: editMode ? 'layout' : 'group',
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const onNodePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = nodePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dxScreen = event.clientX - drag.startClient.x;
    const dyScreen = event.clientY - drag.startClient.y;
    const movedDistance = Math.hypot(dxScreen, dyScreen);
    if (!drag.moved && movedDistance < 7) return;
    drag.moved = true;
    if (drag.mode === 'layout') {
      setNodeBasePoint(drag.wallet, {
        x: drag.startBase.x + dxScreen / view.scale,
        y: drag.startBase.y + dyScreen / view.scale,
      }, true);
      return;
    }
    setDraggingNode(drag.wallet);
    const target = nodeDropTargetAt({ x: event.clientX, y: event.clientY });
    setDropGroupId(target.kind === 'group' ? target.groupId : null);
    setNewGroupHover(target.kind === 'new');
    setRemoveHover(target.kind === 'remove');
  };

  const onNodePointerUp = (event: ReactPointerEvent<HTMLButtonElement>, child: NetworkChild) => {
    const drag = nodePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    nodePointerRef.current = null;
    if (!drag.moved) {
      setDraggingNode(null);
      if (drag.mode === 'group') setSelectedWallet(keyWallet(child.wallet));
      return;
    }
    if (drag.mode === 'group') {
      const target = nodeDropTargetAt({ x: event.clientX, y: event.clientY });
      if (target.kind === 'group') moveNodeToGroup(drag.wallet, target.groupId);
      else if (target.kind === 'new') beginCreateWith(drag.wallet);
      else if (target.kind === 'remove') removeNodeFromGroup(drag.wallet);
    }
    setDraggingNode(null);
    setDropGroupId(null);
    setNewGroupHover(false);
    setRemoveHover(false);
  };

  const onGroupPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (!editMode) return;
    event.preventDefault();
    event.stopPropagation();
    groupPointerRef.current = {
      pointerId: event.pointerId,
      groupId: group.id,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition: groupPosition(group),
      startOffset: group.memberOffsets[device] ?? { x: 0, y: 0 },
      moved: false,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const onGroupPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = groupPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startClient.x) / view.scale;
    const dy = (event.clientY - drag.startClient.y) / view.scale;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    updateGroupPosition(
      drag.groupId,
      { x: drag.startPosition.x + dx, y: drag.startPosition.y + dy },
      { x: drag.startOffset.x + dx, y: drag.startOffset.y + dy },
    );
  };

  const onGroupPointerUp = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    const drag = groupPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    groupPointerRef.current = null;
    if (!drag.moved) toggleGroupCollapsed(group.id);
  };

  const focusSearchResult = async (result: SearchResult) => {
    setSearchQuery('');
    setSearchResults([]);
    await loadFocus(result.wallet);
  };

  const selectedChild = selectedWallet
    ? data?.children.find((child) => keyWallet(child.wallet) === selectedWallet) ?? null
    : null;

  const visibleChildren = data?.children ?? [];
  const dimDetails = view.scale < 0.78;

  if (!wallet) {
    return (
      <main className="v46Shell">
        <section className="v46State">
          <span className="badge">V46 · PRODUCTION INTEGRATION QA</span>
          <h1>Connect your wallet</h1>
          <p>This preview uses the real VeInvite Network API and your actual referral data.</p>
          <button type="button" onClick={openWallet} disabled={isWalletActionPending}>Connect wallet</button>
        </section>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <main className="v46Shell"><section className="v46State"><span className="badge">V46 · REAL DATA</span><h1>Loading Network…</h1><p>Reading your current VeInvite referral network.</p></section><style jsx>{styles}</style></main>
    );
  }

  if (loadState === 'error' || !data) {
    return (
      <main className="v46Shell"><section className="v46State"><span className="badge">V46 · REAL DATA</span><h1>Network unavailable</h1><p>{error}</p><button type="button" onClick={() => void loadFocus(rootWallet)}>Retry</button></section><style jsx>{styles}</style></main>
    );
  }

  return (
    <main className="v46Shell">
      <section className="v46Header" data-v46-ui="true">
        <div>
          <span className="badge">V46 · PRODUCTION INTEGRATION QA</span>
          <h1>Network</h1>
          <p>Real wallet · real referral API · V45 interaction model</p>
        </div>
        <div className="summary">
          <strong>{data.summary.network.toLocaleString()}</strong><span>network</span>
          <i />
          <strong>{data.summary.direct.toLocaleString()}</strong><span>direct</span>
        </div>
      </section>

      <section className="v46Search" data-v46-ui="true">
        <span>⌕</span>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search wallet"
          spellCheck={false}
          autoComplete="off"
        />
        {searching ? <i className="spinner" /> : null}
        {searchQuery.trim().length >= 3 ? (
          <div className="searchMenu">
            {searchResults.length ? searchResults.map((result) => (
              <button key={result.wallet} type="button" onClick={() => void focusSearchResult(result)}>
                <b>{shortWallet(result.wallet)}</b><small>depth {result.depth}</small>
              </button>
            )) : !searching ? <p>No results</p> : null}
          </div>
        ) : null}
      </section>

      <section
        ref={stageRef}
        className={`v46Stage ${editMode ? 'editing' : ''} ${dimDetails ? 'far' : ''}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerEnd}
        onPointerCancel={onStagePointerEnd}
        onWheel={onWheel}
      >
        <div className="stageTop" data-v46-ui="true">
          <div className="crumbs">
            {data.breadcrumb.map((crumb, index) => (
              <span key={crumb}>
                {index > 0 ? <i>›</i> : null}
                <button type="button" onClick={() => void loadFocus(crumb)}>{index === 0 ? 'YOU' : shortWallet(crumb)}</button>
              </span>
            ))}
          </div>
          <div className="stageToolbar">
            <button
              ref={toolbarRef}
              type="button"
              className={groupsOpen ? 'active' : ''}
              onClick={() => setGroupsOpen((value) => !value)}
            >Groups {currentGroups.length ? `· ${currentGroups.length}` : ''}</button>
            <button type="button" className={editMode ? 'active' : ''} onClick={() => setEditMode((value) => !value)}>{editMode ? 'Done' : 'Edit Layout'}</button>
            {editMode ? <button type="button" onClick={resetMovedNodes}>Reset moved</button> : null}
          </div>
        </div>

        {groupsOpen ? (
          <div ref={panelRef} className="groupPanel" data-v46-ui="true">
            <div className="groupPanelHead">
              <div><b>{editor ? (editor.kind === 'create' ? 'Create group' : 'Edit group') : 'Groups'}</b><small>Personal organization only</small></div>
              <button type="button" onClick={() => setGroupsOpen(false)}>×</button>
            </div>
            {editor ? (
              <div className="groupEditor">
                <label>Group name<input ref={inputRef} value={editor.name} maxLength={MAX_GROUP_NAME} onChange={(event) => setEditor({ ...editor, name: event.target.value } as EditorState)} placeholder="Family, Friends, Work…" /></label>
                <div className="selectedCount"><b>{editor.selected.length}</b><span> selected · tap nodes to change</span></div>
                <div className="editorActions">
                  <button type="button" className="primary" onClick={editor.kind === 'create' ? createGroup : saveGroup}>{editor.kind === 'create' ? 'Create' : 'Save changes'}</button>
                  <button type="button" onClick={() => setEditor(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className={`newGroupDrop ${newGroupHover ? 'hover' : ''}`} data-v46-new-group="true" onClick={() => beginCreateWith()}>
                  <b>{currentGroups.length ? '+ New group' : '+ Create your first group'}</b>
                  <small>Drop a person here or tap to create empty</small>
                </div>
                <div className="groupRows">
                  {currentGroups.map((group) => (
                    <div key={group.id} className={`groupRow ${dropGroupId === group.id ? 'hover' : ''}`} data-v46-group-drop data-group-id={group.id}>
                      <button type="button" className="groupRowMain" onClick={() => toggleGroupCollapsed(group.id)}><b>{group.name}</b><small>{group.members.length} people · {group.collapsed ? 'collapsed' : 'expanded'}</small></button>
                      <button type="button" onClick={() => beginEditGroup(group)}>Manage</button>
                      <button type="button" onClick={() => dissolveGroup(group.id)}>Dissolve</button>
                    </div>
                  ))}
                </div>
                {draggingNode && ownerByMember.has(draggingNode) ? <div className={`removeDrop ${removeHover ? 'hover' : ''}`} data-v46-remove="true">Remove from group</div> : null}
              </>
            )}
          </div>
        ) : null}

        <div
          className="world"
          style={{ transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}
        >
          <svg className="edges" viewBox="-1600 -1400 3200 2800" aria-hidden="true">
            {visibleChildren.map((child) => {
              const id = keyWallet(child.wallet);
              const owner = ownerByMember.get(id);
              const revealManagedMember = editor?.kind === 'edit' && owner?.id === editor.groupId;
              if (owner?.collapsed && !revealManagedMember) return null;
              const point = displayPoint(id);
              return <path key={id} d={`M 0 0 C ${point.x * .18} ${point.y * .2}, ${point.x * .82} ${point.y * .78}, ${point.x} ${point.y}`} />;
            })}
          </svg>

          <div className="centerNode">
            <span className="centerCircle">YOU</span>
            <b>{shortWallet(data.focusWallet)}</b>
            <small>{data.summary.direct} direct · {data.summary.network} below</small>
          </div>

          {visibleChildren.map((child) => {
            const id = keyWallet(child.wallet);
            const owner = ownerByMember.get(id);
            const revealManagedMember = editor?.kind === 'edit' && owner?.id === editor.groupId;
            if (owner?.collapsed && !revealManagedMember) return null;
            const point = displayPoint(id);
            const selected = selectedWallet === id;
            const editorSelected = Boolean(editor?.selected.includes(id));
            return (
              <button
                key={id}
                type="button"
                className={`personNode ${selected ? 'selected' : ''} ${editorSelected ? 'editorSelected' : ''} ${draggingNode === id ? 'dragging' : ''}`}
                style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                data-v46-person="true"
                data-wallet={id}
                onPointerDown={(event) => onNodePointerDown(event, child)}
                onPointerMove={onNodePointerMove}
                onPointerUp={(event) => onNodePointerUp(event, child)}
                onPointerCancel={(event) => onNodePointerUp(event, child)}
                onClick={(event) => {
                  if (nodePointerRef.current) return;
                  if (editor) { event.preventDefault(); toggleEditorMember(id); return; }
                  if (!editMode && !groupsOpen) setSelectedWallet(id);
                }}
              >
                <span className="nodeCircle">{shortWallet(id).slice(-4)}</span>
                <b>{shortWallet(id)}</b>
                <small>{child.network + 1} branch · {child.direct} direct</small>
              </button>
            );
          })}

          {currentGroups.map((group) => {
            const position = groupPosition(group);
            return (
              <button
                key={group.id}
                type="button"
                className={`groupHub ${group.collapsed ? 'collapsed' : 'expanded'} ${dropGroupId === group.id ? 'hover' : ''}`}
                style={{ '--x': `${position.x}px`, '--y': `${position.y}px` } as CSSProperties}
                data-v46-group-hub="true"
                data-v46-group-drop
                data-group-id={group.id}
                onPointerDown={(event) => onGroupPointerDown(event, group)}
                onPointerMove={onGroupPointerMove}
                onPointerUp={(event) => onGroupPointerUp(event, group)}
                onPointerCancel={(event) => onGroupPointerUp(event, group)}
                onClick={() => { if (!editMode) toggleGroupCollapsed(group.id); }}
              >
                <b>{group.name}</b><small>{group.members.length} people</small>
              </button>
            );
          })}
        </div>

        {selectedChild ? (
          <aside className="inspector" data-v46-ui="true">
            <div className="inspectorHead"><div><b>{shortWallet(selectedChild.wallet)}</b><small>{statusText(selectedChild.status)}</small></div><button type="button" onClick={() => setSelectedWallet(null)}>×</button></div>
            <code>{selectedChild.wallet}</code>
            <div className="metrics"><span><b>{selectedChild.network + 1}</b>branch</span><span><b>{selectedChild.direct}</b>direct</span><span><b>{selectedChild.qualified}</b>qualified</span></div>
            <button type="button" className="viewNetwork" onClick={() => enterNetwork(selectedChild.wallet)}>View this network</button>
          </aside>
        ) : null}

        <div className="controls" data-v46-ui="true">
          <button type="button" onClick={goYou}>◎ YOU</button>
          <button type="button" onClick={fitCurrent}>Fit</button>
          <button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale + .12, MIN_SCALE, MAX_SCALE) }))}>+</button>
          <button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale - .12, MIN_SCALE, MAX_SCALE) }))}>−</button>
        </div>

        {editMode ? <div className="editHint" data-v46-ui="true">Drag a person to move only that person · drag a group hub to move the whole group</div> : null}
      </section>

      {toast ? <div className="toast" data-v46-ui="true"><span>{toast.message}</span>{toast.undo ? <button type="button" onClick={undoToast}>Undo</button> : null}</div> : null}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .v46Shell{min-height:100dvh;padding:18px 12px 28px;box-sizing:border-box;background:#0f0f0d;color:#eee8da;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.v46Header{width:min(1180px,100%);margin:0 auto 10px;display:flex;align-items:end;justify-content:space-between;gap:18px}.badge{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border:1px solid rgba(244,183,40,.22);border-radius:999px;background:rgba(244,183,40,.06);color:#cda943;font-size:.58rem;font-weight:900;letter-spacing:.08em}.v46Header h1{margin:7px 0 0;font-size:1.18rem}.v46Header p{margin:4px 0 0;color:#807a70;font-size:.66rem}.summary{display:flex;align-items:baseline;gap:5px;color:#777168;font-size:.6rem}.summary strong{color:#e4d9c4;font-size:.84rem}.summary i{width:1px;height:11px;margin:0 5px;background:rgba(255,255,255,.09)}.v46Search{position:relative;z-index:50;width:min(420px,calc(100% - 12px));height:39px;margin:0 auto 8px;display:flex;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#171713}.v46Search>span{color:#968d7e}.v46Search input{width:100%;border:0;outline:0;background:transparent;color:#eee8da;font:inherit;font-size:.7rem}.spinner{width:12px;height:12px;border:2px solid rgba(255,255,255,.15);border-top-color:#e5b735;border-radius:50%;animation:spin .8s linear infinite}.searchMenu{position:absolute;top:44px;left:0;right:0;padding:7px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#191915;box-shadow:0 18px 44px rgba(0,0,0,.38)}.searchMenu button{width:100%;min-height:38px;padding:0 8px;display:flex;align-items:center;justify-content:space-between;border:0;border-radius:9px;background:transparent;color:#e8e1d5;font:inherit;text-align:left}.searchMenu button:hover{background:rgba(255,255,255,.04)}.searchMenu small,.searchMenu p{color:#777168;font-size:.6rem}.v46Stage{position:relative;width:min(1180px,100%);height:min(72dvh,760px);min-height:540px;margin:0 auto;overflow:hidden;touch-action:none;border:1px solid rgba(255,205,80,.11);border-radius:20px;background:radial-gradient(circle at 50% 42%,rgba(244,183,40,.055),transparent 27%),#12120f;box-shadow:inset 0 0 80px rgba(0,0,0,.24)}.v46Stage.editing{border-color:rgba(244,183,40,.24)}.stageTop{position:absolute;z-index:60;left:10px;right:10px;top:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;pointer-events:none}.crumbs,.stageToolbar{display:flex;align-items:center;gap:5px;pointer-events:auto}.crumbs{max-width:55%;overflow:auto;padding:3px 5px;border-radius:11px;background:rgba(15,15,13,.76);backdrop-filter:blur(10px)}.crumbs span{display:flex;align-items:center;gap:5px}.crumbs button,.stageToolbar button,.controls button{min-height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(20,20,17,.9);color:#aaa397;font:inherit;font-size:.6rem;font-weight:850;white-space:nowrap}.crumbs button{border:0;background:transparent;padding:0 3px}.crumbs i{color:#5f5a52}.stageToolbar button.active{border-color:rgba(244,183,40,.28);background:rgba(244,183,40,.09);color:#e5bd50}.world{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;will-change:transform}.edges{position:absolute;left:-1600px;top:-1400px;width:3200px;height:2800px;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:rgba(203,170,88,.32);stroke-width:1.1;vector-effect:non-scaling-stroke}.centerNode{position:absolute;left:0;top:0;width:150px;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:4px;text-align:center;z-index:8}.centerCircle{width:66px;height:66px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.38);border-radius:50%;background:radial-gradient(circle at 35% 30%,#3a2c0e,#18150d 68%);box-shadow:0 0 34px rgba(244,183,40,.12);color:#f2c348;font-size:.68rem;font-weight:950}.centerNode b{font-size:.64rem}.centerNode small{color:#7d766c;font-size:.55rem}.personNode,.groupHub{position:absolute;left:0;top:0;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));transform-origin:center;touch-action:none}.personNode{z-index:7;width:120px;display:grid;justify-items:center;gap:3px;padding:0;border:0;background:transparent;color:#d9d2c6;font:inherit;cursor:pointer}.nodeCircle{width:52px;height:52px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.11);border-radius:50%;background:#1d1c18;box-shadow:0 7px 18px rgba(0,0,0,.24);color:#c7bfae;font-size:.58rem;font-weight:900}.personNode b{max-width:116px;overflow:hidden;text-overflow:ellipsis;font-size:.6rem;white-space:nowrap}.personNode small{color:#716b63;font-size:.52rem;white-space:nowrap}.personNode.selected .nodeCircle,.personNode.editorSelected .nodeCircle{border-color:rgba(244,183,40,.6);box-shadow:0 0 0 3px rgba(244,183,40,.08),0 8px 20px rgba(0,0,0,.24);color:#f2c348}.personNode.dragging{opacity:.72}.v46Stage.far .personNode b,.v46Stage.far .personNode small{opacity:0}.v46Stage.far .nodeCircle{width:44px;height:44px}.groupHub{z-index:9;min-width:92px;min-height:46px;padding:7px 12px;border:1px dashed rgba(244,183,40,.32);border-radius:18px;background:rgba(31,27,17,.9);color:#e5c25f;font:inherit;box-shadow:0 9px 24px rgba(0,0,0,.25);cursor:pointer}.groupHub b,.groupHub small{display:block}.groupHub b{font-size:.62rem}.groupHub small{margin-top:2px;color:#8c7c50;font-size:.52rem}.groupHub.expanded{opacity:.74}.groupHub.hover{border-color:#f0c44d;box-shadow:0 0 0 4px rgba(244,183,40,.09)}.groupPanel{position:absolute;z-index:90;top:53px;right:10px;width:min(330px,calc(100% - 20px));max-height:calc(100% - 74px);overflow:auto;padding:12px;box-sizing:border-box;border:1px solid rgba(244,183,40,.18);border-radius:17px;background:rgba(20,19,15,.97);box-shadow:0 20px 54px rgba(0,0,0,.48);touch-action:pan-y}.groupPanelHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.groupPanelHead b,.groupPanelHead small{display:block}.groupPanelHead b{font-size:.72rem}.groupPanelHead small{margin-top:3px;color:#777168;font-size:.56rem}.groupPanelHead button{width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#938d83}.newGroupDrop,.removeDrop{padding:13px;border:1px dashed rgba(244,183,40,.22);border-radius:13px;background:rgba(244,183,40,.035);text-align:center;cursor:pointer}.newGroupDrop b,.newGroupDrop small{display:block}.newGroupDrop b{font-size:.66rem;color:#d9bd67}.newGroupDrop small{margin-top:4px;color:#777168;font-size:.55rem}.newGroupDrop.hover,.removeDrop.hover{border-color:#edc44e;background:rgba(244,183,40,.1)}.groupRows{display:grid;gap:6px;margin-top:8px}.groupRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:5px;align-items:center;padding:6px;border:1px solid rgba(255,255,255,.065);border-radius:12px;background:rgba(255,255,255,.018)}.groupRow.hover{border-color:rgba(244,183,40,.48);background:rgba(244,183,40,.07)}.groupRow button{min-height:32px;padding:0 7px;border:0;border-radius:8px;background:transparent;color:#928b80;font:inherit;font-size:.55rem}.groupRowMain{text-align:left!important}.groupRowMain b,.groupRowMain small{display:block}.groupRowMain b{color:#ddd5c7;font-size:.62rem}.groupRowMain small{margin-top:2px;color:#756f66;font-size:.52rem}.removeDrop{margin-top:9px;color:#c9947f;font-size:.58rem}.groupEditor{display:grid;gap:10px}.groupEditor label{display:grid;gap:5px;color:#8f887d;font-size:.56rem}.groupEditor input{height:40px;padding:0 10px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#12120f;color:#ece5d9;outline:0}.selectedCount{padding:9px;border-radius:10px;background:rgba(255,255,255,.025);color:#7e776d;font-size:.58rem}.selectedCount b{color:#e1bd57}.editorActions{display:flex;gap:7px}.editorActions button{min-height:38px;padding:0 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.03);color:#9d968a;font:inherit;font-size:.59rem;font-weight:850}.editorActions .primary{border-color:rgba(244,183,40,.25);background:rgba(244,183,40,.1);color:#e0bd5b}.inspector{position:absolute;z-index:70;right:12px;bottom:12px;width:250px;padding:12px;box-sizing:border-box;border:1px solid rgba(255,205,80,.13);border-radius:16px;background:rgba(18,18,15,.95);box-shadow:0 18px 44px rgba(0,0,0,.38)}.inspectorHead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.inspectorHead b,.inspectorHead small{display:block}.inspectorHead b{font-size:.7rem}.inspectorHead small{margin-top:2px;color:#927c44;font-size:.55rem}.inspectorHead button{width:26px;height:26px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8d877d}.inspector code{display:block;margin:9px 0;padding:7px;border-radius:8px;background:#0f0f0d;color:#787168;font-size:.5rem;word-break:break-all}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.metrics span{padding:7px 4px;border-radius:9px;background:rgba(255,255,255,.025);color:#777168;font-size:.5rem;text-align:center}.metrics b{display:block;margin-bottom:2px;color:#d8cfbf;font-size:.66rem}.viewNetwork{width:100%;min-height:38px;margin-top:8px;border:1px solid rgba(244,183,40,.22);border-radius:10px;background:rgba(244,183,40,.08);color:#ddb94f;font:inherit;font-size:.6rem;font-weight:900}.controls{position:absolute;z-index:75;left:12px;bottom:12px;display:flex;gap:5px}.controls button{height:34px}.editHint{position:absolute;z-index:65;left:50%;bottom:14px;transform:translateX(-50%);padding:7px 10px;border:1px solid rgba(244,183,40,.13);border-radius:999px;background:rgba(20,18,12,.88);color:#a88e4b;font-size:.55rem;white-space:nowrap}.toast{position:fixed;z-index:120;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:10px;min-height:38px;padding:0 12px;border:1px solid rgba(244,183,40,.17);border-radius:12px;background:#191814;color:#c9c1b3;box-shadow:0 13px 35px rgba(0,0,0,.4);font-size:.6rem}.toast button{border:0;background:transparent;color:#edc44e;font:inherit;font-size:.6rem;font-weight:900}.v46State{width:min(520px,calc(100% - 24px));margin:18vh auto 0;padding:28px;box-sizing:border-box;border:1px solid rgba(244,183,40,.13);border-radius:20px;background:#151512;text-align:center}.v46State h1{margin:14px 0 7px;font-size:1.05rem}.v46State p{margin:0 auto 16px;max-width:390px;color:#7e786f;font-size:.68rem;line-height:1.55}.v46State button{min-height:42px;padding:0 15px;border:1px solid rgba(244,183,40,.23);border-radius:11px;background:rgba(244,183,40,.08);color:#e2bd53;font:inherit;font-size:.65rem;font-weight:900}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:640px){.v46Shell{padding:9px 6px 18px}.v46Header{align-items:flex-start;padding:4px 6px}.v46Header p{display:none}.summary{margin-top:4px}.v46Stage{height:76dvh;min-height:520px;border-radius:16px}.stageTop{left:7px;right:7px;top:7px;display:block}.crumbs{max-width:100%;width:max-content}.stageToolbar{margin-top:6px;justify-content:flex-end}.stageToolbar button{min-height:31px;padding:0 8px}.groupPanel{top:82px;right:7px;width:calc(100% - 14px);max-height:calc(100% - 94px)}.inspector{left:8px;right:8px;bottom:54px;width:auto}.controls{left:8px;bottom:8px}.editHint{bottom:50px;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}.personNode{width:106px}.nodeCircle{width:48px;height:48px}.centerCircle{width:60px;height:60px}.v46Stage.far .nodeCircle{width:42px;height:42px}}
  @media(prefers-reduced-motion:reduce){.spinner{animation:none}.world{transition:none!important}}
`;