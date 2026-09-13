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

export type NetworkMemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
export type NetworkChild = {
  wallet: string;
  status: NetworkMemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};
export type NetworkSearchResult = { wallet: string; parentWallet: string | null; depth: number };
export type NetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: { network: number; direct: number; qualified: number; thisRound: number | null; depth: number };
  round: { id: number; startAt: string; endAt: string } | null;
  children: NetworkChild[];
  searchResults: NetworkSearchResult[];
  depthLimitReached: boolean;
};
export type NetworkSource = (
  rootWallet: string,
  options?: { focus?: string; query?: string; signal?: AbortSignal },
) => Promise<NetworkData>;

export type NetworkCanvasCopy = {
  title: string;
  subtitle: string;
  search: string;
  searchPlaceholder: string;
  noResults: string;
  you: string;
  fit: string;
  editLayout: string;
  done: string;
  reset: string;
  groups: string;
  createFirstGroup: string;
  newGroup: string;
  groupName: string;
  create: string;
  cancel: string;
  save: string;
  rename: string;
  dissolve: string;
  dissolveHelp: string;
  collapse: string;
  expand: string;
  removeFromGroup: string;
  available: string;
  joining: string;
  viewNetwork: string;
  direct: string;
  network: string;
  qualified: string;
  inviter: string;
  loading: string;
  loadError: string;
  retry: string;
  holdToEdit: string;
  grouped: string;
  emptyGroup: string;
  newLabel: string;
};

export const NETWORK_CANVAS_COPY: Record<'en' | 'ko', NetworkCanvasCopy> = {
  en: {
    title: 'Network', subtitle: 'Explore your invite network', search: 'Search', searchPlaceholder: 'Wallet / node', noResults: 'No match',
    you: 'YOU', fit: 'Fit', editLayout: 'Edit layout', done: 'Done', reset: 'Reset', groups: 'Groups', createFirstGroup: 'Create your first group',
    newGroup: 'New group', groupName: 'Group name', create: 'Create', cancel: 'Cancel', save: 'Save', rename: 'Rename', dissolve: 'Dissolve group',
    dissolveHelp: 'People are not deleted.', collapse: 'Collapse', expand: 'Expand', removeFromGroup: 'Remove from group', available: 'Available', joining: 'Joining…',
    viewNetwork: 'View this network', direct: 'direct', network: 'network', qualified: 'qualified', inviter: 'Inviter', loading: 'Loading network…',
    loadError: 'Network unavailable', retry: 'Retry', holdToEdit: 'Hold a node to edit · drag canvas · pinch to zoom', grouped: 'grouped', emptyGroup: 'empty', newLabel: 'NEW',
  },
  ko: {
    title: '네트워크', subtitle: '내 초대 네트워크를 확인하세요', search: '검색', searchPlaceholder: '지갑 / 노드', noResults: '검색 결과 없음',
    you: '나', fit: '맞춤', editLayout: '배치 편집', done: '완료', reset: '초기화', groups: '그룹', createFirstGroup: '첫 그룹 만들기',
    newGroup: '새 그룹', groupName: '그룹 이름', create: '만들기', cancel: '취소', save: '저장', rename: '이름 변경', dissolve: '그룹 해제',
    dissolveHelp: '사람은 삭제되지 않습니다.', collapse: '접기', expand: '펼치기', removeFromGroup: '그룹에서 빼기', available: '초대 가능', joining: '추가 중…',
    viewNetwork: '이 네트워크 보기', direct: '직접', network: '네트워크', qualified: '완료', inviter: '초대자', loading: '네트워크 불러오는 중…',
    loadError: '네트워크를 불러올 수 없습니다', retry: '다시 시도', holdToEdit: '노드를 길게 눌러 편집 · 빈 화면 드래그 · 핀치 확대', grouped: '그룹', emptyGroup: '비어 있음', newLabel: 'NEW',
  },
};

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
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  timer: number;
  editingDrag: boolean;
  groupDrag: boolean;
};
type PointerInfo = { point: Point; nodeId: string | null };
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
const MOVE_CANCEL = 10;
const MAX_GROUP_NAME = 24;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
  const base = compact ? 176 : 238;
  const ringGap = compact ? 72 : 96;
  if (index < 8) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(4, Math.min(8, index + 1));
    const jitter = ((hash(id) % 19) - 9) * 0.7;
    return { x: Math.cos(angle) * (base + jitter), y: Math.sin(angle) * (base + jitter) * (compact ? .9 : .82) };
  }
  const ring = Math.floor((index - 8) / 10) + 1;
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
  const radius = base + ring * ringGap + ((hash(id) % 25) - 12);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * (compact ? .9 : .82) };
}
function slotPoint(index: number, compact: boolean): Point {
  const base = compact ? 196 : 272;
  const spread = compact ? .48 : .42;
  const angle = Math.PI / 2 + (index % 2 === 0 ? -spread : spread) + Math.floor(index / 2) * .18;
  const radius = base + Math.floor(index / 2) * (compact ? 58 : 74);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .88 };
}
function linePath(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(70, Math.abs(point.x) * .16);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}
function uniqueName(raw: string, groups: UserGroup[], ignoreId?: string) {
  const clean = raw.trim().slice(0, MAX_GROUP_NAME);
  if (!clean) return '';
  const used = new Set(groups.filter((g) => g.id !== ignoreId).map((g) => g.name.trim().toLocaleLowerCase()));
  if (!used.has(clean.toLocaleLowerCase())) return clean;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${clean.slice(0, Math.max(1, MAX_GROUP_NAME - suffix.length)).trimEnd()}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return clean;
}
function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function safeSet(key: string, value: unknown) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional */ } }

