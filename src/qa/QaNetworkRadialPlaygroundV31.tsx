'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'direct50' | 'hundred' | 'fiveHundred';
type Scenario = { id: ScenarioId; label: string; note: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type GraphNode = { id: string; children: string[]; parent: string | null };
type LineStyle = 'minimal' | 'soft';
type NodeKind = 'person' | 'slot';
type Point = { x: number; y: number };
type NormalizedPoint = { nx: number; ny: number };
type RingItem = Point & { id: string; kind: NodeKind; index: number };
type Travel = { id: string; x: number; y: number; mode: 'in' | 'out' };
type Phase = 'idle' | 'depart' | 'arrive';
type GateDemo = { slotId: string; centerId: string; phase: 'joining' | 'complete' } | null;
type DragState = { key: string; offsetX: number; offsetY: number; pointerId: number } | null;
type PressState = {
  key: string;
  item: RingItem;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  target: HTMLButtonElement;
  timer: number;
  activated: boolean;
} | null;

const ROOT = 'root';
const STORAGE_KEY = 'veinvite:qa:radial-v30:normalized-positions';
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available only', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: '첫 초대', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'five', label: '5명', note: '작은 네트워크', direct: 5, total: 12, depth: 3, fanout: 2, openSlots: 2 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'direct50', label: '직접 50', note: 'wide stress', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', note: '중형', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', note: '대형', direct: 40, total: 500, depth: 7, fanout: 5, openSlots: 2 },
];

const DESKTOP_ANCHORS: Point[] = [
  { x: -226, y: -72 }, { x: 226, y: -40 }, { x: -250, y: 48 }, { x: 244, y: 88 }, { x: -194, y: 174 },
  { x: 184, y: 154 }, { x: -112, y: 216 }, { x: 112, y: 194 }, { x: -270, y: 130 }, { x: 266, y: 158 },
];
const MOBILE_ANCHORS: Point[] = [
  { x: -106, y: -82 }, { x: 108, y: -58 }, { x: -118, y: 32 }, { x: 116, y: 60 },
  { x: -102, y: 152 }, { x: 98, y: 136 }, { x: -34, y: 192 }, { x: 42, y: 174 },
];

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

function makeGraph(s: Scenario) {
  const graph = new Map<string, GraphNode>();
  graph.set(ROOT, { id: ROOT, children: [], parent: null });
  if (!s.total || !s.direct) return graph;
  let nextId = 1;
  const roots: string[] = [];
  const depthMap = new Map<string, number>([[ROOT, 0]]);
  for (let i = 0; i < Math.min(s.direct, s.total); i += 1) {
    const id = `n${nextId++}`;
    roots.push(id);
    graph.set(id, { id, children: [], parent: ROOT });
    depthMap.set(id, 1);
  }
  graph.set(ROOT, { id: ROOT, children: roots, parent: null });
  const queue = [...roots];
  let cursor = 0;
  while (nextId <= s.total && cursor < queue.length) {
    const parent = queue[cursor++];
    const depth = depthMap.get(parent) ?? 1;
    if (depth >= s.depth || s.fanout <= 0) continue;
    const seed = Number(parent.replace('n', '')) || 1;
    const wanted = Math.max(1, Math.min(s.fanout, 1 + (seed % Math.max(1, s.fanout))));
    for (let i = 0; i < wanted && nextId <= s.total; i += 1) {
      const id = `n${nextId++}`;
      graph.set(id, { id, children: [], parent });
      graph.get(parent)?.children.push(id);
      depthMap.set(id, depth + 1);
      queue.push(id);
    }
  }
  while (nextId <= s.total && roots.length) {
    const parent = roots[(nextId - 1) % roots.length];
    const id = `n${nextId++}`;
    graph.set(id, { id, children: [], parent });
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
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    path.unshift(cursor);
    cursor = graph.get(cursor)?.parent ?? null;
  }
  return path[0] === ROOT ? path : [ROOT, ...path];
}

