'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from 'react';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'direct50' | 'hundred' | 'fiveHundred';
type Scenario = { id: ScenarioId; label: string; note: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type GraphNode = { id: string; parent: string | null; children: string[] };
type Point = { x: number; y: number };
type Camera = { x: number; y: number };
type PersonItem = Point & { id: string; index: number };
type Cluster = Point & { id: string; members: PersonItem[] };
type NodeKind = 'person' | 'slot';
type DragState = { key: string; pointerId: number; offsetX: number; offsetY: number; target: HTMLButtonElement } | null;
type PanState = { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null;
type PinchState = {
  startDistance: number;
  startZoom: number;
  startCamera: Camera;
  worldAnchor: Point;
  nodeId: string | null;
  ratio: number;
} | null;
type PressState = {
  key: string;
  kind: NodeKind;
  id: string;
  point: Point;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  target: HTMLButtonElement;
  timer: number;
  activated: boolean;
} | null;
type SearchHit = { id: string; depth: number };

const ROOT = 'root';
const STORAGE_KEY = 'veinvite:qa:radial-v37:positions-v2';
const MIN_ZOOM = .32;
const MAX_ZOOM = 2.5;
const CLUSTER_ENTER_ZOOM = .66;
const CLUSTER_EXIT_ZOOM = .82;
const CLUSTER_MIN_CHILDREN = 14;
const LONG_TRANSITION_MS = 720;
const LONG_PRESS_MS = 500;
const PRESS_MOVE_CANCEL_PX = 10;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available only', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: '첫 초대', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'five', label: '5명', note: '작은 네트워크', direct: 5, total: 12, depth: 3, fanout: 2, openSlots: 2 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 12, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'direct50', label: '직접 50', note: 'one canvas stress', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', note: '중형', direct: 26, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', note: '대형', direct: 54, total: 500, depth: 7, fanout: 5, openSlots: 2 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shortId(id: string) {
  if (id === ROOT) return 'YOU';
  return `0x…${(stableHash(id) & 0xffff).toString(16).padStart(4, '0')}`;
}

function fakeAddress(id: string) {
  if (id === ROOT) return 'Connected wallet (YOU)';
  let value = '';
  for (let i = 0; i < 5; i += 1) value += stableHash(`${id}:${i}`).toString(16).padStart(8, '0');
  return `0x${value.slice(0, 40)}`;
}

function makeGraph(scenario: Scenario) {
  const graph = new Map<string, GraphNode>();
  graph.set(ROOT, { id: ROOT, parent: null, children: [] });
  if (!scenario.total || !scenario.direct) return graph;

  let next = 1;
  const roots: string[] = [];
  const depths = new Map<string, number>([[ROOT, 0]]);
  for (let i = 0; i < Math.min(scenario.direct, scenario.total); i += 1) {
    const id = `n${next++}`;
    roots.push(id);
    graph.set(id, { id, parent: ROOT, children: [] });
    depths.set(id, 1);
  }
  graph.get(ROOT)!.children = roots;

  const queue = [...roots];
  let cursor = 0;
  while (next <= scenario.total && cursor < queue.length) {
    const parent = queue[cursor++];
    const depth = depths.get(parent) ?? 1;
    if (depth >= scenario.depth || scenario.fanout <= 0) continue;
    const seed = Number(parent.replace('n', '')) || 1;
    const wanted = Math.max(1, Math.min(scenario.fanout, 1 + (seed % Math.max(1, scenario.fanout))));
    for (let i = 0; i < wanted && next <= scenario.total; i += 1) {
      const id = `n${next++}`;
      graph.set(id, { id, parent, children: [] });
      graph.get(parent)?.children.push(id);
      depths.set(id, depth + 1);
      queue.push(id);
    }
  }

  while (next <= scenario.total && roots.length) {
    const parent = roots[(next - 1) % roots.length];
    const id = `n${next++}`;
    graph.set(id, { id, parent, children: [] });
    graph.get(parent)?.children.push(id);
  }
  return graph;
}

function descendants(graph: Map<string, GraphNode>, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  return (graph.get(id)?.children ?? []).reduce((sum, child) => sum + 1 + descendants(graph, child, seen), 0);
}

function lineage(graph: Map<string, GraphNode>, id: string) {
  const result: string[] = [];
  let cursor: string | null = id;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    result.unshift(cursor);
    cursor = graph.get(cursor)?.parent ?? null;
  }
  return result[0] === ROOT ? result : [ROOT, ...result];
}

function collectBelow(graph: Map<string, GraphNode>, centerId: string) {
  const result: SearchHit[] = [];
  const walk = (id: string, depth: number) => {
    for (const child of graph.get(id)?.children ?? []) {
      result.push({ id: child, depth });
      walk(child, depth + 1);
    }
  };
  walk(centerId, 1);
  return result;
}

