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
type Node = {
  id: string;
  wallet: string;
  status: Status;
  joinedThisRound: boolean;
  children: Node[];
};
type Stats = { network: number; direct: number; qualified: number; growth: number };
type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };
type SceneItem = {
  key: string;
  kind: 'person' | 'cluster' | 'context';
  sourceId: string | null;
  memberIds: string[];
  x: number;
  y: number;
  wallet: string;
  status: Status | null;
  network: number;
  direct: number;
  qualified: number;
  growth: number;
  joinedThisRound: boolean;
  dim?: boolean;
};
type SceneEdge = {
  key: string;
  from: string;
  to: string;
  dim?: boolean;
  dashed?: boolean;
};

type GroupContext = {
  parentId: string;
  memberIds: string[];
  label: string;
} | null;

const ROOT_ID = 'you';
const PLANE_W = 1200;
const PLANE_H = 720;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.8;

function wallet(index: number) {
  const value = index.toString(16).padStart(8, '0');
  return `0x${value.slice(0, 4)}…${value.slice(-4)}`;
}

function statusFor(index: number): Status {
  if (index % 5 === 0) return 'IN_PROGRESS';
  if (index % 3 === 0) return 'REWARDED';
  return 'QUALIFIED';
}

function leaf(index: number, id: string): Node {
  return {
    id,
    wallet: wallet(index),
    status: statusFor(index),
    joinedThisRound: index % 4 === 0 || index % 7 === 0,
    children: [],
  };
}

