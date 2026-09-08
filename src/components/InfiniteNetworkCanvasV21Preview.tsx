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

type NodeStats = {
  network: number;
  direct: number;
  qualified: number;
  growth: number;
};

type PositionedPerson = NetworkNode & {
  x: number;
  y: number;
  depth: number;
  width: number;
};

type VisualItem = {
  key: string;
  kind: 'person' | 'cluster';
  parentKey: string | null;
  sourceId: string | null;
  x: number;
  y: number;
  wallet: string;
  status: Status | null;
  count: number;
  direct: number;
  qualified: number;
  growth: number;
  joinedThisRound: boolean;
  memberIds: string[];
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const ROOT_ID = 'you';
const H_SPACING = 118;
const V_SPACING = 142;
const PAD = 320;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.25;

function wallet(index: number) {
  const value = index.toString(16).padStart(8, '0');
  return `0x${value.slice(0, 4)}…${value.slice(-4)}`;
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
  const branch = (id: string, direct: number, depth: number): NetworkNode => {
    const node = leaf(n++, id);
    if (depth <= 0) return node;
    node.children = Array.from({ length: direct }, (_, i) => {
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
    return node;
  };

  return {
    id: ROOT_ID,
    wallet: 'YOU',
    status: 'REWARDED',
    joinedThisRound: false,
    children: [
      branch('a', 6, 3),
      branch('b', 4, 3),
      branch('c', 7, 2),
      branch('d', 3, 2),
      branch('e', 5, 2),
    ],
  };
}

function buildWide(): NetworkNode {
  let n = 300;
  const children = Array.from({ length: 100 }, (_, i) => {
    const child = leaf(n++, `w-${i + 1}`);
    if (i < 16) {
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
    if (i % 7 === 0) child.children.push(leaf(900 + i, `side-${i}`));
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

function flatten(root: NetworkNode): NetworkNode[] {
  const result: NetworkNode[] = [];
  const visit = (node: NetworkNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

function findPath(root: NetworkNode, target: string, trail: NetworkNode[] = []): NetworkNode[] | null {
  const next = [...trail, root];
  if (root.id === target) return next;
  for (const child of root.children) {
    const found = findPath(child, target, next);
    if (found) return found;
  }
  return null;
}

function computeStats(root: NetworkNode) {
  const map = new Map<string, NodeStats>();
  const visit = (node: NetworkNode): NodeStats => {
    let network = 0;
    let qualified = 0;
    let growth = 0;
    for (const child of node.children) {
      const childStats = visit(child);
      network += 1 + childStats.network;
      qualified += (child.status === 'IN_PROGRESS' ? 0 : 1) + childStats.qualified;
      growth += (child.joinedThisRound ? 1 : 0) + childStats.growth;
    }
    const stats = { network, direct: node.children.length, qualified, growth };
    map.set(node.id, stats);
    return stats;
  };
  visit(root);
  return map;
}

function layoutPeople(root: NetworkNode) {
  const widths = new Map<string, number>();
  const measure = (node: NetworkNode): number => {
    if (!node.children.length) {
      widths.set(node.id, H_SPACING);
      return H_SPACING;
    }
    const width = Math.max(H_SPACING, node.children.reduce((sum, child) => sum + measure(child), 0));
    widths.set(node.id, width);
    return width;
  };
  measure(root);

  const raw: PositionedPerson[] = [];
  const place = (node: NetworkNode, left: number, depth: number) => {
    const width = widths.get(node.id) ?? H_SPACING;
    raw.push({ ...node, x: left + width / 2, y: depth * V_SPACING, depth, width });
    let cursor = left;
    for (const child of node.children) {
      place(child, cursor, depth + 1);
      cursor += widths.get(child.id) ?? H_SPACING;
    }
  };
  place(root, 0, 0);

  const minX = Math.min(...raw.map((n) => n.x)) - PAD;
  const maxX = Math.max(...raw.map((n) => n.x)) + PAD;
  const minY = -PAD / 2;
  const maxY = Math.max(...raw.map((n) => n.y)) + PAD;
  const people = raw.map((node) => ({ ...node, x: node.x - minX, y: node.y - minY }));
  const byId = new Map(people.map((node) => [node.id, node]));
  const rootNode = byId.get(root.id)!;
  return {
    people,
    byId,
    width: Math.max(1200, maxX - minX),
    height: Math.max(820, maxY - minY),
    rootX: rootNode.x,
    rootY: rootNode.y,
  };
}

function scaleRules(scale: number) {
  if (scale < 0.38) return { groupSize: 20, maxDepth: 1, level: 'overview' as const };
  if (scale < 0.62) return { groupSize: 10, maxDepth: 2, level: 'overview' as const };
  if (scale < 0.88) return { groupSize: 6, maxDepth: 3, level: 'mid' as const };
  if (scale < 1.16) return { groupSize: 3, maxDepth: 5, level: 'mid' as const };
  return { groupSize: 1, maxDepth: 60, level: 'detail' as const };
}

function aggregate(ids: string[], nodeById: Map<string, NetworkNode>, stats: Map<string, NodeStats>) {
  let count = 0;
  let qualified = 0;
  let growth = 0;
  for (const id of ids) {
    const node = nodeById.get(id);
    const s = stats.get(id);
    if (!node || !s) continue;
    count += 1 + s.network;
    qualified += (node.status === 'IN_PROGRESS' ? 0 : 1) + s.qualified;
    growth += (node.joinedThisRound ? 1 : 0) + s.growth;
  }
  return { count, qualified, growth };
}

function buildVisualItems(
  root: NetworkNode,
  positioned: Map<string, PositionedPerson>,
  nodeById: Map<string, NetworkNode>,
  stats: Map<string, NodeStats>,
  scale: number,
): VisualItem[] {
  const { groupSize, maxDepth } = scaleRules(scale);
  const items: VisualItem[] = [];

  const personItem = (node: NetworkNode, parentKey: string | null): VisualItem => {
    const pos = positioned.get(node.id)!;
    const s = stats.get(node.id)!;
    return {
      key: node.id,
      kind: 'person',
      parentKey,
      sourceId: node.id,
      x: pos.x,
      y: pos.y,
      wallet: node.wallet,
      status: node.status,
      count: s.network,
      direct: s.direct,
      qualified: s.qualified,
      growth: s.growth,
      joinedThisRound: node.joinedThisRound,
      memberIds: [node.id],
    };
  };

  const visit = (node: NetworkNode, parentKey: string | null, depth: number) => {
    items.push(personItem(node, parentKey));
    if (!node.children.length) return;

    const createCluster = (members: NetworkNode[], suffix: string) => {
      const positions = members.map((member) => positioned.get(member.id)).filter(Boolean) as PositionedPerson[];
      if (!positions.length) return;
      const ids = members.map((member) => member.id);
      const a = aggregate(ids, nodeById, stats);
      items.push({
        key: `cluster-${node.id}-${suffix}`,
        kind: 'cluster',
        parentKey: node.id,
        sourceId: null,
        x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
        y: positions[0].y,
        wallet: '',
        status: null,
        count: a.count,
        direct: members.length,
        qualified: a.qualified,
        growth: a.growth,
        joinedThisRound: a.growth > 0,
        memberIds: ids,
      });
    };

    if (depth >= maxDepth) {
      createCluster(node.children, 'depth');
      return;
    }

    if (groupSize > 1 && node.children.length > groupSize) {
      for (let start = 0; start < node.children.length; start += groupSize) {
        const group = node.children.slice(start, start + groupSize);
        if (group.length === 1) visit(group[0], node.id, depth + 1);
        else createCluster(group, String(start));
      }
      return;
    }

    node.children.forEach((child) => visit(child, node.id, depth + 1));
  };

  visit(root, null, 0);
  return items;
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

function statusLabel(status: Status) {
  if (status === 'QUALIFIED') return '미션 완료';
  if (status === 'REWARDED') return '보상 완료';
  return '진행 중';
}

export function InfiniteNetworkCanvasV21Preview() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const movedRef = useRef(false);

  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusBranchId, setFocusBranchId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.72 });
  const [growthMode, setGrowthMode] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [animating, setAnimating] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const allPeople = useMemo(() => flatten(root), [root]);
  const nodeById = useMemo(() => new Map(allPeople.map((node) => [node.id, node])), [allPeople]);
  const stats = useMemo(() => computeStats(root), [root]);
  const layout = useMemo(() => layoutPeople(root), [root]);
  const visualItems = useMemo(
    () => buildVisualItems(root, layout.byId, nodeById, stats, view.scale),
    [root, layout.byId, nodeById, stats, view.scale],
  );
  const visualByKey = useMemo(() => new Map(visualItems.map((item) => [item.key, item])), [visualItems]);
  const rules = scaleRules(view.scale);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const selectedStats = selected ? stats.get(selected.id) ?? null : null;
  const selectedPath = selected ? findPath(root, selected.id) ?? [root] : [root];
  const traceIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);
  const focusIds = useMemo(() => {
    if (!focusBranchId) return new Set<string>();
    const focus = nodeById.get(focusBranchId);
    if (!focus) return new Set<string>();
    const ids = new Set(flatten(focus).map((node) => node.id));
    const path = findPath(root, focus.id) ?? [];
    path.forEach((node) => ids.add(node.id));
    return ids;
  }, [focusBranchId, nodeById, root]);
  const rootStats = stats.get(ROOT_ID)!;

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allPeople.filter((node) => node.id !== ROOT_ID && (node.wallet.toLowerCase().includes(q) || node.id.toLowerCase().includes(q))).slice(0, 7);
  }, [allPeople, search]);

  const animateTo = useCallback((x: number, y: number, scale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
    setAnimating(true);
    setView({
      scale: nextScale,
      x: rect.width / 2 - x * nextScale,
      y: rect.height * 0.45 - y * nextScale,
    });
    window.setTimeout(() => setAnimating(false), 360);
  }, []);

  const fitOverview = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = clamp(
      Math.min((rect.width - 60) / layout.width, (rect.height - 90) / layout.height) * 1.55,
      MIN_SCALE,
      0.72,
    );
    setFocusBranchId(null);
    setAnimating(true);
    setView({
      scale,
      x: rect.width / 2 - layout.rootX * scale,
      y: 78 - layout.rootY * scale,
    });
    window.setTimeout(() => setAnimating(false), 360);
  }, [layout.height, layout.rootX, layout.rootY, layout.width]);

  const revealPerson = useCallback((id: string, focusBranch = false) => {
    const person = layout.byId.get(id);
    if (!person) return;
    setSelectedId(id);
    if (focusBranch && id !== ROOT_ID) setFocusBranchId(id);
    animateTo(person.x, person.y, Math.max(1.22, view.scale));
  }, [animateTo, layout.byId, view.scale]);

  const zoomCluster = useCallback((item: VisualItem) => {
    const positions = item.memberIds.map((id) => layout.byId.get(id)).filter(Boolean) as PositionedPerson[];
    if (!positions.length) return;
    const x = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
    const y = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    const nextScale = view.scale < 0.38 ? 0.62 : view.scale < 0.62 ? 0.9 : view.scale < 0.9 ? 1.2 : 1.45;
    animateTo(x, y, nextScale);
  }, [animateTo, layout.byId, view.scale]);

  useEffect(() => {
    setSelectedId(null);
    setFocusBranchId(null);
    setGrowthMode(false);
    setTraceMode(false);
    setSearch('');
    window.setTimeout(fitOverview, 0);
  }, [scenario, fitOverview]);

  useEffect(() => {
    const onResize = () => fitOverview();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitOverview]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const firstPointer = pointersRef.current.size === 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    if (firstPointer) movedRef.current = false;
    setHintVisible(false);

    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
      return;
    }

    const [a, b] = [...pointersRef.current.values()];
    if (a && b) {
      movedRef.current = true;
      lastPinchRef.current = { center: midpoint(a, b), distance: Math.max(1, distance(a, b)) };
      lastSingleRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
      const previous = lastSingleRef.current;
      if (previous) {
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
        setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }
      lastSingleRef.current = point;
      return;
    }

    movedRef.current = true;
    const [a, b] = [...pointersRef.current.values()];
    const previousPinch = lastPinchRef.current;
    if (!a || !b || !previousPinch) return;
    const center = midpoint(a, b);
    const nextDistance = Math.max(1, distance(a, b));
    const ratio = nextDistance / previousPinch.distance;
    setView((current) => {
      const nextScale = clamp(current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const worldX = (previousPinch.center.x - current.x) / current.scale;
      const worldY = (previousPinch.center.y - current.y) / current.scale;
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
    setHintVisible(false);
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

  const scenarioLabel: Record<Scenario, string> = {
    balanced: '일반 네트워크',
    wide: '직접 100명',
    deep: '50세대 깊이',
    empty: '0명',
  };

  return (
    <main className="previewPage">
      <div className="qaBar">
        <div><strong>Infinite Network v2.1</strong><span>샘플 데이터 · 실제 앱과 분리</span></div>
        <div className="scenarioTabs">
          {(Object.keys(scenarioLabel) as Scenario[]).map((key) => (
            <button key={key} className={scenario === key ? 'active' : ''} onClick={() => setScenario(key)}>{scenarioLabel[key]}</button>
          ))}
        </div>
      </div>

      <section className={`canvas level-${rules.level} ${growthMode ? 'growthMode' : ''} ${traceMode ? 'traceMode' : ''} ${focusBranchId ? 'focusMode' : ''}`}>
        <div className="topLeft">
          <strong>My Network</strong>
          <nav aria-label="Current network path">
            {(selected ? selectedPath : [root]).slice(-4).map((node, index, list) => (
              <span key={node.id}>
                {index > 0 ? <i>›</i> : null}
                <button onClick={() => revealPerson(node.id)} className={index === list.length - 1 ? 'current' : ''}>{node.id === ROOT_ID ? 'YOU' : node.wallet}</button>
              </span>
            ))}
          </nav>
        </div>

        <button className={`summary ${growthMode ? 'active' : ''}`} onClick={() => setGrowthMode((value) => !value)}>
          <span><b>{rootStats.network.toLocaleString()}</b> Network</span>
          <i>·</i>
          <span className="round"><b>+{rootStats.growth.toLocaleString()}</b> Round</span>
        </button>

        <div className="controls">
          <button onClick={() => { setFocusBranchId(null); setSelectedId(null); revealPerson(ROOT_ID); }} title="내 위치"><b>◎</b><span>Me</span></button>
          <button className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen((value) => !value)} title="검색"><b>⌕</b><span>Search</span></button>
          <button onClick={() => { setSelectedId(null); setFocusBranchId(null); fitOverview(); }} title="전체 보기"><b>⌂</b><span>Overview</span></button>
        </div>

        <div className="zoomControls">
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 1.18);
          }}>+</button>
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 0.84);
          }}>−</button>
        </div>

        {searchOpen ? (
          <div className="searchPanel">
            <div className="searchField">
              <span>⌕</span>
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="내 네트워크에서 지갑 검색" />
              {search ? <button onClick={() => setSearch('')}>×</button> : null}
            </div>
            {search.trim().length >= 2 ? (
              <div className="results">
                {searchResults.length ? searchResults.map((node) => (
                  <button key={node.id} onClick={() => {
                    setSearchOpen(false);
                    setSearch('');
                    setSelectedId(node.id);
                    const person = layout.byId.get(node.id);
                    if (person) animateTo(person.x, person.y, 1.34);
                  }}>
                    <span>{node.wallet}</span><small>{statusLabel(node.status)}</small><i>›</i>
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
          <div className={`plane ${animating ? 'animating' : ''}`} style={{ width: layout.width, height: layout.height, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true">
              {visualItems.map((item) => {
                if (!item.parentKey) return null;
                const parent = visualByKey.get(item.parentKey);
                if (!parent) return null;
                const onTrace = item.kind === 'person' && parent.kind === 'person' && traceIds.has(item.sourceId ?? '') && traceIds.has(parent.sourceId ?? '');
                const growth = item.growth > 0 || item.joinedThisRound;
                const focused = !focusBranchId || (
                  (item.kind === 'person' && focusIds.has(item.sourceId ?? '')) ||
                  (item.kind === 'cluster' && item.memberIds.some((id) => focusIds.has(id)))
                );
                const bend = (parent.y + item.y) / 2;
                return <path key={`${parent.key}-${item.key}`} d={`M ${parent.x} ${parent.y + 12} C ${parent.x} ${bend}, ${item.x} ${bend}, ${item.x} ${item.y - 12}`} className={`${onTrace ? 'trace' : ''} ${growth ? 'growth' : ''} ${focused ? '' : 'dim'}`} />;
              })}
            </svg>

            {visualItems.map((item) => {
              const selectedNode = item.kind === 'person' && item.sourceId === selectedId;
              const onTrace = item.kind === 'person' && traceIds.has(item.sourceId ?? '');
              const focused = !focusBranchId || (
                (item.kind === 'person' && focusIds.has(item.sourceId ?? '')) ||
                (item.kind === 'cluster' && item.memberIds.some((id) => focusIds.has(id)))
              );

              if (item.kind === 'cluster') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`cluster ${item.growth ? 'hasGrowth' : ''} ${focused ? '' : 'dim'}`}
                    style={{ left: item.x, top: item.y }}
                    onClick={() => { if (!movedRef.current) zoomCluster(item); }}
                    aria-label={`${item.count}명 묶음 확대`}
                  >
                    <span><i /><i /><i /></span>
                    <strong>+{item.count}</strong>
                  </button>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`person status-${item.status?.toLowerCase()} ${selectedNode ? 'selected' : ''} ${onTrace ? 'onTrace' : ''} ${item.joinedThisRound ? 'newRound' : ''} ${focused ? '' : 'dim'}`}
                  style={{ left: item.x, top: item.y }}
                  onClick={() => { if (!movedRef.current) setSelectedId(item.sourceId); }}
                  onDoubleClick={() => { if (item.sourceId) revealPerson(item.sourceId, true); }}
                >
                  <span className="dot">{item.sourceId === ROOT_ID ? 'V' : ''}</span>
                  <span className="label">
                    <strong>{item.sourceId === ROOT_ID ? 'YOU' : item.wallet}</strong>
                    <small>{item.count} network</small>
                  </span>
                </button>
              );
            })}
          </div>

          {scenario === 'empty' ? (
            <div className="emptyState">
              <span>V</span>
              <strong>Your network starts here</strong>
              <small>첫 사용자가 연결되면 이 공간에서 네트워크가 뻗어나가요.</small>
            </div>
          ) : null}

          {hintVisible ? <div className="hint">드래그해서 둘러보기 · 휠/핀치로 확대</div> : null}
        </div>

        {selected && selectedStats ? (
          <aside className="inspector">
            <div className="handle" />
            <header>
              <div><strong>{selected.id === ROOT_ID ? 'YOU' : selected.wallet}</strong><small>{selected.id === ROOT_ID ? 'My Network' : statusLabel(selected.status)}</small></div>
              <button onClick={() => { setSelectedId(null); setTraceMode(false); }}>×</button>
            </header>
            <div className="metrics">
              <span><b>{selectedStats.network}</b><small>Network</small></span>
              <span><b>{selectedStats.direct}</b><small>Direct</small></span>
              <span><b>{selectedStats.qualified}</b><small>Qualified</small></span>
              <span><b>+{selectedStats.growth}</b><small>Round</small></span>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => revealPerson(selected.id, selected.id !== ROOT_ID)}>Center</button>
              {selected.id !== ROOT_ID ? <button className={traceMode ? 'active' : ''} onClick={() => setTraceMode((value) => !value)}>연결 경로 보기</button> : null}
            </div>
          </aside>
        ) : null}
      </section>

      <div className="reviewNote">
        <span>V2.1 REVIEW</span>
        <p>기본 화면은 최대한 비웠고, <b>노드를 선택했을 때만 상세 패널</b>이 나타납니다. `+N`은 펼치기 버튼이 아니라 탭하면 해당 공간으로 확대되며 줌 단계에 따라 자동으로 실제 사용자로 분해됩니다.</p>
      </div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#070706;color:#f4f1e8}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}
      `}</style>
      <style jsx>{`
        .previewPage{min-height:100vh;padding:10px 0 24px;background:radial-gradient(circle at 50% -100px,rgba(244,183,40,.045),transparent 380px),#070706}.qaBar{width:min(calc(100% - 24px),1380px);min-height:38px;margin:0 auto 6px;padding:6px 8px 6px 10px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:rgba(255,255,255,.012)}.qaBar>div:first-child{display:flex;align-items:baseline;gap:8px}.qaBar strong{color:#b99239;font-size:9px}.qaBar span{color:#56534d;font-size:8px}.scenarioTabs{display:flex;gap:3px;overflow-x:auto;scrollbar-width:none}.scenarioTabs button{height:26px;padding:0 8px;flex:0 0 auto;border:1px solid transparent;border-radius:7px;background:transparent;color:#615e57;font-size:8px;font-weight:800;cursor:pointer}.scenarioTabs button.active{border-color:rgba(244,183,40,.12);background:rgba(244,183,40,.05);color:#b99035}.canvas{position:relative;width:min(100%,1440px);height:clamp(640px,84vh,940px);margin:0 auto;overflow:hidden;background:radial-gradient(circle at 50% 16%,rgba(129,87,26,.035),transparent 30%),linear-gradient(#080807,#070706)}.canvas::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background-image:radial-gradient(rgba(255,255,255,.026) .65px,transparent .65px);background-size:38px 38px;mask-image:radial-gradient(circle at 50% 35%,#000 0%,rgba(0,0,0,.35) 45%,transparent 78%)}.canvas::after{content:'';position:absolute;inset:0;z-index:18;pointer-events:none;box-shadow:inset 0 32px 50px -50px rgba(244,183,40,.14),inset 0 -50px 60px -55px #000}.topLeft{position:absolute;z-index:30;top:16px;left:20px;max-width:58%;pointer-events:none}.topLeft>strong{display:block;color:#c6beb0;font-size:12px;letter-spacing:-.02em}.topLeft nav{margin-top:5px;display:flex;align-items:center;gap:2px;overflow:hidden}.topLeft nav span{display:flex;align-items:center;min-width:0}.topLeft nav i{color:#403d38;font-style:normal;font-size:9px}.topLeft nav button{max-width:105px;padding:2px 3px;border:0;background:transparent;color:#5f5b54;font-size:8px;font-weight:760;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;pointer-events:auto}.topLeft nav button.current{color:#938b7c}.summary{position:absolute;z-index:30;top:13px;right:18px;height:34px;padding:0 10px;display:flex;align-items:center;gap:6px;border:0;border-radius:10px;background:rgba(8,8,7,.5);backdrop-filter:blur(10px);color:#716c63;font-size:8px;cursor:pointer}.summary span{white-space:nowrap}.summary b{color:#c5beb2;font-size:10px}.summary>i{color:#3e3b36;font-style:normal}.summary .round b{color:#c79d39}.summary.active{background:rgba(166,121,28,.09)}.viewport{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:grab}.viewport:active{cursor:grabbing}.plane{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.plane.animating{transition:transform .34s cubic-bezier(.22,.8,.28,1)}.edges{position:absolute;inset:0;overflow:visible}.edges path{fill:none;stroke:rgba(206,194,164,.16);stroke-width:1;vector-effect:non-scaling-stroke;transition:opacity .18s,stroke .18s,stroke-width .18s}.edges path.dim{opacity:.07}.growthMode .edges path{opacity:.08}.growthMode .edges path.growth{opacity:1;stroke:rgba(218,171,49,.58);stroke-width:1.35}.traceMode .edges path{opacity:.055}.traceMode .edges path.trace{opacity:1;stroke:rgba(234,192,80,.82);stroke-width:1.65}.person,.cluster{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;background:transparent;touch-action:none;cursor:pointer;transition:opacity .18s}.person{width:108px;height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center}.dot{width:23px;height:23px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.16);border-radius:50%;background:#10100e;color:#aaa397;font-size:7px;font-weight:950;box-shadow:0 0 0 4px rgba(255,255,255,.014);transition:transform .16s,border-color .16s,box-shadow .16s}.person.status-qualified .dot{border-color:rgba(100,190,146,.24)}.person.selected .dot{transform:scale(1.16);border-color:rgba(235,184,58,.8);box-shadow:0 0 0 7px rgba(235,184,58,.055),0 0 22px rgba(235,184,58,.1)}.person.onTrace .dot{border-color:rgba(235,188,72,.5)}.person.newRound::after{content:'';position:absolute;top:17px;right:33px;width:4px;height:4px;border-radius:50%;background:#d5a63a;box-shadow:0 0 8px rgba(213,166,58,.5)}.label{margin-top:5px;text-align:center;transition:opacity .16s}.label strong{display:block;max-width:102px;color:#c8c1b6;font-size:10px;font-weight:820;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.label small{display:block;margin-top:2px;color:#4f4c47;font-size:8px;font-weight:700}.person.dim,.cluster.dim{opacity:.14}.growthMode .person,.growthMode .cluster{opacity:.2}.growthMode .person.newRound,.growthMode .person.selected,.growthMode .cluster.hasGrowth{opacity:1}.traceMode .person,.traceMode .cluster{opacity:.14}.traceMode .person.onTrace,.traceMode .person.selected{opacity:1}.cluster{width:70px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center}.cluster>span{position:relative;width:26px;height:20px}.cluster>span i{position:absolute;left:50%;width:19px;height:19px;transform:translateX(-50%);border:1px solid rgba(203,190,155,.22);border-radius:50%;background:#0e0e0c}.cluster>span i:nth-child(1){top:-4px;opacity:.28}.cluster>span i:nth-child(2){top:-1px;opacity:.55}.cluster>span i:nth-child(3){top:2px}.cluster strong{margin-top:2px;color:#b5a46e;font-size:9px}.cluster.hasGrowth strong{color:#c99d37}.level-overview .person{width:42px;height:42px}.level-overview .dot{width:11px;height:11px}.level-overview .label{opacity:0;pointer-events:none}.level-overview .person.newRound::after{top:10px;right:11px;width:3px;height:3px}.level-overview .cluster{transform:translate(-50%,-50%) scale(.9)}.level-mid .label small{display:none}.controls,.zoomControls{position:absolute;z-index:32;bottom:16px;display:flex;overflow:hidden;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(8,8,7,.58);backdrop-filter:blur(10px)}.controls{left:18px}.zoomControls{right:18px}.controls button,.zoomControls button{height:36px;min-width:36px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border:0;border-left:1px solid rgba(255,255,255,.035);background:transparent;color:#6b675f;cursor:pointer}.controls button:first-child,.zoomControls button:first-child{border-left:0}.controls button.active,.controls button:hover,.zoomControls button:hover{background:rgba(255,255,255,.025);color:#aaa296}.controls b{font-size:12px;font-weight:500}.controls span{font-size:8px;font-weight:800}.searchPanel{position:absolute;z-index:40;top:54px;left:50%;width:min(350px,calc(100% - 28px));transform:translateX(-50%);border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(8,8,7,.94);box-shadow:0 14px 38px rgba(0,0,0,.32);backdrop-filter:blur(15px);overflow:hidden}.searchField{height:42px;padding:0 10px;display:flex;align-items:center;gap:8px}.searchField>span{color:#5e5a53}.searchField input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#d5cfc4;font-size:10px}.searchField button{width:25px;height:25px;border:0;border-radius:50%;background:rgba(255,255,255,.03);color:#625e57;cursor:pointer}.results{padding:0 6px 6px}.results>button{width:100%;height:38px;padding:0 6px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;border:0;border-top:1px solid rgba(255,255,255,.035);background:transparent;color:#b8b1a5;text-align:left;cursor:pointer}.results span{font-size:9px}.results small{color:#5e5a53;font-size:8px}.results i{color:#57534d;font-style:normal}.results>small{display:block;padding:10px}.inspector{position:absolute;z-index:36;left:18px;bottom:64px;width:248px;padding:12px;box-sizing:border-box;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(8,8,7,.82);box-shadow:0 14px 40px rgba(0,0,0,.28);backdrop-filter:blur(14px)}.handle{display:none}.inspector header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.inspector header strong{display:block;color:#d2cbc0;font-size:10px}.inspector header small{display:block;margin-top:3px;color:#5f5b54;font-size:8px}.inspector header>button{width:24px;height:24px;border:0;border-radius:50%;background:rgba(255,255,255,.025);color:#625e57;cursor:pointer}.metrics{margin-top:10px;padding:9px 0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04)}.metrics span{padding:0 5px;border-left:1px solid rgba(255,255,255,.035)}.metrics span:first-child{border-left:0;padding-left:0}.metrics b{display:block;color:#c6bfb4;font-size:10px}.metrics small{display:block;margin-top:2px;color:#4f4c47;font-size:6px}.actions{margin-top:9px;display:flex;gap:5px}.actions button{height:30px;flex:1;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.02);color:#746f66;font-size:8px;font-weight:820;cursor:pointer}.actions button.primary,.actions button.active{border-color:rgba(224,173,47,.14);background:rgba(224,173,47,.05);color:#b58c32}.hint{position:absolute;z-index:20;left:50%;bottom:17px;transform:translateX(-50%);padding:5px 8px;border-radius:999px;background:rgba(8,8,7,.4);color:#55514c;font-size:7px;pointer-events:none}.emptyState{position:absolute;z-index:20;left:50%;top:46%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center}.emptyState>span{width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(220,172,50,.35);border-radius:50%;color:#bf9637;font-size:8px;font-weight:950}.emptyState strong{margin-top:11px;color:#bcb5aa;font-size:11px}.emptyState small{max-width:260px;margin-top:5px;color:#55514b;font-size:8px;line-height:1.5}.reviewNote{width:min(calc(100% - 24px),1380px);margin:7px auto 0;padding:8px 10px;box-sizing:border-box;display:flex;align-items:center;gap:9px;border-top:1px solid rgba(255,255,255,.035);color:#59564f}.reviewNote span{flex:0 0 auto;color:#8f702c;font-size:7px;font-weight:950;letter-spacing:.1em}.reviewNote p{margin:0;font-size:8px;line-height:1.5}.reviewNote b{color:#817b70}@media(max-width:760px){.previewPage{padding-top:6px}.qaBar{width:calc(100% - 12px);align-items:flex-start;flex-direction:column;padding:7px}.qaBar>div:first-child{width:100%;justify-content:space-between}.scenarioTabs{width:100%}.canvas{height:82vh;min-height:600px}.topLeft{top:12px;left:13px;max-width:65%}.summary{top:10px;right:10px;height:30px;padding:0 7px}.summary>i{display:none}.summary span:first-child{display:none}.controls{left:10px;bottom:10px}.zoomControls{display:none}.controls button{height:36px;min-width:38px;padding:0 10px}.controls span{display:none}.searchPanel{top:48px}.inspector{left:7px;right:7px;bottom:54px;width:auto;padding:9px 11px 11px;border-radius:15px}.handle{display:block;width:26px;height:3px;margin:0 auto 7px;border-radius:999px;background:#34312d}.inspector .metrics{margin-top:7px;padding:8px 0}.inspector .actions{margin-top:7px}.hint{bottom:58px}.reviewNote{width:calc(100% - 12px);align-items:flex-start;flex-direction:column;gap:3px}.topLeft nav button{max-width:72px}.label strong{font-size:10px}}
        @media(prefers-reduced-motion:reduce){.plane.animating{transition:none}.dot,.person,.cluster,.edges path{transition:none}}
      `}</style>
    </main>
  );
}
