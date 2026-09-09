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
import { LANGUAGE_OPTIONS, type SupportedLocale } from '@/lib/i18n/locales';

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
  active: boolean;
  delay: number;
};

const ROOT_ID = 'you';
const PLANE_W = 4200;
const PLANE_H = 2400;
const CENTER_X = PLANE_W / 2;
const LEVEL_GAP = 154;
const ITEM_GAP = 28;
const NODE_WIDTH = 138;
const CLUSTER_WIDTH = 112;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.5;

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
    if (depth > 1 && i < Math.min(3, direct)) {
      const nextDirect = Math.max(2, Math.min(4, direct - i));
      child.children = Array.from({ length: nextDirect }, (_, j) => {
        const grand = makeNode(cursor++, `${child.id}-${j + 1}`);
        if (depth > 2 && j < 2) {
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
    if (i < 18) {
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
    const value = {
      network,
      direct: node.children.length,
      qualified,
      growth,
    };
    map.set(node.id, value);
    return value;
  };
  visit(root);
  return map;
}

function buildDepthMap(root: Node) {
  const map = new Map<string, number>();
  const visit = (node: Node, depth: number) => {
    map.set(node.id, depth);
    node.children.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
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

function layoutVisible({
  root,
  byId,
  expanded,
  revealCount,
  selectedId,
  freshIds,
  freshParentId,
  isMobile,
}: {
  root: Node;
  byId: Map<string, Node>;
  expanded: Set<string>;
  revealCount: Map<string, number>;
  selectedId: string | null;
  freshIds: Set<string>;
  freshParentId: string | null;
  isMobile: boolean;
}) {
  const visualByKey = new Map<string, Visual>();
  const measureCache = new Map<string, number>();
  const limit = isMobile ? 3 : 5;

  const entriesFor = (node: Node) => {
    if (!expanded.has(node.id) || node.children.length < 1) return [] as Array<Node | 'cluster'>;
    const revealed = revealCount.get(node.id) ?? limit;
    const visible = node.children.slice(0, revealed);
    const entries: Array<Node | 'cluster'> = [...visible];
    if (revealed < node.children.length) entries.push('cluster');
    return entries;
  };

  const measure = (node: Node): number => {
    const cached = measureCache.get(node.id);
    if (cached) return cached;
    const entries = entriesFor(node);
    if (entries.length < 1) {
      measureCache.set(node.id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const widths = entries.map((entry) =>
      entry === 'cluster' ? CLUSTER_WIDTH : measure(entry),
    );
    const childrenWidth = widths.reduce((sum, value) => sum + value, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    const width = Math.max(NODE_WIDTH, childrenWidth);
    measureCache.set(node.id, width);
    return width;
  };

  const rootWidth = measure(root);

  const place = (
    node: Node,
    x: number,
    y: number,
    parent: { id: string; x: number; y: number } | null,
    depth: number,
  ) => {
    visualByKey.set(node.id, {
      kind: 'person',
      key: node.id,
      id: node.id,
      x,
      y,
      parentId: parent?.id ?? null,
      parentX: parent?.x ?? x,
      parentY: parent?.y ?? y,
      depth,
    });

    const entries = entriesFor(node);
    if (entries.length < 1) return;
    const widths = entries.map((entry) => entry === 'cluster' ? CLUSTER_WIDTH : measure(entry));
    const total = widths.reduce((sum, value) => sum + value, 0) + ITEM_GAP * Math.max(0, widths.length - 1);
    let cursor = x - total / 2;

    entries.forEach((entry, index) => {
      const width = widths[index];
      const childX = cursor + width / 2;
      const childY = y + LEVEL_GAP + (index % 2 === 0 ? -4 : 5);
      if (entry === 'cluster') {
        const revealed = revealCount.get(node.id) ?? limit;
        visualByKey.set(`cluster:${node.id}`, {
          kind: 'cluster',
          key: `cluster:${node.id}`,
          parentId: node.id,
          x: childX,
          y: childY,
          parentX: x,
          parentY: y,
          remaining: Math.max(0, node.children.length - revealed),
          depth: depth + 1,
        });
      } else {
        place(entry, childX, childY, { id: node.id, x, y }, depth + 1);
      }
      cursor += width + ITEM_GAP;
    });
  };

  place(root, CENTER_X, 88, null, 0);

  const visuals = Array.from(visualByKey.values());
  const edges: Edge[] = [];
  visuals.forEach((visual) => {
    if (visual.kind === 'person' && visual.parentId) {
      edges.push({
        key: `${visual.parentId}->${visual.id}`,
        fromId: visual.parentId,
        toKey: visual.id,
        x1: visual.parentX,
        y1: visual.parentY + 16,
        x2: visual.x,
        y2: visual.y - 15,
        fresh: freshIds.has(visual.id),
        active: visual.id === selectedId || visual.parentId === selectedId,
        delay: Math.max(0, visual.x % 5) * 14,
      });
    }
    if (visual.kind === 'cluster') {
      edges.push({
        key: `${visual.parentId}->${visual.key}`,
        fromId: visual.parentId,
        toKey: visual.key,
        x1: visual.parentX,
        y1: visual.parentY + 16,
        x2: visual.x,
        y2: visual.y - 13,
        fresh: freshParentId === visual.parentId,
        active: visual.parentId === selectedId,
        delay: 90,
      });
    }
  });

  return { visuals, edges, rootWidth };
}

export function InfiniteNetworkCanvasV25Preview() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const freshTimerRef = useRef<number | null>(null);
  const rootBloomTimerRef = useRef<number | null>(null);

  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealCount, setRevealCount] = useState<Map<string, number>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [freshParentId, setFreshParentId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 18, scale: 1 });
  const [stageWidth, setStageWidth] = useState(1000);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const depths = useMemo(() => buildDepthMap(root), [root]);
  const rootStats = stats.get(ROOT_ID)!;
  const isMobile = stageWidth < 640;
  const revealStep = isMobile ? 3 : 5;

  const layout = useMemo(
    () => layoutVisible({
      root,
      byId,
      expanded,
      revealCount,
      selectedId,
      freshIds,
      freshParentId,
      isMobile,
    }),
    [root, byId, expanded, revealCount, selectedId, freshIds, freshParentId, isMobile],
  );

  const clearFreshSoon = useCallback(() => {
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => {
      setFreshIds(new Set());
      setFreshParentId(null);
    }, 720);
  }, []);

  const bloom = useCallback((nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node || node.children.length < 1) return;
    const currentlyExpanded = expanded.has(nodeId);

    if (currentlyExpanded) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(nodeId);
        return next;
      });
      setSelectedId(nodeId);
      setFreshIds(new Set());
      setFreshParentId(null);
      return;
    }

    const revealed = revealCount.get(nodeId) ?? revealStep;
    setExpanded((current) => new Set(current).add(nodeId));
    setSelectedId(nodeId);
    setFreshParentId(nodeId);
    setFreshIds(new Set(node.children.slice(0, revealed).map((child) => child.id)));
    clearFreshSoon();
  }, [byId, expanded, revealCount, revealStep, clearFreshSoon]);

  const replayRootBloom = useCallback(() => {
    if (rootBloomTimerRef.current) window.clearTimeout(rootBloomTimerRef.current);
    setExpanded(new Set());
    setRevealCount(new Map());
    setSelectedId(null);
    setFreshIds(new Set());
    setFreshParentId(null);
    setView({ x: 0, y: 18, scale: 1 });
    rootBloomTimerRef.current = window.setTimeout(() => bloom(ROOT_ID), 300);
  }, [bloom]);

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
      if (rootBloomTimerRef.current) window.clearTimeout(rootBloomTimerRef.current);
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
    setRevealCount((existing) => {
      const next = new Map(existing);
      next.set(parentId, nextCount);
      return next;
    });
    setFreshParentId(parentId);
    setFreshIds(new Set(nextFresh));
    setSelectedId(parentId);
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
          <div className="utilityActions">
            <button type="button" className="bellButton" aria-label="Notifications">
              <BellIcon />
              <span className="notificationDot" />
            </button>
            <select
              className="languageSelect"
              value={locale}
              onChange={(event) => setLocale(event.target.value as SupportedLocale)}
              aria-label="Language"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.locale} value={option.locale}>{option.nativeName}</option>
              ))}
            </select>
          </div>
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
              {layout.edges.map((edge) => (
                <line
                  key={edge.key}
                  className={`${edge.fresh ? 'freshEdge' : ''} ${edge.active ? 'activeEdge' : ''}`}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  pathLength={1}
                  style={{ '--edge-delay': `${edge.delay}ms` } as CSSProperties}
                />
              ))}
            </svg>

            {layout.visuals.map((visual) => {
              if (visual.kind === 'cluster') {
                const fresh = freshParentId === visual.parentId;
                const clusterStyle = {
                  left: `${visual.x}px`,
                  top: `${visual.y}px`,
                  '--from-x': `${visual.parentX - visual.x}px`,
                  '--from-y': `${visual.parentY - visual.y}px`,
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
                    <span>+{visual.remaining}</span>
                    <small>more direct</small>
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
              const nodeStyle = {
                left: `${visual.x}px`,
                top: `${visual.y}px`,
                '--from-x': `${visual.parentX - visual.x}px`,
                '--from-y': `${visual.parentY - visual.y}px`,
                '--float-delay': `${(visual.depth % 5) * -0.7}s`,
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
                  onClick={() => {
                    setSelectedId(node.id);
                    if (hasChildren) bloom(node.id);
                  }}
                  aria-label={`${node.wallet}, ${nodeStats.network} network`}
                >
                  <span className="nodeShell">
                    <span className="halo" />
                    <span className="dot" />
                    {node.joinedThisRound ? <span className="roundPulse" /> : null}
                  </span>
                  <strong>{isRoot ? 'YOU' : node.wallet}</strong>
                  {isRoot ? null : <small>{1 + nodeStats.network} branch</small>}
                  {hasChildren ? <span className={`continuation ${isExpanded ? 'open' : ''}`}>⌄</span> : null}
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
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView({ x: 0, y: 18, scale: 1 })}>◎</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + 0.1, MIN_SCALE, MAX_SCALE) }))}>+</button>
            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - 0.1, MIN_SCALE, MAX_SCALE) }))}>−</button>
          </div>
        </div>
      </section>

      <PreviewBottomNavigation />

      <style jsx>{`
        .screen { min-height:100svh; box-sizing:border-box; padding:22px 18px 118px; color:#fff; background:radial-gradient(circle at 50% 16%,rgba(244,183,40,.14),transparent 32%),#080807; }
        .topBar { width:min(100%,520px); margin:0 auto 10px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .topActions { min-width:0; display:flex; align-items:center; gap:10px; }
        .utilityActions { min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; }
        .languageSelect { max-width:155px; height:40px; padding:0 28px 0 11px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; }
        .accountChip,.bellButton { min-height:40px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; cursor:pointer; }
        .accountChip { padding:0 13px; display:inline-flex; align-items:center; gap:8px; font-size:.72rem; font-weight:850; }
        .accountDot { width:9px; height:9px; border-radius:50%; background:#f4b728; box-shadow:0 0 14px rgba(244,183,40,.68); }
        .bellButton { position:relative; width:40px; padding:0; display:grid; place-items:center; }
        .bellButton :global(svg) { width:18px; height:18px; }
        .notificationDot { position:absolute; top:8px; right:8px; width:6px; height:6px; border-radius:50%; background:#f4b728; box-shadow:0 0 9px rgba(244,183,40,.65); }

        .networkSurface { width:min(calc(100vw - 28px),1180px); margin:0 auto; }
        .networkHeader { width:min(100%,1120px); min-height:54px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:0 12px; box-sizing:border-box; }
        .networkHeader > div:first-child { display:grid; gap:3px; }
        .eyebrow { color:#8e8062; font-size:.56rem; font-weight:950; letter-spacing:.14em; }
        .networkHeader strong { color:#f8f4ea; font-size:.9rem; }
        .networkSummary { display:flex; align-items:baseline; gap:5px; color:#77736c; font-size:.58rem; white-space:nowrap; }
        .networkSummary strong { color:#ddd7ca; font-size:.72rem; }
        .networkSummary .growth { color:#f4b728; }
        .networkSummary i { width:1px; height:10px; margin:0 4px; background:rgba(255,255,255,.1); }

        .networkStage { position:relative; height:clamp(540px,calc(100svh - 190px),760px); overflow:hidden; touch-action:none; cursor:grab; user-select:none; border-radius:30px; background:radial-gradient(circle at 50% 31%,rgba(244,183,40,.055),transparent 26%); }
        .networkStage:active { cursor:grabbing; }
        .stageGlow { position:absolute; inset:0; pointer-events:none; background:linear-gradient(to bottom,rgba(255,255,255,.012),transparent 18%,transparent 80%,rgba(0,0,0,.1)); }
        .world { position:absolute; top:0; left:50%; transform-origin:50% 0; will-change:transform; }
        .edges { position:absolute; inset:0; overflow:visible; pointer-events:none; }
        .edges line { vector-effect:non-scaling-stroke; stroke:rgba(224,218,207,.065); stroke-width:1; stroke-linecap:round; transition:stroke 180ms ease,opacity 180ms ease; }
        .edges line.activeEdge { stroke:rgba(244,183,40,.22); }
        .edges line.freshEdge { stroke:rgba(244,183,40,.42); stroke-dasharray:1; stroke-dashoffset:1; animation:drawEdge 470ms cubic-bezier(.22,1,.36,1) var(--edge-delay) forwards,settleEdge 720ms ease 250ms forwards; }

        .personNode,.clusterNode { position:absolute; z-index:3; transform:translate(-50%,-50%); border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; transition:left 420ms cubic-bezier(.22,1,.36,1),top 420ms cubic-bezier(.22,1,.36,1),opacity 180ms ease; }
        .personNode { width:132px; min-height:86px; padding:8px 5px; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:4px; text-align:center; }
        .nodeShell { position:relative; width:32px; height:32px; display:grid; place-items:center; animation:softFloat 7s ease-in-out var(--float-delay) infinite; }
        .dot { position:relative; z-index:2; width:11px; height:11px; border-radius:50%; background:#77746c; box-shadow:0 0 0 1px rgba(255,255,255,.05); transition:transform 180ms ease,background 180ms ease,box-shadow 180ms ease; }
        .halo { position:absolute; z-index:1; width:27px; height:27px; border:1px solid rgba(255,255,255,.075); border-radius:50%; opacity:.8; transition:border-color 180ms ease,box-shadow 180ms ease,transform 180ms ease; }
        .personNode:hover .dot,.selectedNode .dot { transform:scale(1.14); background:#d8b354; }
        .personNode:hover .halo,.selectedNode .halo { border-color:rgba(244,183,40,.48); box-shadow:0 0 24px rgba(244,183,40,.11); transform:scale(1.08); }
        .rootNode .nodeShell { width:42px; height:42px; }
        .rootNode .dot { width:16px; height:16px; background:#f4b728; box-shadow:0 0 22px rgba(244,183,40,.24); }
        .rootNode .halo { width:37px; height:37px; border-color:rgba(255,209,78,.42); box-shadow:0 0 28px rgba(244,183,40,.08); }
        .roundPulse { position:absolute; z-index:4; top:4px; right:2px; width:5px; height:5px; border-radius:50%; background:#f4b728; box-shadow:0 0 9px rgba(244,183,40,.72); }
        .personNode strong { max-width:125px; overflow:hidden; color:#bdb8ae; font-size:.65rem; font-weight:850; text-overflow:ellipsis; white-space:nowrap; direction:ltr; }
        .rootNode strong { color:#e9c252; font-size:.73rem; }
        .personNode small { color:#625f59; font-size:.53rem; font-weight:750; text-transform:lowercase; }
        .continuation { height:9px; margin-top:-1px; color:#514d45; font-size:.68rem; line-height:8px; transition:transform 220ms ease,color 180ms ease; }
        .continuation.open { transform:rotate(180deg); color:#8f7b4d; }
        .freshNode .nodeShell { animation:bloomNode 520ms cubic-bezier(.16,1.08,.34,1) both,softFloat 7s ease-in-out 650ms infinite; }
        .freshNode { animation:labelBloom 520ms ease both; }

        .clusterNode { width:100px; min-height:56px; padding:8px; border:1px solid rgba(244,183,40,.13); border-radius:18px; background:rgba(244,183,40,.035); display:grid; place-items:center; align-content:center; gap:2px; }
        .clusterNode span { color:#d9b452; font-size:.73rem; font-weight:950; }
        .clusterNode small { color:#6c6454; font-size:.48rem; font-weight:800; }
        .clusterNode:hover { border-color:rgba(244,183,40,.3); background:rgba(244,183,40,.07); }

        .inspector { position:absolute; z-index:12; right:18px; top:18px; width:220px; padding:13px 14px; border:1px solid rgba(255,255,255,.08); border-radius:17px; background:rgba(17,17,15,.9); backdrop-filter:blur(16px); box-shadow:0 18px 50px rgba(0,0,0,.24); pointer-events:auto; }
        .inspector > div:first-child { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .inspector strong { color:#e8e2d7; font-size:.68rem; direction:ltr; }
        .inspector small { color:#8c8067; font-size:.48rem; font-weight:850; }
        .inspectorMetrics { margin-top:9px; display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .inspectorMetrics span { padding:7px 5px; border-radius:10px; background:rgba(255,255,255,.025); color:#6f6b64; font-size:.45rem; text-align:center; }
        .inspectorMetrics b { display:block; margin-bottom:2px; color:#cfc8ba; font-size:.62rem; }

        .stageControls { position:absolute; z-index:14; right:14px; bottom:14px; display:flex; gap:6px; }
        .stageControls button,.previewToggle { width:36px; height:36px; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(16,16,14,.84); color:#8d887f; font:inherit; font-size:.72rem; cursor:pointer; backdrop-filter:blur(10px); }
        .stageControls button:hover,.previewToggle:hover { color:#d8c69b; border-color:rgba(244,183,40,.18); }
        .previewCorner { position:absolute; z-index:15; left:14px; bottom:14px; }
        .previewMenu { position:absolute; left:0; bottom:44px; width:155px; padding:9px; display:grid; gap:5px; border:1px solid rgba(255,255,255,.08); border-radius:15px; background:rgba(16,16,14,.94); box-shadow:0 18px 50px rgba(0,0,0,.35); backdrop-filter:blur(14px); }
        .previewMenu small { padding:3px 5px 5px; color:#655d4e; font-size:.45rem; font-weight:950; letter-spacing:.09em; }
        .previewMenu button { min-height:31px; padding:0 9px; border:0; border-radius:9px; background:transparent; color:#8f8a81; font:inherit; font-size:.58rem; font-weight:800; text-align:left; cursor:pointer; }
        .previewMenu button:hover,.previewMenu button.active { background:rgba(244,183,40,.07); color:#e1c062; }

        @keyframes drawEdge { from { stroke-dashoffset:1; opacity:0; } to { stroke-dashoffset:0; opacity:1; } }
        @keyframes settleEdge { from { stroke:rgba(244,183,40,.42); } to { stroke:rgba(224,218,207,.065); } }
        @keyframes bloomNode { 0% { transform:translate(var(--from-x),var(--from-y)) scale(.42); opacity:0; } 70% { transform:translate(0,0) scale(1.08); opacity:1; } 100% { transform:translate(0,0) scale(1); opacity:1; } }
        @keyframes labelBloom { 0%,20% { opacity:.2; } 100% { opacity:1; } }
        @keyframes softFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-1.5px); } }

        @media (max-width:700px) {
          .screen { padding:18px 14px 116px; }
          .topBar { align-items:flex-start; margin-bottom:6px; }
          .topActions { max-width:60%; align-items:flex-end; flex-direction:column-reverse; gap:7px; }
          .utilityActions { width:100%; }
          .languageSelect { min-width:0; width:auto; flex:1; max-width:140px; height:34px; border-radius:11px; font-size:.68rem; }
          .accountChip { min-height:34px; padding:0 10px; border-radius:11px; font-size:.66rem; }
          .bellButton { width:34px; min-height:34px; border-radius:11px; }
          .networkSurface { width:100%; }
          .networkHeader { min-height:48px; padding:0 5px; }
          .networkStage { height:calc(100svh - 176px); min-height:510px; border-radius:23px; }
          .networkSummary span { display:none; }
          .inspector { right:10px; top:auto; bottom:58px; left:10px; width:auto; }
          .stageControls { right:9px; bottom:9px; }
          .previewCorner { left:9px; bottom:9px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .personNode,.clusterNode,.nodeShell,.freshNode,.freshNode .nodeShell,.edges line.freshEdge { animation:none !important; transition:none !important; }
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

function PreviewBottomNavigation() {
  const tabs = [
    { key: 'home', label: 'Home' },
    { key: 'guide', label: 'Network' },
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'settings', label: 'Settings' },
  ] as const;

  return (
    <nav className="bottomNavigation" aria-label="Preview navigation">
      <div>
        <span className="activeIndicator" aria-hidden="true" />
        {tabs.map((tab) => (
          <button key={tab.key} type="button" className={tab.key === 'guide' ? 'active' : ''} tabIndex={-1}>
            <span className="navIcon"><NavIcon name={tab.key} /></span>
            <span className="navLabel">{tab.label}</span>
          </button>
        ))}
      </div>
      <style jsx>{`
        .bottomNavigation { position:fixed; z-index:90; right:0; bottom:0; left:0; padding:0 12px calc(10px + env(safe-area-inset-bottom)); pointer-events:none; background:linear-gradient(to top,rgba(7,7,7,.98) 58%,transparent); }
        .bottomNavigation > div { position:relative; width:min(100%,520px); min-height:70px; margin:0 auto; padding:6px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid rgba(255,205,80,.16); border-radius:23px; background:rgba(22,22,20,.985); box-shadow:0 18px 55px rgba(0,0,0,.5); isolation:isolate; }
        .activeIndicator { position:absolute; z-index:0; top:6px; bottom:6px; left:calc(25% + 3px); width:calc(25% - 6px); border-radius:17px; background:rgba(255,201,61,.1); }
        button { position:relative; z-index:1; width:100%; min-width:0; min-height:56px; padding:6px 3px; display:grid; grid-template-rows:21px 13px; justify-items:center; align-content:center; row-gap:4px; border:0; background:transparent; color:#77736c; font:inherit; font-size:.6rem; font-weight:850; }
        button.active { color:#ffd45f; }
        .navIcon { width:21px; height:21px; line-height:0; }
        .navIcon :global(svg) { width:21px; height:21px; display:block; }
        .navLabel { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; line-height:13px; }
      `}</style>
    </nav>
  );
}

function NavIcon({ name }: { name: 'home' | 'guide' | 'leaderboard' | 'settings' }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'home') return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
  if (name === 'guide') return <svg {...common}><circle cx="12" cy="5" r="2.2" /><circle cx="6" cy="17" r="2.2" /><circle cx="18" cy="17" r="2.2" /><path d="M10.8 6.9 7.2 15" /><path d="m13.2 6.9 3.6 8.1" /><path d="M8.2 17h7.6" /></svg>;
  if (name === 'leaderboard') return <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a4 4 0 0 0 4 4" /><path d="M17 6h3v1a4 4 0 0 1-4 4" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 2.9 13.6H3v-4h-.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88L4.2 6.66 7.06 3.8l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v-.1A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9c.09.39.3.74.6 1 .3.26.68.4 1.1.4H21v4h-.1c-.42 0-.8.14-1.1.4-.3.26-.51.61-.6 1Z" /></svg>;
}
