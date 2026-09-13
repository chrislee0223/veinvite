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
  NetworkData,
  NetworkSearchResult,
  NetworkSource,
} from './VeInviteNetworkCanvasV2';
import { networkV3Css, networkV3StateCss } from './VeInviteNetworkCanvasV3Styles';
import {
  EDGE_PAN_PX,
  EDGE_PAN_STEP,
  LONG_PRESS_MS,
  MAX_DOM_NODES,
  MAX_GROUP_NAME,
  MAX_ZOOM,
  MIN_ZOOM,
  MOVE_CANCEL_PX,
  buildStableLayout,
  clamp,
  cloneGroups,
  curveBetween,
  distance,
  groupFocusLayout,
  keyWallet,
  pointForGroup,
  readJson,
  safeSet,
  scopedManualPositions,
  shortWallet,
  slotPoint,
  uniqueGroupName,
  type ExtendedNetworkData,
  type GraphNode,
  type GroupDrag,
  type GroupForm,
  type GroupMove,
  type PinchState,
  type Point,
  type PressState,
  type UndoState,
  type UserGroup,
  type View,
} from './VeInviteNetworkV3Core';

export type {
  NetworkCanvasCopy,
  NetworkData,
  NetworkSearchResult,
  NetworkSource,
} from './VeInviteNetworkCanvasV2';
export { NETWORK_CANVAS_COPY } from './VeInviteNetworkCanvasV2';

type Props = {
  rootWallet: string;
  source: NetworkSource;
  copy: NetworkCanvasCopy;
  locale?: 'en' | 'ko';
  availableSlots?: (data: NetworkData) => number;
  onInvite?: (focusWallet: string, slotIndex: number) => Promise<void> | void;
  revision?: number;
  storageNamespace?: string;
  dir?: 'ltr' | 'rtl';
};

export function createProductionNetworkSource(endpoint = '/api/network'): NetworkSource {
  return async (rootWallet: string, options: { focus?: string; query?: string; signal?: AbortSignal } = {}) => {
    const params = new URLSearchParams({ wallet: rootWallet });
    if (options.focus) params.set('focus', options.focus);
    if (options.query) params.set('q', options.query);
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : `Network request failed (${response.status}).`;
      throw new Error(message);
    }
    return payload as NetworkData;
  };
}

