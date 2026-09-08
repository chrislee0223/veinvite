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

type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };

type LayoutNode = {
  id: string;
  kind: 'person' | 'more';
  nodeId: string | null;
  parentId: string | null;
  x: number;
  y: number;
  depth: number;
  wallet: string;
  branch: number;
  direct: number;
  growth: number;
  moreCount: number;
  moreStart: number;
};

type LayoutEdge = {
  id: string;
  parentId: string;
  childId: string;
  more: boolean;
};

type LayoutBranch = {
  node: Node;
  width: number;
  children: Array<LayoutBranch | { kind: 'more'; parent: Node; start: number; count: number; width: number }>;
};

const ROOT_ID = 'you';
const WORLD_W = 8000;
const WORLD_H = 8000;
const ROOT_X = 4000;
const ROOT_Y = 220;
const LEVEL_GAP = 176;
const NODE_MIN_WIDTH = 118;
const SIBLING_GAP = 18;
const MIN_SCALE = 0.72;
const MAX_SCALE = 1.7;

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
      if (depth > 1 && i < 4) {
        child.children = Array.from({ length: 2 + ((i + n) % 4) }, (_, j) => {
          const grand = leaf(n++, `${child.id}-${j + 1}`);
          if (depth > 2 && j < 2) {
            grand.children = Array.from({ length: 2 + ((i + j) % 2) }, (_, k) => leaf(n++, `${grand.id}-${k + 1}`));
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
      branch('c', 7, 3),
      branch('d', 3, 2),
      branch('e', 5, 2),
    ],
  };
}

function buildWide(): Node {
  let n = 300;
  const children = Array.from({ length: 100 }, (_, i) => {
    const child = leaf(n++, `wide-${i + 1}`);
    if (i < 28) {
      child.children = Array.from({ length: 2 + (i % 5) }, (_, j) => {
        const grand = leaf(n++, `${child.id}-${j + 1}`);
        if (j === 0 && i < 12) {
          grand.children = Array.from({ length: 2 + (i % 3) }, (_, k) => leaf(n++, `${grand.id}-${k + 1}`));
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
    if (i % 7 === 0) child.children.push(leaf(1100 + i, `side-${i}`));
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

function parentMap(root: Node) {
  const map = new Map<string, string | null>();
  const visit = (node: Node, parent: string | null) => {
    map.set(node.id, parent);
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return map;
}

function pathTo(root: Node, target: string, trail: Node[] = []): Node[] | null {
  const next = [...trail, root];
  if (root.id === target) return next;
  for (const child of root.children) {
    const found = pathTo(child, target, next);
    if (found) return found;
  }
  return null;
}

function descendants(node: Node) {
  const ids: string[] = [];
  const visit = (current: Node) => {
    current.children.forEach((child) => {
      ids.push(child.id);
      visit(child);
    });
  };
  visit(node);
  return ids;
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

function buildLayoutTree(
  node: Node,
  expanded: Set<string>,
  revealCounts: Map<string, number>,
  defaultReveal: number,
): LayoutBranch {
  if (!expanded.has(node.id) || node.children.length === 0) {
    return { node, width: NODE_MIN_WIDTH, children: [] };
  }

  const reveal = Math.max(1, revealCounts.get(node.id) ?? defaultReveal);
  const visible = node.children.slice(0, reveal);
  const children: LayoutBranch['children'] = visible.map((child) =>
    buildLayoutTree(child, expanded, revealCounts, defaultReveal),
  );

  if (node.children.length > reveal) {
    children.push({
      kind: 'more',
      parent: node,
      start: reveal,
      count: node.children.length - reveal,
      width: 104,
    });
  }

  const total = children.reduce((sum, child) => sum + child.width, 0) + Math.max(0, children.length - 1) * SIBLING_GAP;
  return { node, width: Math.max(NODE_MIN_WIDTH, total), children };
}

function flattenLayout(tree: LayoutBranch, stats: Map<string, Stats>) {
  const items: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const place = (branch: LayoutBranch, left: number, depth: number, parentId: string | null) => {
    const x = left + branch.width / 2;
    const y = depth * LEVEL_GAP;
    const s = stats.get(branch.node.id)!;
    items.push({
      id: branch.node.id,
      kind: 'person',
      nodeId: branch.node.id,
      parentId,
      x,
      y,
      depth,
      wallet: branch.node.wallet,
      branch: 1 + s.network,
      direct: s.direct,
      growth: s.growth,
      moreCount: 0,
      moreStart: 0,
    });

    if (parentId) edges.push({ id: `${parentId}-${branch.node.id}`, parentId, childId: branch.node.id, more: false });

    if (!branch.children.length) return;
    let cursor = left;
    branch.children.forEach((child, index) => {
      if ('kind' in child && child.kind === 'more') {
        const moreId = `more:${branch.node.id}:${child.start}`;
        items.push({
          id: moreId,
          kind: 'more',
          nodeId: null,
          parentId: branch.node.id,
          x: cursor + child.width / 2,
          y: (depth + 1) * LEVEL_GAP,
          depth: depth + 1,
          wallet: '',
          branch: 0,
          direct: 0,
          growth: 0,
          moreCount: child.count,
          moreStart: child.start,
        });
        edges.push({ id: `${branch.node.id}-${moreId}`, parentId: branch.node.id, childId: moreId, more: true });
        cursor += child.width;
      } else {
        const next = child as LayoutBranch;
        place(next, cursor, depth + 1, branch.node.id);
        cursor += next.width;
      }
      if (index < branch.children.length - 1) cursor += SIBLING_GAP;
    });
  };

  place(tree, 0, 0, null);
  const root = items.find((item) => item.id === ROOT_ID)!;
  const dx = ROOT_X - root.x;
  const dy = ROOT_Y - root.y;
  items.forEach((item) => {
    item.x += dx;
    item.y += dy;
  });
  return { items, edges };
}

function branchPath(parent: LayoutNode, child: LayoutNode) {
  const startY = parent.y + 18;
  const trunkY = parent.y + 38;
  const endY = child.y - (child.kind === 'more' ? 14 : 18);
  const bendY = trunkY + Math.max(28, (endY - trunkY) * 0.48);
  return `M ${parent.x} ${startY} C ${parent.x} ${trunkY}, ${parent.x} ${trunkY}, ${parent.x} ${trunkY} C ${parent.x} ${bendY}, ${child.x} ${bendY}, ${child.x} ${endY}`;
}

export function InfiniteNetworkBranchBloomPreview() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastSingleRef = useRef<Point | null>(null);
  const lastPinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const movedRef = useRef(false);

  const [scenario, setScenario] = useState<Scenario>('balanced');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT_ID]));
  const [revealCounts, setRevealCounts] = useState<Map<string, number>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string>(ROOT_ID);
  const [growthMode, setGrowthMode] = useState(false);
  const [newlyShown, setNewlyShown] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [hintVisible, setHintVisible] = useState(true);

  const root = useMemo(() => scenarioRoot(scenario), [scenario]);
  const all = useMemo(() => flatten(root), [root]);
  const byId = useMemo(() => new Map(all.map((node) => [node.id, node])), [all]);
  const stats = useMemo(() => computeStats(root), [root]);
  const parents = useMemo(() => parentMap(root), [root]);
  const defaultReveal = viewportWidth < 700 ? 4 : 7;
  const rootStats = stats.get(ROOT_ID)!;

  const layout = useMemo(() => {
    const tree = buildLayoutTree(root, expanded, revealCounts, defaultReveal);
    return flattenLayout(tree, stats);
  }, [root, expanded, revealCounts, defaultReveal, stats]);

  const itemById = useMemo(() => new Map(layout.items.map((item) => [item.id, item])), [layout.items]);
  const selected = byId.get(selectedId) ?? root;
  const selectedStats = stats.get(selected.id)!;
  const selectedPath = useMemo(() => pathTo(root, selected.id) ?? [root], [root, selected.id]);
  const selectedPathIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);

  const centerRoot = useCallback((scaleOverride?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = scaleOverride ?? (rect.width < 700 ? 0.9 : 1);
    setView({
      scale,
      x: rect.width / 2 - ROOT_X * scale,
      y: 150 - ROOT_Y * scale,
    });
  }, []);

  useEffect(() => {
    setExpanded(new Set([ROOT_ID]));
    setRevealCounts(new Map());
    setSelectedId(ROOT_ID);
    setGrowthMode(false);
    setNewlyShown(new Set());
    window.setTimeout(() => centerRoot(), 0);
  }, [scenario, centerRoot]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0]?.contentRect.width ?? 1200);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHintVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, []);

  const assistIntoView = useCallback((parentId: string) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    window.requestAnimationFrame(() => {
      const rect = viewport.getBoundingClientRect();
      const parent = itemById.get(parentId);
      if (!parent) return;
      const children = layout.items.filter((item) => item.parentId === parentId);
      if (!children.length) return;
      const maxY = Math.max(...children.map((item) => item.y));
      const minX = Math.min(...children.map((item) => item.x));
      const maxX = Math.max(...children.map((item) => item.x));
      setView((current) => {
        let nextX = current.x;
        let nextY = current.y;
        const screenBottom = maxY * current.scale + current.y;
        const screenLeft = minX * current.scale + current.x;
        const screenRight = maxX * current.scale + current.x;
        const bottomLimit = rect.height - 110;
        if (screenBottom > bottomLimit) nextY -= Math.min(150, screenBottom - bottomLimit + 24);
        if (screenLeft < 70) nextX += Math.min(120, 70 - screenLeft + 18);
        if (screenRight > rect.width - 70) nextX -= Math.min(120, screenRight - (rect.width - 70) + 18);
        return { ...current, x: nextX, y: nextY };
      });
    });
  }, [itemById, layout.items]);

  const collapseNode = useCallback((node: Node) => {
    const remove = new Set([node.id, ...descendants(node)]);
    setExpanded((current) => {
      const next = new Set(current);
      remove.forEach((id) => next.delete(id));
      if (node.id === ROOT_ID) next.add(ROOT_ID);
      return next;
    });
    setSelectedId(node.id);
  }, []);

  const expandNode = useCallback((node: Node) => {
    if (!node.children.length) {
      setSelectedId(node.id);
      return;
    }
    const reveal = revealCounts.get(node.id) ?? defaultReveal;
    const shownIds = node.children.slice(0, reveal).map((child) => child.id);
    if (node.children.length > reveal) shownIds.push(`more:${node.id}:${reveal}`);
    setSelectedId(node.id);
    setExpanded((current) => new Set(current).add(node.id));
    setNewlyShown(new Set(shownIds));
    window.setTimeout(() => setNewlyShown(new Set()), 720);
    window.setTimeout(() => assistIntoView(node.id), 80);
  }, [revealCounts, defaultReveal, assistIntoView]);

  const toggleNode = useCallback((node: Node) => {
    if (expanded.has(node.id) && node.id !== ROOT_ID) collapseNode(node);
    else if (expanded.has(node.id) && node.id === ROOT_ID) setSelectedId(node.id);
    else expandNode(node);
  }, [expanded, collapseNode, expandNode]);

  const revealMore = useCallback((parentId: string) => {
    const parent = byId.get(parentId);
    if (!parent) return;
    const current = revealCounts.get(parentId) ?? defaultReveal;
    const nextCount = Math.min(parent.children.length, current + defaultReveal);
    const newIds = parent.children.slice(current, nextCount).map((child) => child.id);
    if (nextCount < parent.children.length) newIds.push(`more:${parentId}:${nextCount}`);
    setRevealCounts((map) => {
      const next = new Map(map);
      next.set(parentId, nextCount);
      return next;
    });
    setNewlyShown(new Set(newIds));
    window.setTimeout(() => setNewlyShown(new Set()), 720);
    window.setTimeout(() => assistIntoView(parentId), 80);
  }, [byId, revealCounts, defaultReveal, assistIntoView]);

  const collapseAll = () => {
    setExpanded(new Set([ROOT_ID]));
    setRevealCounts(new Map());
    setSelectedId(ROOT_ID);
    setNewlyShown(new Set());
    centerRoot();
  };

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
      const previous = lastSingleRef.current;
      if (previous) {
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
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
    } else {
      lastSingleRef.current = null;
      lastPinchRef.current = null;
      if (!movedRef.current) setSelectedId(ROOT_ID);
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
        <div className="qaTitle"><strong>Infinite Network v2.4</strong><span>Progressive Branch Bloom</span></div>
        <div className="scenarioTabs">
          {(Object.keys(scenarioLabel) as Scenario[]).map((key) => (
            <button key={key} className={scenario === key ? 'active' : ''} onClick={() => setScenario(key)}>{scenarioLabel[key]}</button>
          ))}
        </div>
      </div>

      <section className={`canvas ${growthMode ? 'growthMode' : ''}`}>
        <div className="topLeft">
          <strong>My Network</strong>
          <div className="crumbs">
            {selectedPath.slice(-4).map((node, index, list) => (
              <span key={node.id}>{index > 0 ? <i>›</i> : null}<b className={index === list.length - 1 ? 'current' : ''}>{node.id === ROOT_ID ? 'YOU' : node.wallet}</b></span>
            ))}
          </div>
        </div>

        <button className={`summary ${growthMode ? 'active' : ''}`} onClick={() => setGrowthMode((value) => !value)}>
          <span><b>{rootStats.network}</b> Network</span><i>·</i><span className="round"><b>+{rootStats.growth}</b> Round</span>
        </button>

        <div className="controls">
          <button onClick={() => centerRoot()}><b>◎</b><span>Me</span></button>
          <button onClick={collapseAll}><b>⌁</b><span>Collapse</span></button>
        </div>

        {viewportWidth >= 700 ? (
          <div className="zoomControls">
            <button onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect();
              if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 1.12);
            }}>+</button>
            <button onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect();
              if (rect) zoomAround({ x: rect.width / 2, y: rect.height / 2 }, 0.89);
            }}>−</button>
          </div>
        ) : null}

        {hintVisible && scenario !== 'empty' ? <div className="hint">노드를 클릭하면 다음 세대가 펼쳐져요</div> : null}

        <div
          ref={viewportRef}
          className="viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <div className="stage" style={{ width: WORLD_W, height: WORLD_H, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} aria-hidden="true">
              {layout.edges.map((edge) => {
                const parent = itemById.get(edge.parentId);
                const child = itemById.get(edge.childId);
                if (!parent || !child) return null;
                const growing = newlyShown.has(child.id);
                const onPath = selectedPathIds.has(parent.id) && selectedPathIds.has(child.id);
                const childNode = child.nodeId ? byId.get(child.nodeId) : null;
                const childStats = childNode ? stats.get(childNode.id) : null;
                const growth = Boolean(childNode && ((childNode.joinedThisRound ? 1 : 0) + (childStats?.growth ?? 0) > 0));
                return (
                  <path
                    key={`${edge.id}-${growing ? 'bloom' : 'steady'}`}
                    pathLength="1"
                    d={branchPath(parent, child)}
                    className={`${edge.more ? 'moreEdge' : ''} ${growing ? 'bloomEdge' : ''} ${onPath ? 'pathEdge' : ''} ${growth ? 'growthEdge' : ''}`}
                  />
                );
              })}
            </svg>

            {layout.items.map((item, index) => {
              const parent = item.parentId ? itemById.get(item.parentId) : null;
              const entering = newlyShown.has(item.id) && Boolean(parent);
              const dx = parent ? parent.x - item.x : 0;
              const dy = parent ? parent.y - item.y : 0;
              const style = {
                left: item.x,
                top: item.y,
                '--dx': `${dx}px`,
                '--dy': `${dy}px`,
                '--delay': `${Math.min(180, (index % 7) * 24)}ms`,
                '--float-delay': `${-(index % 6) * 0.7}s`,
              } as CSSProperties;

              if (item.kind === 'more') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`moreNode ${entering ? 'entering' : ''}`}
                    style={style}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => item.parentId && revealMore(item.parentId)}
                    aria-label={`${item.moreCount} direct users more`}
                  >
                    <span className="fan"><i /><i /><i /></span>
                    <strong>+{item.moreCount}</strong>
                    <small>more</small>
                  </button>
                );
              }

              const node = item.nodeId ? byId.get(item.nodeId) : null;
              if (!node) return null;
              const isSelected = selectedId === node.id;
              const isExpanded = expanded.has(node.id);
              const hasChildren = node.children.length > 0;
              const isNew = node.joinedThisRound;
              const branchGrowth = (stats.get(node.id)?.growth ?? 0) + (isNew ? 1 : 0);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`person ${node.id === ROOT_ID ? 'root' : ''} ${isSelected ? 'selected' : ''} ${isExpanded && hasChildren ? 'expanded' : ''} ${entering ? 'entering' : ''} ${isNew ? 'newRound' : ''}`}
                  style={style}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => toggleNode(node)}
                  aria-label={`${node.id === ROOT_ID ? 'YOU' : node.wallet}, ${item.branch} branch`}
                >
                  <span className="orbWrap"><span className="orb" /></span>
                  <span className="nodeLabel">
                    <strong>{node.id === ROOT_ID ? 'YOU' : node.wallet}</strong>
                    {node.id !== ROOT_ID ? <small>{item.branch} Branch{growthMode && branchGrowth > 0 ? <em>+{branchGrowth}</em> : null}</small> : null}
                  </span>
                  {hasChildren ? <span className={`continuation ${isExpanded ? 'open' : ''}`}>⌄</span> : null}
                </button>
              );
            })}
          </div>

          {scenario === 'empty' ? (
            <div className="emptyState">
              <span className="emptyOrb" />
              <strong>Your network starts here</strong>
              <small>첫 사용자가 연결되면 이 공간에서 Branch가 펼쳐져요.</small>
            </div>
          ) : null}
        </div>

        {selected.id !== ROOT_ID ? (
          <aside className="miniInspector">
            <div><strong>{selected.wallet}</strong><small>{selectedStats.direct > 0 ? `${selectedStats.direct} Direct` : 'End of branch'}</small></div>
            <span><b>{1 + selectedStats.network}</b> Branch</span>
            <span><b>{selectedStats.qualified}</b> Qualified</span>
            {selectedStats.growth > 0 ? <span className="gold"><b>+{selectedStats.growth}</b> Round</span> : null}
          </aside>
        ) : null}
      </section>

      <div className="reviewNote"><b>V2.4 REVIEW</b><span>현재 화면을 교체하지 않고, 클릭한 자리에서 Branch가 계속 펼쳐지는 방식입니다.</span></div>

      <style jsx global>{`
        html,body{margin:0;min-height:100%;background:#070706;color:#f3eee2}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{font:inherit}
      `}</style>
      <style jsx>{`
        .previewPage{min-height:100vh;padding:10px 12px 28px;box-sizing:border-box;background:#070706}.qaBar{width:min(100%,1420px);min-height:42px;margin:0 auto 8px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-sizing:border-box;border:1px solid rgba(255,255,255,.045);border-radius:12px;background:rgba(255,255,255,.012)}.qaTitle{display:flex;align-items:baseline;gap:9px}.qaTitle strong{font-size:10px;color:#d2a640}.qaTitle span{font-size:9px;color:#5f5a52}.scenarioTabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.scenarioTabs button{height:28px;padding:0 9px;flex:0 0 auto;border:1px solid transparent;border-radius:8px;background:transparent;color:#6b665d;font-size:9px;font-weight:800;cursor:pointer}.scenarioTabs button.active{border-color:rgba(235,177,44,.14);background:rgba(235,177,44,.055);color:#cfa23e}.canvas{position:relative;width:min(100%,1420px);height:clamp(650px,84vh,920px);margin:0 auto;overflow:hidden;background:radial-gradient(circle at 50% 30%,rgba(143,98,38,.035),transparent 34%),#090908}.canvas::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.022) .6px,transparent .6px);background-size:42px 42px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.46),rgba(0,0,0,.08) 76%,transparent)}.topLeft{position:absolute;z-index:20;top:16px;left:18px;pointer-events:none}.topLeft>strong{display:block;font-size:11px;color:#d2ccc0}.crumbs{margin-top:5px;display:flex;align-items:center;gap:3px}.crumbs span{display:flex;align-items:center;gap:3px}.crumbs i{font-style:normal;color:#49453f;font-size:9px}.crumbs b{font-size:8px;color:#625e56;font-weight:700}.crumbs b.current{color:#9e978b}.summary{position:absolute;z-index:20;top:13px;right:18px;height:32px;padding:0 10px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:rgba(8,8,7,.68);backdrop-filter:blur(12px);color:#6f6a61;font-size:8px;cursor:pointer}.summary b{color:#c9c2b6;font-size:10px}.summary i{font-style:normal;color:#454039}.summary .round b{color:#cda13d}.summary.active{border-color:rgba(232,177,44,.14);background:rgba(232,177,44,.045)}.controls{position:absolute;z-index:20;left:16px;bottom:16px;display:flex;gap:6px}.controls button{height:34px;padding:0 10px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(8,8,7,.74);color:#7b756b;backdrop-filter:blur(12px);cursor:pointer}.controls b{font-size:13px;color:#a49d90}.controls span{font-size:8px;font-weight:800}.zoomControls{position:absolute;z-index:20;right:16px;bottom:16px;display:grid;gap:5px}.zoomControls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(8,8,7,.72);color:#8d867a;font-size:15px;cursor:pointer}.hint{position:absolute;z-index:19;left:50%;bottom:18px;transform:translateX(-50%);padding:7px 10px;border:1px solid rgba(255,255,255,.045);border-radius:999px;background:rgba(8,8,7,.7);color:#726c62;font-size:8px;pointer-events:none;animation:hintIn .25s ease both}.viewport{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:grab}.viewport:active{cursor:grabbing}.stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;transition:transform .42s cubic-bezier(.22,.78,.28,1)}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:rgba(194,186,169,.16);stroke-width:1.05;stroke-linecap:round;vector-effect:non-scaling-stroke;transition:stroke .22s ease,opacity .22s ease}.edges path.moreEdge{stroke-dasharray:2.5 5;stroke:rgba(194,186,169,.09)}.edges path.pathEdge{stroke:rgba(214,202,176,.3)}.growthMode .edges path{opacity:.07}.growthMode .edges path.growthEdge{opacity:1;stroke:rgba(211,164,55,.46)}.edges path.bloomEdge{stroke:rgba(224,180,69,.42);stroke-dasharray:1;stroke-dashoffset:1;animation:drawLine .48s cubic-bezier(.2,.78,.28,1) forwards}.person,.moreNode{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;background:transparent;cursor:pointer;touch-action:manipulation}.person{width:112px;height:86px;color:#d9d2c6;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:left .46s cubic-bezier(.2,.78,.28,1),top .46s cubic-bezier(.2,.78,.28,1),opacity .2s ease}.person.entering{animation:bloomNode .5s var(--delay) cubic-bezier(.18,.82,.26,1) both}.orbWrap{width:34px;height:34px;display:grid;place-items:center}.orb{width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.19);background:#11110f;box-shadow:0 0 0 5px rgba(255,255,255,.012);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;background .16s ease;animation:floatNode 6s var(--float-delay) ease-in-out infinite}.person:hover .orb{transform:scale(1.08);border-color:rgba(222,207,173,.38)}.person.root .orb{width:30px;height:30px;border-color:rgba(213,166,57,.56);background:#15120c;box-shadow:0 0 0 7px rgba(213,166,57,.038)}.person.selected .orb{border-color:rgba(232,186,77,.8);box-shadow:0 0 0 6px rgba(225,177,63,.07),0 0 20px rgba(213,160,40,.06)}.person.expanded:not(.root) .orb{background:#14120e}.person.newRound:not(.root) .orb::after{content:'';display:block;width:4px;height:4px;margin:3px 0 0 17px;border-radius:50%;background:#d5a23c;box-shadow:0 0 7px rgba(213,162,60,.35)}.nodeLabel{margin-top:5px;text-align:center;white-space:nowrap}.nodeLabel strong{display:block;color:#a8a197;font-size:9px;font-weight:800}.person.root .nodeLabel strong{color:#d4a944;font-size:10px}.nodeLabel small{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;color:#5e5a53;font-size:7px;font-weight:700}.nodeLabel em{font-style:normal;color:#bd9439}.continuation{position:absolute;bottom:2px;color:#4b4740;font-size:10px;line-height:1;transition:transform .22s ease,color .22s ease}.person:hover .continuation{color:#81786a}.continuation.open{transform:rotate(180deg);color:#897044}.moreNode{width:84px;height:66px;color:#81796d;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:left .46s cubic-bezier(.2,.78,.28,1),top .46s cubic-bezier(.2,.78,.28,1)}.moreNode.entering{animation:bloomNode .5s var(--delay) cubic-bezier(.18,.82,.26,1) both}.fan{position:relative;width:28px;height:14px}.fan i{position:absolute;top:4px;width:10px;height:10px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:#0f0f0d}.fan i:nth-child(1){left:1px}.fan i:nth-child(2){left:9px}.fan i:nth-child(3){left:17px}.moreNode strong{margin-top:2px;color:#9b8a61;font-size:9px}.moreNode small{margin-top:1px;color:#544f47;font-size:7px}.miniInspector{position:absolute;z-index:20;right:16px;bottom:62px;min-width:245px;max-width:320px;padding:10px 11px;display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(9,9,8,.78);backdrop-filter:blur(14px);box-shadow:0 12px 34px rgba(0,0,0,.16)}.miniInspector>div{min-width:0;margin-right:auto}.miniInspector>div strong{display:block;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c9c2b6;font-size:9px}.miniInspector>div small{display:block;margin-top:2px;color:#625e56;font-size:7px}.miniInspector>span{display:flex;flex-direction:column;align-items:flex-end;color:#59554e;font-size:7px}.miniInspector>span b{color:#9e978b;font-size:9px}.miniInspector>span.gold b{color:#c59a39}.emptyState{position:absolute;left:50%;top:50%;transform:translate(-50%,-48%);display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none}.emptyOrb{width:30px;height:30px;border:1px solid rgba(213,166,57,.5);border-radius:50%;box-shadow:0 0 0 7px rgba(213,166,57,.035)}.emptyState strong{margin-top:14px;color:#a79f92;font-size:11px}.emptyState small{margin-top:5px;color:#514d46;font-size:8px}.reviewNote{width:min(100%,1420px);margin:8px auto 0;display:flex;align-items:center;gap:8px;color:#5f5a52;font-size:8px}.reviewNote b{color:#8f7130;font-size:8px}
        @keyframes bloomNode{0%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.56)}55%{opacity:1}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes drawLine{0%{stroke-dashoffset:1;opacity:.18}100%{stroke-dashoffset:0;opacity:1}}@keyframes floatNode{0%,100%{translate:0 0}50%{translate:0 -1.5px}}@keyframes hintIn{from{opacity:0;transform:translate(-50%,5px)}to{opacity:1;transform:translate(-50%,0)}}
        @media(max-width:700px){.previewPage{padding:8px 0 20px}.qaBar{width:calc(100% - 12px);margin-bottom:6px;padding:5px 7px}.qaTitle span{display:none}.canvas{width:100%;height:calc(100dvh - 92px);min-height:610px}.topLeft{top:13px;left:13px}.summary{top:10px;right:10px}.controls{left:10px;bottom:10px}.hint{bottom:54px}.miniInspector{left:10px;right:10px;bottom:55px;min-width:0;max-width:none;justify-content:flex-start}.miniInspector>span{margin-left:auto}.person{width:102px}.nodeLabel strong{font-size:8px}.nodeLabel small{font-size:6.5px}.reviewNote{width:calc(100% - 20px);padding-top:2px}}
        @media(prefers-reduced-motion:reduce){.stage,.person,.moreNode,.orb,.edges path{transition:none!important;animation:none!important}.person.entering,.moreNode.entering{opacity:1!important;transform:translate(-50%,-50%)!important}}
      `}</style>
    </main>
  );
}