function autoPersonPoint(id: string, index: number, compact: boolean): Point {
  const jitter = ((stableHash(id) % 101) - 50) / 800;
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE + jitter;
  const radius = compact ? 118 + Math.sqrt(index) * 82 : 208 + Math.sqrt(index) * 128;
  const yScale = compact ? .86 : .78;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * yScale + (compact ? 18 : 26) };
}

function slotPoint(index: number, compact: boolean): Point {
  if (index === 0) return { x: compact ? -58 : -96, y: compact ? 74 : 92 };
  return { x: compact ? 64 : 108, y: compact ? 62 : 78 };
}

function touchDistance(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function pathFor(point: Point) {
  const bend = Math.sign(point.x || 1) * Math.min(58, Math.abs(point.x) * .16);
  return `M 0 0 C ${bend} ${point.y * .22}, ${point.x - bend} ${point.y * .78}, ${point.x} ${point.y}`;
}

function spatialClusters(items: PersonItem[], compact: boolean) {
  const size = compact ? 6 : 8;
  const ordered = [...items].sort((a, b) => {
    const angleA = Math.atan2(a.y, a.x);
    const angleB = Math.atan2(b.y, b.x);
    return angleA - angleB || stableHash(a.id) - stableHash(b.id);
  });
  const result: Cluster[] = [];
  for (let i = 0; i < ordered.length; i += size) {
    const members = ordered.slice(i, i + size);
    if (!members.length) continue;
    let x = members.reduce((sum, item) => sum + item.x, 0) / members.length;
    let y = members.reduce((sum, item) => sum + item.y, 0) / members.length;
    const radius = Math.hypot(x, y);
    const minimumRadius = compact ? 178 : 260;
    if (radius < minimumRadius) {
      const fallback = members[Math.floor(members.length / 2)];
      const angle = Math.atan2(y || fallback.y, x || fallback.x);
      x = Math.cos(angle) * minimumRadius;
      y = Math.sin(angle) * minimumRadius;
    }
    result.push({ id: `cluster-${members[0].id}-${members[members.length - 1].id}`, members, x, y });
  }
  return result;
}

export function QaNetworkRadialPlaygroundV37() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const panRef = useRef<PanState>(null);
  const pinchRef = useRef<PinchState>(null);
  const dragRef = useRef<DragState>(null);
  const pressRef = useRef<PressState>(null);
  const extraCounterRef = useRef(1);
  const suppressClickUntilRef = useRef(0);
  const autoFocusAllowedRef = useRef(true);

  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [centerId, setCenterId] = useState(ROOT);
  const [compact, setCompact] = useState(false);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [clustered, setClustered] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [savedPositions, setSavedPositions] = useState<Record<string, Point>>({});
  const [joiningSlot, setJoiningSlot] = useState<string | null>(null);
  const [newArrival, setNewArrival] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [pressingKey, setPressingKey] = useState<string | null>(null);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const baseGraph = useMemo(() => makeGraph(scenario), [scenario]);
  const graph = useMemo(() => {
    const copy = new Map<string, GraphNode>();
    baseGraph.forEach((node, id) => copy.set(id, { id, parent: node.parent, children: [...node.children] }));
    Object.entries(extras).forEach(([parent, ids]) => {
      const owner = copy.get(parent);
      if (!owner) return;
      for (const id of ids) {
        if (!copy.has(id)) copy.set(id, { id, parent, children: [] });
        if (!owner.children.includes(id)) owner.children.push(id);
      }
    });
    return copy;
  }, [baseGraph, extras]);

  const center = graph.get(centerId) ?? graph.get(ROOT)!;
  const parentId = center.parent;
  const childCount = center.children.length;
  const totalBelow = descendants(graph, center.id);
  const crumbs = lineage(graph, center.id);
  const slotCount = center.id === ROOT ? Math.max(1, Math.min(2, scenario.openSlots)) : 1 + (stableHash(`${scenario.id}:${center.id}:slot`) % 2);
  const layoutPrefix = `${scenario.id}|${center.id}|${compact ? 'mobile' : 'desktop'}|`;
  const layoutKey = (kind: NodeKind, id: string) => `${layoutPrefix}${kind}|${id}`;

  const pointForChild = (id: string, index: number) => savedPositions[layoutKey('person', id)] ?? autoPersonPoint(id, index, compact);
  const pointForSlot = (index: number) => {
    const id = `slot-${index}`;
    return savedPositions[layoutKey('slot', id)] ?? slotPoint(index, compact);
  };

  const personItems = useMemo<PersonItem[]>(() => center.children.map((id, index) => ({ id, index, ...pointForChild(id, index) })), [center.children, savedPositions, compact, layoutPrefix]);
  const slotItems = useMemo(() => Array.from({ length: slotCount }, (_, index) => ({ id: `slot-${index}`, index, ...pointForSlot(index) })), [slotCount, savedPositions, compact, layoutPrefix]);
  const clusterCandidates = useMemo(() => spatialClusters(personItems, compact), [personItems, compact]);

  useEffect(() => {
    if (editMode || childCount < CLUSTER_MIN_CHILDREN) {
      setClustered(false);
      return;
    }
    setClustered((current) => current ? zoom < CLUSTER_EXIT_ZOOM : zoom <= CLUSTER_ENTER_ZOOM);
  }, [zoom, editMode, childCount]);

  const clusters = clustered ? clusterCandidates : [];
  const selected = selectedId ? graph.get(selectedId) ?? null : null;
  const searchResults = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [] as SearchHit[];
    return collectBelow(graph, center.id)
      .filter((hit) => hit.id.toLowerCase().includes(value) || shortId(hit.id).toLowerCase().includes(value) || fakeAddress(hit.id).toLowerCase().includes(value))
      .slice(0, 8);
  }, [query, graph, center.id]);

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    timersRef.current.push(timer);
    return timer;
  };
  const clearPress = (suppress = false) => {
    const press = pressRef.current;
    if (press) window.clearTimeout(press.timer);
    if (suppress) suppressClickUntilRef.current = performance.now() + 520;
    pressRef.current = null;
    setPressingKey(null);
  };

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedPositions(JSON.parse(raw) as Record<string, Point>);
    } catch {
      setSavedPositions({});
    }
    return () => {
      clearTimers();
      clearPress();
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPositions)); } catch { /* QA only */ }
  }, [savedPositions]);

  const stageRect = () => stageRef.current?.getBoundingClientRect() ?? null;
  const screenPoint = (clientX: number, clientY: number) => {
    const rect = stageRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };
  const screenToWorld = (clientX: number, clientY: number) => {
    const point = screenPoint(clientX, clientY);
    return { x: (point.x - camera.x) / zoom, y: (point.y - camera.y) / zoom };
  };

  const setZoomAround = (nextZoomValue: number, clientX: number, clientY: number, startCamera = camera, startZoom = zoom) => {
    const rect = stageRect();
    if (!rect) return;
    const pointer = { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
    const nextZoom = clamp(nextZoomValue, MIN_ZOOM, MAX_ZOOM);
    const worldX = (pointer.x - startCamera.x) / startZoom;
    const worldY = (pointer.y - startCamera.y) / startZoom;
    setZoom(nextZoom);
    setCamera({ x: pointer.x - worldX * nextZoom, y: pointer.y - worldY * nextZoom });
  };

  const focusPoint = (point: Point, targetZoom = Math.max(1, zoom)) => {
    const resolvedZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    setTransitioning(true);
    setZoom(resolvedZoom);
    setCamera({ x: -point.x * resolvedZoom, y: -point.y * resolvedZoom });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };
  const resetView = () => {
    setTransitioning(true);
    setZoom(1);
    setCamera({ x: 0, y: 0 });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };
  const goYou = () => {
    clearTimers();
    clearPress();
    setCenterId(ROOT);
    setSelectedId(null);
    setSearchOpen(false);
    setQuery('');
    setEditMode(false);
    setNotice(null);
    setNewArrival(null);
    setJoiningSlot(null);
    setTransitioning(true);
    setZoom(1);
    setCamera({ x: 0, y: 0 });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };

  const fitNetwork = () => {
    const rect = stageRect();
    if (!rect || !personItems.length) {
      resetView();
      return;
    }
    const points = [...personItems, ...slotItems];
    const minX = Math.min(...points.map((item) => item.x));
    const maxX = Math.max(...points.map((item) => item.x));
    const minY = Math.min(...points.map((item) => item.y));
    const maxY = Math.max(...points.map((item) => item.y));
    const width = Math.max(180, maxX - minX + 220);
    const height = Math.max(180, maxY - minY + 240);
    const targetZoom = clamp(Math.min((rect.width - 28) / width, (rect.height - 28) / height, 1.15), MIN_ZOOM, MAX_ZOOM);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setTransitioning(true);
    setZoom(targetZoom);
    setCamera({ x: -centerX * targetZoom, y: -centerY * targetZoom });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };

  const enterNetwork = (id: string) => {
    if (editMode || !graph.has(id)) return;
    clearPress(true);
    suppressClickUntilRef.current = performance.now() + 360;
    setTransitioning(true);
    setSelectedId(null);
    setCenterId(id);
    setZoom(1);
    setCamera({ x: 0, y: 0 });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };
  const goParent = () => {
    if (!parentId || editMode) return;
    clearPress(true);
    setTransitioning(true);
    setSelectedId(null);
    setCenterId(parentId);
    setZoom(1);
    setCamera({ x: 0, y: 0 });
    later(() => setTransitioning(false), LONG_TRANSITION_MS + 80);
  };
  const goCrumb = (id: string) => {
    if (id === center.id || !graph.has(id) || editMode) return;
    clearPress(true);
    setCenterId(id);
    setSelectedId(null);
    resetView();
  };
  const changeScenario = (id: ScenarioId) => {
    clearTimers();
    clearPress();
    setScenarioId(id);
    setCenterId(ROOT);
    setExtras({});
    setSelectedId(null);
    setSearchOpen(false);
    setQuery('');
    setEditMode(false);
    setJoiningSlot(null);
    setNewArrival(null);
    setNotice(null);
    setZoom(1);
    setCamera({ x: 0, y: 0 });
  };

  const locateSearchResult = (id: string) => {
    const node = graph.get(id);
    if (!node) return;
    const owner = node.parent ?? ROOT;
    const siblings = graph.get(owner)?.children ?? [];
    const index = Math.max(0, siblings.indexOf(id));
    const key = `${scenario.id}|${owner}|${compact ? 'mobile' : 'desktop'}|person|${id}`;
    const point = savedPositions[key] ?? autoPersonPoint(id, index, compact);
    setCenterId(owner);
    setSearchOpen(false);
    setQuery('');
    setSelectedId(id);
    later(() => focusPoint(point, 1.18), 40);
  };
  const openCluster = (cluster: Cluster) => {
    clearPress(true);
    setClustered(false);
    setSelectedId(null);
    focusPoint(cluster, 1.08);
  };
  const markUserInteraction = () => {
    if (joiningSlot) autoFocusAllowedRef.current = false;
  };

  const simulateInvite = (slotId: string) => {
    if (editMode || joiningSlot) return;
    clearTimers();
    autoFocusAllowedRef.current = true;
    setJoiningSlot(slotId);
    setNotice('New friend is joining…');
    const owner = center.id;
    const index = center.children.length;
    const id = `g-${scenario.id}-${extraCounterRef.current++}`;
    const point = autoPersonPoint(id, index, compact);
    later(() => setNotice('Verified · adding to this network'), 520);
    later(() => {
      setExtras((current) => ({ ...current, [owner]: [...(current[owner] ?? []), id] }));
      setJoiningSlot(null);
      setNewArrival(id);
      setNotice('New node added');
      if (autoFocusAllowedRef.current) focusPoint(point, Math.max(1.08, zoom));
    }, 900);
    later(() => {
      setNewArrival(null);
      setNotice(null);
    }, 2600);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (editMode || Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    markUserInteraction();
    const target = event.target instanceof Element ? event.target.closest('button.personNode') as HTMLButtonElement | null : null;
    const multiplier = event.deltaY < 0 ? 1.1 : .9;
    const nextZoom = clamp(zoom * multiplier, MIN_ZOOM, MAX_ZOOM);
    setZoomAround(nextZoom, event.clientX, event.clientY);
    if (target && event.deltaY < 0 && nextZoom >= 1.72) {
      const id = target.dataset.nodeId;
      if (id) later(() => enterNetwork(id), 80);
      return;
    }
    if (!target && parentId && event.deltaY > 0 && nextZoom <= .4) later(goParent, 60);
  };

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || editMode) return;
    clearPress(true);
    markUserInteraction();
    const a = event.touches[0];
    const b = event.touches[1];
    const midClient = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    const midpoint = screenPoint(midClient.x, midClient.y);
    const direct = document.elementFromPoint(midClient.x, midClient.y)?.closest('button.personNode') as HTMLButtonElement | null;
    const nodeId = direct && rootRef.current?.contains(direct) ? direct.dataset.nodeId ?? null : null;
    pinchRef.current = {
      startDistance: Math.max(1, touchDistance(a, b)),
      startZoom: zoom,
      startCamera: camera,
      worldAnchor: { x: (midpoint.x - camera.x) / zoom, y: (midpoint.y - camera.y) / zoom },
      nodeId,
      ratio: 1,
    };
    suppressClickUntilRef.current = performance.now() + 500;
  };
  const onTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const a = event.touches[0];
    const b = event.touches[1];
    const ratio = touchDistance(a, b) / pinch.startDistance;
    pinch.ratio = ratio;
    const midClient = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    const midpoint = screenPoint(midClient.x, midClient.y);
    const nextZoom = clamp(pinch.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
    setZoom(nextZoom);
    setCamera({ x: midpoint.x - pinch.worldAnchor.x * nextZoom, y: midpoint.y - pinch.worldAnchor.y * nextZoom });
  };
  const finishPinch = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length >= 2) return;
    pinchRef.current = null;
    const ratio = pinch.ratio;
    const finalZoom = clamp(pinch.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
    if (pinch.nodeId && ratio >= 1.38) {
      enterNetwork(pinch.nodeId);
      return;
    }
    if (parentId && ratio <= .68 && finalZoom <= .82) goParent();
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pinchRef.current) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (editMode && !target.closest('button,.profileCard,.searchPanel')) {
      setEditMode(false);
      clearPress(true);
      return;
    }
    if (target.closest('button,.profileCard,.searchPanel')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    markUserInteraction();
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: camera.x, originY: camera.y, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }
  };
  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || pinchRef.current) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) < 6) return;
    pan.moved = true;
    setCamera({ x: pan.originX + dx, y: pan.originY + dy });
  };
  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (pan.moved) suppressClickUntilRef.current = performance.now() + 340;
    panRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  };

  const beginDragAt = (target: HTMLButtonElement, pointerId: number, key: string, point: Point, clientX: number, clientY: number) => {
    const world = screenToWorld(clientX, clientY);
    dragRef.current = { key, pointerId, offsetX: world.x - point.x, offsetY: world.y - point.y, target };
    try { target.setPointerCapture(pointerId); } catch { /* no-op */ }
  };
  const beginNodePointer = (event: ReactPointerEvent<HTMLButtonElement>, kind: NodeKind, id: string, point: Point) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    markUserInteraction();
    const key = layoutKey(kind, id);
    if (editMode) {
      event.preventDefault();
      beginDragAt(event.currentTarget, event.pointerId, key, point, event.clientX, event.clientY);
      return;
    }
    clearPress(false);
    const target = event.currentTarget;
    const press: NonNullable<PressState> = {
      key,
      kind,
      id,
      point,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      target,
      timer: 0,
      activated: false,
    };
    try { target.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    press.timer = window.setTimeout(() => {
      const active = pressRef.current;
      if (!active || active.pointerId !== press.pointerId || active.key !== press.key) return;
      active.activated = true;
      suppressClickUntilRef.current = performance.now() + 900;
      setSelectedId(null);
      setEditMode(true);
      setClustered(false);
      setPressingKey(null);
      setNotice('Layout edit on · drag to move');
      beginDragAt(active.target, active.pointerId, active.key, active.point, active.lastX, active.lastY);
      later(() => setNotice(null), 1300);
    }, LONG_PRESS_MS);
    pressRef.current = press;
    setPressingKey(key);
  };
  const moveNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      const world = screenToWorld(event.clientX, event.clientY);
      setSavedPositions((current) => ({ ...current, [drag.key]: { x: world.x - drag.offsetX, y: world.y - drag.offsetY } }));
      return;
    }
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.activated) return;
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > PRESS_MOVE_CANCEL_PX) clearPress(true);
  };
  const finishNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      suppressClickUntilRef.current = performance.now() + 520;
      try { drag.target.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      dragRef.current = null;
      clearPress(true);
      return;
    }
    clearPress(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  };
  const cancelNodePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    clearPress(true);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  };

  const resetLayout = () => {
    clearPress(true);
    setSavedPositions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(layoutPrefix))));
  };
  const nodeClick = (id: string) => {
    if (editMode || performance.now() < suppressClickUntilRef.current) return;
    setSelectedId(id);
  };
  const toggleEditMode = () => {
    clearPress(true);
    setSelectedId(null);
    setEditMode((value) => !value);
  };

  const sceneStyle = { '--cameraX': `${camera.x}px`, '--cameraY': `${camera.y}px`, '--networkZoom': zoom } as CSSProperties;

  return (
    <main ref={rootRef} className="v37Page">
      <section className="labHeader">
        <div><strong>RADIAL NETWORK PLAYGROUND · V37</strong><span>One canvas · spatial +N clusters · long-press edit · new-node follow · YOU / Fit</span></div>
        <div className="headerActions">
          <button type="button" className={debug ? 'active' : ''} onClick={() => setDebug((value) => !value)}>Debug</button>
          <button type="button" onClick={() => setSearchOpen((value) => !value)}>⌕ Search</button>
        </div>
      </section>

      <section className="scenarioBar" aria-label="Network scenarios">
        {SCENARIOS.map((item) => <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => changeScenario(item.id)}><b>{item.label}</b><small>{item.note}</small></button>)}
      </section>

      <section className="controlBar">
        <div className="crumbs">{crumbs.map((id, index) => <span key={id}>{index ? <i>›</i> : null}<button type="button" className={id === center.id ? 'current' : ''} onClick={() => goCrumb(id)} disabled={id === center.id || editMode}>{shortId(id)}</button></span>)}</div>
        <div className="viewActions"><button type="button" onClick={goYou}>◎ YOU</button><button type="button" onClick={fitNetwork}>Fit</button></div>
      </section>

      <section className="networkShell">
        <div className="networkTop">
          <div className="identity"><b>{shortId(center.id)}</b><span>Direct {childCount}</span><span>Network {totalBelow}</span><span>{clustered ? `${clusters.length} groups` : 'All on one canvas'}</span></div>
          <div className="navActions">
            <button type="button" className={editMode ? 'active' : ''} onClick={toggleEditMode}>{editMode ? '✓ Done' : '✦ Edit layout'}</button>
            {editMode ? <button type="button" onClick={resetLayout}>Reset</button> : null}
            <button type="button" onClick={() => setZoom((value) => clamp(value - .12, MIN_ZOOM, MAX_ZOOM))}>−</button>
            <button type="button" className="zoomValue" onClick={resetView}>{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((value) => clamp(value + .12, MIN_ZOOM, MAX_ZOOM))}>+</button>
            {parentId ? <button type="button" onClick={goParent} disabled={editMode}>← Inviter</button> : null}
          </div>
        </div>

        <div
          ref={stageRef}
          className={`stage ${editMode ? 'editMode' : ''} ${transitioning ? 'cameraTransition' : ''} ${clustered ? 'clusterMode' : ''}`}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={finishPinch}
          onTouchCancel={finishPinch}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
        >
          <div className="scene" style={sceneStyle}>
            <div className="waterGlow" />
            <svg className="edges" viewBox="-2200 -2200 4400 4400" aria-hidden="true">
              <defs><linearGradient id="v37Line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgba(239,205,111,.25)"/><stop offset="1" stopColor="rgba(239,205,111,.035)"/></linearGradient></defs>
              {!clustered && personItems.map((item) => <path key={`p-${item.id}`} d={pathFor(item)} className={`spoke ${newArrival === item.id ? 'newEdge' : ''}`} />)}
              {clustered && clusters.map((cluster) => <path key={`c-${cluster.id}`} d={pathFor(cluster)} className="spoke clusterSpoke" />)}
              {slotItems.map((item) => <path key={`s-${item.id}`} d={pathFor(item)} className="spoke slotSpoke" />)}
            </svg>

            <div className="centerWrap"><span className="centerCircle">●</span><b>{shortId(center.id)}</b><small>{childCount} direct · {totalBelow} network</small></div>

            {!clustered ? <div className="ringLayer">
              {personItems.map((item) => {
                const node = graph.get(item.id);
                const childNetwork = descendants(graph, item.id);
                const key = layoutKey('person', item.id);
                return <button
                  key={item.id}
                  type="button"
                  data-node-id={item.id}
                  className={`personNode ${newArrival === item.id ? 'newArrival' : ''} ${pressingKey === key ? 'pressing' : ''}`}
                  style={{ '--x': `${item.x}px`, '--y': `${item.y}px` } as CSSProperties}
                  onClick={() => nodeClick(item.id)}
                  onPointerDown={(event) => beginNodePointer(event, 'person', item.id, item)}
                  onPointerMove={moveNodePointer}
                  onPointerUp={finishNodePointer}
                  onPointerCancel={cancelNodePointer}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                ><span className="nodeCircle">●</span><b>{shortId(item.id)}</b><small>{node?.children.length ?? 0} direct · {childNetwork} net</small></button>;
              })}
            </div> : <div className="ringLayer clusterLayer">
              {clusters.map((cluster) => <button key={cluster.id} type="button" className="clusterNode" style={{ '--x': `${cluster.x}px`, '--y': `${cluster.y}px` } as CSSProperties} onClick={() => openCluster(cluster)}><span>+{cluster.members.length}</span></button>)}
            </div>}

            <div className="ringLayer slotLayer">
              {slotItems.map((item) => {
                const key = layoutKey('slot', item.id);
                return <button
                  key={item.id}
                  type="button"
                  className={`slotNode ${joiningSlot === item.id ? 'joining' : ''} ${pressingKey === key ? 'pressing' : ''}`}
                  style={{ '--x': `${item.x}px`, '--y': `${item.y}px` } as CSSProperties}
                  onClick={() => simulateInvite(item.id)}
                  onPointerDown={(event) => beginNodePointer(event, 'slot', item.id, item)}
                  onPointerMove={moveNodePointer}
                  onPointerUp={finishNodePointer}
                  onPointerCancel={cancelNodePointer}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                ><span className="slotCircle">{joiningSlot === item.id ? '…' : '+'}</span><b>{joiningSlot === item.id ? 'Joining' : 'Available'}</b></button>;
              })}
            </div>
          </div>

          {selected ? <aside className="profileCard">
            <div><b>{shortId(selected.id)}</b><button type="button" onClick={() => setSelectedId(null)}>×</button></div>
            <code>{fakeAddress(selected.id)}</code>
            <p>{selected.children.length} direct · {descendants(graph, selected.id)} network</p>
            <button type="button" className="viewNetwork" onClick={() => enterNetwork(selected.id)}>View this network →</button>
          </aside> : null}

          {searchOpen ? <aside className="searchPanel">
            <div><b>Find in this network</b><button type="button" onClick={() => setSearchOpen(false)}>×</button></div>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Wallet / node" />
            <div className="searchResults">{searchResults.map((hit) => <button key={hit.id} type="button" onClick={() => locateSearchResult(hit.id)}><b>{shortId(hit.id)}</b><small>depth {hit.depth}</small></button>)}{query && !searchResults.length ? <span>No match</span> : null}</div>
          </aside> : null}

          <div className="hint">{editMode ? 'Drag freely · tap background to finish' : clustered ? 'Zoom in or tap +N to unfold · zoom out to group again' : 'Hold a node to edit · drag canvas · pinch to zoom'}</div>
          {notice ? <div className="notice">✦ {notice}</div> : null}
          {debug ? <div className="debugPanel"><span>Children {childCount}</span><span>Rendered {clustered ? clusters.length : personItems.length}</span><span>Zoom {Math.round(zoom * 100)}%</span><span>{clustered ? 'GROUPED' : 'EXPANDED'}</span><span>{editMode ? 'EDIT' : 'VIEW'}</span><span>Saved {Object.keys(savedPositions).length}</span></div> : null}
        </div>
      </section>

      <section className="rules">
        <span><b>One canvas</b>No pages. New nodes keep extending the same network space.</span>
        <span><b>Spatial +N</b>Nearby directions fold together instead of collapsing into the center.</span>
        <span><b>Hold to edit</b>Hold a real node for 0.5s, then drag it immediately.</span>
        <span><b>Safe layout</b>Grouping never changes saved positions.</span>
      </section>

      <style jsx>{`
        .v37Page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}.labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:min(calc(100vw - 20px),960px);margin-left:auto;margin-right:auto;box-sizing:border-box}button,input{font:inherit}.labHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.6rem;letter-spacing:.08em;color:#d9b653}.labHeader span{font-size:.47rem;color:#7e776c}.headerActions,.viewActions,.navActions{display:flex;align-items:center;gap:5px}.headerActions button,.viewActions button,.navActions button{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0e0e0c;color:#918a7e;font-size:.48rem}.headerActions button.active,.navActions button.active{border-color:rgba(244,183,40,.36);background:rgba(244,183,40,.09);color:#ddb958}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:80px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.4rem;color:#6e685f}.controlBar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 2px 9px}.crumbs{display:flex;align-items:center;gap:4px;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.crumbs span{display:flex;align-items:center;gap:4px}.crumbs i{font-style:normal;color:#555047;font-size:.46rem}.crumbs button{border:0;background:transparent;color:#888075;font-size:.46rem;padding:2px}.crumbs button.current{color:#d1ad4d}.viewActions button{color:#b9a36d}
        .networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.networkTop{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.05)}.identity{display:flex;flex-wrap:wrap;align-items:center;gap:5px 9px}.identity b{font-size:.57rem;color:#c6a858}.identity span{font-size:.42rem;color:#777065}.zoomValue{min-width:44px;color:#b59d60!important}.stage{height:min(74svh,720px);min-height:520px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 52%,rgba(244,183,40,.034),transparent 34%),#080807;touch-action:none;overscroll-behavior:contain;cursor:grab}.stage.editMode{cursor:default}.scene{position:absolute;inset:0;transform:translate3d(var(--cameraX),var(--cameraY),0) scale(var(--networkZoom));transform-origin:50% 50%;transition:transform 90ms linear}.cameraTransition .scene{transition:transform ${LONG_TRANSITION_MS}ms cubic-bezier(.18,.82,.2,1)}.waterGlow{position:absolute;inset:12%;background:radial-gradient(ellipse at 50% 54%,rgba(220,181,75,.024),transparent 60%);filter:blur(18px);pointer-events:none}.edges{position:absolute;left:50%;top:50%;width:4400px;height:4400px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:2}.spoke{fill:none;stroke:url(#v37Line);stroke-width:1;stroke-linecap:round;transition:opacity 180ms ease}.clusterSpoke{stroke-width:1.3;stroke-dasharray:5 7;opacity:.58}.slotSpoke{stroke:rgba(220,181,75,.2);stroke-dasharray:3 6}.newEdge{stroke:rgba(250,204,66,.92);stroke-width:2;stroke-dasharray:10 8;animation:newEdge37 1.1s linear 2}
        .centerWrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;display:grid;justify-items:center;gap:5px}.centerCircle{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:#0d0d0b;border:1px solid rgba(244,183,40,.68);color:#e5b943;box-shadow:0 0 38px rgba(244,183,40,.05)}.centerWrap b{font-size:.61rem}.centerWrap small{font-size:.41rem;color:#746d62}.ringLayer{position:absolute;left:50%;top:50%;z-index:6}.personNode,.slotNode,.clusterNode{--x:0px;--y:0px;position:absolute;left:0;top:0;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));border:0;background:transparent;color:#d7d0c3;display:grid;justify-items:center;gap:4px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}.personNode{width:116px}.nodeCircle,.slotCircle{border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.nodeCircle{width:52px;height:52px;border:1px solid rgba(210,174,65,.38);color:#d9b34a;box-shadow:0 0 22px rgba(244,183,40,.025);transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.personNode:hover .nodeCircle,.personNode:focus-visible .nodeCircle{transform:scale(1.05);border-color:rgba(244,183,40,.75);box-shadow:0 0 24px rgba(244,183,40,.08)}.personNode.pressing .nodeCircle{transform:scale(1.08);border-color:rgba(244,183,40,.9);box-shadow:0 0 30px rgba(244,183,40,.12)}.personNode b,.slotNode b{font-size:.47rem;white-space:nowrap}.personNode small{font-size:.38rem;color:#6c655b;white-space:nowrap}.newArrival .nodeCircle{animation:newNode37 720ms cubic-bezier(.16,.82,.2,1) 2}.slotNode{width:104px}.slotCircle{width:46px;height:46px;border:1px dashed rgba(226,181,62,.52);color:#c79f36;font-size:.9rem;animation:slotPulse37 5.6s ease-in-out infinite}.slotNode.pressing .slotCircle{border-style:solid;border-color:rgba(244,183,40,.9);box-shadow:0 0 28px rgba(244,183,40,.1)}.slotNode.joining .slotCircle{border-style:solid;animation:joining37 .7s ease-in-out infinite}.clusterNode{width:72px}.clusterNode span{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(244,183,40,.58);background:rgba(17,16,12,.96);color:#e0b94f;font-size:.62rem;font-weight:700;box-shadow:0 0 26px rgba(244,183,40,.06);transition:transform 170ms ease,border-color 170ms ease}.clusterNode:hover span,.clusterNode:focus-visible span{border-color:rgba(244,183,40,.88);transform:scale(1.05)}
        .clusterMode .slotLayer{opacity:.64}.clusterMode .centerWrap small{opacity:.72}.profileCard,.searchPanel{position:absolute;z-index:50;top:12px;right:12px;width:min(300px,calc(100% - 24px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.18);border-radius:14px;background:rgba(12,12,10,.96);box-shadow:0 14px 42px rgba(0,0,0,.3)}.profileCard>div,.searchPanel>div:first-child{display:flex;align-items:center;justify-content:space-between}.profileCard button,.searchPanel button{border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#11110e;color:#aaa08e}.profileCard>div button,.searchPanel>div:first-child button{width:28px;height:28px}.profileCard b,.searchPanel b{font-size:.54rem;color:#d4b35b}.profileCard code{display:block;margin-top:8px;padding:7px;border-radius:8px;background:#090907;color:#80786c;font-size:.4rem;overflow-wrap:anywhere}.profileCard p{font-size:.44rem;color:#777065}.profileCard .viewNetwork{width:100%;height:34px;color:#d6b45c}.searchPanel input{width:100%;box-sizing:border-box;margin-top:9px;height:36px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#090907;color:#ded7ca;outline:none}.searchResults{display:grid;gap:5px;margin-top:7px}.searchResults button{min-height:34px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between}.searchResults small,.searchResults>span{font-size:.4rem;color:#736b5f}.hint{position:absolute;z-index:30;left:50%;bottom:10px;transform:translateX(-50%);padding:5px 8px;border-radius:999px;background:rgba(10,10,8,.78);color:#6f685d;font-size:.39rem;white-space:nowrap;pointer-events:none}.notice{position:absolute;z-index:42;left:50%;top:14px;transform:translateX(-50%);padding:7px 10px;border:1px solid rgba(244,183,40,.2);border-radius:999px;background:rgba(18,16,9,.94);color:#d7b34e;font-size:.45rem}.debugPanel{position:absolute;z-index:45;left:10px;top:10px;display:flex;flex-wrap:wrap;gap:4px;max-width:62%}.debugPanel span{padding:4px 6px;border-radius:7px;background:rgba(5,5,4,.82);color:#81796c;font-size:.36rem;border:1px solid rgba(255,255,255,.05)}
        .rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.rules span{padding:8px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:#0b0b09;color:#756e64;font-size:.4rem;line-height:1.5}.rules b{display:block;margin-bottom:2px;color:#b99c52;font-size:.43rem}.editMode .personNode,.editMode .slotNode{cursor:grab}.editMode .personNode:active,.editMode .slotNode:active{cursor:grabbing}.editMode .nodeCircle,.editMode .slotCircle{border-color:rgba(244,183,40,.65)}
        @keyframes newNode37{0%{transform:scale(.45);box-shadow:0 0 0 rgba(244,183,40,0)}55%{transform:scale(1.18);box-shadow:0 0 42px rgba(244,183,40,.22)}100%{transform:scale(1);box-shadow:0 0 14px rgba(244,183,40,.04)}}@keyframes newEdge37{from{stroke-dashoffset:72}to{stroke-dashoffset:0}}@keyframes slotPulse37{0%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}50%{box-shadow:0 0 22px rgba(244,183,40,.07)}}@keyframes joining37{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.08);opacity:1}}
        @media(max-width:700px){.labHeader{align-items:flex-start}.labHeader span{display:none}.networkTop{align-items:flex-start;flex-direction:column}.navActions{width:100%;overflow-x:auto;padding-bottom:1px}.stage{height:min(70svh,650px);min-height:500px}.rules{grid-template-columns:1fr 1fr}.profileCard,.searchPanel{top:9px;right:9px;width:calc(100% - 18px)}.hint{max-width:90%;overflow:hidden;text-overflow:ellipsis}.headerActions button,.viewActions button,.navActions button{font-size:.45rem;padding:0 8px}}
        @media(prefers-reduced-motion:reduce){.scene,.cameraTransition .scene,.nodeCircle,.newArrival .nodeCircle,.newEdge{transition:none!important;animation:none!important}}
      `}</style>
    </main>
  );
}