function buildBalanced(): Node {
  let n = 20;
  const branch = (id: string, direct: number, depth: number): Node => {
    const node = leaf(n++, id);
    if (depth <= 0) return node;
    node.children = Array.from({ length: direct }, (_, i) => {
      const child = leaf(n++, `${id}-${i + 1}`);
      if (depth > 1 && i < 3) {
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

function buildWide(): Node {
  let n = 300;
  const children = Array.from({ length: 100 }, (_, i) => {
    const child = leaf(n++, `wide-${i + 1}`);
    if (i < 18) {
      child.children = Array.from({ length: 2 + (i % 5) }, (_, j) => {
        const grand = leaf(n++, `${child.id}-${j + 1}`);
        if (j === 0 && i < 8) {
          grand.children = Array.from({ length: 2 + (i % 2) }, (_, k) => leaf(n++, `${grand.id}-${k + 1}`));
        }
        return grand;
      });
    }
    return child;
  });
  return { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children };
}

function buildDeep(): Node {
  const root: Node = { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children: [] };
  let current = root;
  for (let i = 1; i <= 50; i += 1) {
    const child = leaf(650 + i, `deep-${i}`);
    if (i % 8 === 0) child.children.push(leaf(950 + i, `side-${i}`));
    current.children.push(child);
    current = child;
  }
  return root;
}

function scenarioRoot(scenario: Scenario): Node {
  if (scenario === 'wide') return buildWide();
  if (scenario === 'deep') return buildDeep();
  if (scenario === 'empty') {
    return { id: ROOT_ID, wallet: 'YOU', status: 'REWARDED', joinedThisRound: false, children: [] };
  }
  return buildBalanced();
}

function flatten(root: Node): Node[] {
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

function findPath(root: Node, target: string, trail: Node[] = []): Node[] | null {
  const next = [...trail, root];
  if (root.id === target) return next;
  for (const child of root.children) {
    const found = findPath(child, target, next);
    if (found) return found;
  }
  return null;
}

function parentMap(root: Node) {
  const map = new Map<string, string | null>();
  const visit = (node: Node, parent: string | null) => {
    map.set(node.id, parent);
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return map;
}

function aggregate(ids: string[], byId: Map<string, Node>, stats: Map<string, Stats>) {
  let network = 0;
  let qualified = 0;
  let growth = 0;
  for (const id of ids) {
    const node = byId.get(id);
    const s = stats.get(id);
    if (!node || !s) continue;
    network += 1 + s.network;
    qualified += (node.status === 'IN_PROGRESS' ? 0 : 1) + s.qualified;
    growth += (node.joinedThisRound ? 1 : 0) + s.growth;
  }
  return { network, qualified, growth };
}

function chunkStable<T>(items: T[], groups: number) {
  if (items.length <= groups) return items.map((item) => [item]);
  const result: T[][] = [];
  const size = Math.ceil(items.length / groups);
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function sceneFor({
  root,
  focusId,
  group,
  byId,
  stats,
  parents,
  isMobile,
}: {
  root: Node;
  focusId: string;
  group: GroupContext;
  byId: Map<string, Node>;
  stats: Map<string, Stats>;
  parents: Map<string, string | null>;
  isMobile: boolean;
}) {
  const items: SceneItem[] = [];
  const edges: SceneEdge[] = [];
  const childSlots = isMobile ? 5 : 8;
  const focus = byId.get(focusId) ?? root;
  const focusStats = stats.get(focus.id)!;

  const person = (node: Node, key: string, x: number, y: number, kind: SceneItem['kind'] = 'person', dim = false): SceneItem => {
    const s = stats.get(node.id)!;
    return {
      key,
      kind,
      sourceId: node.id,
      memberIds: [node.id],
      x,
      y,
      wallet: node.wallet,
      status: node.status,
      network: s.network,
      direct: s.direct,
      qualified: s.qualified,
      growth: s.growth,
      joinedThisRound: node.joinedThisRound,
      dim,
    };
  };

  const cluster = (parentId: string, members: Node[], index: number, x: number, y: number): SceneItem => {
    const ids = members.map((node) => node.id);
    const a = aggregate(ids, byId, stats);
    return {
      key: `cluster-${parentId}-${index}`,
      kind: 'cluster',
      sourceId: null,
      memberIds: ids,
      x,
      y,
      wallet: '',
      status: null,
      network: a.network,
      direct: members.length,
      qualified: a.qualified,
      growth: a.growth,
      joinedThisRound: a.growth > 0,
    };
  };

  // Parent context: always one small node above when exploring below YOU.
  const parentId = parents.get(focus.id) ?? null;
  if (focus.id !== ROOT_ID && parentId) {
    const parent = byId.get(parentId);
    if (parent) {
      items.push(person(parent, `context-parent-${parent.id}`, 600, 92, 'context', true));
      edges.push({ key: `parent-${focus.id}`, from: `context-parent-${parent.id}`, to: focus.id, dim: true });
    }
  }

  const focusY = focus.id === ROOT_ID ? 150 : 205;
  items.push(person(focus, focus.id, 600, focusY));

  let visibleChildren = focus.children;
  if (group && group.parentId === focus.id) {
    const set = new Set(group.memberIds);
    visibleChildren = focus.children.filter((child) => set.has(child.id));
  }

  if (visibleChildren.length > 0) {
    const groups = chunkStable(visibleChildren, childSlots);
    const gap = isMobile ? 150 : 126;
    const totalWidth = Math.min(1000, Math.max(0, (groups.length - 1) * gap));
    const startX = 600 - totalWidth / 2;
    const childY = focus.id === ROOT_ID ? 390 : 455;

    groups.forEach((members, index) => {
      const x = groups.length === 1 ? 600 : startX + index * (totalWidth / Math.max(1, groups.length - 1));
      if (members.length === 1) {
        const child = members[0];
        const item = person(child, child.id, x, childY);
        items.push(item);
        edges.push({ key: `${focus.id}-${child.id}`, from: focus.id, to: child.id });
      } else {
        const item = cluster(focus.id, members, index, x, childY);
        items.push(item);
        edges.push({ key: `${focus.id}-${item.key}`, from: focus.id, to: item.key });
      }
    });
  }

  // Two faint sibling context markers on desktop only.
  if (!isMobile && focus.id !== ROOT_ID && parentId) {
    const parent = byId.get(parentId);
    if (parent) {
      const siblings = parent.children.filter((child) => child.id !== focus.id);
      const index = parent.children.findIndex((child) => child.id === focus.id);
      const contextSiblings = [siblings[Math.max(0, index - 1)], siblings[Math.min(siblings.length - 1, index)]].filter(Boolean).slice(0, 2);
      const positions = [170, 1030];
      contextSiblings.forEach((sibling, i) => {
        const key = `context-sibling-${sibling.id}`;
        items.push(person(sibling, key, positions[i], 245, 'context', true));
      });
    }
  }

  return { items, edges, focusStats };
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

export function InfiniteNetworkCanvasV22Preview() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const movedRef = useRef(false);

  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [focusId, setFocusId] = useState(ROOT_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupContext>(null);
  const [growthMode, setGrowthMode] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [animating, setAnimating] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1000);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const parents = useMemo(() => parentMap(root), [root]);
  const isMobile = viewportWidth < 700;
  const rootStats = stats.get(ROOT_ID)!;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedStats = selected ? stats.get(selected.id) ?? null : null;
  const selectedPath = selected ? findPath(root, selected.id) ?? [root] : [root];
  const traceIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);
  const focusPath = useMemo(() => findPath(root, focusId) ?? [root], [root, focusId]);

  const scene = useMemo(
    () => sceneFor({ root, focusId, group, byId, stats, parents, isMobile }),
    [root, focusId, group, byId, stats, parents, isMobile],
  );
  const itemByKey = useMemo(() => new Map(scene.items.map((item) => [item.key, item])), [scene.items]);

  const fitScene = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = clamp(Math.min((rect.width - 72) / PLANE_W, (rect.height - 90) / PLANE_H), MIN_SCALE, 1.05);
    setAnimating(true);
    setView({
      scale,
      x: rect.width / 2 - (PLANE_W / 2) * scale,
      y: rect.height / 2 - (PLANE_H / 2) * scale,
    });
    window.setTimeout(() => setAnimating(false), 320);
  }, []);

  const focusPerson = useCallback((id: string) => {
    setFocusId(id);
    setSelectedId(null);
    setGroup(null);
    setTraceMode(false);
    window.setTimeout(fitScene, 0);
  }, [fitScene]);

  useEffect(() => {
    setFocusId(ROOT_ID);
    setSelectedId(null);
    setGroup(null);
    setGrowthMode(false);
    setTraceMode(false);
    setSearch('');
    window.setTimeout(fitScene, 0);
  }, [scenario, fitScene]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0]?.contentRect.width ?? 1000);
      fitScene();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitScene]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return all.filter((node) => node.wallet.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)).slice(0, 7);
  }, [all, search]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      movedRef.current = false;
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
      const prev = lastSingleRef.current;
      if (prev) {
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
        setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }
      lastSingleRef.current = point;
      return;
    }

    const [a, b] = [...pointersRef.current.values()];
    const previous = lastPinchRef.current;
    if (!a || !b || !previous) return;
    movedRef.current = true;
    const center = midpoint(a, b);
    const nextDistance = Math.max(1, distance(a, b));
    const ratio = nextDistance / previous.distance;
    setView((current) => {
      const nextScale = clamp(current.scale * ratio, MIN_SCALE, MAX_SCALE);
      const worldX = (previous.center.x - current.x) / current.scale;
      const worldY = (previous.center.y - current.y) / current.scale;
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
    zoomAround({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY < 0 ? 1.08 : 0.92);
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
        <div><strong>Infinite Network v2.2</strong><span>Focus / Context / Visual Budget</span></div>
        <div className="scenarioTabs">
          {(Object.keys(scenarioLabel) as Scenario[]).map((key) => (
            <button key={key} className={scenario === key ? 'active' : ''} onClick={() => setScenario(key)}>{scenarioLabel[key]}</button>
          ))}
        </div>
      </div>

      <section className={`canvas ${growthMode ? 'growthMode' : ''} ${traceMode ? 'traceMode' : ''}`}>
        <div className="topLeft">
          <strong>My Network</strong>
          <nav>
            {focusPath.slice(-4).map((node, index, list) => (
              <span key={node.id}>
                {index > 0 ? <i>›</i> : null}
                <button className={index === list.length - 1 ? 'current' : ''} onClick={() => focusPerson(node.id)}>{node.id === ROOT_ID ? 'YOU' : node.wallet}</button>
              </span>
            ))}
            {group ? <><i>›</i><em>{group.label}</em></> : null}
          </nav>
        </div>

        <button className={`summary ${growthMode ? 'active' : ''}`} onClick={() => setGrowthMode((value) => !value)}>
          <span><b>{rootStats.network.toLocaleString()}</b> Network</span>
          <i>·</i>
          <span className="round"><b>+{rootStats.growth.toLocaleString()}</b> Round</span>
        </button>

        <div className="controls">
          <button onClick={() => focusPerson(ROOT_ID)}><b>◎</b><span>Me</span></button>
          <button className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen((value) => !value)}><b>⌕</b><span>Search</span></button>
          <button onClick={() => { setFocusId(ROOT_ID); setSelectedId(null); setGroup(null); setTraceMode(false); fitScene(); }}><b>⌂</b><span>Overview</span></button>
        </div>

        {!isMobile ? (
          <div className="zoomControls">
            <button onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect();
              if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 1.15);
            }}>+</button>
            <button onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect();
              if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 0.87);
            }}>−</button>
          </div>
        ) : null}

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
                    setFocusId(node.id);
                    setSelectedId(node.id);
                    setGroup(null);
                    window.setTimeout(fitScene, 0);
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
          <div className={`plane ${animating ? 'animating' : ''}`} style={{ width: PLANE_W, height: PLANE_H, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={PLANE_W} height={PLANE_H} aria-hidden="true">
              {scene.edges.map((edge) => {
                const from = itemByKey.get(edge.from);
                const to = itemByKey.get(edge.to);
                if (!from || !to) return null;
                const bend = (from.y + to.y) / 2;
                const trace = traceIds.has(from.sourceId ?? '') && traceIds.has(to.sourceId ?? '');
                const growth = (to.growth > 0 || to.joinedThisRound);
                return (
                  <path
                    key={edge.key}
                    d={`M ${from.x} ${from.y + 12} C ${from.x} ${bend}, ${to.x} ${bend}, ${to.x} ${to.y - 12}`}
                    className={`${edge.dim ? 'dim' : ''} ${edge.dashed ? 'dashed' : ''} ${trace ? 'trace' : ''} ${growth ? 'growth' : ''}`}
                  />
                );
              })}
            </svg>

            {scene.items.map((item) => {
              if (item.kind === 'cluster') {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`cluster ${item.growth ? 'hasGrowth' : ''}`}
                    style={{ left: item.x, top: item.y }}
                    onClick={() => {
                      if (movedRef.current) return;
                      setGroup({ parentId: focusId, memberIds: item.memberIds, label: `${item.direct} branches` });
                      setSelectedId(null);
                      window.setTimeout(fitScene, 0);
                    }}
                  >
                    <span className="stack"><i /><i /><i /></span>
                    <strong>{item.direct}</strong>
                    <small>{item.network.toLocaleString()} network</small>
                  </button>
                );
              }

              const selectedNode = item.sourceId === selectedId;
              const onTrace = item.sourceId ? traceIds.has(item.sourceId) : false;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`person ${item.kind === 'context' ? 'context' : ''} ${item.dim ? 'dim' : ''} ${selectedNode ? 'selected' : ''} ${onTrace ? 'onTrace' : ''} ${item.joinedThisRound ? 'newRound' : ''}`}
                  style={{ left: item.x, top: item.y }}
                  onClick={() => {
                    if (movedRef.current || !item.sourceId) return;
                    setSelectedId(item.sourceId);
                  }}
                  onDoubleClick={() => {
                    if (item.sourceId) focusPerson(item.sourceId);
                  }}
                >
                  <span className={`dot ${item.sourceId === ROOT_ID ? 'rootDot' : ''}`}>{item.sourceId === ROOT_ID ? 'V' : ''}</span>
                  <span className="label">
                    <strong>{item.sourceId === ROOT_ID ? 'YOU' : item.wallet}</strong>
                    {item.kind !== 'context' ? <small>{item.network.toLocaleString()} network</small> : null}
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
              <button className="primary" onClick={() => focusPerson(selected.id)}>Center</button>
              {selected.id !== ROOT_ID ? <button className={traceMode ? 'active' : ''} onClick={() => setTraceMode((value) => !value)}>연결 경로 보기</button> : null}
            </div>
          </aside>
        ) : null}
      </section>

      <div className="reviewNote">
        <b>V2.2 REVIEW</b>
        <span>전체를 억지로 축소하지 않고, 현재 Focus와 직속 한 단계만 읽을 수 있는 크기로 보여주는 구조입니다.</span>
      </div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#070706;color:#f4f1e8}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}
      `}</style>
      <style jsx>{`
        .previewPage{min-height:100vh;padding:10px 12px 28px;box-sizing:border-box;background:#070706}.qaBar{width:min(100%,1420px);min-height:40px;margin:0 auto 8px;padding:6px 10px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.014)}.qaBar>div:first-child{display:flex;align-items:baseline;gap:9px}.qaBar strong{color:#d4aa43;font-size:10px}.qaBar span{color:#5e5b55;font-size:9px}.scenarioTabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.scenarioTabs button{height:28px;padding:0 9px;flex:0 0 auto;border:1px solid transparent;border-radius:8px;background:transparent;color:#69655e;font-size:9px;font-weight:800;cursor:pointer}.scenarioTabs button.active{border-color:rgba(244,183,40,.14);background:rgba(244,183,40,.055);color:#c99f3d}.canvas{position:relative;width:min(100%,1420px);height:clamp(620px,82vh,900px);margin:0 auto;overflow:hidden;background:radial-gradient(circle at 50% 30%,rgba(124,86,34,.045),transparent 34%),#090908}.canvas::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.026) .65px,transparent .65px);background-size:38px 38px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.5),rgba(0,0,0,.12) 72%,transparent)}.topLeft{position:absolute;z-index:20;top:16px;left:18px;max-width:58%;pointer-events:none}.topLeft>strong{display:block;color:#d6d0c5;font-size:11px}.topLeft nav{margin-top:6px;display:flex;align-items:center;gap:3px;overflow:hidden}.topLeft nav span{display:flex;align-items:center}.topLeft nav i{color:#4b4842;font-style:normal;font-size:9px}.topLeft nav button{max-width:110px;padding:2px 3px;border:0;background:transparent;color:#66625b;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;pointer-events:auto}.topLeft nav button.current{color:#aaa397}.topLeft nav em{color:#806b3b;font-size:8px;font-style:normal}.summary{position:absolute;z-index:20;top:13px;right:18px;height:32px;padding:0 10px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:rgba(8,8,7,.68);color:#6d6962;font-size:8px;cursor:pointer;backdrop-filter:blur(12px)}.summary b{color:#c7c1b6;font-size:10px}.summary>i{color:#44413c;font-style:normal}.summary .round b{color:#c9a03c}.summary.active{border-color:rgba(244,183,40,.14);background:rgba(244,183,40,.05)}.viewport{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:grab}.viewport:active{cursor:grabbing}.plane{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.plane.animating{transition:transform .32s cubic-bezier(.22,.8,.28,1)}.edges{position:absolute;inset:0;overflow:visible}.edges path{fill:none;stroke:rgba(202,190,164,.2);stroke-width:1.15;vector-effect:non-scaling-stroke;transition:opacity .2s ease,stroke .2s ease}.edges path.dim{opacity:.18}.growthMode .edges path{opacity:.1}.growthMode .edges path.growth{opacity:1;stroke:rgba(220,173,55,.62)}.traceMode .edges path{opacity:.09}.traceMode .edges path.trace{opacity:1;stroke:rgba(236,193,79,.82);stroke-width:1.7}.person,.cluster{position:absolute;transform:translate(-50%,-50%);z-index:3;border:0;background:transparent;color:#d5d0c6;cursor:pointer;touch-action:none}.person{width:114px;height:78px;display:flex;flex-direction:column;align-items:center;justify-content:center}.dot{width:25px;height:25px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:#11110f;color:#aaa398;font-size:8px;font-weight:950;box-shadow:0 0 0 5px rgba(255,255,255,.016);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.rootDot{width:31px;height:31px;border-color:rgba(224,177,57,.55);background:#15120c;color:#d6aa40;box-shadow:0 0 0 7px rgba(224,177,57,.045)}.label{margin-top:6px;text-align:center}.label strong{display:block;max-width:108px;color:#cfc9bd;font-size:10px;font-weight:820;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.label small{display:block;margin-top:2px;color:#5b5751;font-size:8px}.person.selected .dot{transform:scale(1.16);border-color:rgba(239,188,62,.82);box-shadow:0 0 0 7px rgba(239,188,62,.06),0 0 24px rgba(239,188,62,.12)}.person.context{opacity:.32}.person.context .dot{width:15px;height:15px}.person.context .label strong{font-size:8px}.person.newRound::after{content:'';position:absolute;top:18px;right:35px;width:4px;height:4px;border-radius:50%;background:#deb042;box-shadow:0 0 8px rgba(222,176,66,.5)}.growthMode .person{opacity:.2}.growthMode .person.newRound,.growthMode .person.selected,.growthMode .person.context{opacity:1}.traceMode .person{opacity:.2}.traceMode .person.onTrace,.traceMode .person.selected,.traceMode .person.context{opacity:1}.cluster{width:100px;height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center}.stack{position:relative;width:30px;height:24px}.stack i{position:absolute;left:50%;width:22px;height:22px;transform:translateX(-50%);border:1px dashed rgba(209,194,160,.27);border-radius:50%;background:#10100d}.stack i:nth-child(1){top:-5px;opacity:.35}.stack i:nth-child(2){top:-2px;opacity:.6}.stack i:nth-child(3){top:1px}.cluster strong{margin-top:2px;color:#cbb15f;font-size:11px}.cluster small{margin-top:2px;color:#5f5a50;font-size:7px}.cluster.hasGrowth strong{color:#d9aa39}.growthMode .cluster:not(.hasGrowth){opacity:.18}.controls,.zoomControls{position:absolute;z-index:25;display:flex;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:rgba(9,9,8,.75);backdrop-filter:blur(14px);overflow:hidden}.controls{left:16px;bottom:16px}.zoomControls{right:16px;bottom:16px}.controls button,.zoomControls button{height:38px;min-width:38px;padding:0 10px;display:flex;align-items:center;justify-content:center;gap:5px;border:0;border-left:1px solid rgba(255,255,255,.04);background:transparent;color:#706c65;cursor:pointer}.controls button:first-child,.zoomControls button:first-child{border-left:0}.controls button.active{color:#c5a14c;background:rgba(244,183,40,.05)}.controls span{font-size:8px;font-weight:800}.controls b{font-size:11px}.searchPanel{position:absolute;z-index:35;left:50%;top:14px;width:min(360px,calc(100% - 32px));transform:translateX(-50%);border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(9,9,8,.95);box-shadow:0 18px 48px rgba(0,0,0,.38);backdrop-filter:blur(16px);overflow:hidden}.searchField{height:42px;padding:0 11px;display:flex;align-items:center;gap:8px}.searchField input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#ddd6ca;font-size:10px}.searchField>span{color:#5f5b54}.searchField button{width:26px;height:26px;border:0;border-radius:50%;background:rgba(255,255,255,.035);color:#69655e}.results{padding:0 7px 7px}.results>button{width:100%;height:38px;padding:0 7px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;border:0;border-top:1px solid rgba(255,255,255,.04);background:transparent;color:#bab3a7;text-align:left;cursor:pointer}.results>button span{font-size:9px}.results>button small,.results>small{color:#625e58;font-size:8px}.results>button i{font-style:normal;color:#5c5851}.results>small{display:block;padding:10px}.inspector{position:absolute;z-index:28;left:16px;bottom:66px;width:252px;padding:13px;box-sizing:border-box;border:1px solid rgba(244,183,40,.1);border-radius:15px;background:rgba(10,10,9,.9);box-shadow:0 16px 42px rgba(0,0,0,.3);backdrop-filter:blur(16px)}.handle{display:none}.inspector header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.inspector header strong{display:block;color:#ddd7cc;font-size:10px}.inspector header small{display:block;margin-top:3px;color:#69655e;font-size:8px}.inspector header>button{width:24px;height:24px;border:0;border-radius:50%;background:rgba(255,255,255,.035);color:#65615a}.metrics{margin-top:10px;padding:9px 0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04)}.metrics span{padding:0 5px;border-left:1px solid rgba(255,255,255,.035)}.metrics span:first-child{border-left:0;padding-left:0}.metrics b{display:block;color:#cbc4b8;font-size:10px}.metrics small{display:block;margin-top:2px;color:#56524c;font-size:6px}.actions{margin-top:9px;display:flex;gap:6px}.actions button{height:30px;flex:1;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(255,255,255,.025);color:#7a756d;font-size:8px;font-weight:850}.actions .primary{border-color:rgba(244,183,40,.16);background:rgba(244,183,40,.055);color:#c49d3d}.actions button.active{color:#d4aa43;border-color:rgba(244,183,40,.18)}.emptyState{position:absolute;z-index:10;left:50%;top:48%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none}.emptyState>span{width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(224,177,57,.45);border-radius:50%;background:#14120d;color:#d4a83e;font-size:9px;font-weight:950}.emptyState strong{margin-top:12px;color:#c3bcaf;font-size:11px}.emptyState small{max-width:250px;margin-top:5px;color:#5c5851;font-size:8px}.reviewNote{width:min(100%,1420px);margin:8px auto 0;padding:8px 10px;box-sizing:border-box;display:flex;gap:9px;align-items:center;color:#5e5a53;font-size:8px}.reviewNote b{color:#a88431;letter-spacing:.08em}@media (max-width:700px){.previewPage{padding:6px 6px 20px}.qaBar{align-items:flex-start;flex-direction:column;padding:8px}.qaBar>div:first-child{width:100%;justify-content:space-between}.scenarioTabs{width:100%}.canvas{height:79vh;min-height:570px}.topLeft{top:13px;left:13px;max-width:64%}.summary{top:auto;right:11px;bottom:58px}.controls{left:10px;bottom:10px}.controls button{height:36px;min-width:36px;padding:0 9px}.controls span{display:none}.inspector{left:7px;right:7px;bottom:56px;width:auto;padding:9px 12px 11px}.handle{display:block;width:28px;height:3px;margin:0 auto 8px;border-radius:999px;background:#38352f}.searchPanel{top:52px}.label strong{font-size:9px}.label small{font-size:7px}.reviewNote{align-items:flex-start;flex-direction:column;gap:3px}.person.context{display:none}}
        @media (prefers-reduced-motion:reduce){.plane.animating{transition:none}}
      `}</style>
    </main>
  );
}
