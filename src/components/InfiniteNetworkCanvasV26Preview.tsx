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

import { Brand } from './Brand';
import { AppBottomNavigation } from './AppBottomNavigation';
import type { SupportedLocale } from '@/lib/i18n/locales';

type Scenario = 'balanced' | 'wide' | 'deep';
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';

type Node = {
  id: string;
  wallet: string;
  status: Status;
  joinedThisRound: boolean;
  children: Node[];
};

type Stats = {
  network: number;
  direct: number;
  qualified: number;
  growth: number;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

type PersonVisual = {
  kind: 'person';
  key: string;
  id: string;
  x: number;
  y: number;
  parentId: string | null;
  parentX: number;
  parentY: number;
  depth: number;
  stagger: number;
};

type ClusterVisual = {
  kind: 'cluster';
  key: string;
  parentId: string;
  x: number;
  y: number;
  parentX: number;
  parentY: number;
  remaining: number;
  depth: number;
  stagger: number;
};

type Visual = PersonVisual | ClusterVisual;

type Edge = {
  key: string;
  fromId: string;
  toKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fresh: boolean;
  stagger: number;
};

type FocusTone = 'focus' | 'near' | 'dim' | 'normal';

const ROOT_ID = 'you';
const PLANE_W = 4600;
const PLANE_H = 3000;
const CENTER_X = PLANE_W / 2;
const LEVEL_GAP = 144;
const ITEM_GAP = 24;
const NODE_WIDTH = 132;
const CLUSTER_WIDTH = 108;
const MIN_SCALE = 0.74;
const MAX_SCALE = 1.5;
const BLOOM_DELAY_MS = 150;
const FRESH_MS = 1180;

function wallet(index: number) {
  const value = index.toString(16).padStart(8, '0');
  return `0x${value.slice(0, 4)}…${value.slice(-4)}`;
}

function statusFor(index: number): Status {
  if (index % 6 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'REWARDED';
  return 'QUALIFIED';
}

function makeNode(index: number, id: string): Node {
  return {
    id,
    wallet: wallet(index),
    status: statusFor(index),
    joinedThisRound: index % 4 === 0 || index % 7 === 0,
    children: [],
  };
}

function buildBranch(seed: number, id: string, direct: number, depth: number): Node {
  let cursor = seed;
  const root = makeNode(cursor++, id);
  if (depth <= 0) return root;

  root.children = Array.from({ length: direct }, (_, i) => {
    const child = makeNode(cursor++, `${id}-${i + 1}`);
    if (depth > 1 && i < Math.min(4, direct)) {
      const nextDirect = Math.max(2, Math.min(5, direct - i + 1));
      child.children = Array.from({ length: nextDirect }, (_, j) => {
        const grand = makeNode(cursor++, `${child.id}-${j + 1}`);
        if (depth > 2 && j < 3) {
          grand.children = Array.from({ length: 2 + ((j + i) % 2) }, (_, k) =>
            makeNode(cursor++, `${grand.id}-${k + 1}`),
          );
        }
        return grand;
      });
    }
    return child;
  });

  return root;
}

function buildBalanced(): Node {
  return {
    id: ROOT_ID,
    wallet: 'YOU',
    status: 'REWARDED',
    joinedThisRound: false,
    children: [
      buildBranch(20, 'a', 6, 3),
      buildBranch(80, 'b', 4, 3),
      buildBranch(140, 'c', 7, 3),
      buildBranch(210, 'd', 3, 2),
      buildBranch(260, 'e', 5, 2),
    ],
  };
}

function buildWide(): Node {
  let cursor = 400;
  const root: Node = {
    id: ROOT_ID,
    wallet: 'YOU',
    status: 'REWARDED',
    joinedThisRound: false,
    children: [],
  };
  root.children = Array.from({ length: 100 }, (_, i) => {
    const child = makeNode(cursor++, `wide-${i + 1}`);
    if (i < 20) {
      child.children = Array.from({ length: 2 + (i % 4) }, (_, j) =>
        makeNode(cursor++, `${child.id}-${j + 1}`),
      );
    }
    return child;
  });
  return root;
}

function buildDeep(): Node {
  const root: Node = {
    id: ROOT_ID,
    wallet: 'YOU',
    status: 'REWARDED',
    joinedThisRound: false,
    children: [],
  };
  let current = root;
  for (let i = 1; i <= 50; i += 1) {
    const child = makeNode(800 + i, `deep-${i}`);
    if (i % 7 === 0) child.children.push(makeNode(1200 + i, `side-${i}`));
    current.children.push(child);
    current = child;
  }
  return root;
}

function scenarioRoot(scenario: Scenario) {
  if (scenario === 'wide') return buildWide();
  if (scenario === 'deep') return buildDeep();
  return buildBalanced();
}

function flatten(root: Node) {
  const result: Node[] = [];
  const visit = (node: Node) => {
    result.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

function computeStats(root: Node) {
  const map = new Map<string, Stats>();
  const visit = (node: Node): Stats => {
    let network = 0;
    let qualified = 0;
    let growth = 0;
    node.children.forEach((child) => {
      const childStats = visit(child);
      network += 1 + childStats.network;
      qualified += (child.status === 'IN_PROGRESS' ? 0 : 1) + childStats.qualified;
      growth += (child.joinedThisRound ? 1 : 0) + childStats.growth;
    });
    const value = { network, direct: node.children.length, qualified, growth };
    map.set(node.id, value);
    return value;
  };
  visit(root);
  return map;
}

function buildParentMap(root: Node) {
  const map = new Map<string, string | null>();
  const visit = (node: Node, parent: string | null) => {
    map.set(node.id, parent);
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return map;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pathToRoot(id: string | null, parentMap: Map<string, string | null>) {
  const result = new Set<string>();
  let current = id;
  while (current) {
    result.add(current);
    current = parentMap.get(current) ?? null;
  }
  return result;
}

function isDescendantOf(id: string, ancestor: string | null, parentMap: Map<string, string | null>) {
  if (!ancestor || id === ancestor) return id === ancestor;
  let current = parentMap.get(id) ?? null;
  while (current) {
    if (current === ancestor) return true;
    current = parentMap.get(current) ?? null;
  }
  return false;
}

function descendantIds(id: string, byId: Map<string, Node>) {
  const set = new Set<string>();
  const start = byId.get(id);
  if (!start) return set;
  const visit = (node: Node) => {
    node.children.forEach((child) => {
      set.add(child.id);
      visit(child);
    });
  };
  visit(start);
  return set;
}

function layoutVisible({
  root,
  expanded,
  revealCount,
  freshIds,
  freshParentId,
  isMobile,
}: {
  root: Node;
  expanded: Set<string>;
  revealCount: Map<string, number>;
  freshIds: Set<string>;
  freshParentId: string | null;
  isMobile: boolean;
}) {
  const visuals = new Map<string, Visual>();
  const widthCache = new Map<string, number>();
  const limit = isMobile ? 3 : 5;

  const entriesFor = (node: Node) => {
    if (!expanded.has(node.id) || node.children.length < 1) return [] as Array<Node | 'cluster'>;
    const revealed = revealCount.get(node.id) ?? limit;
    const entries: Array<Node | 'cluster'> = [...node.children.slice(0, revealed)];
    if (revealed < node.children.length) entries.push('cluster');
    return entries;
  };

  const measure = (node: Node): number => {
    const cached = widthCache.get(node.id);
    if (cached) return cached;
    const entries = entriesFor(node);
    if (entries.length === 0) {
      widthCache.set(node.id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const widths = entries.map((entry) => entry === 'cluster' ? CLUSTER_WIDTH : measure(entry));
    const total = widths.reduce((sum, width) => sum + width, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    const width = Math.max(NODE_WIDTH, total);
    widthCache.set(node.id, width);
    return width;
  };

  const place = (
    node: Node,
    x: number,
    y: number,
    parent: { id: string; x: number; y: number } | null,
    depth: number,
    stagger = 0,
  ) => {
    visuals.set(node.id, {
      kind: 'person',
      key: node.id,
      id: node.id,
      x,
      y,
      parentId: parent?.id ?? null,
      parentX: parent?.x ?? x,
      parentY: parent?.y ?? y,
      depth,
      stagger,
    });

    const entries = entriesFor(node);
    if (entries.length === 0) return;
    const widths = entries.map((entry) => entry === 'cluster' ? CLUSTER_WIDTH : measure(entry));
    const total = widths.reduce((sum, width) => sum + width, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    const centerIndex = (entries.length - 1) / 2;
    let cursor = x - total / 2;

    entries.forEach((entry, index) => {
      const width = widths[index];
      const childX = cursor + width / 2;
      const microStagger = index % 2 === 0 ? -4 : 5;
      const childY = y + LEVEL_GAP + microStagger;
      const delay = Math.round(Math.abs(index - centerIndex) * 52);

      if (entry === 'cluster') {
        const revealed = revealCount.get(node.id) ?? limit;
        visuals.set(`cluster:${node.id}`, {
          kind: 'cluster',
          key: `cluster:${node.id}`,
          parentId: node.id,
          x: childX,
          y: childY,
          parentX: x,
          parentY: y,
          remaining: Math.max(0, node.children.length - revealed),
          depth: depth + 1,
          stagger: delay,
        });
      } else {
        place(entry, childX, childY, { id: node.id, x, y }, depth + 1, delay);
      }
      cursor += width + ITEM_GAP;
    });
  };

  place(root, CENTER_X, 92, null, 0);

  const list = Array.from(visuals.values());
  const edges: Edge[] = [];
  list.forEach((visual) => {
    if (visual.kind === 'person' && visual.parentId) {
      edges.push({
        key: `${visual.parentId}->${visual.id}`,
        fromId: visual.parentId,
        toKey: visual.id,
        x1: visual.parentX,
        y1: visual.parentY + 18,
        x2: visual.x,
        y2: visual.y - 18,
        fresh: freshIds.has(visual.id),
        stagger: visual.stagger,
      });
    }
    if (visual.kind === 'cluster') {
      edges.push({
        key: `${visual.parentId}->${visual.key}`,
        fromId: visual.parentId,
        toKey: visual.key,
        x1: visual.parentX,
        y1: visual.parentY + 18,
        x2: visual.x,
        y2: visual.y - 16,
        fresh: freshParentId === visual.parentId,
        stagger: visual.stagger,
      });
    }
  });

  return { visuals: list, edges };
}

export function InfiniteNetworkCanvasV26Preview() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const bloomTimerRef = useRef<number | null>(null);
  const freshTimerRef = useRef<number | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  const [locale] = useState<SupportedLocale>('en');
  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealCount, setRevealCount] = useState<Map<string, number>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [freshParentId, setFreshParentId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 16, scale: 1 });
  const [stageWidth, setStageWidth] = useState(1000);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const parentMap = useMemo(() => buildParentMap(root), [root]);
  const rootStats = stats.get(ROOT_ID)!;
  const isMobile = stageWidth < 640;
  const revealStep = isMobile ? 3 : 5;
  const focusPath = useMemo(() => pathToRoot(selectedId, parentMap), [selectedId, parentMap]);

  const layout = useMemo(
    () => layoutVisible({ root, expanded, revealCount, freshIds, freshParentId, isMobile }),
    [root, expanded, revealCount, freshIds, freshParentId, isMobile],
  );

  const clearFreshSoon = useCallback(() => {
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => {
      setFreshIds(new Set());
      setFreshParentId(null);
    }, FRESH_MS);
  }, []);

  const focusToneFor = useCallback((id: string): FocusTone => {
    if (!selectedId || selectedId === ROOT_ID) return 'normal';
    if (focusPath.has(id)) return 'focus';
    if (isDescendantOf(id, selectedId, parentMap)) return 'focus';

    const selectedParent = parentMap.get(selectedId) ?? null;
    const nodeParent = parentMap.get(id) ?? null;
    if (selectedParent && nodeParent === selectedParent) return 'near';
    return 'dim';
  }, [selectedId, focusPath, parentMap]);

  const scheduleBloom = useCallback((nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node || node.children.length === 0) return;
    if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);

    setSelectedId(nodeId);
    setFreshIds(new Set());
    setFreshParentId(null);

    bloomTimerRef.current = window.setTimeout(() => {
      const revealed = revealCount.get(nodeId) ?? revealStep;
      setExpanded((current) => new Set(current).add(nodeId));
      setFreshParentId(nodeId);
      setFreshIds(new Set(node.children.slice(0, revealed).map((child) => child.id)));
      clearFreshSoon();
    }, BLOOM_DELAY_MS);
  }, [byId, revealCount, revealStep, clearFreshSoon]);

  const collapseBranch = useCallback((nodeId: string) => {
    const descendants = descendantIds(nodeId, byId);
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(nodeId);
      descendants.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedId(nodeId);
    setFreshIds(new Set());
    setFreshParentId(null);
  }, [byId]);

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node) return;
    const isOpen = expanded.has(nodeId);

    if (isOpen && selectedId === nodeId) {
      collapseBranch(nodeId);
      return;
    }

    if (isOpen) {
      setSelectedId(nodeId);
      return;
    }

    if (node.children.length > 0) {
      scheduleBloom(nodeId);
      return;
    }

    setSelectedId(nodeId);
  }, [byId, expanded, selectedId, collapseBranch, scheduleBloom]);

  const replayRootBloom = useCallback(() => {
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
    setExpanded(new Set());
    setRevealCount(new Map());
    setSelectedId(null);
    setFreshIds(new Set());
    setFreshParentId(null);
    setView({ x: 0, y: 16, scale: 1 });
    autoTimerRef.current = window.setTimeout(() => scheduleBloom(ROOT_ID), 760);
  }, [scheduleBloom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageWidth(stage.clientWidth || 1000);
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    replayRootBloom();
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
      if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
    };
  }, [scenario]);

  useEffect(() => () => {
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
  }, []);

  const revealMore = (parentId: string) => {
    const node = byId.get(parentId);
    if (!node) return;
    const current = revealCount.get(parentId) ?? revealStep;
    const nextCount = Math.min(node.children.length, current + revealStep);
    const nextFresh = node.children.slice(current, nextCount).map((child) => child.id);
    setSelectedId(parentId);
    setRevealCount((existing) => {
      const next = new Map(existing);
      next.set(parentId, nextCount);
      return next;
    });
    setFreshParentId(parentId);
    setFreshIds(new Set(nextFresh));
    clearFreshSoon();
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
    stageRef.current?.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      lastPinchRef.current = { center: midpoint(a, b), distance: distance(a, b) };
      lastSingleRef.current = null;
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = lastSingleRef.current;
      if (previous) {
        setView((value) => ({ ...value, x: value.x + current.x - previous.x, y: value.y + current.y - previous.y }));
      }
      lastSingleRef.current = current;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const nextCenter = midpoint(a, b);
      const nextDistance = distance(a, b);
      const previous = lastPinchRef.current;
      if (previous && previous.distance > 0) {
        const ratio = nextDistance / previous.distance;
        setView((value) => ({
          x: value.x + nextCenter.x - previous.center.x,
          y: value.y + nextCenter.y - previous.center.y,
          scale: clamp(value.scale * ratio, MIN_SCALE, MAX_SCALE),
        }));
      }
      lastPinchRef.current = { center: nextCenter, distance: nextDistance };
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = Array.from(pointersRef.current.values())[0];
      lastPinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      lastSingleRef.current = null;
      lastPinchRef.current = null;
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setView((value) => ({ ...value, scale: clamp(value.scale * factor, MIN_SCALE, MAX_SCALE) }));
  };

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedStats = selected ? stats.get(selected.id) ?? null : null;

  return (
    <main className="screen">
      <header className="topBar">
        <Brand />
        <div className="topActions">
          <button type="button" className="roundChip">Round 115</button>
          <button type="button" className="bellButton" aria-label="Notifications">
            <BellIcon />
            <span className="notificationDot" />
          </button>
          <button type="button" className="accountChip">
            <span className="accountDot" />
            0x7A31···3F91
          </button>
        </div>
      </header>

      <section className="networkSurface">
        <div className="networkHeader">
          <div>
            <span className="eyebrow">NETWORK</span>
            <strong>My Network</strong>
          </div>
          <div className="networkSummary">
            <strong>{rootStats.network}</strong><span>Network</span>
            <i />
            <strong className="growth">+{rootStats.growth}</strong><span>Round</span>
          </div>
        </div>

        <div
          ref={stageRef}
          className="networkStage"
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className="stageGlow" aria-hidden="true" />

          <div className="previewCorner" data-network-interactive="true">
            <button
              type="button"
              className="previewToggle"
              aria-label="Preview controls"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setPreviewMenuOpen((open) => !open)}
            >•••</button>
            {previewMenuOpen ? (
              <div className="previewMenu">
                <small>PREVIEW ONLY</small>
                <button type="button" onClick={replayRootBloom}>↻ Replay bloom</button>
                <button type="button" onClick={() => setSelectedId(null)}>Clear focus</button>
                <button type="button" className={scenario === 'balanced' ? 'active' : ''} onClick={() => setScenario('balanced')}>Balanced</button>
                <button type="button" className={scenario === 'wide' ? 'active' : ''} onClick={() => setScenario('wide')}>Direct 100</button>
                <button type="button" className={scenario === 'deep' ? 'active' : ''} onClick={() => setScenario('deep')}>Deep 50</button>
              </div>
            ) : null}
          </div>

          <div
            className="world"
            style={{
              width: `${PLANE_W}px`,
              height: `${PLANE_H}px`,
              marginLeft: `${-PLANE_W / 2}px`,
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            }}
          >
            <svg className="edges" width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} aria-hidden="true">
              {layout.edges.map((edge) => {
                const targetId = edge.toKey.startsWith('cluster:') ? edge.fromId : edge.toKey;
                const tone = focusToneFor(targetId);
                return (
                  <line
                    key={edge.key}
                    className={`edge ${tone} ${edge.fresh ? 'freshEdge' : ''}`}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    pathLength={1}
                    style={{ '--edge-delay': `${edge.stagger}ms` } as CSSProperties}
                  />
                );
              })}
            </svg>

            {layout.visuals.map((visual) => {
              if (visual.kind === 'cluster') {
                const fresh = freshParentId === visual.parentId;
                const tone = focusToneFor(visual.parentId);
                const clusterStyle = {
                  left: `${visual.x}px`,
                  top: `${visual.y}px`,
                  '--from-x': `${visual.parentX - visual.x}px`,
                  '--from-y': `${visual.parentY - visual.y}px`,
                  '--bloom-delay': `${visual.stagger}ms`,
                } as CSSProperties;
                return (
                  <button
                    key={visual.key}
                    type="button"
                    data-network-interactive="true"
                    className={`clusterNode ${fresh ? 'freshNode' : ''}`}
                    style={clusterStyle}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => revealMore(visual.parentId)}
                  >
                    <span className={`depthLayer ${tone}`}>
                      <b>+{visual.remaining}</b>
                      <small>more direct</small>
                    </span>
                  </button>
                );
              }

              const node = byId.get(visual.id)!;
              const nodeStats = stats.get(node.id)!;
              const hasChildren = node.children.length > 0;
              const isRoot = node.id === ROOT_ID;
              const isSelected = selectedId === node.id;
              const isExpanded = expanded.has(node.id);
              const fresh = freshIds.has(node.id);
              const tone = focusToneFor(node.id);
              const nodeStyle = {
                left: `${visual.x}px`,
                top: `${visual.y}px`,
                '--from-x': `${visual.parentX - visual.x}px`,
                '--from-y': `${visual.parentY - visual.y}px`,
                '--bloom-delay': `${visual.stagger}ms`,
              } as CSSProperties;

              return (
                <button
                  key={visual.key}
                  type="button"
                  data-network-interactive="true"
                  data-node-id={node.id}
                  className={`personNode ${isRoot ? 'rootNode' : ''} ${isSelected ? 'selectedNode' : ''} ${fresh ? 'freshNode' : ''}`}
                  style={nodeStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => handleNodeClick(node.id)}
                  aria-label={`${node.wallet}, ${nodeStats.network} network`}
                >
                  <span className={`depthLayer ${tone}`}>
                    <span className="nodeShell">
                      <span className="halo" />
                      <span className="dot" />
                      {node.joinedThisRound ? <span className="roundPulse" /> : null}
                    </span>
                    <strong>{isRoot ? 'YOU' : node.wallet}</strong>
                    {isRoot ? null : <small>{1 + nodeStats.network} branch</small>}
                    {hasChildren ? <span className={`continuation ${isExpanded ? 'open' : ''}`}>⌄</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && selectedStats && selected.id !== ROOT_ID ? (
            <div className="inspector" data-network-interactive="true">
              <div>
                <strong>{selected.wallet}</strong>
                <small>{selected.status === 'IN_PROGRESS' ? 'In progress' : selected.status === 'QUALIFIED' ? 'Qualified' : 'Rewarded'}</small>
              </div>
              <div className="inspectorMetrics">
                <span><b>{selectedStats.network}</b> Network</span>
                <span><b>{selectedStats.direct}</b> Direct</span>
                <span><b>{selectedStats.qualified}</b> Qualified</span>
              </div>
            </div>
          ) : null}

          <div className="stageControls" data-network-interactive="true">
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView({ x: 0, y: 16, scale: 1 })}>◎</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + 0.1, MIN_SCALE, MAX_SCALE) }))}>+</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - 0.1, MIN_SCALE, MAX_SCALE) }))}>−</button>
          </div>
        </div>
      </section>

      <AppBottomNavigation activeTab="guide" locale={locale} onChange={() => undefined} />

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 118px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 8px; display:flex; align-items:center; justify-content:space-between; gap:14px; }
        .topActions { min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
        .roundChip,.accountChip,.bellButton { min-height:38px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:#141413; color:#fff; font:inherit; cursor:pointer; }
        .roundChip { padding:0 11px; color:#9d8b62; font-size:.62rem; font-weight:850; }
        .accountChip { padding:0 12px; display:inline-flex; align-items:center; gap:7px; font-size:.68rem; font-weight:850; }
        .accountDot { width:8px; height:8px; border-radius:50%; background:#f4b728; box-shadow:0 0 12px rgba(244,183,40,.55); }
        .bellButton { position:relative; width:38px; padding:0; display:grid; place-items:center; }
        .bellButton :global(svg) { width:17px; height:17px; }
        .notificationDot { position:absolute; top:7px; right:7px; width:5px; height:5px; border-radius:50%; background:#f4b728; box-shadow:0 0 8px rgba(244,183,40,.65); }

        .networkSurface { width:min(calc(100vw - 28px),1180px); margin:0 auto; }
        .networkHeader { width:min(100%,1120px); min-height:52px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:0 12px; box-sizing:border-box; }
        .networkHeader > div:first-child { display:grid; gap:3px; }
        .eyebrow { color:#8e8062; font-size:.54rem; font-weight:950; letter-spacing:.14em; }
        .networkHeader strong { color:#f8f4ea; font-size:.9rem; }
        .networkSummary { display:flex; align-items:baseline; gap:5px; color:#77736c; font-size:.56rem; white-space:nowrap; }
        .networkSummary strong { color:#ddd7ca; font-size:.71rem; }
        .networkSummary .growth { color:#f4b728; }
        .networkSummary i { width:1px; height:10px; margin:0 4px; background:rgba(255,255,255,.1); }

        .networkStage { position:relative; height:clamp(540px,calc(100svh - 186px),760px); overflow:hidden; touch-action:none; cursor:grab; user-select:none; border-radius:30px; background:radial-gradient(circle at 50% 28%,rgba(244,183,40,.052),transparent 27%); }
        .networkStage:active { cursor:grabbing; }
        .stageGlow { position:absolute; inset:0; pointer-events:none; background:linear-gradient(to bottom,rgba(255,255,255,.011),transparent 18%,transparent 80%,rgba(0,0,0,.12)); }
        .world { position:absolute; top:0; left:50%; transform-origin:50% 0; will-change:transform; }
        .edges { position:absolute; inset:0; overflow:visible; pointer-events:none; }
        .edge { vector-effect:non-scaling-stroke; stroke:rgba(220,215,206,.075); stroke-width:.9; stroke-linecap:round; opacity:.34; transition:opacity 260ms ease,stroke 260ms ease; }
        .edge.focus { opacity:.9; stroke:rgba(226,205,156,.22); }
        .edge.near { opacity:.19; }
        .edge.dim { opacity:.045; }
        .edge.freshEdge { opacity:1; stroke:rgba(244,183,40,.58); stroke-dasharray:1; stroke-dashoffset:1; animation:drawEdge 700ms cubic-bezier(.16,1,.3,1) var(--edge-delay) forwards,settleEdge 950ms ease calc(var(--edge-delay) + 420ms) forwards; }

        .personNode,.clusterNode { position:absolute; z-index:3; transform:translate(-50%,-50%); border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; transition:left 520ms cubic-bezier(.22,1,.36,1),top 520ms cubic-bezier(.22,1,.36,1); will-change:left,top,transform,opacity; }
        .personNode { width:128px; min-height:84px; padding:7px 5px; text-align:center; }
        .depthLayer { width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:4px; transform:scale(1); opacity:1; filter:blur(0); transition:opacity 280ms ease,filter 280ms ease,transform 360ms cubic-bezier(.22,1,.36,1); }
        .depthLayer.focus,.depthLayer.normal { opacity:1; filter:none; transform:scale(1); }
        .depthLayer.near { opacity:.4; filter:blur(.12px); transform:scale(.992); }
        .depthLayer.dim { opacity:.17; filter:blur(.48px); transform:scale(.982); }
        .nodeShell { position:relative; width:32px; height:32px; display:grid; place-items:center; }
        .dot { position:relative; z-index:2; width:10px; height:10px; border-radius:50%; background:#77746c; box-shadow:0 0 0 1px rgba(255,255,255,.05); transition:transform 180ms ease,background 180ms ease,box-shadow 180ms ease; }
        .halo { position:absolute; z-index:1; width:27px; height:27px; border:1px solid rgba(255,255,255,.075); border-radius:50%; transition:border-color 180ms ease,box-shadow 180ms ease,transform 180ms ease; }
        .personNode:hover .dot,.selectedNode .dot { transform:scale(1.18); background:#d8b354; }
        .personNode:hover .halo,.selectedNode .halo { border-color:rgba(244,183,40,.55); box-shadow:0 0 25px rgba(244,183,40,.12); transform:scale(1.1); }
        .selectedNode { z-index:8; }
        .rootNode .nodeShell { width:42px; height:42px; }
        .rootNode .dot { width:15px; height:15px; background:#f4b728; box-shadow:0 0 22px rgba(244,183,40,.24); }
        .rootNode .halo { width:37px; height:37px; border-color:rgba(255,209,78,.42); box-shadow:0 0 28px rgba(244,183,40,.08); }
        .roundPulse { position:absolute; z-index:4; top:4px; right:2px; width:5px; height:5px; border-radius:50%; background:#f4b728; box-shadow:0 0 9px rgba(244,183,40,.72); }
        .personNode strong { max-width:122px; overflow:hidden; color:#bdb8ae; font-size:.63rem; font-weight:850; text-overflow:ellipsis; white-space:nowrap; direction:ltr; }
        .rootNode strong { color:#e9c252; font-size:.72rem; }
        .personNode small { color:#625f59; font-size:.51rem; font-weight:750; text-transform:lowercase; }
        .continuation { height:9px; margin-top:-1px; color:#514d45; font-size:.66rem; line-height:8px; transition:transform 220ms ease,color 180ms ease; }
        .continuation.open { transform:rotate(180deg); color:#8f7b4d; }
        .freshNode { animation:wholeBloom 820ms cubic-bezier(.14,1.05,.28,1) var(--bloom-delay) both; z-index:9; }
        .freshNode .depthLayer { animation:labelResolve 820ms ease var(--bloom-delay) both; }

        .clusterNode { width:100px; min-height:56px; padding:0; }
        .clusterNode .depthLayer { padding:8px; box-sizing:border-box; border:1px solid rgba(244,183,40,.13); border-radius:18px; background:rgba(244,183,40,.035); }
        .clusterNode b { color:#d9b452; font-size:.72rem; font-weight:950; }
        .clusterNode small { color:#6c6454; font-size:.47rem; font-weight:800; }
        .clusterNode:hover .depthLayer { border-color:rgba(244,183,40,.3); background:rgba(244,183,40,.07); }

        .inspector { position:absolute; z-index:12; right:18px; top:18px; width:220px; padding:13px 14px; border:1px solid rgba(255,255,255,.08); border-radius:17px; background:rgba(17,17,15,.9); backdrop-filter:blur(16px); box-shadow:0 18px 50px rgba(0,0,0,.24); pointer-events:auto; animation:inspectorIn 180ms ease both; }
        .inspector > div:first-child { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .inspector strong { color:#e8e2d7; font-size:.67rem; direction:ltr; }
        .inspector small { color:#8c8067; font-size:.47rem; font-weight:850; }
        .inspectorMetrics { margin-top:9px; display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .inspectorMetrics span { padding:7px 5px; border-radius:10px; background:rgba(255,255,255,.025); color:#6f6b64; font-size:.44rem; text-align:center; }
        .inspectorMetrics b { display:block; margin-bottom:2px; color:#cfc8ba; font-size:.61rem; }

        .stageControls { position:absolute; z-index:14; right:14px; bottom:14px; display:flex; gap:6px; }
        .stageControls button,.previewToggle { width:36px; height:36px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(16,16,14,.84); color:#8d887f; font:inherit; font-size:.72rem; cursor:pointer; backdrop-filter:blur(10px); }
        .stageControls button:hover,.previewToggle:hover { color:#d8c69b; border-color:rgba(244,183,40,.18); }
        .previewCorner { position:absolute; z-index:15; left:14px; bottom:14px; }
        .previewMenu { position:absolute; left:0; bottom:44px; width:160px; padding:9px; display:grid; gap:5px; border:1px solid rgba(255,255,255,.08); border-radius:15px; background:rgba(16,16,14,.94); box-shadow:0 18px 50px rgba(0,0,0,.35); backdrop-filter:blur(14px); }
        .previewMenu small { padding:3px 5px 5px; color:#655d4e; font-size:.45rem; font-weight:950; letter-spacing:.09em; }
        .previewMenu button { min-height:31px; padding:0 9px; border:0; border-radius:9px; background:transparent; color:#8f8a81; font:inherit; font-size:.58rem; font-weight:800; text-align:left; cursor:pointer; }
        .previewMenu button:hover,.previewMenu button.active { background:rgba(244,183,40,.07); color:#e1c062; }

        @keyframes drawEdge { 0% { stroke-dashoffset:1; opacity:0; } 100% { stroke-dashoffset:0; opacity:1; } }
        @keyframes settleEdge { from { stroke:rgba(244,183,40,.58); opacity:1; } to { stroke:rgba(226,205,156,.2); opacity:.82; } }
        @keyframes wholeBloom {
          0% { transform:translate(-50%,-50%) translate(var(--from-x),var(--from-y)) scale(.12); opacity:0; }
          26% { opacity:.8; }
          72% { transform:translate(-50%,-50%) translate(0,0) scale(1.08); opacity:1; }
          100% { transform:translate(-50%,-50%) translate(0,0) scale(1); opacity:1; }
        }
        @keyframes labelResolve { 0%,28% { filter:blur(3px); } 72% { filter:blur(0); } 100% { filter:blur(0); } }
        @keyframes inspectorIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        @media (max-width:700px) {
          .screen { padding:18px 14px 116px; }
          .topBar { align-items:flex-start; margin-bottom:4px; }
          .topActions { max-width:64%; gap:6px; flex-wrap:wrap; }
          .roundChip { display:none; }
          .accountChip { min-height:34px; padding:0 9px; border-radius:11px; font-size:.63rem; }
          .bellButton { width:34px; min-height:34px; border-radius:11px; }
          .networkSurface { width:100%; }
          .networkHeader { min-height:48px; padding:0 5px; }
          .networkStage { height:calc(100svh - 172px); min-height:510px; border-radius:23px; }
          .networkSummary span { display:none; }
          .inspector { right:10px; top:auto; bottom:58px; left:10px; width:auto; }
          .stageControls { right:9px; bottom:9px; }
          .previewCorner { left:9px; bottom:9px; }
          .depthLayer.near { opacity:.3; }
          .depthLayer.dim { opacity:.11; filter:blur(.58px); }
          .edge.dim { opacity:.025; }
        }

        @media (prefers-reduced-motion: reduce) {
          .personNode,.clusterNode,.depthLayer,.freshNode,.freshNode .depthLayer,.edge.freshEdge,.inspector { animation:none !important; transition:none !important; }
        }
      `}</style>
    </main>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}