function slotsFor(id: string, scenario: Scenario) {
  if (id === ROOT) return Math.max(1, Math.min(2, scenario.openSlots || 2));
  return 1 + (stableHash(`${scenario.id}:${id}:slots`) % 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slotDefaults(count: number, compact: boolean): Point[] {
  if (count <= 1) return [{ x: 0, y: compact ? 78 : 88 }];
  return compact ? [{ x: -52, y: 64 }, { x: 58, y: 50 }] : [{ x: -92, y: 66 }, { x: 102, y: 52 }];
}

function basePersonPoint(id: string, localIndex: number, compact: boolean) {
  const anchors = compact ? MOBILE_ANCHORS : DESKTOP_ANCHORS;
  const base = anchors[localIndex % anchors.length];
  const hash = stableHash(id);
  const jitterX = ((hash % 17) - 8) * (compact ? .75 : 1.45);
  const jitterY = (((hash >>> 6) % 17) - 8) * (compact ? .8 : 1.45);
  return { x: base.x + jitterX, y: base.y + jitterY };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function minimallySeparate(candidate: Point, id: string, occupied: Point[], gates: Point[], compact: boolean) {
  const personMin = compact ? 78 : 92;
  const gateMin = compact ? 82 : 104;
  const collides = (point: Point) => occupied.some((other) => distance(point, other) < personMin) || gates.some((gate) => distance(point, gate) < gateMin);
  if (!collides(candidate)) return candidate;
  const hash = stableHash(`${id}:avoid`);
  const sign = hash % 2 ? 1 : -1;
  const attempts = compact ? [12, 20, 28, 34] : [16, 24, 32, 40];
  for (const shift of attempts) {
    const options = [
      { x: candidate.x + sign * shift, y: candidate.y - shift * .18 },
      { x: candidate.x - sign * shift, y: candidate.y + shift * .14 },
      { x: candidate.x + sign * shift * .55, y: candidate.y + shift * .52 },
      { x: candidate.x - sign * shift * .48, y: candidate.y - shift * .45 },
    ];
    const found = options.find((point) => !collides(point));
    if (found) return found;
  }
  return candidate;
}

function pathFor(item: RingItem, style: LineStyle) {
  const { x, y } = item;
  const seeded = ((stableHash(item.id) % 13) - 6) * .75;
  if (style === 'minimal') return `M 0 0 C ${x * .28 + seeded} ${y * .24}, ${x * .72 - seeded} ${y * .76}, ${x} ${y}`;
  const bend = Math.sign(x || 1) * Math.min(30, Math.abs(x) * .14) + seeded;
  return `M 0 0 C ${bend} ${y * .2}, ${x - bend} ${y * .8}, ${x} ${y}`;
}

function limits(compact: boolean) {
  return compact ? { x: 138, y: 220, yMin: -210, yMax: 220 } : { x: 306, y: 246, yMin: -238, yMax: 246 };
}

function fromNormalized(point: NormalizedPoint | undefined, compact: boolean): Point | null {
  if (!point) return null;
  const lim = limits(compact);
  return { x: clamp(point.nx, -1, 1) * lim.x, y: clamp(point.ny, -1, 1) * lim.y };
}

function toNormalized(point: Point, compact: boolean): NormalizedPoint {
  const lim = limits(compact);
  return { nx: clamp(point.x / lim.x, -1, 1), ny: clamp(point.y / lim.y, -1, 1) };
}

export function QaNetworkRadialPlaygroundV31() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [centerId, setCenterId] = useState(ROOT);
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  const [lineStyle, setLineStyle] = useState<LineStyle>('soft');
  const [debug, setDebug] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [travel, setTravel] = useState<Travel | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [gateDemo, setGateDemo] = useState<GateDemo>(null);
  const [extras, setExtras] = useState<Record<string, string[]>>({});
  const [newArrival, setNewArrival] = useState<string | null>(null);
  const [arrivalNotice, setArrivalNotice] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [pageMotion, setPageMotion] = useState<'left' | 'right' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [savedPositions, setSavedPositions] = useState<Record<string, NormalizedPoint>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [pressingKey, setPressingKey] = useState<string | null>(null);

  const timers = useRef<number[]>([]);
  const extraCounter = useRef(1);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const pressRef = useRef<PressState>(null);
  const suppressClickRef = useRef<{ key: string; until: number } | null>(null);

  const minZoom = compact ? .58 : .48;
  const maxZoom = compact ? 1.04 : 1.16;
  const peoplePerPage = compact ? 8 : 10;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const clearPress = (suppress = false) => {
    const press = pressRef.current;
    if (press) {
      window.clearTimeout(press.timer);
      if (suppress) suppressClickRef.current = { key: press.key, until: Date.now() + 700 };
    }
    pressRef.current = null;
    setPressingKey(null);
  };

  const clearDrag = () => {
    dragRef.current = null;
    setDraggingKey(null);
  };

  const clearPointerInteraction = () => {
    clearPress(false);
    clearDrag();
  };

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  useEffect(() => () => {
    clearTimers();
    clearPointerInteraction();
  }, []);
  useEffect(() => setZoom((current) => clamp(current, minZoom, maxZoom)), [minZoom, maxZoom]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedPositions(JSON.parse(raw) as Record<string, NormalizedPoint>);
    } catch {
      setSavedPositions({});
    } finally {
      setStorageReady(true);
    }
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPositions)); } catch { /* QA only */ }
  }, [savedPositions, storageReady]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !editMode) return;
      clearPointerInteraction();
      setEditMode(false);
      setEditNotice(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode]);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const baseGraph = useMemo(() => makeGraph(scenario), [scenario]);
  const graph = useMemo(() => {
    const copy = new Map<string, GraphNode>();
    baseGraph.forEach((node, id) => copy.set(id, { id, parent: node.parent, children: [...node.children] }));
    Object.entries(extras).forEach(([parent, ids]) => ids.forEach((id) => {
      if (!copy.has(id)) copy.set(id, { id, parent, children: [] });
    }));
    Object.entries(extras).forEach(([parent, ids]) => {
      const owner = copy.get(parent);
      if (!owner) return;
      ids.forEach((id) => { if (!owner.children.includes(id)) owner.children.push(id); });
    });
    return copy;
  }, [baseGraph, extras]);

  const center = graph.get(centerId) ?? graph.get(ROOT)!;
  const slotCount = slotsFor(center.id, scenario);
  const pageCount = Math.max(1, Math.ceil(center.children.length / peoplePerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * peoplePerPage;
  const visibleChildren = center.children.slice(pageStart, pageStart + peoplePerPage);
  const crumbs = lineage(graph, center.id);
  const parentId = center.parent;
  const defaultGates = useMemo(() => slotDefaults(slotCount, compact), [slotCount, compact]);
  const layoutPrefix = `${scenario.id}|${center.id}|`;
  const layoutKey = (kind: NodeKind, id: string) => `${layoutPrefix}${kind}|${id}`;

  const autoPersonPoints = useMemo(() => {
    const occupied: Point[] = [];
    const points = new Map<string, Point>();
    visibleChildren.forEach((id, localIndex) => {
      const candidate = basePersonPoint(id, localIndex, compact);
      const resolved = minimallySeparate(candidate, id, occupied, defaultGates, compact);
      occupied.push(resolved);
      points.set(id, resolved);
    });
    return points;
  }, [visibleChildren, compact, defaultGates]);

  const personItems = useMemo<RingItem[]>(() => visibleChildren.map((id, localIndex) => {
    const automatic = autoPersonPoints.get(id) ?? basePersonPoint(id, localIndex, compact);
    const custom = fromNormalized(savedPositions[`${layoutPrefix}person|${id}`], compact);
    const point = custom ?? automatic;
    return { id, kind: 'person', x: point.x, y: point.y, index: pageStart + localIndex };
  }), [visibleChildren, autoPersonPoints, compact, savedPositions, layoutPrefix, pageStart]);

  const slotItems = useMemo<RingItem[]>(() => defaultGates.map((automatic, index) => {
    const id = `slot-${index}`;
    const custom = fromNormalized(savedPositions[`${layoutPrefix}slot|${id}`], compact);
    const point = custom ?? automatic;
    return { id, kind: 'slot', x: point.x, y: point.y, index };
  }), [defaultGates, compact, savedPositions, layoutPrefix]);

  const ringItems = [...personItems, ...slotItems];
  const childCount = center.children.length;
  const totalBelow = descendants(graph, center.id);
  const completed = Math.min(childCount, Math.floor(childCount * (.52 + ((stableHash(center.id) % 28) / 100))));
  const busy = phase !== 'idle' || Boolean(gateDemo);
  const zoomClass = zoom < .66 ? 'zoom-far' : zoom < .9 ? 'zoom-mid' : 'zoom-near';

  const resetMotion = () => {
    clearTimers();
    setPhase('idle');
    setTravel(null);
    setGateDemo(null);
    setPageMotion(null);
    setNewArrival(null);
    setArrivalNotice(null);
    setEditNotice(null);
  };

  const setZoomSafe = (value: number) => setZoom(clamp(value, minZoom, maxZoom));
  const bumpZoom = (amount: number) => setZoom((current) => clamp(current + amount, minZoom, maxZoom));
  const onWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    if (editMode || Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    setZoom((current) => clamp(current + (event.deltaY > 0 ? -.08 : .08), minZoom, maxZoom));
  };

  const consumeSuppressedClick = (key: string) => {
    const suppressed = suppressClickRef.current;
    if (!suppressed) return false;
    if (suppressed.until < Date.now()) {
      suppressClickRef.current = null;
      return false;
    }
    if (suppressed.key !== key) return false;
    suppressClickRef.current = null;
    return true;
  };

  const enterNode = (item: RingItem) => {
    if (editMode || busy || item.kind !== 'person' || !graph.has(item.id)) return;
    clearTimers();
    setInfoOpen(false);
    setTravel({ id: item.id, x: item.x, y: item.y, mode: 'in' });
    setPhase('depart');
    later(() => {
      setCenterId(item.id);
      setPage(0);
      setTravel(null);
      setPhase('arrive');
    }, 500);
    later(() => setPhase('idle'), 840);
  };

  const goParent = () => {
    if (editMode || busy || !parentId) return;
    const parent = graph.get(parentId);
    if (!parent) return;
    const childIndex = parent.children.indexOf(center.id);
    const targetPage = Math.max(0, Math.floor(Math.max(0, childIndex) / peoplePerPage));
    const localIndex = Math.max(0, childIndex) % peoplePerPage;
    const parentCustom = fromNormalized(savedPositions[`${scenario.id}|${parentId}|person|${center.id}`], compact);
    const target = parentCustom ?? basePersonPoint(center.id, localIndex, compact);
    clearTimers();
    setInfoOpen(false);
    setTravel({ id: center.id, x: target.x, y: target.y, mode: 'out' });
    setPhase('depart');
    later(() => {
      setCenterId(parentId);
      setPage(targetPage);
      setTravel(null);
      setPhase('arrive');
    }, 500);
    later(() => setPhase('idle'), 840);
  };

  const goToCrumb = (id: string) => {
    if (editMode || busy || id === center.id || !graph.has(id)) return;
    clearPointerInteraction();
    clearTimers();
    setInfoOpen(false);
    setCenterId(id);
    setPage(0);
    setPhase('arrive');
    later(() => setPhase('idle'), 340);
  };

  const goRoot = () => {
    clearPointerInteraction();
    resetMotion();
    setEditMode(false);
    setInfoOpen(false);
    setCenterId(ROOT);
    setPage(0);
  };

  const changeScenario = (id: ScenarioId) => {
    clearPointerInteraction();
    resetMotion();
    setEditMode(false);
    setScenarioId(id);
    setCenterId(ROOT);
    setPage(0);
    setExtras({});
    setInfoOpen(false);
  };

  const changePage = (direction: 'left' | 'right') => {
    if (editMode || busy || pageCount <= 1) return;
    clearPointerInteraction();
    setPageMotion(direction);
    setPage((current) => direction === 'right' ? (current + 1) % pageCount : (current - 1 + pageCount) % pageCount);
    later(() => setPageMotion(null), 320);
  };

  const simulateGate = (slotId: string) => {
    if (editMode || busy) return;
    clearTimers();
    const owner = center.id;
    const nextId = `g-${scenario.id}-${extraCounter.current++}`;
    const destinationPage = Math.floor(childCount / peoplePerPage);
    setGateDemo({ slotId, centerId: owner, phase: 'joining' });
    later(() => setGateDemo({ slotId, centerId: owner, phase: 'complete' }), 560);
    later(() => {
      setExtras((current) => ({ ...current, [owner]: [...(current[owner] ?? []), nextId] }));
      setGateDemo(null);
      if (destinationPage === safePage) {
        setNewArrival(nextId);
        setPhase('arrive');
      } else {
        setArrivalNotice(`New person added · page ${destinationPage + 1}`);
      }
    }, 930);
    later(() => {
      setNewArrival(null);
      setArrivalNotice(null);
      setPhase('idle');
    }, 2200);
  };

  const logicalPointer = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - (rect.left + rect.width / 2)) / zoom, y: (clientY - (rect.top + rect.height / 2)) / zoom };
  };

  const startDragAt = (item: RingItem, key: string, pointerId: number, clientX: number, clientY: number, target: HTMLButtonElement) => {
    const pointer = logicalPointer(clientX, clientY);
    dragRef.current = { key, offsetX: pointer.x - item.x, offsetY: pointer.y - item.y, pointerId };
    setDraggingKey(key);
    try { target.setPointerCapture(pointerId); } catch { /* no-op */ }
  };

  const beginPointer = (event: ReactPointerEvent<HTMLButtonElement>, item: RingItem) => {
    if (busy) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const key = layoutKey(item.kind, item.id);
    if (editMode) {
      event.preventDefault();
      event.stopPropagation();
      startDragAt(item, key, event.pointerId, event.clientX, event.clientY, event.currentTarget);
      return;
    }

    clearPress(false);
    const target = event.currentTarget;
    const press: NonNullable<PressState> = {
      key,
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      target,
      timer: 0,
      activated: false,
    };
    press.timer = window.setTimeout(() => {
      const active = pressRef.current;
      if (!active || active.pointerId !== press.pointerId || active.key !== press.key) return;
      active.activated = true;
      suppressClickRef.current = { key, until: Date.now() + 900 };
      setEditMode(true);
      setPressingKey(null);
      setEditNotice('Layout edit on · drag to move');
      startDragAt(active.item, active.key, active.pointerId, active.lastX, active.lastY, active.target);
      later(() => setEditNotice(null), 1600);
    }, LONG_PRESS_MS);
    pressRef.current = press;
    setPressingKey(key);
  };

  const movePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragging = dragRef.current;
    if (dragging && dragging.pointerId === event.pointerId) {
      event.preventDefault();
      const pointer = logicalPointer(event.clientX, event.clientY);
      const lim = limits(compact);
      const next = {
        x: clamp(pointer.x - dragging.offsetX, -lim.x, lim.x),
        y: clamp(pointer.y - dragging.offsetY, lim.yMin, lim.yMax),
      };
      setSavedPositions((current) => ({ ...current, [dragging.key]: toNormalized(next, compact) }));
      return;
    }

    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.activated) return;
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (moved > MOVE_CANCEL_PX) clearPress(true);
  };

  const endPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragging = dragRef.current;
    if (dragging && dragging.pointerId === event.pointerId) {
      suppressClickRef.current = { key: dragging.key, until: Date.now() + 700 };
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
      clearDrag();
      clearPress(true);
      return;
    }
    clearPress(false);
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) clearDrag();
    clearPress(true);
  };

  const toggleEditMode = () => {
    if (busy) return;
    clearPointerInteraction();
    setEditMode((value) => !value);
    setEditNotice(null);
  };

  const finishEditFromBackground = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode || busy || dragRef.current || pressRef.current) return;
    const target = event.target as Element;
    if (target.closest('button, aside, .centerWrap, .traveler, .emptyHint, .arrivalNotice, .editNotice, .debugPanel')) return;
    clearPointerInteraction();
    setEditMode(false);
    setEditNotice(null);
  };

  const resetCurrentLayout = () => {
    clearPointerInteraction();
    setSavedPositions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(layoutPrefix))));
    setEditNotice('Current layout reset');
    later(() => setEditNotice(null), 1200);
  };

  return (
    <main className="page">
      <section className="labHeader">
        <div>
          <strong>RADIAL NETWORK PLAYGROUND · V31</strong>
          <span>Organic stable anchors · long-press edit · tap background to finish · semantic zoom</span>
        </div>
        <div className="headerActions">
          <button type="button" className={debug ? 'active' : ''} onClick={() => setDebug((value) => !value)}>Debug</button>
          <button type="button" onClick={goRoot}>◎ YOU</button>
        </div>
      </section>

      <section className="scenarioBar" aria-label="Network scenarios">
        {SCENARIOS.map((item) => <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => changeScenario(item.id)}><b>{item.label}</b><small>{item.note}</small></button>)}
      </section>

      <section className="controlBar">
        <div className="crumbs" aria-label="Network path">
          {crumbs.map((id, index) => <span key={id}>{index ? <i>›</i> : null}<button type="button" className={id === center.id ? 'current' : ''} onClick={() => goToCrumb(id)} disabled={busy || editMode || id === center.id}>{shortId(id)}</button></span>)}
        </div>
        <div className="lineSwitch" aria-label="Line style">
          <button type="button" className={lineStyle === 'minimal' ? 'active' : ''} onClick={() => setLineStyle('minimal')}>Minimal</button>
          <button type="button" className={lineStyle === 'soft' ? 'active' : ''} onClick={() => setLineStyle('soft')}>Soft</button>
        </div>
      </section>

      <section className="networkShell">
        <div className="networkTop">
          <div className="identity"><b>{shortId(center.id)}</b><span>Direct {childCount}</span><span>Network {totalBelow}</span><span>Completed {completed}</span></div>
          <div className="navActions">
            <button type="button" className={editMode ? 'active editButton' : 'editButton'} onClick={toggleEditMode} disabled={busy}>{editMode ? '✓ Done' : '✦ Edit layout'}</button>
            {editMode ? <button type="button" className="resetButton" onClick={resetCurrentLayout}>Reset</button> : null}
            <div className="zoomControls" aria-label="Network zoom"><button type="button" onClick={() => bumpZoom(-.1)} disabled={zoom <= minZoom + .01}>−</button><button type="button" className="zoomValue" onClick={() => setZoomSafe(1)}>{Math.round(zoom * 100)}%</button><button type="button" onClick={() => bumpZoom(.1)} disabled={zoom >= maxZoom - .01}>+</button></div>
            <button type="button" className={infoOpen ? 'active' : ''} onClick={() => setInfoOpen((value) => !value)}>ⓘ</button>
            {parentId ? <button type="button" onClick={goParent} disabled={busy || editMode}>← Inviter</button> : null}
            {pageCount > 1 ? <div className="pager"><button type="button" onClick={() => changePage('left')} disabled={busy || editMode}>‹</button><span>{safePage + 1}/{pageCount}</span><button type="button" onClick={() => changePage('right')} disabled={busy || editMode}>›</button></div> : null}
          </div>
        </div>

        <div ref={stageRef} className={`stage ${editMode ? 'editMode' : ''} phase-${phase} ${pageMotion ? `page-${pageMotion}` : ''}`} onWheel={onWheelZoom} onPointerDown={finishEditFromBackground}>
          {infoOpen ? <aside className="infoCard"><div><b>{shortId(center.id)}</b><button type="button" onClick={() => setInfoOpen(false)}>×</button></div><code>{fakeAddress(center.id)}</code><dl><div><dt>Direct</dt><dd>{childCount}</dd></div><div><dt>Network</dt><dd>{totalBelow}</dd></div><div><dt>Completed</dt><dd>{completed}</dd></div><div><dt>Available</dt><dd>{slotCount}</dd></div></dl><small>QA: custom positions are stored as relative coordinates.</small></aside> : null}

          <div className={`scene ${zoomClass}`} style={{ '--sceneScale': zoom } as CSSProperties}>
            <div className="waterGlow" />
            {parentId ? <button type="button" className="parentNode" onClick={goParent} disabled={busy || editMode}><span className="miniCircle">●</span><b>{shortId(parentId)}</b><small>Invited by</small></button> : null}

            <svg className="edges" viewBox="-360 -285 720 620" aria-hidden="true">
              <defs>
                <linearGradient id="base31" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="rgba(231,204,126,.145)"/><stop offset="1" stopColor="rgba(231,204,126,.04)"/></linearGradient>
                <filter id="blur31" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
                {slotItems.map((slot, index) => <radialGradient key={`gradient-${slot.id}`} id={`gateGlow31-${index}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={compact ? 50 : 70}><stop offset="0" stopColor="rgba(255,207,78,.84)"/><stop offset=".38" stopColor="rgba(244,183,40,.27)"/><stop offset="1" stopColor="rgba(244,183,40,0)"/><animate attributeName="cx" values={`0;${slot.x * .5};${slot.x}`} dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/><animate attributeName="cy" values={`0;${slot.y * .5};${slot.y}`} dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/></radialGradient>)}
              </defs>
              {ringItems.map((item) => {
                const key = layoutKey(item.kind, item.id);
                return <path key={`${item.kind}-${item.id}-base`} d={pathFor(item, lineStyle)} className={`spoke ${item.kind === 'slot' ? 'slotSpoke' : ''} ${draggingKey ? (draggingKey === key ? 'dragActive' : 'dragDim') : ''}`}/>;
              })}
              {slotItems.map((slot, index) => <path key={`${slot.id}-glow`} d={pathFor(slot, lineStyle)} className={`gateGlowPath ${draggingKey && draggingKey !== layoutKey('slot', slot.id) ? 'dragDim' : ''}`} stroke={`url(#gateGlow31-${index})`} filter="url(#blur31)"><animate attributeName="opacity" values="0;0;.82;.48;0;0" keyTimes="0;.08;.18;.42;.56;1" dur="8s" begin={`${index * 4}s`} repeatCount="indefinite"/></path>)}
            </svg>

            <div className="centerWrap"><div className="centerFloat"><span className="centerCircle">●</span><b>{shortId(center.id)}</b><small>{childCount} direct · {totalBelow} network</small></div></div>

            <div className="ringLayer">
              {personItems.map((item, index) => {
                const child = graph.get(item.id);
                const childNetwork = descendants(graph, item.id);
                const hash = stableHash(item.id);
                const key = layoutKey('person', item.id);
                const style = { '--x': `${item.x}px`, '--y': `${item.y}px`, '--delay': `${index * 34}ms`, '--floatDur': `${5.4 + (hash % 25) / 10}s`, '--floatDelay': `${-((hash >>> 4) % 30) / 10}s` } as CSSProperties;
                return <button key={item.id} type="button" className={`ringNode person ${newArrival === item.id ? 'newArrival' : ''} ${draggingKey === key ? 'dragging' : ''} ${pressingKey === key ? 'pressing' : ''}`} style={style} onClick={() => { if (!consumeSuppressedClick(key)) enterNode(item); }} onPointerDown={(event) => beginPointer(event, item)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} disabled={busy}><span className="floatInner"><span className="ringCircle">●</span><b>{shortId(item.id)}</b><small>{child?.children.length ?? 0} direct · {childNetwork} net</small></span></button>;
              })}
              {slotItems.map((item, index) => {
                const active = gateDemo?.centerId === center.id && gateDemo.slotId === item.id ? gateDemo.phase : null;
                const key = layoutKey('slot', item.id);
                const style = { '--x': `${item.x}px`, '--y': `${item.y}px`, '--gateDelay': `${index * 4}s`, '--floatDur': `${7 + index * .7}s`, '--floatDelay': `${-1.7 - index * .9}s` } as CSSProperties;
                return <button key={item.id} type="button" className={`ringNode slot ${active ?? ''} ${draggingKey === key ? 'dragging' : ''} ${pressingKey === key ? 'pressing' : ''}`} style={style} onClick={() => { if (!consumeSuppressedClick(key)) simulateGate(item.id); }} onPointerDown={(event) => beginPointer(event, item)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelPointer} onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} disabled={busy && !active}><span className="floatInner"><span className="slotCircle">{active === 'joining' ? '…' : active === 'complete' ? '✓' : '+'}</span><b>{active === 'joining' ? 'Joining' : active === 'complete' ? 'Completed' : 'Available'}</b></span></button>;
              })}
            </div>

            {travel ? <div className={`traveler ${travel.mode}`} style={{ '--tx': `${travel.x}px`, '--ty': `${travel.y}px` } as CSSProperties}><span className="travelCircle">●</span><b>{shortId(travel.id)}</b></div> : null}
            {!childCount ? <div className="emptyHint"><span>No completed direct yet</span><small>Available is ready for the first invitation.</small></div> : null}
          </div>

          {editMode ? <div className="editHint">Drag nodes · tap background to finish</div> : <div className="zoomHint">hold a node to edit · wheel / − + · {Math.round(zoom * 100)}%</div>}
          {arrivalNotice ? <div className="arrivalNotice">✓ {arrivalNotice}</div> : null}
          {editNotice ? <div className="editNotice">✦ {editNotice}</div> : null}
          {debug ? <div className="debugPanel"><span>People/page {peoplePerPage}</span><span>Available {slotCount}</span><span>Direct {childCount}</span><span>Pages {pageCount}</span><span>Zoom {Math.round(zoom * 100)}%</span><span>{editMode ? 'EDIT' : 'VIEW'}</span><span>Saved {Object.keys(savedPositions).length}</span><span>{pressingKey ? 'HOLDING' : draggingKey ? 'DRAGGING' : 'IDLE'}</span></div> : null}
        </div>
      </section>

      <section className="rules">
        <span><b>Organic stable</b>기존 간격은 유지하면서 위아래 위치 차이를 키워 좌우 대칭 느낌을 완화</span>
        <span><b>Hold + tap out</b>노드를 길게 눌러 편집 · 빈 배경을 누르면 바로 편집 종료</span>
        <span><b>Semantic zoom</b>축소하면 읽기 어려운 direct / net 정보부터 부드럽게 정리</span>
        <span><b>Lines follow</b>사람과 Available을 옮기면 선과 Available 빛이 실시간으로 따라감</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}
        .labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:min(calc(100vw - 20px),920px);margin-left:auto;margin-right:auto;box-sizing:border-box}
        button{font:inherit}.labHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}
        .headerActions,.lineSwitch,.navActions,.pager,.zoomControls{display:flex;align-items:center;gap:5px}.headerActions button,.lineSwitch button,.navActions>button,.pager button,.zoomControls button{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#0e0e0c;color:#918a7e;font-size:.48rem}.headerActions button.active,.lineSwitch button.active,.navActions>button.active{border-color:rgba(244,183,40,.32);background:rgba(244,183,40,.08);color:#ddb958}.navActions>.editButton.active{border-color:rgba(244,183,40,.5);color:#e5be55;background:rgba(244,183,40,.1)}.navActions>.resetButton{color:#8b7b5d}button:disabled{cursor:default;opacity:.45}.zoomControls{padding:2px 3px;border:1px solid rgba(255,255,255,.05);border-radius:9px}.zoomControls button{height:24px;padding:0 7px}.zoomControls .zoomValue{min-width:42px;color:#b39b5e}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:78px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.41rem;color:#6e685f}
        .controlBar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 2px 9px}.crumbs{display:flex;gap:4px;align-items:center;overflow-x:auto;white-space:nowrap;scrollbar-width:none}.crumbs::-webkit-scrollbar{display:none}.crumbs span{display:flex;gap:4px;align-items:center}.crumbs i{font-style:normal;color:#5b554d;font-size:.44rem}.crumbs button{border:0;background:transparent;color:#8d8578;font-size:.46rem;padding:3px 1px}.crumbs button.current{color:#c4a654}
        .networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.networkTop{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.05)}.identity{display:flex;flex-wrap:wrap;align-items:center;gap:5px 9px}.identity b{font-size:.56rem;letter-spacing:.04em;color:#c6a858}.identity span{font-size:.42rem;color:#777065}.pager{padding:2px 3px;border:1px solid rgba(255,255,255,.05);border-radius:9px}.pager span{min-width:28px;text-align:center;font-size:.43rem;color:#7d756a}
        .stage{height:min(72svh,680px);min-height:540px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 53%,rgba(244,183,40,.032),transparent 34%),#080807;overscroll-behavior:contain}.scene{--sceneScale:1;position:absolute;inset:0;transform:scale(var(--sceneScale));transform-origin:50% 50%;transition:transform 180ms cubic-bezier(.2,.78,.2,1)}.waterGlow{position:absolute;inset:18% 12% 10%;background:radial-gradient(ellipse at 50% 62%,rgba(219,183,79,.025),transparent 58%);filter:blur(16px);pointer-events:none}
        .edges{position:absolute;left:50%;top:50%;width:720px;height:620px;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;z-index:2;transition:opacity 180ms ease}.spoke{fill:none;stroke:url(#base31);stroke-width:1;stroke-linecap:round;transition:opacity 120ms ease,stroke 120ms ease}.slotSpoke{stroke:rgba(213,177,73,.18)}.spoke.dragActive{stroke:rgba(242,196,68,.58);stroke-width:1.35}.spoke.dragDim,.gateGlowPath.dragDim{opacity:.16!important}.gateGlowPath{fill:none;stroke-width:8;stroke-linecap:round;opacity:0}
        .centerWrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8}.centerFloat{width:132px;display:grid;justify-items:center;gap:5px;animation:centerFloat31 7.6s ease-in-out infinite}.centerCircle{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:#0d0d0b;border:1px solid rgba(244,183,40,.66);color:#e5b943;font-size:.72rem;box-shadow:0 0 38px rgba(244,183,40,.045)}.centerFloat b{font-size:.62rem}.centerFloat small{font-size:.42rem;color:#756e63;white-space:nowrap}
        .ringLayer{position:absolute;left:50%;top:50%;z-index:6;transition:opacity 180ms ease}.ringNode{--x:0px;--y:0px;position:absolute;left:0;top:0;width:110px;transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%));display:grid;justify-items:center;color:#d8d2c5;border:0;background:transparent;animation:bloom31 430ms cubic-bezier(.18,.8,.24,1) both;animation-delay:var(--delay,0ms);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}.floatInner{display:grid;justify-items:center;gap:4px;animation:float31 var(--floatDur,6.4s) ease-in-out infinite;animation-delay:var(--floatDelay,-1s);pointer-events:none}.ringCircle,.slotCircle,.miniCircle,.travelCircle{border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.ringCircle{width:52px;height:52px;border:1px solid rgba(210,174,65,.37);color:#d9b34a;font-size:.62rem;transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease}.ringNode b{font-size:.48rem;white-space:nowrap}.ringNode small{font-size:.39rem;color:#6d665c;white-space:nowrap}.person:hover .ringCircle,.person:focus-visible .ringCircle{border-color:rgba(244,183,40,.72);box-shadow:0 0 24px rgba(244,183,40,.08);transform:scale(1.04)}
        .ringNode.pressing .floatInner{animation:none}.ringNode.pressing .ringCircle,.ringNode.pressing .slotCircle{animation:hold31 ${LONG_PRESS_MS}ms cubic-bezier(.2,.75,.2,1) forwards}.editMode .ringNode{cursor:grab;touch-action:none}.editMode .ringNode.dragging{cursor:grabbing;z-index:22}.editMode .ringNode.dragging .floatInner{animation:none}.editMode .ringNode.dragging .ringCircle,.editMode .ringNode.dragging .slotCircle{border-color:rgba(244,183,40,.9);box-shadow:0 0 26px rgba(244,183,40,.14);transform:scale(1.06)}
        .slot{opacity:.82}.slotCircle{width:46px;height:46px;border:1px dashed rgba(226,181,62,.5);color:#c79f36;font-size:.9rem;animation:gatePulse31 8s ease-in-out infinite;animation-delay:var(--gateDelay,0s)}.slot b{color:#a3936e}.slot.joining .slotCircle{border-style:solid;animation:joining31 .9s ease-in-out infinite}.slot.complete .slotCircle{border-style:solid;border-color:rgba(138,205,123,.68);color:#8fca80;box-shadow:0 0 22px rgba(115,189,101,.1)}.newArrival .ringCircle{animation:newArrival31 650ms cubic-bezier(.16,.8,.2,1) both}
        .parentNode{position:absolute;left:50%;top:calc(50% - 224px);transform:translateX(-50%);display:grid;justify-items:center;gap:2px;color:#8c8478;z-index:7;border:0;background:transparent}.parentNode:after{content:'';position:absolute;top:48px;width:1px;height:60px;background:linear-gradient(rgba(217,181,78,.13),rgba(217,181,78,.01))}.miniCircle{width:32px;height:32px;border:1px solid rgba(220,188,92,.25);color:#a78a3e;font-size:.4rem}.parentNode b{font-size:.43rem}.parentNode small{font-size:.36rem;color:#5f5951}
        .traveler{--tx:0px;--ty:0px;position:absolute;left:50%;top:50%;width:110px;display:grid;justify-items:center;gap:4px;z-index:30;color:#e8dfcb;pointer-events:none}.travelCircle{width:56px;height:56px;border:1px solid rgba(244,183,40,.72);color:#e5b943;box-shadow:0 0 34px rgba(244,183,40,.09)}.traveler b{font-size:.49rem}.traveler.in{animation:travelIn31 500ms cubic-bezier(.18,.78,.18,1) both}.traveler.out{animation:travelOut31 500ms cubic-bezier(.18,.78,.18,1) both}
        .phase-depart .ringLayer,.phase-depart .edges{opacity:.12}.phase-depart .centerWrap{animation:centerYield31 500ms cubic-bezier(.18,.78,.18,1) both}.phase-arrive .centerWrap{animation:centerArrive31 330ms cubic-bezier(.18,.78,.18,1) both}.phase-arrive .ringNode{animation:bloom31 430ms cubic-bezier(.18,.8,.24,1) both;animation-delay:var(--delay,0ms)}.page-left .ringLayer,.page-right .ringLayer{animation:pageFade31 300ms ease both}
        .emptyHint{position:absolute;left:50%;top:calc(50% + 118px);transform:translateX(-50%);display:grid;justify-items:center;gap:3px;color:#716a60;z-index:3}.emptyHint span{font-size:.47rem}.emptyHint small{font-size:.39rem;color:#58534c}
        .person small,.centerFloat small,.parentNode small,.emptyHint small{max-height:18px;overflow:hidden;opacity:1;transform:translateY(0);transition:opacity 150ms ease,transform 150ms ease,max-height 180ms ease}.scene.zoom-mid .person small,.scene.zoom-mid .centerFloat small,.scene.zoom-mid .parentNode small{opacity:0;max-height:0;transform:translateY(-2px)}.scene.zoom-far .person small,.scene.zoom-far .centerFloat small,.scene.zoom-far .parentNode small,.scene.zoom-far .emptyHint small{opacity:0;max-height:0;transform:translateY(-2px)}.scene.zoom-far .spoke{opacity:.72}.scene.zoom-far .centerCircle{box-shadow:none}.scene.zoom-far .waterGlow{opacity:.55}
        .infoCard{position:absolute;right:10px;top:10px;width:220px;padding:10px;border:1px solid rgba(244,183,40,.14);border-radius:12px;background:rgba(12,12,10,.94);backdrop-filter:blur(12px);z-index:40;box-shadow:0 16px 48px rgba(0,0,0,.28)}.infoCard>div:first-child{display:flex;align-items:center;justify-content:space-between}.infoCard b{font-size:.55rem;color:#c7a957}.infoCard button{border:0;background:transparent;color:#777065;font-size:.8rem}.infoCard code{display:block;margin-top:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.38rem;color:#696258}.infoCard dl{margin:9px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.infoCard dl div{padding:6px;border:1px solid rgba(255,255,255,.04);border-radius:8px}.infoCard dt{font-size:.36rem;color:#5e584f}.infoCard dd{margin:2px 0 0;font-size:.48rem;color:#aaa294}.infoCard>small{display:block;margin-top:8px;font-size:.35rem;color:#58534b}
        .zoomHint,.editHint{position:absolute;right:10px;bottom:10px;padding:5px 7px;border:1px solid rgba(255,255,255,.04);border-radius:8px;background:rgba(12,12,10,.66);font-size:.38rem;color:#5f594f;z-index:42;pointer-events:none}.editHint{color:#a08b58;border-color:rgba(244,183,40,.11)}.arrivalNotice,.editNotice{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);padding:7px 10px;border-radius:10px;background:rgba(10,16,10,.92);font-size:.43rem;z-index:44;animation:notice31 1600ms ease both;white-space:nowrap}.arrivalNotice{border:1px solid rgba(138,205,123,.2);color:#91c886}.editNotice{border:1px solid rgba(244,183,40,.22);color:#d5b65e}.debugPanel{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:70%;z-index:45}.debugPanel span{padding:5px 7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(12,12,10,.84);font-size:.4rem;color:#777067}
        .rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding-top:9px}.rules span{display:grid;gap:3px;padding:9px 10px;border:1px solid rgba(255,255,255,.05);border-radius:11px;background:#0b0b09;color:#70695f;font-size:.45rem;line-height:1.5}.rules b{color:#a58c4c;font-size:.48rem}
        @keyframes float31{0%,100%{transform:translate3d(0,-1px,0) rotate(-.22deg)}35%{transform:translate3d(1.2px,2.4px,0) rotate(.26deg)}70%{transform:translate3d(-1px,.5px,0) rotate(-.1deg)}}
        @keyframes centerFloat31{0%,100%{transform:translateY(0)}45%{transform:translateY(1.7px)}75%{transform:translateY(-1px)}}
        @keyframes bloom31{from{opacity:0;filter:blur(2px);transform:translate(calc(var(--x) - 50%),calc(var(--y) - 46%)) scale(.94)}to{opacity:1;filter:blur(0);transform:translate(calc(var(--x) - 50%),calc(var(--y) - 50%)) scale(1)}}
        @keyframes hold31{0%{transform:scale(1);box-shadow:0 0 0 rgba(244,183,40,0)}65%{transform:scale(1.025);box-shadow:0 0 13px rgba(244,183,40,.08)}100%{transform:scale(1.07);border-color:rgba(244,183,40,.88);box-shadow:0 0 28px rgba(244,183,40,.17)}}
        @keyframes gatePulse31{0%,68%,100%{box-shadow:0 0 0 rgba(244,183,40,0);border-color:rgba(226,181,62,.42)}78%{box-shadow:0 0 22px rgba(244,183,40,.1);border-color:rgba(238,191,64,.68)}}
        @keyframes joining31{0%,100%{transform:scale(1);box-shadow:0 0 10px rgba(244,183,40,.03)}50%{transform:scale(1.06);box-shadow:0 0 24px rgba(244,183,40,.13)}}
        @keyframes newArrival31{0%{opacity:.2;transform:translateY(10px) scale(.72);box-shadow:0 0 0 rgba(244,183,40,0)}60%{opacity:1;transform:translateY(-2px) scale(1.08);box-shadow:0 0 34px rgba(244,183,40,.15)}100%{opacity:1;transform:translateY(0) scale(1);box-shadow:0 0 12px rgba(244,183,40,.04)}}
        @keyframes travelIn31{0%{transform:translate(calc(var(--tx) - 50%),calc(var(--ty) - 50%)) scale(1)}38%{transform:translate(calc(var(--tx)*.62 - 50%),calc(var(--ty)*.62 - 58%)) scale(1.08)}100%{transform:translate(-50%,-50%) scale(1.05)}}
        @keyframes travelOut31{0%{transform:translate(-50%,-50%) scale(1.05)}62%{transform:translate(calc(var(--tx)*.65 - 50%),calc(var(--ty)*.65 - 56%)) scale(1.04)}100%{transform:translate(calc(var(--tx) - 50%),calc(var(--ty) - 50%)) scale(1)}}
        @keyframes centerYield31{to{opacity:.12;transform:translate(-50%,-82%) scale(.72)}}@keyframes centerArrive31{from{opacity:.2;transform:translate(-50%,-43%) scale(.92)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes pageFade31{0%{opacity:.22;filter:blur(1px)}100%{opacity:1;filter:blur(0)}}@keyframes notice31{0%{opacity:0;transform:translate(-50%,7px)}12%,78%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-4px)}}
        @media(max-width:640px){.page{padding-top:8px}.labHeader,.scenarioBar,.controlBar,.networkShell,.rules{width:min(calc(100vw - 12px),920px)}.labHeader{padding:8px 9px}.labHeader span{display:none}.networkTop{align-items:flex-start;flex-direction:column;padding:8px 9px}.navActions{width:100%;overflow-x:auto;scrollbar-width:none}.navActions::-webkit-scrollbar{display:none}.stage{height:min(70svh,610px);min-height:510px}.edges{width:520px;height:520px}.centerCircle{width:66px;height:66px}.centerFloat{width:116px}.ringNode{width:94px}.ringCircle{width:47px;height:47px}.slotCircle{width:43px;height:43px}.parentNode{top:calc(50% - 194px)}.rules{grid-template-columns:1fr 1fr}.infoCard{left:8px;right:8px;top:auto;bottom:8px;width:auto}.editHint{left:10px;right:auto;max-width:72%}.zoomHint{max-width:72%}}
        @media(prefers-reduced-motion:reduce){.centerFloat,.floatInner,.slotCircle,.traveler,.newArrival .ringCircle,.phase-depart .centerWrap,.phase-arrive .centerWrap,.page-left .ringLayer,.page-right .ringLayer,.arrivalNotice,.editNotice,.ringNode.pressing .ringCircle,.ringNode.pressing .slotCircle{animation:none!important}.scene{transition:none}.gateGlowPath{display:none}}
      `}</style>
    </main>
  );
}
