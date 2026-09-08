'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type Scenario = 'balanced' | 'wide' | 'deep' | 'empty';

type NetworkNode = {
  id: string;
  wallet: string;
  status: Status;
  joinedThisRound: boolean;
  children: NetworkNode[];
};

type DisplayNode = {
  id: string;
  kind: 'person' | 'cluster';
  parentId: string | null;
  sourceId: string | null;
  wallet: string;
  status: Status | null;
  joinedThisRound: boolean;
  count: number;
  qualified: number;
  growth: number;
  children: DisplayNode[];
};

type PositionedNode = DisplayNode & {
  x: number;
  y: number;
  depth: number;
  width: number;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const ROOT_ID = 'you';
const NODE_SPACING = 132;
const VERTICAL_GAP = 148;
const PLANE_PADDING = 360;
const MIN_SCALE = 0.28;
const MAX_SCALE = 2.4;

function hex(index: number) {
  return index.toString(16).padStart(6, '0');
}

function wallet(index: number) {
  const h = hex(index);
  return `0x${h.slice(0, 2)}${h.slice(2, 4)}…${h.slice(4)}${(index * 7 % 255).toString(16).padStart(2, '0')}`;
}

function statusFor(index: number): Status {
  if (index % 5 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'REWARDED';
  return 'QUALIFIED';
}

function leaf(index: number, id: string): NetworkNode {
  return {
    id,
    wallet: wallet(index),
    status: statusFor(index),
    joinedThisRound: index % 4 === 0 || index % 7 === 0,
    children: [],
  };
}

function buildBalanced(): NetworkNode {
  let n = 10;
  const makeBranch = (id: string, direct: number, depth: number): NetworkNode => {
    const me = leaf(n++, id);
    if (depth <= 0) return me;
    me.children = Array.from({ length: direct }, (_, i) => {
      const child = leaf(n++, `${id}-${i + 1}`);
      if (depth > 1 && i < Math.min(3, direct)) {
        child.children = Array.from({ length: 2 + ((i + n) % 3) }, (_, j) => {
          const grand = leaf(n++, `${child.id}-${j + 1}`);
          if (depth > 2 && j === 0) {
            grand.children = Array.from({ length: 2 }, (_, k) => leaf(n++, `${grand.id}-${k + 1}`));
          }
          return grand;
        });
      }
      return child;
    });
    return me;
  };

  return {
    id: ROOT_ID,
    wallet: 'YOU',
    status: 'REWARDED',
    joinedThisRound: false,
    children: [
      makeBranch('a', 6, 3),
      makeBranch('b', 4, 3),
      makeBranch('c', 7, 2),
      makeBranch('d', 3, 2),
      makeBranch('e', 5, 2),
    ],
  };
}

function buildWide(): NetworkNode {
  let n = 300;
  const children = Array.from({ length: 100 }, (_, i) => {
    const child = leaf(n++, `w-${i + 1}`);
    if (i < 14) {
      child.children = Array.from({ length: 2 + (i % 4) }, (_, j) => leaf(n++, `${child.id}-${j + 1}`));
    }
    return child;
  });
  return { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children };
}

function buildDeep(): NetworkNode {
  const root: NetworkNode = { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children: [] };
  let current = root;
  for (let i = 1; i <= 50; i += 1) {
    const child = leaf(600 + i, `deep-${i}`);
    if (i % 6 === 0) {
      child.children.push(leaf(900 + i, `side-${i}`));
    }
    current.children.push(child);
    current = child;
  }
  return root;
}

function scenarioRoot(scenario: Scenario): NetworkNode {
  if (scenario === 'wide') return buildWide();
  if (scenario === 'deep') return buildDeep();
  if (scenario === 'empty') return { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children: [] };
  return buildBalanced();
}

function flatten(node: NetworkNode): NetworkNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function descendants(node: NetworkNode): NetworkNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function metrics(node: NetworkNode) {
  const down = descendants(node);
  return {
    network: down.length,
    direct: node.children.length,
    qualified: down.filter((item) => item.status !== 'IN_PROGRESS').length,
    growth: down.filter((item) => item.joinedThisRound).length,
  };
}

function findNode(root: NetworkNode, id: string): NetworkNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findPath(root: NetworkNode, id: string, trail: NetworkNode[] = []): NetworkNode[] | null {
  const next = [...trail, root];
  if (root.id === id) return next;
  for (const child of root.children) {
    const found = findPath(child, id, next);
    if (found) return found;
  }
  return null;
}

function clusterMetrics(nodes: NetworkNode[]) {
  const all = nodes.flatMap((node) => [node, ...descendants(node)]);
  return {
    count: all.length,
    qualified: all.filter((node) => node.status !== 'IN_PROGRESS').length,
    growth: all.filter((node) => node.joinedThisRound).length,
  };
}

function toDisplayTree(
  node: NetworkNode,
  expandedClusters: Set<string>,
  depth = 0,
  maxDepth = 7,
): DisplayNode {
  const base: DisplayNode = {
    id: node.id,
    kind: 'person',
    parentId: null,
    sourceId: node.id,
    wallet: node.wallet,
    status: node.status,
    joinedThisRound: node.joinedThisRound,
    count: metrics(node).network,
    qualified: metrics(node).qualified,
    growth: metrics(node).growth,
    children: [],
  };

  if (node.children.length === 0) return base;

  if (depth >= maxDepth) {
    const m = clusterMetrics(node.children);
    base.children = [{
      id: `cluster-depth-${node.id}`,
      kind: 'cluster',
      parentId: node.id,
      sourceId: null,
      wallet: '',
      status: null,
      joinedThisRound: m.growth > 0,
      count: m.count,
      qualified: m.qualified,
      growth: m.growth,
      children: [],
    }];
    return base;
  }

  if (node.children.length > 10) {
    const chunkSize = 12;
    const groups: DisplayNode[] = [];
    for (let start = 0; start < node.children.length; start += chunkSize) {
      const group = node.children.slice(start, start + chunkSize);
      const clusterId = `cluster-${node.id}-${start}`;
      const m = clusterMetrics(group);
      const cluster: DisplayNode = {
        id: clusterId,
        kind: 'cluster',
        parentId: node.id,
        sourceId: null,
        wallet: '',
        status: null,
        joinedThisRound: m.growth > 0,
        count: m.count,
        qualified: m.qualified,
        growth: m.growth,
        children: [],
      };
      if (expandedClusters.has(clusterId)) {
        cluster.children = group.map((child) => {
          const d = toDisplayTree(child, expandedClusters, depth + 2, maxDepth);
          d.parentId = clusterId;
          return d;
        });
      }
      groups.push(cluster);
    }
    base.children = groups;
    return base;
  }

  base.children = node.children.map((child) => {
    const d = toDisplayTree(child, expandedClusters, depth + 1, maxDepth);
    d.parentId = node.id;
    return d;
  });
  return base;
}

function layoutTree(root: DisplayNode) {
  const positions: PositionedNode[] = [];

  const measure = (node: DisplayNode): number => {
    if (node.children.length === 0) return NODE_SPACING;
    return Math.max(NODE_SPACING, node.children.reduce((sum, child) => sum + measure(child), 0));
  };

  const place = (node: DisplayNode, left: number, y: number, depth: number) => {
    const width = measure(node);
    const x = left + width / 2;
    positions.push({ ...node, x, y, depth, width });
    let cursor = left;
    for (const child of node.children) {
      const childWidth = measure(child);
      place(child, cursor, y + VERTICAL_GAP, depth + 1);
      cursor += childWidth;
    }
  };

  place(root, 0, 0, 0);
  const minX = Math.min(...positions.map((n) => n.x)) - PLANE_PADDING;
  const maxX = Math.max(...positions.map((n) => n.x)) + PLANE_PADDING;
  const minY = -PLANE_PADDING / 2;
  const maxY = Math.max(...positions.map((n) => n.y)) + PLANE_PADDING;
  const width = Math.max(1400, maxX - minX);
  const height = Math.max(900, maxY - minY);
  const shifted = positions.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
  const byId = new Map(shifted.map((n) => [n.id, n]));
  const shiftedRoot = byId.get(root.id)!;
  return { nodes: shifted, byId, width, height, rootX: shiftedRoot.x, rootY: shiftedRoot.y };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function label(status: Status) {
  if (status === 'REWARDED') return '보상 완료';
  if (status === 'QUALIFIED') return '미션 완료';
  return '진행 중';
}

export function InfiniteNetworkCanvasV2Preview() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const movedRef = useRef(false);

  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.72 });
  const [growthPulse, setGrowthPulse] = useState(false);
  const [trace, setTrace] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [animating, setAnimating] = useState(false);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const allPeople = useMemo(() => flatten(root), [root]);
  const maxDepth = scenario === 'deep' ? 50 : 7;
  const displayRoot = useMemo(() => toDisplayTree(root, expandedClusters, 0, maxDepth), [root, expandedClusters, maxDepth]);
  const layout = useMemo(() => layoutTree(displayRoot), [displayRoot]);
  const selected = useMemo(() => findNode(root, selectedId) ?? root, [root, selectedId]);
  const selectedMetrics = useMemo(() => metrics(selected), [selected]);
  const totalMetrics = useMemo(() => metrics(root), [root]);
  const selectedPath = useMemo(() => findPath(root, selected.id) ?? [root], [root, selected.id]);
  const traceIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allPeople.filter((node) => node.wallet.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)).slice(0, 6);
  }, [allPeople, search]);

  const detailLevel = view.scale < 0.55 ? 'overview' : view.scale < 0.95 ? 'mid' : 'detail';

  const fitOverview = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = clamp(
      Math.min((rect.width - 80) / layout.width, (rect.height - 100) / layout.height) * 1.45,
      MIN_SCALE,
      0.82,
    );
    setAnimating(true);
    setView({
      scale,
      x: rect.width / 2 - layout.rootX * scale,
      y: 82 - layout.rootY * scale,
    });
    window.setTimeout(() => setAnimating(false), 380);
  }, [layout.height, layout.rootX, layout.rootY, layout.width]);

  const centerDisplayNode = useCallback((id: string, scale = 1.08) => {
    const viewport = viewportRef.current;
    const node = layout.byId.get(id);
    if (!viewport || !node) return;
    const rect = viewport.getBoundingClientRect();
    setAnimating(true);
    setView({
      scale: clamp(scale, MIN_SCALE, MAX_SCALE),
      x: rect.width / 2 - node.x * scale,
      y: rect.height * 0.44 - node.y * scale,
    });
    window.setTimeout(() => setAnimating(false), 380);
  }, [layout.byId]);

  const centerPerson = useCallback((id: string) => {
    setSelectedId(id);
    window.setTimeout(() => centerDisplayNode(id, 1.08), 0);
  }, [centerDisplayNode]);

  useEffect(() => {
    setSelectedId(ROOT_ID);
    setExpandedClusters(new Set());
    setTrace(false);
    setGrowthPulse(false);
    setSearch('');
    window.setTimeout(() => fitOverview(), 0);
  }, [scenario, fitOverview]);

  useEffect(() => {
    fitOverview();
    const onResize = () => fitOverview();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitOverview]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    movedRef.current = false;
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
    } else {
      const [a, b] = [...pointersRef.current.values()];
      if (a && b) {
        lastPinchRef.current = { center: midpoint(a, b), distance: Math.max(1, distance(a, b)) };
        lastSingleRef.current = null;
      }
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
      const prev = lastSingleRef.current;
      if (prev) {
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true;
        setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }
      lastSingleRef.current = point;
      return;
    }

    movedRef.current = true;
    const [a, b] = [...pointersRef.current.values()];
    const prevPinch = lastPinchRef.current;
    if (!a || !b || !prevPinch) return;
    const center = midpoint(a, b);
    const nextDistance = Math.max(1, distance(a, b));
    const ratio = nextDistance / prevPinch.distance;
    setView((current) => {
      const nextScale = clamp(current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const worldX = (prevPinch.center.x - current.x) / current.scale;
      const worldY = (prevPinch.center.y - current.y) / current.scale;
      return {
        scale: nextScale,
        x: center.x - worldX * nextScale,
        y: center.y - worldY * nextScale,
      };
    });
    lastPinchRef.current = { center, distance: nextDistance };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      lastSingleRef.current = remaining ?? null;
      lastPinchRef.current = null;
    } else {
      lastSingleRef.current = null;
      lastPinchRef.current = null;
    }
  };

  const zoomAround = useCallback((point: Point, multiplier: number) => {
    setView((current) => {
      const nextScale = clamp(current.scale * multiplier, MIN_SCALE, MAX_SCALE);
      const worldX = (point.x - current.x) / current.scale;
      const worldY = (point.y - current.y) / current.scale;
      return {
        scale: nextScale,
        x: point.x - worldX * nextScale,
        y: point.y - worldY * nextScale,
      };
    });
  }, []);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAround({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY < 0 ? 1.11 : 0.9);
  };

  const toggleCluster = (id: string) => {
    setExpandedClusters((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scenarioLabel: Record<Scenario, string> = {
    balanced: '일반 네트워크',
    wide: '직접 100명',
    deep: '50세대 깊이',
    empty: '0명',
  };

  return (
    <main className="v2PreviewPage">
      <div className="qaBar">
        <div>
          <strong>Infinite Network Canvas v2</strong>
          <span>샘플 데이터 · 실제 앱/지갑/보상과 분리</span>
        </div>
        <div className="scenarioTabs">
          {(Object.keys(scenarioLabel) as Scenario[]).map((key) => (
            <button key={key} className={scenario === key ? 'active' : ''} onClick={() => setScenario(key)}>{scenarioLabel[key]}</button>
          ))}
        </div>
      </div>

      <section className={`canvasShell detail-${detailLevel} ${growthPulse ? 'growthMode' : ''} ${trace ? 'traceMode' : ''}`}>
        <div className="canvasTopLeft">
          <span className="networkTitle">MY NETWORK</span>
          <nav className="breadcrumbs" aria-label="Current network path">
            {selectedPath.slice(Math.max(0, selectedPath.length - 5)).map((node, index, visible) => (
              <span key={node.id}>
                {index > 0 ? <i>›</i> : null}
                <button onClick={() => centerPerson(node.id)} className={index === visible.length - 1 ? 'current' : ''}>{node.id === ROOT_ID ? 'YOU' : node.wallet}</button>
              </span>
            ))}
          </nav>
        </div>

        <div className="summaryOverlay">
          <span><b>{totalMetrics.network}</b> Network</span>
          <span><b>{totalMetrics.qualified}</b> Qualified</span>
          <button className={growthPulse ? 'active' : ''} onClick={() => setGrowthPulse((v) => !v)}><b>+{totalMetrics.growth}</b> This Round</button>
        </div>

        <div className="floatingControls leftControls">
          <button onClick={() => centerPerson(ROOT_ID)} title="내 위치">◎<span>Me</span></button>
          <button onClick={fitOverview} title="전체 보기">⌂<span>Overview</span></button>
          <button className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen((v) => !v)} title="검색">⌕<span>Search</span></button>
        </div>

        <div className="floatingControls zoomControls">
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 1.2);
          }}>+</button>
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 0.82);
          }}>−</button>
        </div>

        {searchOpen ? (
          <div className="searchPanel">
            <div className="searchField">
              <span>⌕</span>
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="지갑 주소 검색" />
              {search ? <button onClick={() => setSearch('')}>×</button> : null}
            </div>
            {search.trim().length >= 2 ? (
              <div className="searchResults">
                {searchResults.length ? searchResults.map((node) => (
                  <button key={node.id} onClick={() => { setSearchOpen(false); setSearch(''); centerPerson(node.id); }}>
                    <span>{node.wallet}</span><small>{label(node.status)}</small><i>›</i>
                  </button>
                )) : <small>일치하는 지갑이 없어요.</small>}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          ref={viewportRef}
          className="viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <div
            className={`plane ${animating ? 'animating' : ''}`}
            style={{ width: layout.width, height: layout.height, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}
          >
            <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.nodes.map((node) => {
                if (!node.parentId) return null;
                const parent = layout.byId.get(node.parentId);
                if (!parent) return null;
                const selectedEdge = traceIds.has(node.sourceId ?? '') && traceIds.has(parent.sourceId ?? '');
                const growthEdge = node.joinedThisRound || node.growth > 0;
                const bend = (parent.y + node.y) / 2;
                return (
                  <path
                    key={`${parent.id}-${node.id}`}
                    d={`M ${parent.x} ${parent.y + 17} C ${parent.x} ${bend}, ${node.x} ${bend}, ${node.x} ${node.y - 16}`}
                    className={`${selectedEdge ? 'traceEdge' : ''} ${growthEdge ? 'growthEdge' : ''}`}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((node) => {
              const selectedNode = node.kind === 'person' && node.sourceId === selected.id;
              const onTrace = node.kind === 'person' && traceIds.has(node.sourceId ?? '');
              return node.kind === 'cluster' ? (
                <button
                  key={node.id}
                  type="button"
                  className={`clusterNode ${expandedClusters.has(node.id) ? 'expanded' : ''} ${node.growth > 0 ? 'hasGrowth' : ''}`}
                  style={{ left: node.x, top: node.y }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleCluster(node.id)}
                >
                  <span className="clusterStack"><i /><i /><i /></span>
                  <strong>+{node.count}</strong>
                  <small>{expandedClusters.has(node.id) ? '접기' : '펼치기'}</small>
                </button>
              ) : (
                <button
                  key={node.id}
                  type="button"
                  className={`personNode status-${node.status?.toLowerCase()} ${selectedNode ? 'selected' : ''} ${onTrace ? 'onTrace' : ''} ${node.joinedThisRound ? 'newThisRound' : ''}`}
                  style={{ left: node.x, top: node.y }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSelectedId(node.sourceId ?? ROOT_ID)}
                  onDoubleClick={() => centerPerson(node.sourceId ?? ROOT_ID)}
                >
                  <span className="nodeDot">{node.sourceId === ROOT_ID ? 'V' : ''}</span>
                  <span className="nodeLabel">
                    <strong>{node.sourceId === ROOT_ID ? 'YOU' : node.wallet}</strong>
                    <small>{node.count} network</small>
                  </span>
                </button>
              );
            })}
          </div>

          {scenario === 'empty' ? (
            <div className="emptyState">
              <span className="emptyDot">V</span>
              <strong>Your network starts here</strong>
              <small>첫 사용자가 연결되면 이 공간에서 네트워크가 뻗어나가요.</small>
            </div>
          ) : null}

          <div className="gestureHint">드래그 이동 · 휠/핀치 확대</div>
        </div>

        <aside className="inspector">
          <div className="inspectorHandle" />
          <header>
            <div>
              <span>{selected.id === ROOT_ID ? 'YOU' : selected.wallet}</span>
              <small>{selected.id === ROOT_ID ? 'My Network' : label(selected.status)}</small>
            </div>
            {selected.id !== ROOT_ID ? <button onClick={() => setSelectedId(ROOT_ID)}>×</button> : null}
          </header>
          <div className="inspectorMetrics">
            <span><b>{selectedMetrics.network}</b><small>Network</small></span>
            <span><b>{selectedMetrics.direct}</b><small>Direct</small></span>
            <span><b>{selectedMetrics.qualified}</b><small>Qualified</small></span>
            <span><b>+{selectedMetrics.growth}</b><small>Round</small></span>
          </div>
          <div className="inspectorActions">
            <button className="primary" onClick={() => centerPerson(selected.id)}>Center here</button>
            {selected.id !== ROOT_ID ? <button className={trace ? 'active' : ''} onClick={() => setTrace((v) => !v)}>Trace to Me</button> : null}
          </div>
        </aside>
      </section>

      <div className="reviewNote">
        <span>PREVIEW CHECK</span>
        <p>노드 박스가 아니라 <b>공간·연결선·가지</b>가 주인공인지, 확대/축소했을 때 정보량이 자연스럽게 바뀌는지, `+N` 묶음과 Center 이동이 직관적인지 확인해 주세요.</p>
      </div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#070706;color:#f4f1e8}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}
      `}</style>
      <style jsx>{`
        .v2PreviewPage{min-height:100vh;padding:14px 14px 34px;box-sizing:border-box;background:radial-gradient(circle at 50% -80px,rgba(244,183,40,.055),transparent 360px),#070706}.qaBar{width:min(100%,1380px);min-height:42px;margin:0 auto 10px;padding:7px 9px 7px 12px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.055);border-radius:13px;background:rgba(255,255,255,.018)}.qaBar>div:first-child{display:flex;align-items:baseline;gap:9px;min-width:0}.qaBar strong{color:#d4aa43;font-size:10px}.qaBar span{color:#646159;font-size:9px}.scenarioTabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.scenarioTabs button{flex:0 0 auto;height:28px;padding:0 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:#706c64;font-size:9px;font-weight:800;cursor:pointer}.scenarioTabs button.active{border-color:rgba(244,183,40,.15);background:rgba(244,183,40,.065);color:#d0a746}.canvasShell{position:relative;width:min(100%,1380px);height:clamp(620px,80vh,900px);margin:0 auto;overflow:hidden;border:1px solid rgba(244,183,40,.12);border-radius:24px;background:radial-gradient(circle at 50% 18%,rgba(139,94,29,.045),transparent 30%),#090908;box-shadow:0 24px 70px rgba(0,0,0,.32)}.canvasShell::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.035) .7px,transparent .7px);background-size:34px 34px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,.14) 70%,transparent)}.canvasTopLeft{position:absolute;z-index:20;top:18px;left:20px;max-width:54%;pointer-events:none}.networkTitle{display:block;color:#c89d37;font-size:9px;font-weight:950;letter-spacing:.13em}.breadcrumbs{margin-top:7px;display:flex;align-items:center;gap:3px;overflow:hidden}.breadcrumbs span{display:flex;align-items:center;min-width:0}.breadcrumbs i{color:#49463f;font-style:normal;font-size:10px}.breadcrumbs button{max-width:122px;padding:2px 4px;border:0;background:transparent;color:#6c6861;font-size:9px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;pointer-events:auto}.breadcrumbs button.current{color:#c7c0b2}.summaryOverlay{position:absolute;z-index:20;top:15px;right:18px;display:flex;align-items:center;gap:5px;padding:5px;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(8,8,7,.72);backdrop-filter:blur(12px)}.summaryOverlay span,.summaryOverlay button{height:28px;padding:0 8px;display:flex;align-items:center;gap:4px;border:0;border-radius:8px;background:transparent;color:#6e6a63;font-size:8px;font-weight:750;white-space:nowrap}.summaryOverlay b{color:#c9c3b7;font-size:10px}.summaryOverlay button{cursor:pointer}.summaryOverlay button.active{background:rgba(244,183,40,.08);color:#a98232}.summaryOverlay button.active b{color:#e0b64e}.viewport{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:grab}.viewport:active{cursor:grabbing}.plane{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.plane.animating{transition:transform .36s cubic-bezier(.22,.8,.28,1)}.edges{position:absolute;inset:0;overflow:visible}.edges path{fill:none;stroke:rgba(207,190,154,.18);stroke-width:1.1;vector-effect:non-scaling-stroke;transition:opacity .2s ease,stroke .2s ease,stroke-width .2s ease}.growthMode .edges path{opacity:.12}.growthMode .edges path.growthEdge{opacity:1;stroke:rgba(224,174,49,.62);stroke-width:1.35}.traceMode .edges path{opacity:.08}.traceMode .edges path.traceEdge{opacity:1;stroke:rgba(238,194,82,.82);stroke-width:1.7}.personNode,.clusterNode{position:absolute;transform:translate(-50%,-50%);z-index:3;border:0;background:transparent;color:#d8d3c9;cursor:pointer;touch-action:none}.personNode{width:112px;height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center}.nodeDot{width:24px;height:24px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:#11110f;color:#b8b2a7;font-size:8px;font-weight:950;box-shadow:0 0 0 5px rgba(255,255,255,.018);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}.personNode.status-qualified .nodeDot{border-color:rgba(82,198,142,.3)}.personNode.status-rewarded .nodeDot{border-color:rgba(224,177,57,.34)}.personNode.selected .nodeDot{transform:scale(1.16);border-color:rgba(244,190,54,.8);background:#18140c;box-shadow:0 0 0 7px rgba(244,183,40,.065),0 0 28px rgba(244,183,40,.13)}.personNode.onTrace .nodeDot{border-color:rgba(244,192,65,.58)}.nodeLabel{margin-top:6px;text-align:center;transition:opacity .16s ease}.nodeLabel strong{display:block;max-width:104px;color:#cfc9bd;font-size:8px;font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nodeLabel small{display:block;margin-top:2px;color:#55524d;font-size:7px;font-weight:700}.personNode.newThisRound::after{content:'';position:absolute;top:18px;right:34px;width:4px;height:4px;border-radius:50%;background:#e4b33d;box-shadow:0 0 9px rgba(228,179,61,.55)}.growthMode .personNode{opacity:.32}.growthMode .personNode.newThisRound,.growthMode .personNode.selected{opacity:1}.traceMode .personNode{opacity:.22}.traceMode .personNode.onTrace,.traceMode .personNode.selected{opacity:1}.clusterNode{width:82px;height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center}.clusterStack{position:relative;width:28px;height:24px}.clusterStack i{position:absolute;left:50%;width:22px;height:22px;transform:translateX(-50%);border:1px dashed rgba(204,190,158,.24);border-radius:50%;background:rgba(16,15,12,.92)}.clusterStack i:nth-child(1){top:-5px;opacity:.35}.clusterStack i:nth-child(2){top:-2px;opacity:.6}.clusterStack i:nth-child(3){top:1px}.clusterNode strong{margin-top:2px;color:#c5b47d;font-size:9px}.clusterNode small{margin-top:2px;color:#57534d;font-size:6px}.clusterNode.hasGrowth strong{color:#d7ab3f}.clusterNode.expanded .clusterStack i{border-style:solid;border-color:rgba(218,177,68,.3)}.detail-overview .personNode{width:46px;height:46px}.detail-overview .nodeDot{width:12px;height:12px;border-width:1px}.detail-overview .nodeLabel{opacity:0;pointer-events:none}.detail-overview .personNode.newThisRound::after{top:12px;right:13px;width:3px;height:3px}.detail-overview .clusterNode{transform:translate(-50%,-50%) scale(.82)}.detail-mid .nodeLabel small{display:none}.floatingControls{position:absolute;z-index:25;display:flex;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(9,9,8,.8);backdrop-filter:blur(14px);overflow:hidden}.leftControls{left:17px;bottom:18px}.zoomControls{right:17px;bottom:18px}.floatingControls button{height:38px;min-width:38px;padding:0 10px;display:flex;align-items:center;justify-content:center;gap:5px;border:0;border-left:1px solid rgba(255,255,255,.045);background:transparent;color:#77736b;font-size:13px;cursor:pointer}.floatingControls button:first-child{border-left:0}.floatingControls button:hover,.floatingControls button.active{background:rgba(255,255,255,.035);color:#c8c1b4}.floatingControls span{font-size:8px;font-weight:800}.searchPanel{position:absolute;z-index:30;left:50%;top:15px;width:min(360px,calc(100% - 40px));transform:translateX(-50%);border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(9,9,8,.94);box-shadow:0 16px 44px rgba(0,0,0,.34);backdrop-filter:blur(16px);overflow:hidden}.searchField{height:42px;padding:0 11px;display:flex;align-items:center;gap:8px}.searchField>span{color:#656159}.searchField input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#ded8cc;font-size:10px}.searchField button{width:26px;height:26px;border:0;border-radius:50%;background:rgba(255,255,255,.035);color:#69655e;cursor:pointer}.searchResults{padding:0 7px 7px}.searchResults>button{width:100%;height:38px;padding:0 7px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;border:0;border-top:1px solid rgba(255,255,255,.04);background:transparent;color:#bdb6aa;text-align:left;cursor:pointer}.searchResults>button span{font-size:9px}.searchResults>button small,.searchResults>small{color:#625e58;font-size:8px}.searchResults>button i{font-style:normal;color:#5c5851}.searchResults>small{display:block;padding:10px}.inspector{position:absolute;z-index:24;left:18px;bottom:68px;width:250px;padding:14px;box-sizing:border-box;border:1px solid rgba(244,183,40,.11);border-radius:16px;background:rgba(10,10,9,.88);box-shadow:0 18px 45px rgba(0,0,0,.3);backdrop-filter:blur(16px)}.inspectorHandle{display:none}.inspector header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.inspector header span{display:block;color:#ddd7cb;font-size:10px;font-weight:850}.inspector header small{display:block;margin-top:3px;color:#6b675f;font-size:8px}.inspector header>button{width:25px;height:25px;border:0;border-radius:50%;background:rgba(255,255,255,.035);color:#6b675f;cursor:pointer}.inspectorMetrics{margin-top:12px;padding:10px 0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045)}.inspectorMetrics span{padding:0 5px;border-left:1px solid rgba(255,255,255,.04)}.inspectorMetrics span:first-child{border-left:0;padding-left:0}.inspectorMetrics b{display:block;color:#cfc8bc;font-size:10px}.inspectorMetrics small{display:block;margin-top:2px;color:#55514b;font-size:6px}.inspectorActions{margin-top:10px;display:flex;gap:6px}.inspectorActions button{height:30px;flex:1;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.025);color:#817b71;font-size:8px;font-weight:850;cursor:pointer}.inspectorActions button.primary{border-color:rgba(244,183,40,.17);background:rgba(244,183,40,.065);color:#c9a13d}.inspectorActions button.active{color:#d9b24c;border-color:rgba(244,183,40,.2)}.gestureHint{position:absolute;z-index:10;left:50%;bottom:19px;transform:translateX(-50%);color:#3f3d39;font-size:7px;pointer-events:none}.emptyState{position:absolute;z-index:12;left:50%;top:46%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none}.emptyDot{width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.4);border-radius:50%;background:#14120d;color:#d4a83e;font-size:9px;font-weight:950}.emptyState strong{margin-top:12px;color:#c5beb2;font-size:11px}.emptyState small{max-width:260px;margin-top:5px;color:#5e5a53;font-size:8px;line-height:1.5}.reviewNote{width:min(100%,1380px);margin:10px auto 0;padding:10px 12px;box-sizing:border-box;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.045);border-radius:12px;background:rgba(255,255,255,.014)}.reviewNote span{flex:0 0 auto;color:#a8812f;font-size:8px;font-weight:950;letter-spacing:.1em}.reviewNote p{margin:0;color:#66625b;font-size:9px;line-height:1.5}.reviewNote b{color:#918a7d}@media (max-width:760px){.v2PreviewPage{padding:8px 8px 24px}.qaBar{align-items:flex-start;flex-direction:column;padding:9px}.qaBar>div:first-child{width:100%;justify-content:space-between}.scenarioTabs{width:100%}.canvasShell{height:78vh;min-height:580px;border-radius:19px}.canvasTopLeft{top:14px;left:14px;max-width:62%}.summaryOverlay{top:auto;right:12px;bottom:66px;flex-direction:column;align-items:stretch;padding:4px}.summaryOverlay span,.summaryOverlay button{height:24px;justify-content:flex-start;padding:0 6px}.summaryOverlay span:nth-child(2){display:none}.leftControls{left:12px;bottom:14px}.zoomControls{right:12px;bottom:14px}.floatingControls button{height:36px;min-width:36px;padding:0 9px}.floatingControls span{display:none}.inspector{left:8px;right:8px;bottom:58px;width:auto;padding:9px 12px 12px;border-radius:16px}.inspectorHandle{display:block;width:28px;height:3px;margin:0 auto 8px;border-radius:999px;background:#3a3732}.inspectorMetrics{margin-top:8px;padding:8px 0}.inspectorActions{margin-top:8px}.gestureHint{display:none}.searchPanel{top:56px}.reviewNote{align-items:flex-start;flex-direction:column;gap:4px}.breadcrumbs button{max-width:86px}.personNode{width:104px}.nodeLabel strong{max-width:96px}}@media (prefers-reduced-motion:reduce){.plane.animating{transition:none}.nodeDot,.edges path{transition:none}}
      `}</style>
    </main>
  );
}