export function VeInviteNetworkCanvasV3({
  rootWallet,
  source,
  copy,
  locale = 'en',
  availableSlots = () => 0,
  onInvite,
  revision = 0,
  storageNamespace = 'veinvite:network:canvas-v3',
  dir = 'ltr',
}: Props) {
  const root = keyWallet(rootWallet);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const groupTargetsRef = useRef<Map<string, HTMLElement>>(new Map());
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
  const previousNodeIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const autoFollowRef = useRef(true);
  const newTimerRef = useRef<number | null>(null);

  const [focusWallet, setFocusWallet] = useState(root);
  const [data, setData] = useState<ExtendedNetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compact, setCompact] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 900, height: 640 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [manualPositions, setManualPositions] = useState<Record<string, Point>>({});
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [groupFocusId, setGroupFocusId] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [temporaryRevealWallet, setTemporaryRevealWallet] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NetworkSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [groupDrag, setGroupDrag] = useState<GroupDrag | null>(null);
  const [groupMovingId, setGroupMovingId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [joiningSlot, setJoiningSlot] = useState<number | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>(null);

  const extraCopy = useMemo(
    () =>
      locale === 'ko'
        ? {
            selectPeople: '여러 명 선택',
            doneSelecting: '선택 완료',
            moveSelected: '선택한 사람 이동',
            removeSelected: '선택한 사람 그룹 해제',
            undo: '되돌리기',
            groupFocus: '그룹 보기',
            people: '명',
            selected: '명 선택',
          }
        : {
            selectPeople: 'Select people',
            doneSelecting: 'Done selecting',
            moveSelected: 'Move selected',
            removeSelected: 'Remove selected',
            undo: 'Undo',
            groupFocus: 'View group',
            people: 'people',
            selected: 'selected',
          },
    [locale],
  );

  const device = compact ? 'mobile' : 'desktop';
  const scope = focusWallet;
  const layoutStorageKey = `${storageNamespace}:layout:${root}`;
  const groupStorageKey = `${storageNamespace}:groups:${root}`;
  const currentGroups = useMemo(() => groups.filter((group) => group.scope === scope), [groups, scope]);
  const activeGroup = useMemo(
    () => currentGroups.find((group) => group.id === groupFocusId) ?? null,
    [currentGroups, groupFocusId],
  );
  const memberOwner = useMemo(() => {
    const owner = new Map<string, string>();
    currentGroups.forEach((group) => group.members.forEach((id) => owner.set(id, group.id)));
    return owner;
  }, [currentGroups]);

  const graphNodes = useMemo<GraphNode[]>(() => {
    if (!data) return [];
    if (Array.isArray(data.allNodes)) {
      return data.allNodes.map((node) => ({
        ...node,
        wallet: keyWallet(node.wallet),
        parentWallet: node.parentWallet ? keyWallet(node.parentWallet) : data.focusWallet,
      }));
    }
    return data.children.map((node) => ({
      ...node,
      wallet: keyWallet(node.wallet),
      parentWallet: data.focusWallet,
      generation: 1,
    }));
  }, [data]);
  const graphNodeMap = useMemo(
    () => new Map(graphNodes.map((node) => [keyWallet(node.wallet), node])),
    [graphNodes],
  );

  const manualForScope = useMemo(
    () => scopedManualPositions(manualPositions, scope, device),
    [manualPositions, scope, device],
  );

  const baseLayout = useMemo(
    () => buildStableLayout(graphNodes, focusWallet, compact, manualForScope),
    [graphNodes, focusWallet, compact, manualForScope],
  );
  const focusLayout = useMemo(
    () => (activeGroup ? groupFocusLayout(activeGroup.members, compact) : null),
    [activeGroup, compact],
  );

  const allowedNodeIds = useMemo(() => {
    if (activeGroup) return new Set(activeGroup.members);
    return new Set(
      graphNodes
        .filter((node) => {
          const id = keyWallet(node.wallet);
          const ownerId = memberOwner.get(id);
          if (!ownerId) return true;
          const owner = currentGroups.find((group) => group.id === ownerId);
          if (!owner?.collapsed) return true;
          return temporaryRevealWallet === id;
        })
        .map((node) => keyWallet(node.wallet)),
    );
  }, [activeGroup, graphNodes, memberOwner, currentGroups, temporaryRevealWallet]);

  const activeNodes = useMemo(
    () => graphNodes.filter((node) => allowedNodeIds.has(keyWallet(node.wallet))),
    [graphNodes, allowedNodeIds],
  );

  const rawPointFor = useCallback(
    (id: string) => {
      if (activeGroup && focusLayout?.[id]) return focusLayout[id];
      return baseLayout[id] ?? { x: 0, y: 0 };
    },
    [activeGroup, focusLayout, baseLayout],
  );

  const fanOffsets = useMemo(() => {
    if (!selectedWallet || !allowedNodeIds.has(selectedWallet)) return {} as Record<string, Point>;
    const center = rawPointFor(selectedWallet);
    const overlapping = activeNodes
      .map((node) => keyWallet(node.wallet))
      .filter((id) => id !== selectedWallet && distance(rawPointFor(id), center) < (compact ? 52 : 62));
    if (!overlapping.length) return {} as Record<string, Point>;
    const offsets: Record<string, Point> = {};
    overlapping.forEach((id, index) => {
      const angle = (Math.PI * 2 * index) / overlapping.length;
      const radius = compact ? 46 : 58;
      offsets[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    return offsets;
  }, [selectedWallet, allowedNodeIds, activeNodes, rawPointFor, compact]);

  const pointFor = useCallback(
    (id: string) => {
      const base = rawPointFor(id);
      const offset = fanOffsets[id];
      return offset ? { x: base.x + offset.x, y: base.y + offset.y } : base;
    },
    [rawPointFor, fanOffsets],
  );

  useEffect(() => {
    setGroups(readJson<UserGroup[]>(groupStorageKey, []));
    setManualPositions(readJson<Record<string, Point>>(layoutStorageKey, {}));
  }, [groupStorageKey, layoutStorageKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => safeSet(groupStorageKey, groups), 280);
    return () => window.clearTimeout(timer);
  }, [groupStorageKey, groups]);
  useEffect(() => {
    const timer = window.setTimeout(() => safeSet(layoutStorageKey, manualPositions), 320);
    return () => window.clearTimeout(timer);
  }, [layoutStorageKey, manualPositions]);
  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setStageSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(
    () => () => {
      if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
    },
    [],
  );

  const setNodePosition = useCallback(
    (id: string, point: Point) => {
      setManualPositions((current) => ({ ...current, [`${scope}|${device}|${id}`]: point }));
    },
    [scope, device],
  );
  const resetLayout = () => {
    setManualPositions((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${scope}|${device}|`)),
      ),
    );
  };
  const markInteraction = () => {
    autoFollowRef.current = false;
  };
  const localPoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };
  const screenToWorld = (clientX: number, clientY: number) => {
    const point = localPoint(clientX, clientY);
    return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
  };
  const focusPoint = (point: Point, zoom = Math.max(1.1, view.scale)) => {
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    setTransitioning(true);
    setView({ x: -point.x * next, y: -point.y * next, scale: next });
    window.setTimeout(() => setTransitioning(false), 820);
  };
  const resetView = () => {
    setTransitioning(true);
    setView({ x: 0, y: 0, scale: 1 });
    window.setTimeout(() => setTransitioning(false), 760);
  };
  const zoomAround = (nextScale: number, clientX: number, clientY: number, from = view) => {
    const point = localPoint(clientX, clientY);
    const next = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    const worldX = (point.x - from.x) / from.scale;
    const worldY = (point.y - from.y) / from.scale;
    setView({ x: point.x - worldX * next, y: point.y - worldY * next, scale: next });
  };

  const loadFocus = useCallback(
    async (target: string, signal?: AbortSignal, followNew = true): Promise<ExtendedNetworkData | null> => {
      setLoading(true);
      setError('');
      try {
        const payload = (await source(root, { focus: keyWallet(target), signal })) as ExtendedNetworkData;
        if (signal?.aborted) return null;
        const payloadNodes = Array.isArray(payload.allNodes) ? payload.allNodes : payload.children;
        const key = keyWallet(payload.focusWallet);
        const nextIds = new Set(payloadNodes.map((node) => keyWallet(node.wallet)));
        const previous = previousNodeIdsRef.current.get(key);
        previousNodeIdsRef.current.set(key, nextIds);
        const arrivals: string[] = previous ? [...nextIds].filter((id) => !previous.has(id)) : [];
        setData(payload);
        setFocusWallet(key);
        setSelectedWallet(null);
        setTemporaryRevealWallet(null);
        setGroupFocusId(null);
        setBulkMode(false);
        setBulkSelected([]);
        setLoading(false);
        if (arrivals.length) {
          setNewIds(arrivals);
          if (newTimerRef.current) window.clearTimeout(newTimerRef.current);
          newTimerRef.current = window.setTimeout(() => setNewIds([]), 3000);
          if (arrivals.length === 1 && followNew && autoFollowRef.current) {
            const extended = payloadNodes.map((node) => ({
              ...node,
              parentWallet: (node as GraphNode).parentWallet ?? key,
              generation: (node as GraphNode).generation ?? 1,
            })) as GraphNode[];
            const previewLayout = buildStableLayout(extended, key, compact, scopedManualPositions(manualPositions, key, device));
            const point = previewLayout[arrivals[0]];
            if (point) window.setTimeout(() => focusPoint(point, Math.max(1.08, view.scale)), 40);
          }
        }
        return payload;
      } catch (cause) {
        if (signal?.aborted) return null;
        setLoading(false);
        setError(cause instanceof Error ? cause.message : copy.loadError);
        return null;
      }
    },
    [source, root, compact, manualPositions, device, view.scale, copy.loadError],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadFocus(focusWallet || root, controller.signal, revision > 0);
    return () => controller.abort();
    // Navigation itself explicitly calls loadFocus; revision refreshes current focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, root]);

  useEffect(() => {
    if (!searchOpen || query.trim().length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void source(root, { query: query.trim().toLowerCase(), signal: controller.signal })
        .then((payload) => {
          if (!controller.signal.aborted) setSearchResults(payload.searchResults ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 240);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchOpen, query, source, root]);

  useEffect(() => {
    if (!groupsOpen) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || panelRef.current?.contains(target)) return;
      if (target.closest('[data-node-id],.groupHub')) return;
      if (groupDragRef.current || groupMoveRef.current) return;
      setGroupsOpen(false); // Keep groupForm draft for reopen.
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGroupsOpen(false); // Keep draft.
    };
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [groupsOpen]);

  const goFocus = async (wallet: string) => {
    markInteraction();
    setEditMode(false);
    setGroupsOpen(false);
    setSearchOpen(false);
    setGroupFocusId(null);
    resetView();
    await loadFocus(keyWallet(wallet), undefined, false);
  };
  const goYou = async () => {
    setGroupFocusId(null);
    await goFocus(root);
  };
  const goParent = async () => {
    if (data?.invitedBy) await goFocus(data.invitedBy);
  };
  const enterGroupFocus = (groupId: string) => {
    const group = currentGroups.find((item) => item.id === groupId);
    if (!group) return;
    markInteraction();
    setSelectedWallet(null);
    setTemporaryRevealWallet(null);
    setGroupFocusId(groupId);
    setGroupsOpen(false);
    resetView();
  };

  const fit = () => {
    const ids = activeNodes.map((node) => keyWallet(node.wallet));
    const points = ids.map(pointFor);
    if (!activeGroup) {
      currentGroups
        .filter((group) => group.collapsed)
        .forEach((group) => points.push(group.position[device]));
      if (data) {
        Array.from({ length: Math.max(0, availableSlots(data)) }, (_, index) => slotPoint(index, compact)).forEach((point) => points.push(point));
      }
    }
    if (!points.length) {
      resetView();
      return;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const next = clamp(
      Math.min(
        (stageSize.width - 72) / Math.max(300, maxX - minX + 150),
        (stageSize.height - 72) / Math.max(300, maxY - minY + 170),
        1.08,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setTransitioning(true);
    setView({ x: -((minX + maxX) / 2) * next, y: -((minY + maxY) / 2) * next, scale: next });
    window.setTimeout(() => setTransitioning(false), 760);
  };

  const rememberUndo = (message: string) => {
    setUndoState({ groups: cloneGroups(groups), message });
  };
  const undoGroups = () => {
    if (!undoState) return;
    setGroups(cloneGroups(undoState.groups));
    setUndoState(null);
  };
  const moveMembersToGroup = (nodeIds: string[], targetId: string) => {
    if (!nodeIds.length) return;
    rememberUndo(extraCopy.moveSelected);
    setGroups((current) =>
      current.map((group) => {
        if (group.scope !== scope) return group;
        const without = group.members.filter((id) => !nodeIds.includes(id));
        return group.id === targetId ? { ...group, members: [...without, ...nodeIds.filter((id) => !without.includes(id))] } : { ...group, members: without };
      }),
    );
  };
  const removeMembers = (nodeIds: string[]) => {
    if (!nodeIds.length) return;
    rememberUndo(extraCopy.removeSelected);
    setGroups((current) =>
      current.map((group) =>
        group.scope === scope ? { ...group, members: group.members.filter((id) => !nodeIds.includes(id)) } : group,
      ),
    );
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
    for (const [key, element] of groupTargetsRef.current.entries()) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left - 5 && clientX <= rect.right + 5 && clientY >= rect.top - 5 && clientY <= rect.bottom + 5) {
        return key.slice(key.indexOf(':') + 1);
      }
    }
    return null;
  };
  const panNearEdge = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || editMode) return;
    let dx = 0;
    let dy = 0;
    if (clientX < rect.left + EDGE_PAN_PX) dx = EDGE_PAN_STEP;
    else if (clientX > rect.right - EDGE_PAN_PX) dx = -EDGE_PAN_STEP;
    if (clientY < rect.top + EDGE_PAN_PX) dy = EDGE_PAN_STEP;
    else if (clientY > rect.bottom - EDGE_PAN_PX) dy = -EDGE_PAN_STEP;
    if (dx || dy) setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };

  const clearPress = () => {
    if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  const beginNodePointer = (event: ReactPointerEvent<HTMLButtonElement>, id: string, index: number) => {
    if (bulkMode) return;
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
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // best effort
    }
    if (editMode) {
      const point = pointFor(id);
      const world = screenToWorld(event.clientX, event.clientY);
      editDragRef.current = { pointerId: event.pointerId, nodeId: id, offset: { x: world.x - point.x, y: world.y - point.y } };
    } else {
      state.timer = window.setTimeout(() => {
        const current = pressRef.current;
        if (!current || current.pointerId !== state.pointerId || current.mode !== 'pending') return;
        current.mode = 'edit';
        setEditMode(true);
        setSelectedWallet(null);
        const point = pointFor(id);
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
      const hover = hitGroupTarget(event.clientX, event.clientY);
      if (!hover) {
        const world = screenToWorld(event.clientX, event.clientY);
        const offset = press.dragOffset ?? { x: 0, y: 0 };
        setNodePosition(press.nodeId, { x: world.x - offset.x, y: world.y - offset.y });
      }
      const next: GroupDrag = { nodeId: press.nodeId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, hover };
      groupDragRef.current = next;
      setGroupDrag(next);
      event.preventDefault();
      return;
    }
    if (moved <= MOVE_CANCEL_PX) return;
    if (press.timer) {
      window.clearTimeout(press.timer);
      press.timer = 0;
    }
    if (groupsOpen && press.mode === 'pending') {
      press.mode = 'group';
      suppressNodeClickRef.current = performance.now() + 700;
      const world = screenToWorld(event.clientX, event.clientY);
      const currentPoint = pointFor(press.nodeId);
      press.dragOffset = { x: world.x - currentPoint.x, y: world.y - currentPoint.y };
      const next: GroupDrag = { nodeId: press.nodeId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, hover: hitGroupTarget(event.clientX, event.clientY) };
      groupDragRef.current = next;
      setGroupDrag(next);
      event.preventDefault();
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
      if (target === 'remove') removeMembers([press.nodeId]);
      else if (target === 'new') {
        setGroupForm({ mode: 'create', name: '', pendingMembers: [press.nodeId] });
        setGroupsOpen(true);
      } else if (target) {
        moveMembersToGroup([press.nodeId], target);
      }
    }
    groupDragRef.current = null;
    setGroupDrag(null);
    clearPress();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // best effort
    }
  };

  const saveGroup = () => {
    if (!groupForm) return;
    const name = uniqueGroupName(groupForm.name, currentGroups, groupForm.id);
    if (!name) return;
    rememberUndo(groupForm.mode === 'create' ? copy.create : copy.rename);
    if (groupForm.mode === 'create') {
      const index = currentGroups.length;
      const group: UserGroup = {
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        scope,
        name,
        members: [...new Set<string>(groupForm.pendingMembers)],
        collapsed: true,
        position: {
          desktop: pointForGroup(index, false),
          mobile: pointForGroup(index, true),
        },
      };
      setGroups((current) => {
        const pending = new Set(group.members);
        const cleaned = current.map((item) =>
          item.scope === scope ? { ...item, members: item.members.filter((id) => !pending.has(id)) } : item,
        );
        return [...cleaned, group];
      });
    } else if (groupForm.id) {
      setGroups((current) => current.map((group) => (group.id === groupForm.id ? { ...group, name } : group)));
    }
    setGroupForm(null);
    setBulkSelected([]);
  };
  const dissolveGroup = (groupId: string) => {
    rememberUndo(copy.dissolve);
    setGroups((current) => current.filter((group) => group.id !== groupId));
    if (groupFocusId === groupId) setGroupFocusId(null);
  };
  const toggleGroup = (groupId: string) => {
    rememberUndo(copy.collapse);
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)));
  };

  const beginGroupMove = (event: ReactPointerEvent<HTMLButtonElement>, group: UserGroup) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    event.stopPropagation();
    groupMoveRef.current = {
      groupId: group.id,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: group.position[device],
      moved: false,
    };
    setGroupMovingId(group.id);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // best effort
    }
  };
  const moveGroup = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const move = groupMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    const dx = event.clientX - move.start.x;
    const dy = event.clientY - move.start.y;
    if (!move.moved && Math.hypot(dx, dy) < 5) return;
    move.moved = true;
    suppressGroupClickRef.current = performance.now() + 650;
    panNearEdge(event.clientX, event.clientY);
    event.preventDefault();
    const next = { x: move.origin.x + dx / view.scale, y: move.origin.y + dy / view.scale };
    setGroups((current) =>
      current.map((group) =>
        group.id === move.groupId ? { ...group, position: { ...group.position, [device]: next } } : group,
      ),
    );
  };
  const finishGroupMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const move = groupMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    if (move.moved) suppressGroupClickRef.current = performance.now() + 650;
    groupMoveRef.current = null;
    setGroupMovingId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // best effort
    }
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>('[data-node-id]');
    pointersRef.current.set(event.pointerId, {
      point: { x: event.clientX, y: event.clientY },
      nodeId: node?.dataset.nodeId ?? null,
    });
    if (pointersRef.current.size === 2 && !editMode) {
      clearPress();
      panRef.current = null;
      markInteraction();
      const values = [...pointersRef.current.values()].slice(0, 2);
      const a = values[0].point;
      const b = values[1].point;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const local = localPoint(midpoint.x, midpoint.y);
      const worldMidpoint = { x: (local.x - view.x) / view.scale, y: (local.y - view.y) / view.scale };
      let centeredNode: string | null = null;
      let centeredDistance = (compact ? 72 : 82) / Math.max(view.scale, 0.2);
      activeNodes.forEach((candidate) => {
        const id = keyWallet(candidate.wallet);
        const candidateDistance = distance(pointFor(id), worldMidpoint);
        if (candidateDistance < centeredDistance) {
          centeredDistance = candidateDistance;
          centeredNode = id;
        }
      });
      pinchRef.current = {
        startDistance: Math.max(1, distance(a, b)),
        startZoom: view.scale,
        worldAnchor: worldMidpoint,
        nodeId: centeredNode,
        ratio: 1,
      };
      return;
    }
    if (pointersRef.current.size > 1 || editMode || target.closest('[data-interactive="true"]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markInteraction();
    panRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: view.x, y: view.y },
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // best effort
    }
  };
  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointersRef.current.get(event.pointerId);
    if (pointer) pointer.point = { x: event.clientX, y: event.clientY };
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const values = [...pointersRef.current.values()].slice(0, 2);
      const a = values[0].point;
      const b = values[1].point;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = Math.max(1, distance(a, b)) / pinch.startDistance;
      pinch.ratio = ratio;
      const local = localPoint(midpoint.x, midpoint.y);
      const next = clamp(pinch.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
      setView({ x: local.x - pinch.worldAnchor.x * next, y: local.y - pinch.worldAnchor.y * next, scale: next });
      event.preventDefault();
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.start.x;
    const dy = event.clientY - pan.start.y;
    if (!pan.moved && Math.hypot(dx, dy) < 6) return;
    pan.moved = true;
    setView((current) => ({ ...current, x: pan.origin.x + dx, y: pan.origin.y + dy }));
  };
  const onStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size < 2) {
      pinchRef.current = null;
      // Blank-space pinch is always zoom only. Navigation is only from a node-centered pinch.
      if (pinch.nodeId && pinch.ratio >= 1.38) void goFocus(pinch.nodeId);
      else if (pinch.nodeId && data?.invitedBy && pinch.ratio <= 0.68) void goParent();
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (editMode) return;
    event.preventDefault();
    markInteraction();
    zoomAround(view.scale * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
  };

  const selectSearchResult = async (result: NetworkSearchResult) => {
    const parent = keyWallet(result.parentWallet ?? root);
    const payload = await loadFocus(parent, undefined, false);
    if (!payload) return;
    const resultId = keyWallet(result.wallet);
    const payloadNodes = Array.isArray(payload.allNodes) ? payload.allNodes : payload.children;
    if (!payloadNodes.some((node) => keyWallet(node.wallet) === resultId)) return;
    const owner = groups.find((group) => group.scope === parent && group.members.includes(resultId) && group.collapsed);
    setTemporaryRevealWallet(owner ? resultId : null);
    setSelectedWallet(resultId);
    setGroupFocusId(null);
    setSearchOpen(false);
    setQuery('');
    setSearchResults([]);
    const extended = payloadNodes.map((node) => ({
      ...node,
      parentWallet: (node as GraphNode).parentWallet ?? parent,
      generation: (node as GraphNode).generation ?? 1,
    })) as GraphNode[];
    const layout = buildStableLayout(extended, parent, compact, scopedManualPositions(manualPositions, parent, device));
    const point = layout[resultId];
    if (point) window.setTimeout(() => focusPoint(point, 1.18), 60);
  };

  const invite = async (slotIndex: number) => {
    if (!data || !onInvite || joiningSlot !== null || activeGroup) return;
    setJoiningSlot(slotIndex);
    autoFollowRef.current = true;
    try {
      await onInvite(data.focusWallet, slotIndex);
      await loadFocus(data.focusWallet, undefined, true);
    } finally {
      setJoiningSlot(null);
    }
  };

  const slots = data && !activeGroup ? Math.max(0, availableSlots(data)) : 0;
  const selected = graphNodes.find((node) => keyWallet(node.wallet) === selectedWallet) ?? null;
  const detailProgress = clamp((view.scale - 0.42) / 0.72, 0, 1);

  const renderNodes = useMemo(() => {
    if (activeNodes.length <= MAX_DOM_NODES) return activeNodes;
    const margin = 150;
    const important = new Set([
      ...(selectedWallet ? [selectedWallet] : []),
      ...newIds,
      ...bulkSelected,
      ...(temporaryRevealWallet ? [temporaryRevealWallet] : []),
    ]);
    const visible = activeNodes
      .map((node) => {
        const id = keyWallet(node.wallet);
        const point = pointFor(id);
        const sx = stageSize.width / 2 + view.x + point.x * view.scale;
        const sy = stageSize.height / 2 + view.y + point.y * view.scale;
        const inView = sx >= -margin && sx <= stageSize.width + margin && sy >= -margin && sy <= stageSize.height + margin;
        const distanceToCenter = Math.hypot(sx - stageSize.width / 2, sy - stageSize.height / 2);
        return { node, id, inView, distanceToCenter, important: important.has(id) };
      })
      .filter((item) => item.inView || item.important)
      .sort((left, right) => Number(right.important) - Number(left.important) || left.distanceToCenter - right.distanceToCenter);
    return visible.slice(0, MAX_DOM_NODES).map((item) => item.node);
  }, [activeNodes, selectedWallet, newIds, bulkSelected, temporaryRevealWallet, pointFor, stageSize, view]);
  const renderedIds = useMemo(() => new Set(renderNodes.map((node) => keyWallet(node.wallet))), [renderNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(stageSize.width * dpr));
    const height = Math.max(1, Math.round(stageSize.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${stageSize.width}px`;
    canvas.style.height = `${stageSize.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, stageSize.width, stageSize.height);
    if (activeNodes.length <= MAX_DOM_NODES) return;
    const activeSet = new Set(activeNodes.map((node) => keyWallet(node.wallet)));
    const byId = new Map(activeNodes.map((node) => [keyWallet(node.wallet), node]));
    context.lineWidth = 0.55;
    context.strokeStyle = 'rgba(218,207,180,.10)';
    context.beginPath();
    activeNodes.forEach((node) => {
      const id = keyWallet(node.wallet);
      if (renderedIds.has(id)) return;
      const parent = node.parentWallet ? keyWallet(node.parentWallet) : focusWallet;
      if (activeGroup && !activeSet.has(parent)) return;
      const from = parent === focusWallet ? { x: 0, y: 0 } : pointFor(parent);
      if (parent !== focusWallet && !byId.has(parent)) return;
      const to = pointFor(id);
      const x1 = stageSize.width / 2 + view.x + from.x * view.scale;
      const y1 = stageSize.height / 2 + view.y + from.y * view.scale;
      const x2 = stageSize.width / 2 + view.x + to.x * view.scale;
      const y2 = stageSize.height / 2 + view.y + to.y * view.scale;
      if ((x1 < -100 && x2 < -100) || (x1 > stageSize.width + 100 && x2 > stageSize.width + 100) || (y1 < -100 && y2 < -100) || (y1 > stageSize.height + 100 && y2 > stageSize.height + 100)) return;
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    });
    context.stroke();
    context.fillStyle = 'rgba(164,156,143,.44)';
    activeNodes.forEach((node) => {
      const id = keyWallet(node.wallet);
      if (renderedIds.has(id)) return;
      const point = pointFor(id);
      const x = stageSize.width / 2 + view.x + point.x * view.scale;
      const y = stageSize.height / 2 + view.y + point.y * view.scale;
      if (x < -12 || x > stageSize.width + 12 || y < -12 || y > stageSize.height + 12) return;
      context.beginPath();
      context.arc(x, y, Math.max(1, Math.min(2.2, 1.2 + view.scale * 0.7)), 0, Math.PI * 2);
      context.fill();
    });
  }, [activeNodes, renderedIds, pointFor, stageSize, view, focusWallet, activeGroup]);

  if (loading && !data) return <div className="networkV3State">{copy.loading}<style jsx>{networkV3StateCss}</style></div>;
  if (error && !data) {
    return (
      <div className="networkV3State">
        <b>{copy.loadError}</b>
        <span>{error}</span>
        <button type="button" onClick={() => void loadFocus(focusWallet)}>{copy.retry}</button>
        <style jsx>{networkV3StateCss}</style>
      </div>
    );
  }
  if (!data) return null;

  const svgEdges = activeNodes.length <= MAX_DOM_NODES ? activeNodes : renderNodes;

  return (
    <section
      className="networkV3"
      dir={dir}
      style={{
        '--detail': detailProgress,
        '--node-size': `${18 + 32 * detailProgress}px`,
        '--label-shift': `${(1 - detailProgress) * -3}px`,
      } as CSSProperties}
    >
      <header className="networkHeader">
        <div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <div className="headerActions">
          <button type="button" className={searchOpen ? 'active' : ''} onClick={() => { setSearchOpen((value) => !value); setGroupsOpen(false); }}>⌕ {copy.search}</button>
          <button type="button" className={groupsOpen ? 'active' : ''} onClick={() => { setGroupsOpen((value) => !value); setSearchOpen(false); }}>◎ {copy.groups}</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="crumbs">
          {data.breadcrumb.map((wallet, index) => (
            <span key={wallet}>
              {index > 0 ? <i>›</i> : null}
              <button type="button" disabled={keyWallet(wallet) === focusWallet && !activeGroup} onClick={() => void goFocus(wallet)}>{index === 0 ? copy.you : shortWallet(wallet)}</button>
            </span>
          ))}
          {activeGroup ? <span><i>›</i><button type="button" disabled>{activeGroup.name}</button></span> : null}
        </div>
        <div className="toolbarActions">
          <button type="button" onClick={() => void goYou()}>◎ {copy.you}</button>
          <button type="button" onClick={fit}>{copy.fit}</button>
          {!activeGroup ? <button type="button" className={editMode ? 'active' : ''} onClick={() => { clearPress(); setEditMode((value) => !value); setSelectedWallet(null); }}>{editMode ? `✓ ${copy.done}` : `✦ ${copy.editLayout}`}</button> : null}
          {editMode ? <button type="button" onClick={resetLayout}>{copy.reset}</button> : null}
        </div>
      </div>

      <div className="shell">
        <div className="shellTop">
          <div className="focusIdentity">
            <b>{activeGroup ? `${activeGroup.name} · ${activeGroup.members.length} ${extraCopy.people}` : focusWallet === root ? copy.you : shortWallet(focusWallet)}</b>
            {!activeGroup ? <><span>{data.summary.direct} {copy.direct}</span><span>{data.summary.network} {copy.network}</span></> : null}
          </div>
          <div className="zoomActions">
            <button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale - 0.12, MIN_ZOOM, MAX_ZOOM) }))}>−</button>
            <button type="button" onClick={resetView}>{Math.round(view.scale * 100)}%</button>
            <button type="button" onClick={() => setView((current) => ({ ...current, scale: clamp(current.scale + 0.12, MIN_ZOOM, MAX_ZOOM) }))}>+</button>
            {!activeGroup && data.invitedBy ? <button type="button" onClick={() => void goParent()}>{copy.inviter} ↑</button> : null}
          </div>
        </div>

        <div
          ref={stageRef}
          className={`stage ${editMode ? 'editMode' : ''} ${transitioning ? 'transitioning' : ''} ${activeNodes.length > MAX_DOM_NODES ? 'dense' : ''}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerEnd}
          onPointerCancel={onStagePointerEnd}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className="lodCanvas" aria-hidden="true" />
          <div className="world" style={{ '--vx': `${view.x}px`, '--vy': `${view.y}px`, '--vz': view.scale } as CSSProperties}>
            <svg className="edges" viewBox="-6000 -6000 12000 12000" aria-hidden="true">
              {svgEdges.map((node) => {
                const id = keyWallet(node.wallet);
                const parent = node.parentWallet ? keyWallet(node.parentWallet) : focusWallet;
                if (activeGroup && !allowedNodeIds.has(parent)) return null;
                if (parent !== focusWallet && !graphNodeMap.has(parent)) return null;
                const from = parent === focusWallet ? { x: 0, y: 0 } : pointFor(parent);
                const to = pointFor(id);
                return <path key={id} d={curveBetween(from, to)} className={newIds.includes(id) ? 'newEdge' : ''} />;
              })}
              {!activeGroup ? Array.from({ length: slots }, (_, index) => <path key={`slot-${index}`} d={curveBetween({ x: 0, y: 0 }, slotPoint(index, compact))} className="slotEdge" />) : null}
            </svg>

            {activeGroup ? (
              <div className="groupFocusCenter">
                <span>◎</span><b>{activeGroup.name}</b><small>{activeGroup.members.length} {extraCopy.people}</small>
              </div>
            ) : (
              <div className="centerNode"><span>●</span><b>{focusWallet === root ? copy.you : shortWallet(focusWallet)}</b><small>{data.summary.direct} {copy.direct} · {data.summary.network} {copy.network}</small></div>
            )}

            {renderNodes.map((node, index) => {
              const id = keyWallet(node.wallet);
              const point = pointFor(id);
              const fresh = newIds.includes(id);
              const selectedForBulk = bulkSelected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  data-node-id={id}
                  data-interactive="true"
                  className={`personNode ${selectedWallet === id ? 'selected' : ''} ${fresh ? 'fresh' : ''} ${selectedForBulk ? 'bulkSelected' : ''} ${groupDrag?.nodeId === id ? 'dragging' : ''}`}
                  style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                  onClick={() => {
                    if (editMode || performance.now() < suppressNodeClickRef.current) return;
                    if (bulkMode) {
                      setBulkSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
                      return;
                    }
                    setSelectedWallet(id);
                    setTemporaryRevealWallet(memberOwner.get(id) ? id : null);
                  }}
                  onPointerDown={(event) => beginNodePointer(event, id, index)}
                  onPointerMove={moveNodePointer}
                  onPointerUp={finishNodePointer}
                  onPointerCancel={finishNodePointer}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <span className="nodeCircle">●</span>
                  <b>{shortWallet(id)}</b>
                  <small>{node.direct} {copy.direct} · {node.network} {copy.network}</small>
                  {fresh ? <em>{copy.newLabel}</em> : null}
                </button>
              );
            })}

            {!activeGroup ? currentGroups.filter((group) => group.collapsed).map((group) => {
              const point = group.position[device];
              return (
                <button
                  key={group.id}
                  ref={(node) => { const key = `hub:${group.id}`; if (node) groupTargetsRef.current.set(key, node); else groupTargetsRef.current.delete(key); }}
                  type="button"
                  className={`groupHub ${groupMovingId === group.id ? 'moving' : ''} ${groupDrag?.hover === group.id ? 'dropHover' : ''}`}
                  data-interactive="true"
                  style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties}
                  onPointerDown={(event) => beginGroupMove(event, group)}
                  onPointerMove={moveGroup}
                  onPointerUp={finishGroupMove}
                  onPointerCancel={finishGroupMove}
                  onClick={() => { if (performance.now() >= suppressGroupClickRef.current) enterGroupFocus(group.id); }}
                >
                  <span>◎</span><b>{group.name} · {group.members.length}</b><small>{extraCopy.groupFocus}</small>
                </button>
              );
            }) : null}

            {!activeGroup ? Array.from({ length: slots }, (_, index) => {
              const point = slotPoint(index, compact);
              const joining = joiningSlot === index;
              return (
                <button key={index} type="button" className={`slotNode ${joining ? 'joining' : ''}`} data-interactive="true" style={{ '--x': `${point.x}px`, '--y': `${point.y}px` } as CSSProperties} disabled={!onInvite} onClick={() => void invite(index)}>
                  <span>{joining ? '…' : '+'}</span><b>{joining ? copy.joining : copy.available}</b>
                </button>
              );
            }) : null}
          </div>

          {selected ? (
            <aside className="profileCard" data-interactive="true">
              <div><b>{shortWallet(selected.wallet)}</b><button type="button" onClick={() => { setSelectedWallet(null); setTemporaryRevealWallet(null); }}>×</button></div>
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
              <div className="panelHead">
                <b>{copy.groups}</b>
                <button type="button" onClick={() => setGroupsOpen(false)}>×</button>
              </div>
              <div className="bulkBar">
                <button type="button" className={bulkMode ? 'active' : ''} onClick={() => { setBulkMode((value) => !value); if (bulkMode) setBulkSelected([]); }}>{bulkMode ? extraCopy.doneSelecting : extraCopy.selectPeople}</button>
                {bulkMode ? <small>{bulkSelected.length} {extraCopy.selected}</small> : null}
              </div>
              {groupForm ? (
                <div className="groupForm">
                  <input autoFocus value={groupForm.name} maxLength={MAX_GROUP_NAME} placeholder={copy.groupName} onChange={(event) => setGroupForm((current) => current ? { ...current, name: event.target.value } : current)} />
                  <div><button type="button" onClick={() => setGroupForm(null)}>{copy.cancel}</button><button type="button" className="primary" onClick={saveGroup}>{groupForm.mode === 'create' ? copy.create : copy.save}</button></div>
                </div>
              ) : (
                <>
                  <div className="groupRows">
                    {currentGroups.map((group) => (
                      <div key={group.id} ref={(node) => { const key = `row:${group.id}`; if (node) groupTargetsRef.current.set(key, node); else groupTargetsRef.current.delete(key); }} className={`groupRow ${groupDrag?.hover === group.id ? 'hover' : ''}`}>
                        <button type="button" className="groupMain" onClick={() => toggleGroup(group.id)}><b>{group.name}</b><small>{group.members.length ? `${group.members.length} ${copy.grouped}` : copy.emptyGroup}</small></button>
                        {bulkSelected.length ? <button type="button" title={extraCopy.moveSelected} onClick={() => { moveMembersToGroup(bulkSelected, group.id); setBulkSelected([]); }}>+{bulkSelected.length}</button> : null}
                        <button type="button" title={extraCopy.groupFocus} onClick={() => enterGroupFocus(group.id)}>◎</button>
                        <button type="button" aria-label={copy.rename} onClick={() => setGroupForm({ mode: 'edit', id: group.id, name: group.name, pendingMembers: [] })}>✎</button>
                        <button type="button" aria-label={copy.dissolve} onClick={() => dissolveGroup(group.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <button ref={newGroupTargetRef} type="button" className={`newGroup ${groupDrag?.hover === 'new' ? 'hover' : ''}`} onClick={() => setGroupForm({ mode: 'create', name: '', pendingMembers: bulkSelected })}><b>{currentGroups.length ? `＋ ${copy.newGroup}` : `＋ ${copy.createFirstGroup}`}</b><small>{bulkSelected.length ? `${bulkSelected.length} ${extraCopy.selected}` : copy.dissolveHelp}</small></button>
                  {bulkSelected.length && bulkSelected.some((id) => memberOwner.has(id)) ? <button type="button" className="bulkRemove" onClick={() => { removeMembers(bulkSelected); setBulkSelected([]); }}>{extraCopy.removeSelected}</button> : null}
                  {groupDrag && memberOwner.has(groupDrag.nodeId) ? <div ref={removeTargetRef} className={`removeZone ${groupDrag.hover === 'remove' ? 'hover' : ''}`}>{copy.removeFromGroup}</div> : null}
                </>
              )}
            </aside>
          ) : null}

          {groupDrag ? <div className="dragGhost" style={{ left: groupDrag.x, top: groupDrag.y }}>{shortWallet(groupDrag.nodeId)}</div> : null}
          <div className="hint">{activeGroup ? `${activeGroup.name} · ${activeGroup.members.length} ${extraCopy.people}` : editMode ? `${copy.editLayout} · ${copy.done}` : copy.holdToEdit}</div>
          {newIds.length > 1 ? <div className="newBadge">{newIds.length} {copy.newLabel}</div> : null}
          {undoState ? <div className="undoToast"><span>{undoState.message}</span><button type="button" onClick={undoGroups}>{extraCopy.undo}</button></div> : null}
        </div>
      </div>
      <style jsx>{networkV3Css}</style>
    </section>
  );
}