export function VeInviteNetworkCanvas({
  rootWallet,
  source,
  copy,
  availableSlots = () => 0,
  onInvite,
  revision = 0,
  storageNamespace = 'veinvite:network:v1',
  dir = 'ltr',
}: Props) {
  const normalizedRoot = keyWallet(rootWallet);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const groupPanelRef = useRef<HTMLDivElement | null>(null);
  const groupTargetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const newGroupTargetRef = useRef<HTMLButtonElement | null>(null);
  const removeTargetRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<Map<number, PointerInfo>>(new Map());
  const panRef = useRef<{ pointerId: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number; startView: Point; worldAnchor: Point; nodeId: string | null; ratio: number } | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const draggedNodeRef = useRef<{ id: string; pointerId: number; offset: Point } | null>(null);
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
  const [groupDrag, setGroupDrag] = useState<{ nodeId: string; x: number; y: number; hover: string | 'new' | 'remove' | null } | null>(null);
  const [groupMove, setGroupMove] = useState<{ groupId: string; pointerId: number; start: Point; origin: Point } | null>(null);
  const [joiningSlot, setJoiningSlot] = useState<number | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [notice, setNotice] = useState('');

  const device = compact ? 'mobile' : 'desktop';
  const scope = focusWallet;
  const layoutKey = `${storageNamespace}:layout:${normalizedRoot}`;
  const groupKey = `${storageNamespace}:groups:${normalizedRoot}`;
  const currentGroups = useMemo(() => groups.filter((g) => g.scope === scope), [groups, scope]);
  const memberOwner = useMemo(() => {
    const map = new Map<string, string>();
    currentGroups.forEach((g) => g.members.forEach((id) => map.set(id, g.id)));
    return map;
  }, [currentGroups]);

  const defaultPosition = useCallback((id: string, index: number) => autoPoint(id, index, compact), [compact]);
  const positionFor = useCallback((id: string, index: number) => positions[`${scope}|${device}|${id}`] ?? defaultPosition(id, index), [positions, scope, device, defaultPosition]);
  const groupPosition = useCallback((group: UserGroup) => group.position[device], [device]);

  const visibleChildren = useMemo(() => {
    if (!data) return [];
    return data.children.filter((child) => {
      const owner = memberOwner.get(keyWallet(child.wallet));
      if (!owner) return true;
      const group = currentGroups.find((g) => g.id === owner);
      if (!group?.collapsed) return true;
      return temporaryRevealGroup === group.id;
    });
  }, [data, memberOwner, currentGroups, temporaryRevealGroup]);

  const loadFocus = useCallback(async (target: string, signal?: AbortSignal, followNew = true) => {
    setLoading(true); setError('');
    try {
      const payload = await source(normalizedRoot, { focus: target, signal });
      if (signal?.aborted) return;
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
        newTimerRef.current = window.setTimeout(() => setNewIds([]), 2600);
        if (followNew && arrivals.length === 1 && autoFollowRef.current) {
          const index = payload.children.findIndex((child) => keyWallet(child.wallet) === arrivals[0]);
          const point = positions[`${key}|${device}|${arrivals[0]}`] ?? autoPoint(arrivals[0], Math.max(0, index), compact);
          setTransitioning(true);
          setView((current) => ({ ...current, scale: Math.max(1.06, current.scale), x: -point.x * Math.max(1.06, current.scale), y: -point.y * Math.max(1.06, current.scale) }));
          window.setTimeout(() => setTransitioning(false), 900);
        }
      }
    } catch (cause) {
      if (signal?.aborted) return;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : copy.loadError);
    }
  }, [source, normalizedRoot, positions, device, compact, copy.loadError]);

  useEffect(() => {
    setGroups(readJson<UserGroup[]>(groupKey, []));
    setPositions(readJson<Record<string, Point>>(layoutKey, {}));
  }, [groupKey, layoutKey]);
  useEffect(() => safeSet(groupKey, groups), [groupKey, groups]);
  useEffect(() => safeSet(layoutKey, positions), [layoutKey, positions]);

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync(); window.addEventListener('resize', sync); return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadFocus(focusWallet || normalizedRoot, controller.signal, revision > 0);
    return () => controller.abort();
  }, [revision, normalizedRoot]); // intentional: focus changes are explicit

  useEffect(() => {
    if (!searchOpen || query.trim().length < 3) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void source(normalizedRoot, { query: query.trim().toLowerCase(), signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) setSearchResults(payload.searchResults ?? []); })
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 240);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchOpen, query, source, normalizedRoot]);

  useEffect(() => {
    if (!groupsOpen && !groupForm) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (groupPanelRef.current?.contains(target)) return;
      if (groupDrag || groupMove) return;
      setGroupForm(null); setGroupsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setGroupForm(null); setGroupsOpen(false); } };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('keydown', onKey); };
  }, [groupsOpen, groupForm, groupDrag, groupMove]);

  useEffect(() => () => { if (newTimerRef.current) window.clearTimeout(newTimerRef.current); }, []);

  const markInteraction = () => { autoFollowRef.current = false; };
  const stageRect = () => stageRef.current?.getBoundingClientRect() ?? null;
  const screenPoint = (x: number, y: number) => {
    const rect = stageRect(); if (!rect) return { x: 0, y: 0 };
    return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
  };
  const screenToWorld = (x: number, y: number) => {
    const p = screenPoint(x, y); return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  };
  const setZoomAround = (nextValue: number, clientX: number, clientY: number, start = view) => {
    const p = screenPoint(clientX, clientY); const next = clamp(nextValue, MIN_ZOOM, MAX_ZOOM);
    const wx = (p.x - start.x) / start.scale; const wy = (p.y - start.y) / start.scale;
    setView({ x: p.x - wx * next, y: p.y - wy * next, scale: next });
  };
  const resetView = () => { setTransitioning(true); setView({ x: 0, y: 0, scale: 1 }); window.setTimeout(() => setTransitioning(false), 700); };
  const fit = () => {
    if (!data || !stageRef.current || data.children.length === 0) { resetView(); return; }
    const pts = data.children.map((child, index) => positionFor(keyWallet(child.wallet), index));
    const slots = Array.from({ length: Math.max(0, availableSlots(data)) }, (_, index) => slotPoint(index, compact));
    const all = [...pts, ...slots];
    const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y)); const maxY = Math.max(...all.map((p) => p.y));
    const rect = stageRef.current.getBoundingClientRect();
    const scale = clamp(Math.min((rect.width - 80) / Math.max(360, maxX - minX + 180), (rect.height - 80) / Math.max(360, maxY - minY + 180), 1.08), MIN_ZOOM, MAX_ZOOM);
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    setTransitioning(true); setView({ x: -cx * scale, y: -cy * scale, scale }); window.setTimeout(() => setTransitioning(false), 700);
  };

  const goFocus = async (wallet: string) => {
    markInteraction(); setEditMode(false); setGroupsOpen(false); setGroupForm(null); resetView();
    await loadFocus(keyWallet(wallet), undefined, false);
  };
  const goParent = async () => { if (data?.invitedBy) await goFocus(data.invitedBy); };
  const goYou = async () => { await goFocus(normalizedRoot); };

  const setNodePosition = (id: string, point: Point) => setPositions((current) => ({ ...current, [`${scope}|${device}|${id}`]: point }));
  const resetLayout = () => setPositions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${scope}|${device}|`))));

  const clearPress = () => {
    if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const hitGroupTarget = (x: number, y: number) => {
    if (removeTargetRef.current) {
      const r = removeTargetRef.current.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'remove' as const;
    }
    if (newGroupTargetRef.current) {
      const r = newGroupTargetRef.current.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'new' as const;
    }
    for (const [id, el] of groupTargetRefs.current.entries()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return id;
    }
    return null;
  };

  const moveMemberToGroup = (nodeId: string, groupId: string) => {
    setGroups((current) => current.map((g) => {
      if (g.scope !== scope) return g;
      const without = g.members.filter((id) => id !== nodeId);
      return g.id === groupId ? { ...g, members: [...without, nodeId] } : { ...g, members: without };
    }));
    setNotice('Moved'); window.setTimeout(() => setNotice(''), 1000);
  };
  const removeMember = (nodeId: string) => setGroups((current) => current.map((g) => g.scope === scope ? { ...g, members: g.members.filter((id) => id !== nodeId) } : g));

  const beginNodePointer = (event: ReactPointerEvent<HTMLButtonElement>, id: string, index: number) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    const point = positionFor(id, index);
    const press: PressState = { pointerId: event.pointerId, nodeId: id, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, timer: 0, editingDrag: false, groupDrag: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (editMode) {
      const world = screenToWorld(event.clientX, event.clientY);
      draggedNodeRef.current = { id, pointerId: event.pointerId, offset: { x: world.x - point.x, y: world.y - point.y } };
      press.editingDrag = true;
    } else {
      press.timer = window.setTimeout(() => {
        const active = pressRef.current;
        if (!active || active.pointerId !== press.pointerId || active.groupDrag) return;
        setEditMode(true); setSelectedWallet(null); setNotice(copy.editLayout);
        window.setTimeout(() => setNotice(''), 1100);
        const world = screenToWorld(active.lastX, active.lastY);
        draggedNodeRef.current = { id, pointerId: active.pointerId, offset: { x: world.x - point.x, y: world.y - point.y } };
        active.editingDrag = true;
      }, LONG_PRESS_MS);
    }
    pressRef.current = press;
  };

  const moveNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = draggedNodeRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      const world = screenToWorld(event.clientX, event.clientY);
      setNodePosition(drag.id, { x: world.x - drag.offset.x, y: world.y - drag.offset.y });
      return;
    }
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    press.lastX = event.clientX; press.lastY = event.clientY;
    const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (moved > MOVE_CANCEL && groupsOpen && !press.editingDrag) {
      if (press.timer) window.clearTimeout(press.timer);
      press.groupDrag = true;
      setGroupDrag({ nodeId: press.nodeId, x: event.clientX, y: event.clientY, hover: hitGroupTarget(event.clientX, event.clientY) });
      event.preventDefault();
      return;
    }
    if (press.groupDrag) {
      setGroupDrag({ nodeId: press.nodeId, x: event.clientX, y: event.clientY, hover: hitGroupTarget(event.clientX, event.clientY) });
      event.preventDefault();
      return;
    }
    if (moved > MOVE_CANCEL && press.timer) { window.clearTimeout(press.timer); press.timer = 0; }
  };

  const finishNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (draggedNodeRef.current?.pointerId === event.pointerId) draggedNodeRef.current = null;
    if (press?.pointerId === event.pointerId && press.groupDrag) {
      const target = hitGroupTarget(event.clientX, event.clientY);
      if (target === 'remove') removeMember(press.nodeId);
      else if (target === 'new') { setGroupForm({ mode: 'create', name: '', pendingMember: press.nodeId }); setGroupsOpen(true); }
      else if (target) moveMemberToGroup(press.nodeId, target);
    }
    setGroupDrag(null); clearPress();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
  };

  const createOrSaveGroup = () => {
    if (!groupForm) return;
    const name = uniqueName(groupForm.name, currentGroups, groupForm.id);
    if (!name) return;
    if (groupForm.mode === 'create') {
      const point = { x: compact ? 228 : 330, y: compact ? -170 : -220 };
      const group: UserGroup = { id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, scope, name, members: groupForm.pendingMember ? [groupForm.pendingMember] : [], collapsed: true, position: devicePoint(point) };
      setGroups((current) => [...current, group]);
    } else if (groupForm.id) {
      setGroups((current) => current.map((g) => g.id === groupForm.id ? { ...g, name } : g));
    }
    setGroupForm(null);
  };
  const dissolveGroup = (id: string) => { setGroups((current) => current.filter((g) => g.id !== id)); setGroupForm(null); };
  const toggleGroup = (id: string) => setGroups((current) => current.map((g) => g.id === id ? { ...g, collapsed: !g.collapsed } : g));

  const beginGroupMove = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction(); event.stopPropagation();
    const origin = groupPosition(group);
    setGroupMove({ groupId: group.id, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };
  const moveGroup = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!groupMove || groupMove.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - groupMove.start.x) / view.scale; const dy = (event.clientY - groupMove.start.y) / view.scale;
    const next = { x: groupMove.origin.x + dx, y: groupMove.origin.y + dy };
    setGroups((current) => current.map((g) => g.id === groupMove.groupId ? { ...g, position: { ...g.position, [device]: next } } : g));
  };
  const finishGroupMove = (event: ReactPointerEvent<HTMLButtonElement>) => { if (groupMove?.pointerId === event.pointerId) setGroupMove(null); };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLButtonElement>('[data-node-id]');
    pointerRef.current.set(event.pointerId, { point: { x: event.clientX, y: event.clientY }, nodeId: node?.dataset.nodeId ?? null });
    if (pointerRef.current.size === 2 && !editMode) {
      const values = [...pointerRef.current.values()];
      const a = values[0].point; const b = values[1].point;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const local = screenPoint(mid.x, mid.y);
      const direct = document.elementFromPoint(mid.x, mid.y)?.closest<HTMLElement>('[data-node-id]');
      const nodeId = direct?.dataset.nodeId ?? values.find((v) => v.nodeId)?.nodeId ?? null;
      pinchRef.current = { startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), startZoom: view.scale, startView: { x: view.x, y: view.y }, worldAnchor: { x: (local.x - view.x) / view.scale, y: (local.y - view.y) / view.scale }, nodeId, ratio: 1 };
      panRef.current = null; clearPress(); markInteraction();
      return;
    }
    if (pointerRef.current.size > 1 || editMode || target.closest('[data-interactive="true"]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction(); panRef.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: view.x, y: view.y }, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  };
  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointerRef.current.get(event.pointerId); if (info) info.point = { x: event.clientX, y: event.clientY };
    const pinch = pinchRef.current;
    if (pinch && pointerRef.current.size >= 2) {
      const values = [...pointerRef.current.values()].slice(0, 2); const a = values[0].point; const b = values[1].point;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); const ratio = dist / pinch.startDistance; pinch.ratio = ratio;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const p = screenPoint(mid.x, mid.y); const next = clamp(pinch.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
      setView({ x: p.x - pinch.worldAnchor.x * next, y: p.y - pinch.worldAnchor.y * next, scale: next }); event.preventDefault(); return;
    }
    const pan = panRef.current; if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.start.x; const dy = event.clientY - pan.start.y;
    if (!pan.moved && Math.hypot(dx, dy) < 6) return;
    pan.moved = true; setView((current) => ({ ...current, x: pan.origin.x + dx, y: pan.origin.y + dy }));
  };
  const onStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerRef.current.delete(event.pointerId);
    const pinch = pinchRef.current;
    if (pinch && pointerRef.current.size < 2) {
      pinchRef.current = null;
      if (pinch.nodeId && pinch.ratio >= 1.38) void goFocus(pinch.nodeId);
      else if (data?.invitedBy && pinch.ratio <= .68) void goParent();
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => { if (editMode) return; event.preventDefault(); markInteraction(); setZoomAround(view.scale * (event.deltaY < 0 ? 1.1 : .9), event.clientX, event.clientY); };

  const selectSearchResult = async (result: NetworkSearchResult) => {
    const parent = result.parentWallet ?? normalizedRoot;
    await loadFocus(parent, undefined, false);
    setSearchOpen(false); setQuery(''); setSearchResults([]);
    const owner = groups.find((g) => g.scope === keyWallet(parent) && g.members.includes(keyWallet(result.wallet)) && g.collapsed);
    if (owner) setTemporaryRevealGroup(owner.id);
    setSelectedWallet(keyWallet(result.wallet));
    window.setTimeout(() => {
      const currentData = previousChildrenRef.current.get(keyWallet(parent));
      if (!currentData?.has(keyWallet(result.wallet))) return;
    }, 20);
  };

  const invite = async (index: number) => {
    if (!data || !onInvite || joiningSlot !== null) return;
    setJoiningSlot(index); autoFollowRef.current = true;
    try { await onInvite(data.focusWallet, index); await loadFocus(data.focusWallet, undefined, true); }
    finally { setJoiningSlot(null); }
  };

  const selected = data?.children.find((child) => keyWallet(child.wallet) === selectedWallet) ?? null;
  const slots = data ? Math.max(0, availableSlots(data)) : 0;
  const zoomDetail = view.scale >= DETAIL_ZOOM;

  if (loading && !data) return <div className="networkCandidateState">{copy.loading}<style jsx>{stateCss}</style></div>;
  if (error && !data) return <div className="networkCandidateState"><b>{copy.loadError}</b><span>{error}</span><button type="button" onClick={() => void loadFocus(focusWallet)}>{copy.retry}</button><style jsx>{stateCss}</style></div>;
  if (!data) return null;

  return (
    <section className="networkCandidate" dir={dir}>
      <header className="networkCandidateHeader">
        <div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className="headerActions">
          <button type="button" onClick={() => { setSearchOpen((v) => !v); setGroupsOpen(false); setGroupForm(null); }}>⌕ {copy.search}</button>
          <button type="button" className={groupsOpen ? 'active' : ''} onClick={() => { setGroupsOpen((v) => !v); setSearchOpen(false); setGroupForm(null); }}>◎ {copy.groups}</button>
        </div>
      </header>

      <div className="canvasBar">
        <div className="crumbs">
          {data.breadcrumb.map((wallet, index) => <span key={wallet}>{index ? <i>›</i> : null}<button type="button" disabled={keyWallet(wallet) === focusWallet || editMode} onClick={() => void goFocus(wallet)}>{index === 0 ? copy.you : shortWallet(wallet)}</button></span>)}
        </div>
        <div className="canvasActions">
          <button type="button" onClick={() => void goYou()}>◎ {copy.you}</button>
          <button type="button" onClick={fit}>{copy.fit}</button>
          <button type="button" className={editMode ? 'active' : ''} onClick={() => { setEditMode((v) => !v); setSelectedWallet(null); }}>{editMode ? `✓ ${copy.done}` : `✦ ${copy.editLayout}`}</button>
          {editMode ? <button type="button" onClick={resetLayout}>{copy.reset}</button> : null}
        </div>
      </div>

      <div className="networkShell">
        <div className="networkTop">
          <div className="focusIdentity"><b>{focusWallet === normalizedRoot ? copy.you : shortWallet(focusWallet)}</b><span>{data.summary.direct} {copy.direct}</span><span>{data.summary.network} {copy.network}</span></div>
          <div className="zoomActions"><button type="button" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale - .12, MIN_ZOOM, MAX_ZOOM) }))}>−</button><button type="button" onClick={resetView}>{Math.round(view.scale * 100)}%</button><button type="button" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale + .12, MIN_ZOOM, MAX_ZOOM) }))}>+</button>{data.invitedBy ? <button type="button" onClick={() => void goParent()}>{copy.inviter} ↑</button> : null}</div>
        </div>

        <div
          ref={stageRef}
          className={`networkStage ${editMode ? 'editMode' : ''} ${transitioning ? 'transitioning' : ''} ${zoomDetail ? 'detail' : 'overview'}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerEnd}
          onPointerCancel={onStagePointerEnd}
          onWheel={onWheel}
        >
          <div className="world" style={{ '--vx': `${view.x}px`, '--vy': `${view.y}px`, '--vz': view.scale } as CSSProperties}>
            <div className="ambient" />
            <svg className="edges" viewBox="-2200 -2200 4400 4400" aria-hidden="true">
              {data.children.map((child, index) => {
                const id = keyWallet(child.wallet); const owner = memberOwner.get(id); const group = owner ? currentGroups.find((g) => g.id === owner) : null;
                if (group?.collapsed && temporaryRevealGroup !== group.id) return null;
                const point = positionFor(id, index);
                return <path key={id} d={linePath(point)} className={newIds.includes(id) ? 'newEdge' : ''} />;
              })}
              {Array.from({ length: slots }, (_, index) => <path key={`slot-${index}`} d={linePath(slotPoint(index, compact))} className="slotEdge" />)}
            </svg>

            <div className="centerNode"><span>●</span><b>{focusWallet === normalizedRoot ? copy.you : shortWallet(focusWallet)}</b><small>{data.summary.direct} {copy.direct} · {data.summary.network} {copy.network}</small></div>

            {data.children.map((child, index) => {
              const id = keyWallet(child.wallet); const point = positionFor(id, index); const owner = memberOwner.get(id); const group = owner ? currentGroups.find((g) => g.id === owner) : null;
              if (group?.collapsed && temporaryRevealGroup !== group.id) return null;
              const fresh = newIds.includes(id);
              return <button
                key={id}
                type="button"
                data-node-id={id}
                data-interactive="true"
                className={`personNode ${selectedWallet === id ? 'selected' : ''} ${fresh ? 'fresh' : ''} ${groupDrag?.nodeId === id ? 'dragging' : ''}`}
                style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                onClick={() => { if (!editMode && !pressRef.current?.groupDrag) { setSelectedWallet(id); setTemporaryRevealGroup(group?.collapsed ? group.id : null); } }}
                onPointerDown={(event) => beginNodePointer(event, id, index)}
                onPointerMove={moveNodePointer}
                onPointerUp={finishNodePointer}
                onPointerCancel={finishNodePointer}
                onContextMenu={(event) => event.preventDefault()}
              ><span className="nodeCircle">●</span><b>{shortWallet(id)}</b><small>{child.direct} {copy.direct} · {child.network} {copy.network}</small>{fresh ? <em>{copy.newLabel}</em> : null}</button>;
            })}

            {currentGroups.filter((g) => g.collapsed).map((group) => {
              const point = groupPosition(group);
              return <button key={group.id} type="button" className={`groupHub ${temporaryRevealGroup === group.id ? 'revealed' : ''}`} data-interactive="true" style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties} onPointerDown={(event) => beginGroupMove(event, group)} onPointerMove={moveGroup} onPointerUp={finishGroupMove} onPointerCancel={finishGroupMove} onClick={() => toggleGroup(group.id)}><span>◎</span><b>{group.name}</b><small>{group.members.length ? `${group.members.length} ${copy.grouped}` : copy.emptyGroup}</small></button>;
            })}

            {Array.from({ length: slots }, (_, index) => {
              const point = slotPoint(index, compact); const joining = joiningSlot === index;
              return <button key={index} type="button" className={`slotNode ${joining ? 'joining' : ''}`} data-interactive="true" style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties} onClick={() => void invite(index)} disabled={!onInvite}><span>{joining ? '…' : '+'}</span><b>{joining ? copy.joining : copy.available}</b></button>;
            })}
          </div>

          {selected ? <aside className="profileCard" data-interactive="true"><div><b>{shortWallet(selected.wallet)}</b><button type="button" onClick={() => { setSelectedWallet(null); setTemporaryRevealGroup(null); }}>×</button></div><code>{selected.wallet}</code><p>{selected.direct} {copy.direct} · {selected.network} {copy.network} · {selected.qualified} {copy.qualified}</p><button type="button" onClick={() => void goFocus(selected.wallet)}>{copy.viewNetwork} →</button></aside> : null}

          {searchOpen ? <aside className="searchPanel" data-interactive="true"><div><b>{copy.search}</b><button type="button" onClick={() => setSearchOpen(false)}>×</button></div><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} dir="ltr"/><div className="searchResults">{searchResults.map((result) => <button key={result.wallet} type="button" onClick={() => void selectSearchResult(result)}><b>{shortWallet(result.wallet)}</b><small>{result.depth}</small></button>)}{query.trim().length >= 3 && !searching && searchResults.length === 0 ? <span>{copy.noResults}</span> : null}</div></aside> : null}

          {groupsOpen ? <aside ref={groupPanelRef} className="groupPanel" data-interactive="true"><div className="panelHead"><b>{copy.groups}</b><button type="button" onClick={() => { setGroupsOpen(false); setGroupForm(null); }}>×</button></div>{groupForm ? <div className="groupForm"><input value={groupForm.name} maxLength={MAX_GROUP_NAME} placeholder={copy.groupName} onChange={(event) => setGroupForm((current) => current ? { ...current, name: event.target.value } : current)} autoFocus/><div><button type="button" onClick={() => setGroupForm(null)}>{copy.cancel}</button><button type="button" className="primary" onClick={createOrSaveGroup}>{groupForm.mode === 'create' ? copy.create : copy.save}</button></div></div> : <><div className="groupRows">{currentGroups.map((group) => <div key={group.id} ref={(el) => { if (el) groupTargetRefs.current.set(group.id, el); else groupTargetRefs.current.delete(group.id); }} className={`groupRow ${groupDrag?.hover === group.id ? 'hover' : ''}`}><button type="button" className="groupMain" onClick={() => toggleGroup(group.id)}><b>{group.name}</b><small>{group.members.length ? `${group.members.length} ${copy.grouped}` : copy.emptyGroup}</small></button><button type="button" onClick={() => setGroupForm({ mode: 'edit', id: group.id, name: group.name })}>✎</button><button type="button" onClick={() => dissolveGroup(group.id)}>×</button></div>)}</div><button ref={newGroupTargetRef} type="button" className={`newGroup ${groupDrag?.hover === 'new' ? 'hover' : ''}`} onClick={() => setGroupForm({ mode: 'create', name: '' })}><b>{currentGroups.length ? `＋ ${copy.newGroup}` : `＋ ${copy.createFirstGroup}`}</b><small>{copy.dissolveHelp}</small></button>{groupDrag && memberOwner.has(groupDrag.nodeId) ? <div ref={removeTargetRef} className={`removeZone ${groupDrag.hover === 'remove' ? 'hover' : ''}`}>{copy.removeFromGroup}</div> : null}</>}</aside> : null}

          {groupDrag ? <div className="dragGhost" style={{ left: groupDrag.x, top: groupDrag.y }}>{shortWallet(groupDrag.nodeId)}</div> : null}
          <div className="hint">{editMode ? `${copy.editLayout} · ${copy.done}` : copy.holdToEdit}</div>
          {newIds.length > 1 ? <div className="newBadge">{newIds.length} {copy.newLabel}</div> : null}
          {notice ? <div className="notice">✦ {notice}</div> : null}
        </div>
      </div>

      <style jsx>{`
        .networkCandidate{width:min(calc(100vw - 20px),960px);margin:0 auto;color:#f1eee5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.networkCandidateHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px}.networkCandidateHeader h1{margin:0;font-size:1.02rem;letter-spacing:-.025em}.networkCandidateHeader p{margin:3px 0 0;color:#716b61;font-size:.55rem}.headerActions,.canvasActions,.zoomActions{display:flex;align-items:center;gap:5px}.networkCandidate button,.networkCandidate input{font:inherit}.headerActions button,.canvasActions button,.zoomActions button{min-height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0e0e0c;color:#9b9488;font-size:.48rem;cursor:pointer}.headerActions button.active,.canvasActions button.active{border-color:rgba(244,183,40,.35);color:#deb84e;background:rgba(244,183,40,.06)}.canvasBar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 2px 8px}.crumbs{min-width:0;display:flex;align-items:center;gap:4px;overflow:auto;scrollbar-width:none}.crumbs span{display:flex;align-items:center;gap:4px}.crumbs i{color:#4e4941;font-style:normal}.crumbs button{border:0;background:transparent;color:#8b8376;font-size:.48rem;white-space:nowrap;cursor:pointer}.crumbs button:disabled{color:#d7b759;cursor:default}.networkShell{border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#090908;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.2)}.networkTop{min-height:52px;padding:8px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.045)}.focusIdentity{display:flex;align-items:baseline;gap:7px;min-width:0}.focusIdentity b{font-size:.62rem;color:#d7d0c3}.focusIdentity span{font-size:.42rem;color:#6f685d}.networkStage{position:relative;height:min(76svh,740px);min-height:540px;overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:radial-gradient(circle at 50% 44%,rgba(244,183,40,.026),transparent 42%)}.networkStage:active{cursor:grabbing}.world{position:absolute;left:50%;top:50%;width:0;height:0;transform:translate3d(var(--vx),var(--vy),0) scale(var(--vz));transform-origin:0 0}.transitioning .world{transition:transform 760ms cubic-bezier(.22,.78,.18,1)}.ambient{position:absolute;width:640px;height:520px;left:-320px;top:-260px;border-radius:50%;background:radial-gradient(circle,rgba(244,183,40,.035),transparent 68%);pointer-events:none}.edges{position:absolute;left:-2200px;top:-2200px;width:4400px;height:4400px;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:rgba(218,207,180,.22);stroke-width:1;vector-effect:non-scaling-stroke;transition:opacity 180ms ease}.edges .newEdge{stroke:rgba(244,190,49,.82);stroke-dasharray:5 8;animation:newEdge 1.15s linear infinite}.edges .slotEdge{stroke:rgba(233,187,61,.38);stroke-dasharray:2 10;animation:slotFlow 1.55s linear infinite;filter:drop-shadow(0 0 2px rgba(244,183,40,.22))}.centerNode{position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:8;display:grid;justify-items:center;gap:3px;pointer-events:none}.centerNode>span{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(244,183,40,.58);background:#12110d;color:#dcb449;box-shadow:0 0 36px rgba(244,183,40,.07)}.centerNode b{font-size:.52rem;color:#d9d2c6}.centerNode small{font-size:.36rem;color:#6e675c;white-space:nowrap}.personNode,.slotNode,.groupHub{position:absolute;left:0;top:0;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));border:0;background:transparent;color:#aaa197;display:grid;justify-items:center;gap:3px;cursor:pointer;z-index:6;touch-action:none}.personNode .nodeCircle{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(213,204,188,.2);background:#11110f;color:#6d685f;box-shadow:0 7px 24px rgba(0,0,0,.24);transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.personNode b,.slotNode b,.groupHub b{font-size:.42rem;white-space:nowrap}.personNode small,.groupHub small{font-size:.33rem;color:#625d54;white-space:nowrap}.personNode:hover .nodeCircle,.personNode.selected .nodeCircle{border-color:rgba(244,183,40,.7);color:#d5ad42;transform:scale(1.05)}.personNode.fresh .nodeCircle{border-color:rgba(244,183,40,.95);box-shadow:0 0 0 5px rgba(244,183,40,.08),0 0 35px rgba(244,183,40,.12);animation:freshPulse 1.2s ease-in-out infinite}.personNode em{position:absolute;top:-12px;padding:3px 5px;border-radius:999px;background:#d9ad39;color:#15120a;font-size:.3rem;font-style:normal;font-weight:900}.personNode.dragging{opacity:.28}.slotNode span{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.44);background:rgba(244,183,40,.025);color:#c89f36;font-size:.8rem;box-shadow:0 0 26px rgba(244,183,40,.04)}.slotNode b{color:#816c39}.slotNode.joining span{animation:freshPulse 1s ease-in-out infinite}.groupHub{z-index:7}.groupHub span{width:64px;height:50px;border-radius:18px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.34);background:rgba(17,15,10,.96);color:#b9973e;box-shadow:0 9px 28px rgba(0,0,0,.28)}.groupHub.revealed{opacity:.28}.overview .personNode b,.overview .personNode small,.overview .groupHub b,.overview .groupHub small{opacity:0;pointer-events:none}.overview .personNode .nodeCircle{width:42px;height:42px}.profileCard,.searchPanel,.groupPanel{position:absolute;z-index:30;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(13,13,11,.97);box-shadow:0 18px 48px rgba(0,0,0,.38);backdrop-filter:blur(14px)}.profileCard{right:12px;top:12px;width:220px;padding:10px}.profileCard>div,.searchPanel>div:first-child,.panelHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.profileCard b,.searchPanel b,.panelHead b{font-size:.52rem}.profileCard button,.searchPanel button,.groupPanel button{border:0;background:transparent;color:#91897d;cursor:pointer}.profileCard code{display:block;margin-top:8px;color:#6d675e;font-size:.36rem;word-break:break-all}.profileCard p{margin:8px 0;color:#8a8277;font-size:.4rem}.profileCard>button{width:100%;height:31px;border:1px solid rgba(244,183,40,.18);border-radius:8px;color:#c7a44b;background:rgba(244,183,40,.04);font-size:.42rem}.searchPanel{left:12px;top:12px;width:min(310px,calc(100% - 24px));padding:9px}.searchPanel input,.groupForm input{width:100%;height:34px;margin-top:8px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;outline:0;background:#0a0a09;color:#d7d0c4;font-size:.46rem}.searchResults{max-height:230px;margin-top:6px;overflow:auto}.searchResults button{width:100%;min-height:34px;padding:0 7px;display:flex;align-items:center;justify-content:space-between;border-radius:7px}.searchResults button:hover{background:rgba(244,183,40,.05)}.searchResults small,.searchResults>span{color:#696259;font-size:.37rem}.groupPanel{right:12px;top:12px;width:245px;padding:9px;max-height:calc(100% - 24px);overflow:auto}.groupRows{display:grid;gap:5px;margin-top:8px}.groupRow{display:flex;align-items:center;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#0d0d0b;transition:border-color 140ms ease,background 140ms ease}.groupRow.hover,.newGroup.hover,.removeZone.hover{border-color:rgba(244,183,40,.85)!important;background:rgba(244,183,40,.08)!important}.groupMain{min-width:0;flex:1;min-height:42px;text-align:left;display:grid;align-content:center}.groupMain b{font-size:.43rem;color:#b9b1a5}.groupMain small{font-size:.32rem;color:#625d54}.groupRow>button:not(.groupMain){width:30px}.newGroup{width:100%;min-height:52px;margin-top:8px;padding:8px!important;border:1px dashed rgba(244,183,40,.28)!important;border-radius:9px!important;text-align:left;display:grid;gap:2px;background:rgba(244,183,40,.035)!important}.newGroup b{font-size:.43rem;color:#bf9c42}.newGroup small{font-size:.31rem;color:#665e50}.removeZone{margin-top:7px;padding:10px;border:1px dashed rgba(217,121,94,.3);border-radius:8px;text-align:center;color:#a87868;font-size:.39rem}.groupForm>div{display:flex;justify-content:flex-end;gap:5px;margin-top:8px}.groupForm button{height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.06);border-radius:8px}.groupForm .primary{border-color:rgba(244,183,40,.26);color:#caa541;background:rgba(244,183,40,.05)}.dragGhost{position:fixed;z-index:999;transform:translate(12px,12px);padding:6px 8px;border:1px solid rgba(244,183,40,.35);border-radius:8px;background:#12110d;color:#c9aa54;font-size:.38rem;pointer-events:none}.hint{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);color:#4f4b44;font-size:.36rem;white-space:nowrap;pointer-events:none}.notice,.newBadge{position:absolute;left:50%;transform:translateX(-50%);padding:6px 9px;border:1px solid rgba(244,183,40,.23);border-radius:999px;background:rgba(15,14,11,.95);color:#c8a64c;font-size:.38rem;pointer-events:none}.notice{bottom:34px}.newBadge{top:12px}.editMode .personNode{cursor:move}.editMode .personNode .nodeCircle{border-color:rgba(244,183,40,.46)}
        @keyframes slotFlow{to{stroke-dashoffset:-48}}@keyframes newEdge{to{stroke-dashoffset:-52}}@keyframes freshPulse{50%{transform:scale(1.08);box-shadow:0 0 0 8px rgba(244,183,40,.04),0 0 40px rgba(244,183,40,.14)}}
        @media(max-width:640px){.networkCandidate{width:calc(100vw - 12px)}.networkCandidateHeader{padding:8px 2px}.networkCandidateHeader h1{font-size:.92rem}.networkCandidateHeader p{font-size:.5rem}.headerActions button{min-height:29px;padding:0 7px}.canvasBar{align-items:flex-start;flex-direction:column}.canvasActions{width:100%;overflow:auto}.networkTop{align-items:flex-start;flex-direction:column}.zoomActions{width:100%;overflow:auto}.networkStage{height:calc(100svh - 210px);min-height:510px}.profileCard{left:10px;right:10px;top:auto;bottom:34px;width:auto}.groupPanel{left:9px;right:9px;top:9px;width:auto;max-height:72%}.personNode .nodeCircle{width:46px;height:46px}.centerNode>span{width:54px;height:54px}.hint{max-width:90%;overflow:hidden;text-overflow:ellipsis}.overview .personNode .nodeCircle{width:40px;height:40px}}
        @media(prefers-reduced-motion:reduce){.transitioning .world,.personNode .nodeCircle{transition:none!important}.slotEdge,.newEdge,.personNode.fresh .nodeCircle{animation:none!important}}
      `}</style>
    </section>
  );
}

const stateCss = `.networkCandidateState{min-height:420px;display:grid;place-items:center;align-content:center;gap:9px;background:#080807;color:#8c857a;font:500 12px/1.4 system-ui,sans-serif}.networkCandidateState b{color:#c7c0b5}.networkCandidateState span{max-width:420px;color:#766f64}.networkCandidateState button{height:32px;padding:0 12px;border:1px solid rgba(244,183,40,.2);border-radius:9px;background:rgba(244,183,40,.04);color:#caa640}`;
