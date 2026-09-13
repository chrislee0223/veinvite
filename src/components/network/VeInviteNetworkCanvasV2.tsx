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

import type {
  NetworkCanvasCopy,
  NetworkChild,
  NetworkData,
  NetworkSearchResult,
  NetworkSource,
} from './VeInviteNetworkCanvas';

export type { NetworkCanvasCopy, NetworkChild, NetworkData, NetworkSearchResult, NetworkSource } from './VeInviteNetworkCanvas';
export { NETWORK_CANVAS_COPY } from './VeInviteNetworkCanvas';

type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };
type DevicePoint = { desktop: Point; mobile: Point };
type UserGroup = {
  id: string;
  scope: string;
  name: string;
  members: string[];
  collapsed: boolean;
  position: DevicePoint;
};
type PressState = {
  pointerId: number;
  nodeId: string;
  index: number;
  start: Point;
  last: Point;
  timer: number;
  mode: 'pending' | 'edit' | 'group';
};
type PinchState = {
  startDistance: number;
  startZoom: number;
  worldAnchor: Point;
  nodeId: string | null;
  ratio: number;
};
type GroupMove = {
  groupId: string;
  pointerId: number;
  start: Point;
  origin: Point;
  moved: boolean;
};
type GroupDrag = {
  nodeId: string;
  pointerId: number;
  x: number;
  y: number;
  hover: string | 'new' | 'remove' | null;
};

type Props = {
  rootWallet: string;
  source: NetworkSource;
  copy: NetworkCanvasCopy;
  availableSlots?: (data: NetworkData) => number;
  onInvite?: (focusWallet: string, slotIndex: number) => Promise<void> | void;
  revision?: number;
  storageNamespace?: string;
  dir?: 'ltr' | 'rtl';
};

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2.2;
const DETAIL_ZOOM = 0.82;
const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 10;
const MAX_GROUP_NAME = 24;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const EDGE_PAN_PX = 44;
const EDGE_PAN_STEP = 9;

