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

type Stats = {
  network: number;
  direct: number;
  qualified: number;
  growth: number;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

type SceneItem = {
  key: string;
  kind: 'person' | 'cluster' | 'context';
  sourceId: string | null;
  memberIds: string[];
  x: number;
  y: number;
  wallet: string;
  status: Status | null;
  branch: number;
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
};

type GroupContext = {
  parentId: string;
  memberIds: string[];
  label: string;
} | null;

const ROOT_ID = 'you';
const PLANE_W = 1200;
const PLANE_H = 650;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.6;

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
    if (i < 20) {
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

function buildParentMap(root: Node) {
  const map = new Map<string, string | null>();
  const visit = (node: Node, parent: string | null) => {
    map.set(node.id, parent);
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return map;
}

function chunkFixed<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function aggregate(ids: string[], byId: Map<string, Node>, stats: Map<string, Stats>) {
  let branch = 0;
  let network = 0;
  let qualified = 0;
  let growth = 0;
  for (const id of ids) {
    const node = byId.get(id);
    const s = stats.get(id);
    if (!node || !s) continue;
    branch += 1 + s.network;
    network += s.network;
    qualified += (node.status === 'IN_PROGRESS' ? 0 : 1) + s.qualified;
    growth += (node.joinedThisRound ? 1 : 0) + s.growth;
  }
  return { branch, network, qualified, growth };
}

function statusLabel(status: Status) {
  if (status === 'QUALIFIED') return '미션 완료';
  if (status === 'REWARDED') return '보상 완료';
  return '진행 중';
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

function sceneFor({
  root,
  focusId,
  group,
  byId,
  stats,
  parents,
  viewportWidth,
}: {
  root: Node;
  focusId: string;
  group: GroupContext;
  byId: Map<string, Node>;
  stats: Map<string, Stats>;
  parents: Map<string, string | null>;
  viewportWidth: number;
}) {
  const isMobile = viewportWidth < 700;
  const items: SceneItem[] = [];
  const edges: SceneEdge[] = [];
  const focus = byId.get(focusId) ?? root;
  const focusStats = stats.get(focus.id)!;

  const toItem = (
    node: Node,
    key: string,
    x: number,
    y: number,
    kind: SceneItem['kind'] = 'person',
    dim = false,
  ): SceneItem => {
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
      branch: 1 + s.network,
      network: s.network,
      direct: s.direct,
      qualified: s.qualified,
      growth: s.growth,
      joinedThisRound: node.joinedThisRound,
      dim,
    };
  };

  const parentId = parents.get(focus.id) ?? null;
  if (focus.id !== ROOT_ID && parentId) {
    const parent = byId.get(parentId);
    if (parent) {
      items.push(toItem(parent, parent.id, 600, 90, 'context', true));
      edges.push({ key: `parent-${focus.id}`, from: parent.id, to: focus.id, dim: true });
    }
  }

  const focusY = focus.id === ROOT_ID ? 155 : 205;
  items.push(toItem(focus, focus.id, 600, focusY));

  let visibleChildren = focus.children;
  if (group && group.parentId === focus.id) {
    const ids = new Set(group.memberIds);
    visibleChildren = focus.children.filter((child) => ids.has(child.id));
  }

  const bucketSize = isMobile ? 34 : 16;
  const buckets = visibleChildren.length > (isMobile ? 4 : 8)
    ? chunkFixed(visibleChildren, bucketSize)
    : visibleChildren.map((child) => [child]);

  const childY = focus.id === ROOT_ID ? 365 : 430;
  const count = buckets.length;
  const maxWidth = isMobile ? 700 : 1020;
  const width = count <= 1 ? 0 : Math.min(maxWidth, Math.max(220, (count - 1) * (isMobile ? 170 : 140)));
  const startX = 600 - width / 2;

  buckets.forEach((members, index) => {
    const x = count <= 1 ? 600 : startX + (index * width) / Math.max(1, count - 1);
    if (members.length === 1) {
      const child = members[0];
      items.push(toItem(child, child.id, x, childY));
      edges.push({ key: `${focus.id}-${child.id}`, from: focus.id, to: child.id });
      return;
    }

    const ids = members.map((member) => member.id);
    const a = aggregate(ids, byId, stats);
    const first = focus.children.findIndex((child) => child.id === members[0].id) + 1;
    const last = first + members.length - 1;
    const key = `cluster-${focus.id}-${first}-${last}`;
    items.push({
      key,
      kind: 'cluster',
      sourceId: null,
      memberIds: ids,
      x,
      y: childY,
      wallet: '',
      status: null,
      branch: a.branch,
      network: a.network,
      direct: members.length,
      qualified: a.qualified,
      growth: a.growth,
      joinedThisRound: a.growth > 0,
    });
    edges.push({ key: `${focus.id}-${key}`, from: focus.id, to: key });
  });

  if (!isMobile && focus.id !== ROOT_ID && parentId) {
    const parent = byId.get(parentId);
    if (parent) {
      const siblings = parent.children.filter((child) => child.id !== focus.id);
      const unique = Array.from(new Map(siblings.map((sibling) => [sibling.id, sibling])).values()).slice(0, 2);
      const positions = [155, 1045];
      unique.forEach((sibling, index) => {
        items.push(toItem(sibling, `context-${sibling.id}`, positions[index], 205, 'context', true));
      });
    }
  }

  return { items, edges, focusStats };
}

export function InfiniteNetworkCanvasV23Preview() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);

  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [focusId, setFocusId] = useState(ROOT_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupContext>(null);
  const [growthMode, setGrowthMode] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [animating, setAnimating] = useState(false);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const parents = useMemo(() => buildParentMap(root), [root]);
  const rootStats = stats.get(ROOT_ID)!;
  const focusPath = useMemo(() => findPath(root, focusId) ?? [root], [root, focusId]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedStats = selected ? stats.get(selected.id) ?? null : null;
  const selectedPath = selected ? findPath(root, selected.id) ?? [root] : [root];
  const traceIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);

  const scene = useMemo(
    () => sceneFor({ root, focusId, group, byId, stats, parents, viewportWidth }),
    [root, focusId, group, byId, stats, parents, viewportWidth],
  );
  const itemByKey = useMemo(() => new Map(scene.items.map((item) => [item.key, item])), [scene.items]);

  const fitScene = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = clamp(Math.min((rect.width - 40) / PLANE_W, (rect.height - 70) / PLANE_H), MIN_SCALE, 1.06);
    setAnimating(true);
    setView({
      scale,
      x: rect.width / 2 - (PLANE_W / 2) * scale,
      y: rect.height / 2 - (PLANE_H / 2) * scale,
    });
    window.setTimeout(() => setAnimating(false), 360);
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
      const width = entries[0]?.contentRect.width ?? 1200;
      setViewportWidth(width);
      window.setTimeout(fitScene, 0);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitScene]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return all.filter((node) => node.wallet.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)).slice(0, 8);
  }, [all, search]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-interactive="true"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      lastSingleRef.current = point;
      lastPinchRef.current = null;
      return;
    }
    const [a, b] = [...pointersRef.current.values()];
    if (a && b) {
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
        setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }
      lastSingleRef.current = point;
      return;
    }

    const [a, b] = [...pointersRef.current.values()];
    const previous = lastPinchRef.current;
    if (!a || !b || !previous) return;
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

  const selectPerson = (id: string) => {
    if (selectedId === id && id !== ROOT_ID) {
      focusPerson(id);
      return;
    }
    setSelectedId(id);
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
        <div><strong>Infinite Network v2.3</strong><span>Interactive branch explorer</span></div>
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
            {focusPath.length > 5 ? <><button onClick={() => focusPerson(ROOT_ID)}>YOU</button><i>›</i><em>…</em><i>›</i></> : null}
            {(focusPath.length > 5 ? focusPath.slice(-3) : focusPath).map((node, index, list) => (
              <span key={node.id}>
                {index > 0 ? <i>›</i> : null}
                <button className={node.id === focusId ? 'current' : ''} onClick={() => focusPerson(node.id)}>{node.id === ROOT_ID ? 'YOU' : node.wallet}</button>
              </span>
            ))}
          </nav>
          {group ? (
            <div className="groupChip" data-interactive="true">
              <span>{group.label}</span>
              <button onClick={() => setGroup(null)}>All direct</button>
            </div>
          ) : null}
        </div>

        <button className={`summary ${growthMode ? 'active' : ''}`} onClick={() => setGrowthMode((value) => !value)} data-interactive="true">
          <span><b>{rootStats.network.toLocaleString()}</b> Network</span>
          <i>·</i>
          <span className="round"><b>+{rootStats.growth.toLocaleString()}</b> Round</span>
        </button>

        <div className="controls" data-interactive="true">
          <button onClick={() => focusPerson(ROOT_ID)}><b>◎</b><span>Me</span></button>
          <button className={searchOpen ? 'active' : ''} onClick={() => setSearchOpen((value) => !value)}><b>⌕</b><span>Search</span></button>
        </div>

        <div className="zoomControls" data-interactive="true">
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 1.12);
          }}>+</button>
          <button onClick={() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 0.89);
          }}>−</button>
        </div>

        {searchOpen ? (
          <div className="searchPanel" data-interactive="true">
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
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest('[data-interactive="true"]')) {
              setSelectedId(null);
              setTraceMode(false);
            }
          }}
        >
          <div className={`plane ${animating ? 'animating' : ''}`} style={{ width: PLANE_W, height: PLANE_H, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={PLANE_W} height={PLANE_H} aria-hidden="true">
              {scene.edges.map((edge) => {
                const from = itemByKey.get(edge.from);
                const to = itemByKey.get(edge.to);
                if (!from || !to) return null;
                const trunkY = from.y + 48;
                const bend = (trunkY + to.y) / 2;
                const trace = traceIds.has(from.sourceId ?? '') && traceIds.has(to.sourceId ?? '');
                const growth = to.growth > 0 || to.joinedThisRound;
                return (
                  <path
                    key={edge.key}
                    d={`M ${from.x} ${from.y + 15} C ${from.x} ${trunkY}, ${to.x} ${bend}, ${to.x} ${to.y - 16}`}
                    className={`${edge.dim ? 'dim' : ''} ${trace ? 'trace' : ''} ${growth ? 'growth' : ''}`}
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
                    data-interactive="true"
                    className={`cluster ${item.growth ? 'hasGrowth' : ''}`}
                    style={{ left: item.x, top: item.y }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      const firstNode = byId.get(item.memberIds[0]);
                      const lastNode = byId.get(item.memberIds[item.memberIds.length - 1]);
                      const first = firstNode ? (byId.get(focusId)?.children.findIndex((child) => child.id === firstNode.id) ?? 0) + 1 : 1;
                      const last = first + item.memberIds.length - 1;
                      setGroup({ parentId: focusId, memberIds: item.memberIds, label: `Direct users ${first}–${last}` });
                      setSelectedId(null);
                    }}
                  >
                    <span className="stack"><i /><i /><i /></span>
                    <strong>{item.direct} users</strong>
                    <small>{item.branch.toLocaleString()} total branch</small>
                    {item.growth > 0 ? <em>+{item.growth}</em> : null}
                  </button>
                );
              }

              const selectedNode = item.sourceId === selectedId;
              const onTrace = item.sourceId ? traceIds.has(item.sourceId) : false;
              return (
                <button
                  key={item.key}
                  type="button"
                  data-interactive="true"
                  className={`person ${item.kind === 'context' ? 'context' : ''} ${item.dim ? 'dim' : ''} ${selectedNode ? 'selected' : ''} ${onTrace ? 'onTrace' : ''}`}
                  style={{ left: item.x, top: item.y }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => item.sourceId && selectPerson(item.sourceId)}
                >
                  <span className={`dot ${item.sourceId === ROOT_ID ? 'rootDot' : ''}`} />
                  <span className="label">
                    <strong>{item.sourceId === ROOT_ID ? 'YOU' : item.wallet}</strong>
                    {item.sourceId !== ROOT_ID && item.kind !== 'context' ? <small>{item.branch.toLocaleString()} Branch</small> : null}
                    {item.sourceId !== ROOT_ID && item.kind !== 'context' && item.growth > 0 ? <em>+{item.growth}</em> : null}
                  </span>
                  {item.kind !== 'context' && item.network > 0 ? <span className="continuation"><i />↓</span> : null}
                </button>
              );
            })}
          </div>

          {scenario === 'empty' ? (
            <div className="emptyState">
              <span />
              <strong>Your network starts here</strong>
              <small>첫 사용자가 연결되면 이 공간에서 네트워크가 뻗어나가요.</small>
            </div>
          ) : null}
        </div>

        {selected && selectedStats ? (
          <aside className="inspector" data-interactive="true">
            <div className="handle" />
            <header>
              <div>
                <strong>{selected.id === ROOT_ID ? 'YOU' : selected.wallet}</strong>
                <small>{selected.id === ROOT_ID ? 'My Network' : statusLabel(selected.status)}</small>
              </div>
              <button onClick={() => { setSelectedId(null); setTraceMode(false); }}>×</button>
            </header>
            <div className="metrics">
              <span><b>{selected.id === ROOT_ID ? selectedStats.network : selectedStats.network + 1}</b><small>{selected.id === ROOT_ID ? 'Network' : 'Branch'}</small></span>
              <span><b>{selectedStats.direct}</b><small>Direct</small></span>
              <span><b>{selectedStats.qualified}</b><small>Qualified</small></span>
              <span><b>+{selectedStats.growth}</b><small>Round</small></span>
            </div>
            <div className="actions">
              {selected.id !== ROOT_ID && selectedStats.network > 0 ? <button className="primary" onClick={() => focusPerson(selected.id)}>네트워크 보기 →</button> : null}
              {selected.id !== ROOT_ID ? <button className={traceMode ? 'active' : ''} onClick={() => setTraceMode((value) => !value)}>연결 경로 보기</button> : null}
            </div>
            {selected.id !== ROOT_ID && selectedStats.network === 0 ? <div className="leafNote">No network below yet</div> : null}
          </aside>
        ) : null}
      </section>

      <div className="reviewNote"><b>V2.3 REVIEW</b><span>노드 1회 클릭 = 선택 · 같은 노드 다시 클릭 또는 ‘네트워크 보기’ = Branch 진입 · 빈 공간 드래그 = 이동</span></div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#070706;color:#f4f1e8}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}
      `}</style>
      <style jsx>{`
        .previewPage{min-height:100vh;padding:10px 12px 28px;box-sizing:border-box;background:#070706}.qaBar{width:min(100%,1420px);min-height:40px;margin:0 auto 8px;padding:6px 10px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.014)}.qaBar>div:first-child{display:flex;align-items:baseline;gap:9px}.qaBar strong{color:#d4aa43;font-size:10px}.qaBar span{color:#5e5b55;font-size:9px}.scenarioTabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.scenarioTabs button{height:28px;padding:0 9px;flex:0 0 auto;border:1px solid transparent;border-radius:8px;background:transparent;color:#69655e;font-size:9px;font-weight:800;cursor:pointer}.scenarioTabs button.active{border-color:rgba(244,183,40,.14);background:rgba(244,183,40,.055);color:#c99f3d}.canvas{position:relative;width:min(100%,1420px);height:clamp(620px,82vh,900px);margin:0 auto;overflow:hidden;background:radial-gradient(circle at 50% 28%,rgba(124,86,34,.04),transparent 32%),#090908}.canvas::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.024) .6px,transparent .6px);background-size:40px 40px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.4),rgba(0,0,0,.08) 72%,transparent)}.topLeft{position:absolute;z-index:20;top:16px;left:18px;max-width:64%;pointer-events:none}.topLeft>strong{display:block;color:#d6d0c5;font-size:11px}.topLeft nav{margin-top:6px;display:flex;align-items:center;gap:3px;overflow:hidden}.topLeft nav span{display:flex;align-items:center}.topLeft nav i{color:#4b4842;font-style:normal;font-size:9px}.topLeft nav button{max-width:110px;padding:2px 3px;border:0;background:transparent;color:#66625b;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;pointer-events:auto}.topLeft nav button.current{color:#aaa397}.topLeft nav em{color:#6e685e;font-size:8px;font-style:normal}.groupChip{margin-top:7px;display:inline-flex;align-items:center;gap:7px;padding:4px 6px 4px 8px;border:1px solid rgba(244,183,40,.12);border-radius:999px;background:rgba(244,183,40,.045);pointer-events:auto}.groupChip span{color:#a88a45;font-size:8px}.groupChip button{border:0;background:transparent;color:#d0b36e;font-size:8px;cursor:pointer}.summary{position:absolute;z-index:20;top:13px;right:18px;height:32px;padding:0 10px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:rgba(8,8,7,.68);color:#6d6962;font-size:8px;cursor:pointer;backdrop-filter:blur(12px)}.summary b{color:#c7c1b6;font-size:10px}.summary>i{color:#44413c;font-style:normal}.summary .round b{color:#c9a03c}.summary.active{border-color:rgba(244,183,40,.14);background:rgba(244,183,40,.05)}.viewport{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:grab}.viewport:active{cursor:grabbing}.plane{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.plane.animating{transition:transform .36s cubic-bezier(.22,.8,.28,1)}.edges{position:absolute;inset:0;overflow:visible}.edges path{fill:none;stroke:rgba(202,190,164,.2);stroke-width:1.15;vector-effect:non-scaling-stroke;transition:opacity .22s ease,stroke .22s ease}.edges path.dim{opacity:.18}.growthMode .edges path{opacity:.09}.growthMode .edges path.growth{opacity:1;stroke:rgba(220,173,55,.62)}.traceMode .edges path{opacity:.08}.traceMode .edges path.trace{opacity:1;stroke:rgba(236,193,79,.82);stroke-width:1.7}.person,.cluster{position:absolute;transform:translate(-50%,-50%);z-index:3;border:0;background:transparent;color:#d5d0c6;cursor:pointer;touch-action:manipulation;transition:left .34s cubic-bezier(.22,.8,.28,1),top .34s cubic-bezier(.22,.8,.28,1),opacity .2s ease}.person{width:122px;height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center}.dot{width:26px;height:26px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:#11110f;box-shadow:0 0 0 5px rgba(255,255,255,.016);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.rootDot{width:32px;height:32px;border-color:rgba(224,177,57,.58);background:#15120c;box-shadow:0 0 0 7px rgba(224,177,57,.04)}.label{position:relative;margin-top:6px;text-align:center}.label strong{display:block;color:#c9c3b9;font-size:10px;line-height:1.15}.label small{display:block;margin-top:4px;color:#625e57;font-size:8px}.label em{position:absolute;left:calc(100% + 5px);top:11px;color:#d5a936;font-size:8px;font-style:normal}.person.selected .dot{transform:scale(1.06);border-color:rgba(226,177,58,.75);box-shadow:0 0 0 6px rgba(226,177,58,.055)}.person.context{opacity:.34}.person.context .dot{width:18px;height:18px}.person.context .label strong{font-size:8px}.person.context .label small,.person.context .continuation{display:none}.continuation{position:absolute;top:80px;display:flex;flex-direction:column;align-items:center;color:#8a7240;font-size:8px;line-height:8px}.continuation i{display:block;width:1px;height:9px;margin-bottom:2px;background:linear-gradient(to bottom,rgba(191,157,75,.32),transparent)}.cluster{min-width:104px;height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center}.stack{position:relative;width:31px;height:22px}.stack i{position:absolute;width:20px;height:20px;border:1px solid rgba(194,157,72,.24);border-radius:50%;background:#10100e}.stack i:nth-child(1){left:0;top:2px}.stack i:nth-child(2){left:6px;top:0}.stack i:nth-child(3){left:11px;top:3px}.cluster strong{margin-top:5px;color:#c7a55a;font-size:9px}.cluster small{margin-top:3px;color:#625d54;font-size:7px}.cluster em{margin-top:2px;color:#d1a633;font-size:7px;font-style:normal}.controls{position:absolute;z-index:20;left:18px;bottom:16px;display:flex;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(7,7,6,.7);overflow:hidden;backdrop-filter:blur(10px)}.controls button{height:34px;padding:0 9px;display:flex;align-items:center;gap:5px;border:0;border-right:1px solid rgba(255,255,255,.045);background:transparent;color:#777168;font-size:8px;cursor:pointer}.controls button:last-child{border-right:0}.controls button.active{color:#c9a34a;background:rgba(244,183,40,.04)}.controls b{font-size:11px;font-weight:500}.zoomControls{position:absolute;z-index:20;right:18px;bottom:16px;display:flex;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(7,7,6,.7);overflow:hidden}.zoomControls button{width:38px;height:34px;border:0;border-right:1px solid rgba(255,255,255,.045);background:transparent;color:#6f6960;cursor:pointer}.zoomControls button:last-child{border-right:0}.searchPanel{position:absolute;z-index:30;left:18px;bottom:58px;width:min(360px,calc(100% - 36px));padding:7px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(12,12,10,.96);box-shadow:0 14px 40px rgba(0,0,0,.34)}.searchField{height:34px;display:flex;align-items:center;gap:7px;padding:0 8px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#0b0b09}.searchField span{color:#6a655c}.searchField input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#d7d1c6;font-size:9px}.searchField button{border:0;background:transparent;color:#716b61;cursor:pointer}.results{margin-top:6px;display:grid;gap:2px}.results>button{height:34px;padding:0 7px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;border:0;border-radius:8px;background:transparent;text-align:left;color:#bdb6aa;cursor:pointer}.results>button:hover{background:rgba(255,255,255,.025)}.results small{color:#625e57;font-size:8px}.results i{color:#5f5a52;font-style:normal}.inspector{position:absolute;z-index:28;right:18px;bottom:60px;width:280px;padding:12px;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:rgba(12,12,10,.94);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(14px)}.handle{display:none}.inspector header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.inspector header strong{display:block;color:#ded8cd;font-size:11px}.inspector header small{display:block;margin-top:3px;color:#746f66;font-size:8px}.inspector header>button{border:0;background:transparent;color:#6d675e;font-size:14px;cursor:pointer}.metrics{margin-top:11px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.metrics span{min-width:0}.metrics b{display:block;color:#cfc8bd;font-size:11px}.metrics small{display:block;margin-top:3px;color:#5f5a53;font-size:7px}.actions{margin-top:12px;display:flex;gap:6px}.actions button{height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:transparent;color:#80796f;font-size:8px;cursor:pointer}.actions button.primary{border-color:rgba(228,177,51,.2);background:rgba(228,177,51,.07);color:#d1aa4b}.actions button.active{color:#d1aa4b}.leafNote{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.05);color:#69635b;font-size:8px}.emptyState{position:absolute;left:50%;top:50%;transform:translate(-50%,-42%);display:flex;flex-direction:column;align-items:center;text-align:center}.emptyState>span{width:34px;height:34px;border:1px solid rgba(224,177,57,.45);border-radius:50%;box-shadow:0 0 0 7px rgba(224,177,57,.035)}.emptyState strong{margin-top:14px;color:#c7c0b6;font-size:11px}.emptyState small{margin-top:6px;color:#625d55;font-size:8px}.reviewNote{width:min(100%,1420px);margin:8px auto 0;padding:0 10px;display:flex;align-items:center;gap:8px;box-sizing:border-box}.reviewNote b{color:#a68333;font-size:7px}.reviewNote span{color:#555149;font-size:7px}@media(max-width:700px){.previewPage{padding:6px 6px 18px}.qaBar{align-items:flex-start;flex-direction:column}.qaBar>div:first-child{width:100%;justify-content:space-between}.scenarioTabs{width:100%}.canvas{height:calc(100vh - 116px);min-height:600px}.topLeft{top:12px;left:12px;max-width:68%}.summary{top:9px;right:10px;height:30px}.controls{left:10px;bottom:12px}.zoomControls{display:none}.person{width:104px}.label strong{font-size:9px}.label small{font-size:7px}.inspector{left:8px;right:8px;bottom:8px;width:auto;padding:10px 12px 12px;border-radius:16px}.handle{display:block;width:28px;height:3px;margin:-3px auto 8px;border-radius:99px;background:#34312c}.metrics{gap:2px}.actions{padding-right:0}.actions button{flex:1}.controls{bottom:10px}.searchPanel{left:8px;bottom:54px;width:calc(100% - 16px);box-sizing:border-box}.reviewNote{padding:0 4px}.reviewNote span{display:none}}@media(prefers-reduced-motion:reduce){.plane.animating,.person,.cluster{transition:none!important}}
      `}</style>
    </main>
  );
}