function keyWallet(value: string) { return value.trim().toLowerCase(); }
function shortWallet(value: string) { return value.length < 13 ? value : `${value.slice(0, 6)}…${value.slice(-4).toUpperCase()}`; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function devicePoint(value: Point): DevicePoint { return { desktop: { ...value }, mobile: { ...value } }; }
function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function autoPoint(id: string, index: number, compact: boolean): Point {
  const safeRadius = compact ? 174 : 236;
  const ringGap = compact ? 70 : 94;
  const perRing = compact ? 9 : 11;
  const ring = Math.floor(index / perRing);
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
  const jitter = ((hash(id) % 29) - 14) * .8;
  const radius = safeRadius + ring * ringGap + jitter;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * (compact ? .9 : .82),
  };
}
function slotPoint(index: number, compact: boolean): Point {
  const base = compact ? 198 : 274;
  const spread = compact ? .5 : .43;
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  const angle = Math.PI / 2 + side * (spread + row * .08);
  const radius = base + row * (compact ? 58 : 74);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .88 };
}
function pathTo(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(72, Math.abs(point.x) * .17);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}
function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function safeSet(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* local preference only */ }
}
function uniqueGroupName(raw: string, groups: UserGroup[], ignoreId?: string) {
  const clean = raw.trim().slice(0, MAX_GROUP_NAME);
  if (!clean) return '';
  const used = new Set(groups.filter((group) => group.id !== ignoreId).map((group) => group.name.trim().toLocaleLowerCase()));
  if (!used.has(clean.toLocaleLowerCase())) return clean;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`;
    const base = clean.slice(0, Math.max(1, MAX_GROUP_NAME - suffix.length)).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return clean;
}
function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function VeInviteNetworkCanvasV2({
  rootWallet,
  source,
  copy,
  availableSlots = () => 0,
  onInvite,
  revision = 0,
  storageNamespace = 'veinvite:network:canvas-v2',
  dir = 'ltr',
}: Props) {
  const normalizedRoot = keyWallet(rootWallet);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const groupTargetsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const newGroupTargetRef = useRef<HTMLButtonElement | null>(null);
  const removeTargetRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, { point: Point; nodeId: string | null }>>(new Map());
  const panRef = useRef<{ pointerId: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const editDragRef = useRef<{ pointerId: number; nodeId: string; offset: Point } | null>(null);
  const groupMoveRef = useRef<GroupMove | null>(null);
  const groupDragRef = useRef<GroupDrag | null>(null);
  const suppressNodeClickRef = useRef(0);
  const suppressGroupClickRef = useRef(0);
  const previousChildrenRef = useRef<Map<string, Set<string>>>(new Map());
  const autoFollowRef = useRef(true);
  const newTimerRef = useRef<number | null>(null);

  const [focusWallet, setFocusWallet] = useState(normalizedRoot);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compact, setCompact] = useState(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [editMode, setEditMode] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NetworkSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<{ mode: 'create' | 'edit'; id?: string; name: string; pendingMember?: string } | null>(null);
  const [temporaryRevealGroup, setTemporaryRevealGroup] = useState<string | null>(null);
  const [groupDrag, setGroupDrag] = useState<GroupDrag | null>(null);
  const [groupMovingId, setGroupMovingId] = useState<string | null>(null);
  const [joiningSlot, setJoiningSlot] = useState<number | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [notice, setNotice] = useState('');

  const device = compact ? 'mobile' : 'desktop';
  const scope = focusWallet;
  const layoutStorageKey = `${storageNamespace}:layout:${normalizedRoot}`;
  const groupStorageKey = `${storageNamespace}:groups:${normalizedRoot}`;
  const currentGroups = useMemo(() => groups.filter((group) => group.scope === scope), [groups, scope]);
  const memberOwner = useMemo(() => {
    const owner = new Map<string, string>();
    currentGroups.forEach((group) => group.members.forEach((id) => owner.set(id, group.id)));
    return owner;
  }, [currentGroups]);

  const positionFor = useCallback((id: string, index: number, targetScope = scope, targetDevice = device) => {
    const saved = positions[`${targetScope}|${targetDevice}|${id}`];
    return saved ?? autoPoint(id, index, targetDevice === 'mobile');
  }, [positions, scope, device]);
  const groupPosition = useCallback((group: UserGroup) => group.position[device], [device]);

  useEffect(() => {
    setGroups(readJson<UserGroup[]>(groupStorageKey, []));
    setPositions(readJson<Record<string, Point>>(layoutStorageKey, {}));
  }, [groupStorageKey, layoutStorageKey]);
  useEffect(() => safeSet(groupStorageKey, groups), [groupStorageKey, groups]);
  useEffect(() => safeSet(layoutStorageKey, positions), [layoutStorageKey, positions]);
  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync(); window.addEventListener('resize', sync); return () => window.removeEventListener('resize', sync);
  }, []);
  useEffect(() => () => { if (newTimerRef.current) window.clearTimeout(newTimerRef.current); }, []);

  const clearPress = () => {
    if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  const markInteraction = () => { autoFollowRef.current = false; };
  const stageRect = () => stageRef.current?.getBoundingClientRect() ?? null;
  const localPoint = (clientX: number, clientY: number) => {
    const rect = stageRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };
  const screenToWorld = (clientX: number, clientY: number) => {
    const point = localPoint(clientX, clientY);
    return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
  };
  const focusPoint = (point: Point, zoom = Math.max(1.12, view.scale)) => {
    const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    setTransitioning(true);
    setView({ x: -point.x * nextZoom, y: -point.y * nextZoom, scale: nextZoom });
    window.setTimeout(() => setTransitioning(false), 800);
  };
  const resetView = () => {
    setTransitioning(true); setView({ x: 0, y: 0, scale: 1 });
    window.setTimeout(() => setTransitioning(false), 720);
  };
  const zoomAround = (nextScale: number, clientX: number, clientY: number, from = view) => {
    const point = localPoint(clientX, clientY);
    const next = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    const worldX = (point.x - from.x) / from.scale;
    const worldY = (point.y - from.y) / from.scale;
    setView({ x: point.x - worldX * next, y: point.y - worldY * next, scale: next });
  };

  const loadFocus = useCallback(async (target: string, signal?: AbortSignal, followNew = true): Promise<NetworkData | null> => {
    setLoading(true); setError('');
    try {
      const payload = await source(normalizedRoot, { focus: keyWallet(target), signal });
      if (signal?.aborted) return null;
      const key = keyWallet(payload.focusWallet);
      const nextSet = new Set(payload.children.map((child) => keyWallet(child.wallet)));
      const previous = previousChildrenRef.current.get(key);
      previousChildrenRef.current.set(key, nextSet);
      const arrivals = previous ? [...nextSet].filter((id) => !previous.has(id)) : [];
      setData(payload);
      setFocusWallet(key);
      setSelectedWallet(null);
      setTemporaryRevealGroup(null);
      setLoading(false);
      if (arrivals.length) {
        setNewIds(arrivals);
        if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
        newTimerRef.current = window.setTimeout(() => setNewIds([]), 2800);
        if (arrivals.length === 1 && followNew && autoFollowRef.current) {
          const index = payload.children.findIndex((child) => keyWallet(child.wallet) === arrivals[0]);
          const point = positionFor(arrivals[0], Math.max(0, index), key, device);
          focusPoint(point, Math.max(1.08, view.scale));
        }
      }
      return payload;
    } catch (cause) {
      if (signal?.aborted) return null;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : copy.loadError);
      return null;
    }
  }, [source, normalizedRoot, positionFor, device, view.scale, copy.loadError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFocus(focusWallet || normalizedRoot, controller.signal, revision > 0);
    return () => controller.abort();
    // Focus navigation is explicit; revision refreshes the current focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, normalizedRoot]);

  useEffect(() => {
    if (!searchOpen || query.trim().length < 3) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void source(normalizedRoot, { query: query.trim().toLowerCase(), signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) setSearchResults(payload.searchResults ?? []); })
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchOpen, query, source, normalizedRoot]);

  useEffect(() => {
    if (!groupsOpen && !groupForm) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // A node or group hub is a valid drag source while the panel is open.
      if (target.closest('[data-node-id],.groupHub')) return;
      if (groupDragRef.current || groupMoveRef.current) return;
      setGroupForm(null); setGroupsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setGroupForm(null); setGroupsOpen(false);
    };
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onOutside, true); window.removeEventListener('keydown', onKey); };
  }, [groupsOpen, groupForm]);

  const goFocus = async (wallet: string) => {
    markInteraction(); clearPress(); setEditMode(false); setGroupsOpen(false); setGroupForm(null); setSearchOpen(false); resetView();
    await loadFocus(keyWallet(wallet), undefined, false);
  };
  const goYou = async () => goFocus(normalizedRoot);
  const goParent = async () => { if (data?.invitedBy) await goFocus(data.invitedBy); };

  const fit = () => {
    if (!data || !stageRef.current) return;
    const points = data.children.map((child, index) => positionFor(keyWallet(child.wallet), index));
    const slots = Array.from({ length: Math.max(0, availableSlots(data)) }, (_, index) => slotPoint(index, compact));
    const hubs = currentGroups.filter((group) => group.collapsed).map(groupPosition);
    const all = [...points, ...slots, ...hubs];
    if (!all.length) { resetView(); return; }
    const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y)); const maxY = Math.max(...all.map((p) => p.y));
    const rect = stageRef.current.getBoundingClientRect();
    const next = clamp(Math.min((rect.width - 72) / Math.max(360, maxX - minX + 190), (rect.height - 72) / Math.max(360, maxY - minY + 210), 1.08), MIN_ZOOM, MAX_ZOOM);
    setTransitioning(true);
    setView({ x: -((minX + maxX) / 2) * next, y: -((minY + maxY) / 2) * next, scale: next });
    window.setTimeout(() => setTransitioning(false), 720);
  };

  const setNodePosition = (id: string, point: Point) => {
    setPositions((current) => ({ ...current, [`${scope}|${device}|${id}`]: point }));
  };
  const resetLayout = () => {
    setPositions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${scope}|${device}|`))));
  };

  const hitGroupTarget = (clientX: number, clientY: number) => {
    if (removeTargetRef.current) {
      const rect = removeTargetRef.current.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return 'remove' as const;
    }
    if (newGroupTargetRef.current) {
      const rect = newGroupTargetRef.current.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return 'new' as const;
    }
    for (const [id, element] of groupTargetsRef.current.entries()) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left - 4 && clientX <= rect.right + 4 && clientY >= rect.top - 4 && clientY <= rect.bottom + 4) return id;
    }
    return null;
  };
  const panNearEdge = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || editMode) return;
    let dx = 0; let dy = 0;
    if (clientX < rect.left + EDGE_PAN_PX) dx = EDGE_PAN_STEP;
    else if (clientX > rect.right - EDGE_PAN_PX) dx = -EDGE_PAN_STEP;
    if (clientY < rect.top + EDGE_PAN_PX) dy = EDGE_PAN_STEP;
    else if (clientY > rect.bottom - EDGE_PAN_PX) dy = -EDGE_PAN_STEP;
    if (dx || dy) setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };
  const moveMemberToGroup = (nodeId: string, targetId: string) => {
    setGroups((current) => current.map((group) => {
      if (group.scope !== scope) return group;
      const without = group.members.filter((id) => id !== nodeId);
      return group.id === targetId ? { ...group, members: [...without, nodeId] } : { ...group, members: without };
    }));
  };
  const removeMember = (nodeId: string) => {
    setGroups((current) => current.map((group) => group.scope === scope ? { ...group, members: group.members.filter((id) => id !== nodeId) } : group));
  };

  const beginNodePointer = (event: ReactPointerEvent<HTMLButtonElement>, id: string, index: number) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    const state: PressState = {
      pointerId: event.pointerId,
      nodeId: id,
      index,
      start: { x: event.clientX, y: event.clientY },
      last: { x: event.clientX, y: event.clientY },
      timer: 0,
      mode: editMode ? 'edit' : 'pending',
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (editMode) {
      const point = positionFor(id, index);
      const world = screenToWorld(event.clientX, event.clientY);
      editDragRef.current = { pointerId: event.pointerId, nodeId: id, offset: { x: world.x - point.x, y: world.y - point.y } };
    } else {
      state.timer = window.setTimeout(() => {
        const current = pressRef.current;
        if (!current || current.pointerId !== state.pointerId || current.mode !== 'pending') return;
        current.mode = 'edit';
        setEditMode(true); setSelectedWallet(null); setNotice(copy.editLayout);
        window.setTimeout(() => setNotice(''), 1200);
        const point = positionFor(id, index);
        const world = screenToWorld(current.last.x, current.last.y);
        editDragRef.current = { pointerId: current.pointerId, nodeId: id, offset: { x: world.x - point.x, y: world.y - point.y } };
      }, LONG_PRESS_MS);
    }
    pressRef.current = state;
  };
  const moveNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const editDrag = editDragRef.current;
    if (editDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      const world = screenToWorld(event.clientX, event.clientY);
      setNodePosition(editDrag.nodeId, { x: world.x - editDrag.offset.x, y: world.y - editDrag.offset.y });
      return;
    }
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    press.last = { x: event.clientX, y: event.clientY };
    const moved = distance(press.start, press.last);
    if (press.mode === 'group') {
      panNearEdge(event.clientX, event.clientY);
      const next: GroupDrag = { nodeId: press.nodeId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, hover: hitGroupTarget(event.clientX, event.clientY) };
      groupDragRef.current = next; setGroupDrag(next); event.preventDefault(); return;
    }
    if (moved <= MOVE_CANCEL_PX) return;
    if (press.timer) { window.clearTimeout(press.timer); press.timer = 0; }
    if (groupsOpen && press.mode === 'pending') {
      press.mode = 'group';
      suppressNodeClickRef.current = performance.now() + 700;
      const next: GroupDrag = { nodeId: press.nodeId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, hover: hitGroupTarget(event.clientX, event.clientY) };
      groupDragRef.current = next; setGroupDrag(next); event.preventDefault();
    }
  };
  const finishNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (editDragRef.current?.pointerId === event.pointerId) {
      editDragRef.current = null;
      suppressNodeClickRef.current = performance.now() + 500;
    }
    if (press?.pointerId === event.pointerId && press.mode === 'group') {
      const target = hitGroupTarget(event.clientX, event.clientY);
      suppressNodeClickRef.current = performance.now() + 700;
      if (target === 'remove') removeMember(press.nodeId);
      else if (target === 'new') { setGroupForm({ mode: 'create', name: '', pendingMember: press.nodeId }); setGroupsOpen(true); }
      else if (target) moveMemberToGroup(press.nodeId, target);
    }
    groupDragRef.current = null; setGroupDrag(null); clearPress();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const saveGroup = () => {
    if (!groupForm) return;
    const name = uniqueGroupName(groupForm.name, currentGroups, groupForm.id);
    if (!name) return;
    if (groupForm.mode === 'create') {
      const pending = groupForm.pendingMember;
      const index = currentGroups.length;
      const desktop = autoPoint(`group-${index}`, index + 2, false);
      const mobile = autoPoint(`group-${index}`, index + 2, true);
      const group: UserGroup = {
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        scope,
        name,
        members: pending ? [pending] : [],
        collapsed: true,
        position: { desktop, mobile },
      };
      setGroups((current) => {
        const cleaned = pending ? current.map((item) => item.scope === scope ? { ...item, members: item.members.filter((id) => id !== pending) } : item) : current;
        return [...cleaned, group];
      });
    } else if (groupForm.id) {
      setGroups((current) => current.map((group) => group.id === groupForm.id ? { ...group, name } : group));
    }
    setGroupForm(null);
  };
  const dissolveGroup = (groupId: string) => { setGroups((current) => current.filter((group) => group.id !== groupId)); setGroupForm(null); };
  const toggleGroup = (groupId: string) => setGroups((current) => current.map((group) => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group));

  const beginGroupMove = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction(); event.stopPropagation();
    const state: GroupMove = {
      groupId: group.id,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: groupPosition(group),
      moved: false,
    };
    groupMoveRef.current = state; setGroupMovingId(group.id);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };
  const moveGroup = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const move = groupMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    const dx = event.clientX - move.start.x; const dy = event.clientY - move.start.y;
    if (!move.moved && Math.hypot(dx, dy) < 5) return;
    move.moved = true; suppressGroupClickRef.current = performance.now() + 600;
    event.preventDefault();
    const next = { x: move.origin.x + dx / view.scale, y: move.origin.y + dy / view.scale };
    setGroups((current) => current.map((group) => group.id === move.groupId ? { ...group, position: { ...group.position, [device]: next } } : group));
  };
  const finishGroupMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const move = groupMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    if (move.moved) suppressGroupClickRef.current = performance.now() + 650;
    groupMoveRef.current = null; setGroupMovingId(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>('[data-node-id]');
    pointersRef.current.set(event.pointerId, { point: { x: event.clientX, y: event.clientY }, nodeId: node?.dataset.nodeId ?? null });
    if (pointersRef.current.size === 2 && !editMode) {
      clearPress(); panRef.current = null; markInteraction();
      const values = [...pointersRef.current.values()].slice(0, 2);
      const a = values[0].point; const b = values[1].point;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const local = localPoint(midpoint.x, midpoint.y);
      const exact = document.elementFromPoint(midpoint.x, midpoint.y)?.closest<HTMLElement>('[data-node-id]');
      const nodeId = exact?.dataset.nodeId ?? values.find((item) => item.nodeId)?.nodeId ?? null;
      pinchRef.current = {
        startDistance: Math.max(1, distance(a, b)),
        startZoom: view.scale,
        worldAnchor: { x: (local.x - view.x) / view.scale, y: (local.y - view.y) / view.scale },
        nodeId,
        ratio: 1,
      };
      return;
    }
    if (pointersRef.current.size > 1 || editMode || target.closest('[data-interactive="true"]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    panRef.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: view.x, y: view.y }, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };
  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointersRef.current.get(event.pointerId);
    if (pointer) pointer.point = { x: event.clientX, y: event.clientY };
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const values = [...pointersRef.current.values()].slice(0, 2);
      const a = values[0].point; const b = values[1].point;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = Math.max(1, distance(a, b)) / pinch.startDistance;
      pinch.ratio = ratio;
      const local = localPoint(midpoint.x, midpoint.y);
      const next = clamp(pinch.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
      setView({ x: local.x - pinch.worldAnchor.x * next, y: local.y - pinch.worldAnchor.y * next, scale: next });
      event.preventDefault(); return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.start.x; const dy = event.clientY - pan.start.y;
    if (!pan.moved && Math.hypot(dx, dy) < 6) return;
    pan.moved = true;
    setView((current) => ({ ...current, x: pan.origin.x + dx, y: pan.origin.y + dy }));
  };
  const onStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size < 2) {
      pinchRef.current = null;
      if (pinch.nodeId && pinch.ratio >= 1.38) void goFocus(pinch.nodeId);
      else if (data?.invitedBy && pinch.ratio <= .68) void goParent();
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (editMode) return;
    event.preventDefault(); markInteraction();
    zoomAround(view.scale * (event.deltaY < 0 ? 1.1 : .9), event.clientX, event.clientY);
  };

  const selectSearchResult = async (result: NetworkSearchResult) => {
    const parent = keyWallet(result.parentWallet ?? normalizedRoot);
    const payload = await loadFocus(parent, undefined, false);
    if (!payload) return;
    const resultId = keyWallet(result.wallet);
    const index = payload.children.findIndex((child) => keyWallet(child.wallet) === resultId);
    if (index < 0) return;
    const owner = groups.find((group) => group.scope === parent && group.members.includes(resultId) && group.collapsed);
    setTemporaryRevealGroup(owner?.id ?? null);
    setSelectedWallet(resultId);
    setSearchOpen(false); setQuery(''); setSearchResults([]);
    const point = positionFor(resultId, index, parent, device);
    window.setTimeout(() => focusPoint(point, 1.18), 50);
  };

  const invite = async (slotIndex: number) => {
    if (!data || !onInvite || joiningSlot !== null) return;
    setJoiningSlot(slotIndex); autoFollowRef.current = true;
    try {
      await onInvite(data.focusWallet, slotIndex);
      await loadFocus(data.focusWallet, undefined, true);
    } finally { setJoiningSlot(null); }
  };

  const slots = data ? Math.max(0, availableSlots(data)) : 0;
  const selected = data?.children.find((child) => keyWallet(child.wallet) === selectedWallet) ?? null;
  const detail = view.scale >= DETAIL_ZOOM;

  if (loading && !data) return <div className="networkV2State">{copy.loading}<style jsx>{stateCss}</style></div>;
  if (error && !data) return <div className="networkV2State"><b>{copy.loadError}</b><span>{error}</span><button type="button" onClick={() => void loadFocus(focusWallet)}>{copy.retry}</button><style jsx>{stateCss}</style></div>;
  if (!data) return null;

  return (
    <section className="networkV2" dir={dir}>
      <header className="networkHeader">
        <div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className="headerActions">
          <button type="button" className={searchOpen ? 'active' : ''} onClick={() => { setSearchOpen((value) => !value); setGroupsOpen(false); setGroupForm(null); }}>⌕ {copy.search}</button>
          <button type="button" className={groupsOpen ? 'active' : ''} onClick={() => { setGroupsOpen((value) => !value); setSearchOpen(false); setGroupForm(null); }}>◎ {copy.groups}</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="crumbs">
          {data.breadcrumb.map((wallet, index) => (
            <span key={wallet}>{index > 0 ? <i>›</i> : null}<button type="button" disabled={keyWallet(wallet) === focusWallet || editMode} onClick={() => void goFocus(wallet)}>{index === 0 ? copy.you : shortWallet(wallet)}</button></span>
          ))}
        </div>
        <div className="toolbarActions">
          <button type="button" onClick={() => void goYou()}>◎ {copy.you}</button>
          <button type="button" onClick={fit}>{copy.fit}</button>
          <button type="button" className={editMode ? 'active' : ''} onClick={() => { clearPress(); setEditMode((value) => !value); setSelectedWallet(null); }}>{editMode ? `✓ ${copy.done}` : `✦ ${copy.editLayout}`}</button>
          {editMode ? <button type="button" onClick={resetLayout}>{copy.reset}</button> : null}
        </div>
      </div>

      <div className="shell">
        <div className="shellTop">
          <div className="focusIdentity"><b>{focusWallet === normalizedRoot ? copy.you : shortWallet(focusWallet)}</b><span>{data.summary.direct} {copy.direct}</span><span>{data.summary.network} {copy.network}</span></div>
          <div className="zoomActions"><button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale - .12, MIN_ZOOM, MAX_ZOOM) }))}>−</button><button type="button" onClick={resetView}>{Math.round(view.scale * 100)}%</button><button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale + .12, MIN_ZOOM, MAX_ZOOM) }))}>+</button>{data.invitedBy ? <button type="button" onClick={() => void goParent()}>{copy.inviter} ↑</button> : null}</div>
        </div>

        <div
          ref={stageRef}
          className={`stage ${editMode ? 'editMode' : ''} ${transitioning ? 'transitioning' : ''} ${detail ? 'detail' : 'overview'}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerEnd}
          onPointerCancel={onStagePointerEnd}
          onWheel={onWheel}
        >
          <div className="world" style={{ '--vx': `${view.x}px`, '--vy': `${view.y}px`, '--vz': view.scale } as CSSProperties}>
            <div className="ambient" />
            <svg className="edges" viewBox="-2400 -2400 4800 4800" aria-hidden="true">
              {data.children.map((child, index) => {
                const id = keyWallet(child.wallet);
                const ownerId = memberOwner.get(id);
                const owner = ownerId ? currentGroups.find((group) => group.id === ownerId) : null;
                if (owner?.collapsed && temporaryRevealGroup !== owner.id) return null;
                return <path key={id} d={pathTo(positionFor(id, index))} className={newIds.includes(id) ? 'newEdge' : ''} />;
              })}
              {Array.from({ length: slots }, (_, index) => <path key={`slot-${index}`} d={pathTo(slotPoint(index, compact))} className="slotEdge" />)}
            </svg>

            <div className="centerNode"><span>●</span><b>{focusWallet === normalizedRoot ? copy.you : shortWallet(focusWallet)}</b><small>{data.summary.direct} {copy.direct} · {data.summary.network} {copy.network}</small></div>

            {data.children.map((child, index) => {
              const id = keyWallet(child.wallet);
              const ownerId = memberOwner.get(id);
              const owner = ownerId ? currentGroups.find((group) => group.id === ownerId) : null;
              if (owner?.collapsed && temporaryRevealGroup !== owner.id) return null;
              const point = positionFor(id, index);
              const fresh = newIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  data-node-id={id}
                  data-interactive="true"
                  className={`personNode ${selectedWallet === id ? 'selected' : ''} ${fresh ? 'fresh' : ''} ${groupDrag?.nodeId === id ? 'dragging' : ''}`}
                  style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                  onClick={() => {
                    if (editMode || performance.now() < suppressNodeClickRef.current) return;
                    setSelectedWallet(id); setTemporaryRevealGroup(owner?.collapsed ? owner.id : null);
                  }}
                  onPointerDown={(event) => beginNodePointer(event, id, index)}
                  onPointerMove={moveNodePointer}
                  onPointerUp={finishNodePointer}
                  onPointerCancel={finishNodePointer}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <span className="nodeCircle">●</span><b>{shortWallet(id)}</b><small>{child.direct} {copy.direct} · {child.network} {copy.network}</small>{fresh ? <em>{copy.newLabel}</em> : null}
                </button>
              );
            })}

            {currentGroups.filter((group) => group.collapsed).map((group) => {
              const point = groupPosition(group);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`groupHub ${temporaryRevealGroup === group.id ? 'revealed' : ''} ${groupMovingId === group.id ? 'moving' : ''}`}
                  data-interactive="true"
                  style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                  onPointerDown={(event) => beginGroupMove(event, group)}
                  onPointerMove={moveGroup}
                  onPointerUp={finishGroupMove}
                  onPointerCancel={finishGroupMove}
                  onClick={() => { if (performance.now() >= suppressGroupClickRef.current) toggleGroup(group.id); }}
                >
                  <span>◎</span><b>{group.name}</b><small>{group.members.length ? `${group.members.length} ${copy.grouped}` : copy.emptyGroup}</small>
                </button>
              );
            })}

            {Array.from({ length: slots }, (_, index) => {
              const point = slotPoint(index, compact); const joining = joiningSlot === index;
              return <button key={index} type="button" className={`slotNode ${joining ? 'joining' : ''}`} data-interactive="true" style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties} disabled={!onInvite} onClick={() => void invite(index)}><span>{joining ? '…' : '+'}</span><b>{joining ? copy.joining : copy.available}</b></button>;
            })}
          </div>

          {selected ? (
            <aside className="profileCard" data-interactive="true">
              <div><b>{shortWallet(selected.wallet)}</b><button type="button" onClick={() => { setSelectedWallet(null); setTemporaryRevealGroup(null); }}>×</button></div>
              <code>{selected.wallet}</code>
              <p>{selected.direct} {copy.direct} · {selected.network} {copy.network} · {selected.qualified} {copy.qualified}</p>
              <div className="profileActions">
                <a href={`https://block-explorer.vechain.org/address/${selected.wallet}`} target="_blank" rel="noreferrer">Explorer ↗</a>
                <button type="button" onClick={() => void goFocus(selected.wallet)}>{copy.viewNetwork} →</button>
              </div>
            </aside>
          ) : null}

          {searchOpen ? (
            <aside className="searchPanel" data-interactive="true">
              <div><b>{copy.search}</b><button type="button" onClick={() => setSearchOpen(false)}>×</button></div>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} dir="ltr" />
              <div className="searchResults">
                {searchResults.map((result) => <button key={result.wallet} type="button" onClick={() => void selectSearchResult(result)}><b>{shortWallet(result.wallet)}</b><small>{result.depth}</small></button>)}
                {query.trim().length >= 3 && !searching && searchResults.length === 0 ? <span>{copy.noResults}</span> : null}
              </div>
            </aside>
          ) : null}

          {groupsOpen ? (
            <aside ref={(node) => { panelRef.current = node; }} className="groupPanel" data-interactive="true">
              <div className="panelHead"><b>{copy.groups}</b><button type="button" onClick={() => { setGroupsOpen(false); setGroupForm(null); }}>×</button></div>
              {groupForm ? (
                <div className="groupForm">
                  <input autoFocus value={groupForm.name} maxLength={MAX_GROUP_NAME} placeholder={copy.groupName} onChange={(event) => setGroupForm((current) => current ? { ...current, name: event.target.value } : current)} />
                  <div><button type="button" onClick={() => setGroupForm(null)}>{copy.cancel}</button><button type="button" className="primary" onClick={saveGroup}>{groupForm.mode === 'create' ? copy.create : copy.save}</button></div>
                </div>
              ) : (
                <>
                  <div className="groupRows">
                    {currentGroups.map((group) => (
                      <div key={group.id} ref={(node) => { if (node) groupTargetsRef.current.set(group.id, node); else groupTargetsRef.current.delete(group.id); }} className={`groupRow ${groupDrag?.hover === group.id ? 'hover' : ''}`}>
                        <button type="button" className="groupMain" onClick={() => toggleGroup(group.id)}><b>{group.name}</b><small>{group.members.length ? `${group.members.length} ${copy.grouped}` : copy.emptyGroup}</small></button>
                        <button type="button" aria-label={copy.rename} onClick={() => setGroupForm({ mode: 'edit', id: group.id, name: group.name })}>✎</button>
                        <button type="button" aria-label={copy.dissolve} onClick={() => dissolveGroup(group.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <button ref={newGroupTargetRef} type="button" className={`newGroup ${groupDrag?.hover === 'new' ? 'hover' : ''}`} onClick={() => setGroupForm({ mode: 'create', name: '' })}><b>{currentGroups.length ? `＋ ${copy.newGroup}` : `＋ ${copy.createFirstGroup}`}</b><small>{copy.dissolveHelp}</small></button>
                  {groupDrag && memberOwner.has(groupDrag.nodeId) ? <div ref={removeTargetRef} className={`removeZone ${groupDrag.hover === 'remove' ? 'hover' : ''}`}>{copy.removeFromGroup}</div> : null}
                </>
              )}
            </aside>
          ) : null}

          {groupDrag ? <div className="dragGhost" style={{ left: groupDrag.x, top: groupDrag.y }}>{shortWallet(groupDrag.nodeId)}</div> : null}
          <div className="hint">{editMode ? `${copy.editLayout} · ${copy.done}` : copy.holdToEdit}</div>
          {newIds.length > 1 ? <div className="newBadge">{newIds.length} {copy.newLabel}</div> : null}
          {notice ? <div className="notice">✦ {notice}</div> : null}
        </div>
      </div>

      <style jsx>{`
        .networkV2{width:min(calc(100vw - 20px),960px);margin:0 auto;color:#f1eee5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.networkHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px}.networkHeader h1{margin:0;font-size:1.02rem;letter-spacing:-.025em}.networkHeader p{margin:3px 0 0;color:#716b61;font-size:.55rem}.headerActions,.toolbarActions,.zoomActions{display:flex;align-items:center;gap:5px}.networkV2 button,.networkV2 input{font:inherit}.headerActions button,.toolbarActions button,.zoomActions button{min-height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0e0e0c;color:#9b9488;font-size:.48rem;cursor:pointer}.headerActions button.active,.toolbarActions button.active{border-color:rgba(244,183,40,.35);color:#deb84e;background:rgba(244,183,40,.06)}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 2px 8px}.crumbs{min-width:0;display:flex;align-items:center;gap:4px;overflow:auto;scrollbar-width:none}.crumbs span{display:flex;align-items:center;gap:4px}.crumbs i{color:#4e4941;font-style:normal}.crumbs button{border:0;background:transparent;color:#8b8376;font-size:.48rem;white-space:nowrap;cursor:pointer}.crumbs button:disabled{color:#d7b759;cursor:default}.shell{border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#090908;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.2)}.shellTop{min-height:52px;padding:8px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.045)}.focusIdentity{display:flex;align-items:baseline;gap:7px;min-width:0}.focusIdentity b{font-size:.62rem;color:#d7d0c3}.focusIdentity span{font-size:.42rem;color:#6f685d}.stage{position:relative;height:min(76svh,740px);min-height:540px;overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:radial-gradient(circle at 50% 44%,rgba(244,183,40,.026),transparent 42%)}.stage:active{cursor:grabbing}.world{position:absolute;left:50%;top:50%;width:0;height:0;transform:translate3d(var(--vx),var(--vy),0) scale(var(--vz));transform-origin:0 0;will-change:transform}.transitioning .world{transition:transform 760ms cubic-bezier(.22,.78,.18,1)}.ambient{position:absolute;width:680px;height:540px;left:-340px;top:-270px;border-radius:50%;background:radial-gradient(circle,rgba(244,183,40,.035),transparent 68%);pointer-events:none}.edges{position:absolute;left:-2400px;top:-2400px;width:4800px;height:4800px;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:rgba(218,207,180,.22);stroke-width:1;vector-effect:non-scaling-stroke;transition:opacity 180ms ease}.edges .newEdge{stroke:rgba(244,190,49,.82);stroke-dasharray:5 8;animation:newEdge 1.15s linear infinite}.edges .slotEdge{stroke:rgba(233,187,61,.38);stroke-dasharray:2 10;animation:slotFlow 1.55s linear infinite;filter:drop-shadow(0 0 2px rgba(244,183,40,.22))}.centerNode{position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:8;display:grid;justify-items:center;gap:3px;pointer-events:none}.centerNode>span{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(244,183,40,.58);background:#12110d;color:#dcb449;box-shadow:0 0 36px rgba(244,183,40,.07)}.centerNode b{font-size:.52rem;color:#d9d2c6}.centerNode small{font-size:.36rem;color:#6e675c;white-space:nowrap}.personNode,.slotNode,.groupHub{position:absolute;left:0;top:0;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));border:0;background:transparent;color:#aaa197;display:grid;justify-items:center;gap:3px;cursor:pointer;z-index:6;touch-action:none}.personNode .nodeCircle{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(213,204,188,.2);background:#11110f;color:#6d685f;box-shadow:0 7px 24px rgba(0,0,0,.24);transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.personNode b,.slotNode b,.groupHub b{font-size:.42rem;white-space:nowrap}.personNode small,.groupHub small{font-size:.33rem;color:#625d54;white-space:nowrap}.personNode:hover .nodeCircle,.personNode.selected .nodeCircle{border-color:rgba(244,183,40,.7);color:#d5ad42;transform:scale(1.05)}.personNode.fresh .nodeCircle{border-color:rgba(244,183,40,.95);box-shadow:0 0 0 5px rgba(244,183,40,.08),0 0 35px rgba(244,183,40,.12);animation:freshPulse 1.2s ease-in-out infinite}.personNode em{position:absolute;top:-12px;padding:3px 5px;border-radius:999px;background:#d9ad39;color:#15120a;font-size:.3rem;font-style:normal;font-weight:900}.personNode.dragging{opacity:.25}.slotNode span{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.44);background:rgba(244,183,40,.025);color:#c89f36;font-size:.8rem;box-shadow:0 0 26px rgba(244,183,40,.04)}.slotNode b{color:#816c39}.slotNode.joining span{animation:freshPulse 1s ease-in-out infinite}.groupHub{z-index:7}.groupHub span{width:64px;height:50px;border-radius:18px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.34);background:rgba(17,15,10,.96);color:#b9973e;box-shadow:0 9px 28px rgba(0,0,0,.28)}.groupHub.moving{opacity:.82}.groupHub.revealed{opacity:.3}.overview .personNode b,.overview .personNode small,.overview .groupHub b,.overview .groupHub small{opacity:0;pointer-events:none}.overview .personNode .nodeCircle{width:42px;height:42px}.profileCard,.searchPanel,.groupPanel{position:absolute;z-index:30;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(13,13,11,.97);box-shadow:0 18px 48px rgba(0,0,0,.38);backdrop-filter:blur(14px)}.profileCard{right:12px;top:12px;width:232px;padding:10px}.profileCard>div:first-child,.searchPanel>div:first-child,.panelHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.profileCard b,.searchPanel b,.panelHead b{font-size:.52rem}.profileCard button,.searchPanel button,.groupPanel button{border:0;background:transparent;color:#91897d;cursor:pointer}.profileCard code{display:block;margin-top:8px;color:#6d675e;font-size:.36rem;word-break:break-all}.profileCard p{margin:8px 0;color:#8a8277;font-size:.4rem}.profileActions{display:flex;gap:5px}.profileActions a,.profileActions button{flex:1;min-height:31px;border:1px solid rgba(244,183,40,.18)!important;border-radius:8px!important;color:#c7a44b!important;background:rgba(244,183,40,.04)!important;font-size:.4rem!important;text-decoration:none;display:grid;place-items:center}.searchPanel{left:12px;top:12px;width:min(310px,calc(100% - 24px));padding:9px}.searchPanel input,.groupForm input{width:100%;height:34px;margin-top:8px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;outline:0;background:#0a0a09;color:#d7d0c4;font-size:.46rem}.searchResults{max-height:230px;margin-top:6px;overflow:auto}.searchResults button{width:100%;min-height:34px;padding:0 7px;display:flex;align-items:center;justify-content:space-between;border-radius:7px}.searchResults button:hover{background:rgba(244,183,40,.05)}.searchResults small,.searchResults>span{color:#696259;font-size:.37rem}.groupPanel{right:12px;top:12px;width:245px;padding:9px;max-height:calc(100% - 24px);overflow:auto}.groupRows{display:grid;gap:5px;margin-top:8px}.groupRow{display:flex;align-items:center;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#0d0d0b;transition:border-color 140ms ease,background 140ms ease}.groupRow.hover,.newGroup.hover,.removeZone.hover{border-color:rgba(244,183,40,.85)!important;background:rgba(244,183,40,.08)!important}.groupMain{min-width:0;flex:1;min-height:42px;text-align:left;display:grid;align-content:center}.groupMain b{font-size:.43rem;color:#b9b1a5}.groupMain small{font-size:.32rem;color:#625d54}.groupRow>button:not(.groupMain){width:30px}.newGroup{width:100%;min-height:52px;margin-top:8px;padding:8px!important;border:1px dashed rgba(244,183,40,.28)!important;border-radius:9px!important;text-align:left;display:grid;gap:2px;background:rgba(244,183,40,.035)!important}.newGroup b{font-size:.43rem;color:#bf9c42}.newGroup small{font-size:.31rem;color:#665e50}.removeZone{margin-top:7px;padding:10px;border:1px dashed rgba(217,121,94,.3);border-radius:8px;text-align:center;color:#a87868;font-size:.39rem}.groupForm>div{display:flex;justify-content:flex-end;gap:5px;margin-top:8px}.groupForm button{height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.06);border-radius:8px}.groupForm .primary{border-color:rgba(244,183,40,.26);color:#caa541;background:rgba(244,183,40,.05)}.dragGhost{position:fixed;z-index:999;transform:translate(12px,12px);padding:6px 8px;border:1px solid rgba(244,183,40,.35);border-radius:8px;background:#12110d;color:#c9aa54;font-size:.38rem;pointer-events:none}.hint{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);color:#4f4b44;font-size:.36rem;white-space:nowrap;pointer-events:none}.notice,.newBadge{position:absolute;left:50%;transform:translateX(-50%);padding:6px 9px;border:1px solid rgba(244,183,40,.23);border-radius:999px;background:rgba(15,14,11,.95);color:#c8a64c;font-size:.38rem;pointer-events:none}.notice{bottom:34px}.newBadge{top:12px}.editMode .personNode{cursor:move}.editMode .personNode .nodeCircle{border-color:rgba(244,183,40,.46)}
        @keyframes slotFlow{to{stroke-dashoffset:-48}}@keyframes newEdge{to{stroke-dashoffset:-52}}@keyframes freshPulse{50%{transform:scale(1.08);box-shadow:0 0 0 8px rgba(244,183,40,.04),0 0 40px rgba(244,183,40,.14)}}
        @media(max-width:640px){.networkV2{width:calc(100vw - 12px)}.networkHeader{padding:8px 2px}.networkHeader h1{font-size:.92rem}.networkHeader p{font-size:.5rem}.headerActions button{min-height:29px;padding:0 7px}.toolbar{align-items:flex-start;flex-direction:column}.toolbarActions{width:100%;overflow:auto}.shellTop{align-items:flex-start;flex-direction:column}.zoomActions{width:100%;overflow:auto}.stage{height:calc(100svh - 210px);min-height:510px}.profileCard{left:10px;right:10px;top:auto;bottom:34px;width:auto}.groupPanel{left:9px;right:9px;top:9px;width:auto;max-height:72%}.personNode .nodeCircle{width:46px;height:46px}.centerNode>span{width:54px;height:54px}.hint{max-width:90%;overflow:hidden;text-overflow:ellipsis}.overview .personNode .nodeCircle{width:40px;height:40px}}
        @media(prefers-reduced-motion:reduce){.transitioning .world,.personNode .nodeCircle{transition:none!important}.slotEdge,.newEdge,.personNode.fresh .nodeCircle{animation:none!important}}
      `}</style>
    </section>
  );
}

const stateCss = `.networkV2State{min-height:420px;display:grid;place-items:center;align-content:center;gap:9px;background:#080807;color:#8c857a;font:500 12px/1.4 system-ui,sans-serif}.networkV2State b{color:#c7c0b5}.networkV2State span{max-width:420px;color:#766f64}.networkV2State button{height:32px;padding:0 12px;border:1px solid rgba(244,183,40,.2);border-radius:9px;background:rgba(244,183,40,.04);color:#caa640}`;
