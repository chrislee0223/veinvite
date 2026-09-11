'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'deep10' | 'direct50' | 'hundred' | 'fiveHundred' | 'worst';
type Scenario = { id: ScenarioId; label: string; note: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type GraphNode = { id: string; children: string[] };
type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };
type Curve = { id: string; parent: string; child: string; d: string; points: Point[]; opacity: number; active?: boolean; slot?: boolean };
type DisplayNode = { id: string; x: number; y: number; opacity: number; kind: 'root' | 'person' | 'slot' | 'branch'; parent: string | null };
type BranchNode = { id: string; x: number; y: number; opacity: number; parent: string };
type PrimaryNode = { id: string; index: number; opacity: number; layoutWeight: number; x: number };

const ROOT = 'root';
const ROOT_Y = 92;
const FAN_Y = 154;
const DIRECT_Y = 320;
const CHILD_GAP_Y = 190;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.78;
const PERSON_DIAMETER = 52;
const SLOT_DIAMETER = 46;
const BASE_PERSON_X = 104;
const ELASTIC_GAP = 138;
const FRONTIER_GAP = 136;

const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available 2개', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: 'Person + Available', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'five', label: '5명', note: '작은 direct', direct: 5, total: 9, depth: 2, fanout: 2, openSlots: 1 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 2 },
  { id: 'deep10', label: '10세대', note: '깊은 한쪽 가지', direct: 2, total: 16, depth: 10, fanout: 1, openSlots: 1 },
  { id: 'direct50', label: '직접 50명', note: 'direct 스트레스', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 2 },
  { id: 'hundred', label: '100명', note: '중형 네트워크', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 2 },
  { id: 'fiveHundred', label: '500명', note: '대형 스트레스', direct: 40, total: 500, depth: 6, fanout: 5, openSlots: 2 },
  { id: 'worst', label: '최악 구조', note: '불균형·다분기', direct: 12, total: 140, depth: 8, fanout: 6, openSlots: 2 },
];

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function shortId(id: string) { return id === ROOT ? 'YOU' : `0x…${id.replace('n', '').padStart(4, '0')}`; }
function smoothReveal(scale: number, start: number, end: number) {
  if (scale <= start) return 0;
  if (scale >= end) return 1;
  const t = (scale - start) / (end - start);
  return t * t * (3 - 2 * t);
}

function makeGraph(s: Scenario) {
  const graph = new Map<string, GraphNode>([[ROOT, { id: ROOT, children: [] }]]);
  if (!s.total || !s.direct) return graph;
  let nextId = 1;
  const depths = new Map<string, number>([[ROOT, 0]]);
  const roots: string[] = [];
  for (let i = 0; i < s.direct && nextId <= s.total; i += 1) {
    const id = `n${nextId++}`;
    roots.push(id);
    graph.set(id, { id, children: [] });
    depths.set(id, 1);
  }
  graph.set(ROOT, { id: ROOT, children: roots });

  if (s.id === 'deep10') {
    let cursor = roots[0];
    for (let depth = 2; depth <= s.depth && nextId <= s.total && cursor; depth += 1) {
      const id = `n${nextId++}`;
      graph.get(cursor)?.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, depth);
      cursor = id;
    }
    while (nextId <= s.total && roots[1]) {
      const id = `n${nextId++}`;
      graph.get(roots[1])?.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, 2);
    }
    return graph;
  }

  const queue = [...roots];
  let cursor = 0;
  while (nextId <= s.total && cursor < queue.length) {
    const parent = queue[cursor++];
    const depth = depths.get(parent) ?? 1;
    if (depth >= s.depth) continue;
    const seed = Number(parent.replace('n', '')) || 1;
    const cap = Math.max(1, s.fanout || 1);
    const wanted = s.id === 'worst' ? 1 + (seed % cap) : Math.min(cap, 2 + (seed % Math.max(1, cap - 1)));
    for (let i = 0; i < wanted && nextId <= s.total; i += 1) {
      const id = `n${nextId++}`;
      graph.get(parent)?.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, depth + 1);
      queue.push(id);
    }
  }
  while (nextId <= s.total && roots.length) {
    const parent = roots[(nextId - 1) % roots.length];
    const id = `n${nextId++}`;
    graph.get(parent)?.children.push(id);
    graph.set(id, { id, children: [] });
  }
  return graph;
}

function descendants(graph: Map<string, GraphNode>, id: string): number {
  return (graph.get(id)?.children ?? []).reduce((sum, child) => sum + 1 + descendants(graph, child), 0);
}

function revealState(index: number, scale: number, maxPeople: number) {
  if (index >= maxPeople) return { opacity: 0, layoutWeight: 0 };
  if (index < 2) return { opacity: 1, layoutWeight: 1 };
  if (index < 4) return {
    opacity: smoothReveal(scale, 1.00, 1.14),
    layoutWeight: smoothReveal(scale, 0.95, 1.10),
  };
  if (index < 6) return {
    opacity: smoothReveal(scale, 1.18, 1.34),
    layoutWeight: smoothReveal(scale, 1.13, 1.30),
  };
  return {
    opacity: smoothReveal(scale, 1.38, 1.56),
    layoutWeight: smoothReveal(scale, 1.33, 1.52),
  };
}

function elasticPersonX(index: number, states: Array<{ layoutWeight: number }>, single: boolean) {
  if (single) return -96;
  const side = index % 2 === 0 ? -1 : 1;
  const rank = Math.floor(index / 2);
  let extent = BASE_PERSON_X;
  for (let r = 1; r <= rank; r += 1) {
    const priorIndex = side < 0 ? r * 2 : r * 2 + 1;
    extent += ELASTIC_GAP * (states[priorIndex]?.layoutWeight ?? 0);
  }
  return side * extent;
}

function frontierSlots(primary: PrimaryNode[], openSlots: number) {
  if (openSlots <= 0) return [] as number[];
  if (!primary.length) return openSlots >= 2 ? [-112, 112] : [0];
  if (primary.length === 1 && openSlots === 1) return [96];

  const layoutPeople = primary.filter((item) => item.opacity > 0.02 || item.layoutWeight > 0.05);
  const left = layoutPeople.filter((item) => item.x < 0).reduce((extent, item) => Math.max(extent, Math.abs(item.x)), BASE_PERSON_X);
  const right = layoutPeople.filter((item) => item.x > 0).reduce((extent, item) => Math.max(extent, Math.abs(item.x)), BASE_PERSON_X);
  if (openSlots >= 2) return [-(left + FRONTIER_GAP), right + FRONTIER_GAP];
  return [right + FRONTIER_GAP];
}

function depthOpacity(depth: number, scale: number) {
  if (depth <= 1) return 1;
  if (depth === 2) return smoothReveal(scale, 1.14, 1.30);
  if (depth === 3) return smoothReveal(scale, 1.34, 1.50);
  return smoothReveal(scale, 1.52, 1.70);
}

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * b.x + 3 * mt * t ** 2 * c.x + t ** 3 * d.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * b.y + 3 * mt * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function makeCurve(id: string, parent: string, child: string, start: Point, end: Point, opacity: number, options?: { active?: boolean; slot?: boolean }): Curve {
  const dx = end.x - start.x;
  const dy = Math.max(86, end.y - start.y);
  const c1 = { x: start.x + dx * 0.08, y: start.y + dy * 0.24 };
  const c2 = { x: end.x - dx * 0.18, y: end.y - dy * 0.34 };
  const d = `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  const points = Array.from({ length: 25 }, (_, i) => cubicPoint(start, c1, c2, end, i / 24));
  return { id, parent, child, d, points, opacity, active: options?.active, slot: options?.slot };
}

function buildFocusedLayout(graph: Map<string, GraphNode>, focused: string | null, focusX: number, scale: number) {
  const placed: BranchNode[] = [];
  const curves: Curve[] = [];
  if (!focused) return { placed, curves };
  const maxDepth = scale < 1.18 ? 1 : scale < 1.36 ? 2 : scale < 1.54 ? 3 : 4;
  const childCap = 5;
  const unit = 116;
  const measure = (id: string, depth: number): number => {
    if (depth >= maxDepth) return 1;
    const children = (graph.get(id)?.children ?? []).slice(0, childCap);
    if (!children.length) return 1;
    return Math.max(1, children.reduce((sum, child) => sum + measure(child, depth + 1), 0));
  };
  const rootWidth = Math.max(unit, measure(focused, 1) * unit);
  const place = (parentId: string, px: number, py: number, depth: number, left: number, width: number) => {
    if (depth >= maxDepth) return;
    const children = (graph.get(parentId)?.children ?? []).slice(0, childCap);
    if (!children.length) return;
    const weights = children.map((id) => measure(id, depth + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cursor = left;
    children.forEach((childId, index) => {
      const childWidth = width * (weights[index] / totalWeight);
      const cx = cursor + childWidth / 2;
      const cy = DIRECT_Y + depth * CHILD_GAP_Y;
      const opacity = depthOpacity(depth + 1, scale);
      placed.push({ id: childId, x: cx, y: cy, opacity, parent: parentId });
      curves.push(makeCurve(
        `branch-${parentId}-${childId}`,
        parentId,
        childId,
        { x: px, y: py + PERSON_DIAMETER / 2 },
        { x: cx, y: cy - PERSON_DIAMETER / 2 },
        Math.min(1, opacity * 1.12 + 0.04),
        { active: true },
      ));
      place(childId, cx, cy, depth + 1, cursor, childWidth);
      cursor += childWidth;
    });
  };
  place(focused, focusX, DIRECT_Y, 1, focusX - rootWidth / 2, rootWidth);
  return { placed, curves };
}

function properCross(a1: Point, a2: Point, b1: Point, b2: Point) {
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return orient(a1, a2, b1) * orient(a1, a2, b2) < 0 && orient(b1, b2, a1) * orient(b1, b2, a2) < 0;
}

export function QaNetworkStressLabV25() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 36, scale: 0.94 });
  const [compact, setCompact] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{ id: number; start: Point; view: View } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const graph = useMemo(() => makeGraph(scenario), [scenario]);
  const rootChildren = graph.get(ROOT)?.children ?? [];
  const objectCap = compact ? 6 : 8;
  const visibleSlotCount = Math.min(2, scenario.openSlots);
  const peopleCap = Math.max(0, objectCap - visibleSlotCount);
  const pageSize = Math.max(1, peopleCap);
  const pageCount = Math.max(1, Math.ceil(rootChildren.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageIds = rootChildren.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const revealStates = pageIds.map((_, index) => revealState(index, view.scale, peopleCap));
  const primary: PrimaryNode[] = pageIds.map((id, index) => ({
    id,
    index,
    opacity: revealStates[index].opacity,
    layoutWeight: revealStates[index].layoutWeight,
    x: elasticPersonX(index, revealStates, pageIds.length === 1),
  }));
  const slots = frontierSlots(primary, visibleSlotCount);
  const visiblePrimary = primary.filter((item) => item.opacity > 0.035);
  const focusedPrimary = primary.find((item) => item.id === focused) ?? null;
  const focusLayout = useMemo(
    () => buildFocusedLayout(graph, focusedPrimary?.id ?? null, focusedPrimary?.x ?? 0, view.scale),
    [graph, focusedPrimary?.id, focusedPrimary?.x, view.scale],
  );

  const materializedXs = [
    ...primary.filter((item) => item.opacity > 0.015 || item.layoutWeight > 0.06).map((item) => item.x),
    ...slots,
    ...focusLayout.placed.filter((node) => node.opacity > 0.015).map((node) => node.x),
  ];
  const halfWidth = Math.ceil(Math.max(360, ...materializedXs.map((x) => Math.abs(x) + 150)));
  const worldW = halfWidth * 2;
  const rootX = halfWidth;
  const toWorldX = (x: number) => rootX + x;
  const worldH = Math.max(930, ...focusLayout.placed.filter((node) => node.opacity > 0.015).map((node) => node.y + 170)) + 120;

  const directCurves = visiblePrimary.map((item) => makeCurve(
    `direct-${item.id}`, ROOT, item.id,
    { x: rootX, y: FAN_Y },
    { x: toWorldX(item.x), y: DIRECT_Y - PERSON_DIAMETER / 2 },
    Math.min(1, item.opacity * 1.08 + 0.03),
    { active: focused === item.id },
  ));
  const slotCurves = slots.map((x, index) => makeCurve(
    `slot-${index}`, ROOT, `slot-${index}`,
    { x: rootX, y: FAN_Y },
    { x: toWorldX(x), y: DIRECT_Y - SLOT_DIAMETER / 2 },
    0.58,
    { slot: true },
  ));
  const branchCurves = focusLayout.curves.filter((curve) => curve.opacity > 0.015).map((curve) => {
    const start = curve.points[0];
    const end = curve.points[curve.points.length - 1];
    return makeCurve(curve.id, curve.parent, curve.child, { x: toWorldX(start.x), y: start.y }, { x: toWorldX(end.x), y: end.y }, curve.opacity, { active: true });
  });
  const curves = [...directCurves, ...slotCurves, ...branchCurves];

  const displayNodes: DisplayNode[] = [
    { id: ROOT, x: rootX, y: ROOT_Y, opacity: 1, kind: 'root', parent: null },
    ...visiblePrimary.map((item) => ({ id: item.id, x: toWorldX(item.x), y: DIRECT_Y, opacity: item.opacity, kind: 'person' as const, parent: ROOT })),
    ...slots.map((x, index) => ({ id: `slot-${index}`, x: toWorldX(x), y: DIRECT_Y, opacity: 1, kind: 'slot' as const, parent: ROOT })),
    ...focusLayout.placed.filter((node) => node.opacity > 0.035).map((node) => ({ id: node.id, x: toWorldX(node.x), y: node.y, opacity: node.opacity, kind: 'branch' as const, parent: node.parent })),
  ];

  const duplicateCount = displayNodes.length - new Set(displayNodes.map((node) => node.id)).size;
  let nodeOverlap = 0;
  let availableOverlap = 0;
  let labelOverlap = 0;
  for (let i = 0; i < displayNodes.length; i += 1) {
    for (let j = i + 1; j < displayNodes.length; j += 1) {
      const a = displayNodes[i]; const b = displayNodes[j];
      const dx = Math.abs(a.x - b.x); const dy = Math.abs(a.y - b.y);
      if (dx < 88 && dy < 70) nodeOverlap += 1;
      if ((a.kind === 'slot' || b.kind === 'slot') && dx < 94 && dy < 76) availableOverlap += 1;
      if (dy < 44 && dx < 122) labelOverlap += 1;
    }
  }
  let lineCross = 0;
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      const a = curves[i]; const b = curves[j];
      if (a.parent === b.parent || a.child === b.child || a.parent === b.child || a.child === b.parent) continue;
      outer: for (let ai = 0; ai < a.points.length - 1; ai += 1) {
        for (let bi = 0; bi < b.points.length - 1; bi += 1) {
          if (properCross(a.points[ai], a.points[ai + 1], b.points[bi], b.points[bi + 1])) { lineCross += 1; break outer; }
        }
      }
    }
  }
  let edgeNodeOverlap = 0;
  curves.forEach((curve) => displayNodes.forEach((node) => {
    if (node.id === curve.parent || node.id === curve.child) return;
    if (curve.points.some((point) => Math.abs(point.x - node.x) < 34 && Math.abs(point.y - node.y) < 30)) edgeNodeOverlap += 1;
  }));
  const clipped = displayNodes.filter((node) => node.x < 66 || node.x > worldW - 66 || node.y < 50 || node.y > worldH - 72).length;
  const ghostReserve = primary.filter((item) => item.opacity < 0.015 && item.layoutWeight < 0.06).some((item) => Math.abs(item.x) + 150 >= halfWidth + 1) ? 1 : 0;
  const metrics = [
    ['Line crossing', lineCross], ['Node overlap', nodeOverlap], ['Available overlap', availableOverlap], ['Edge-node', edgeNodeOverlap],
    ['Label overlap', labelOverlap], ['Clipped', clipped], ['Ghost reserve', ghostReserve], ['Duplicate', duplicateCount],
  ] as const;

  const setScenario = (id: ScenarioId) => {
    setScenarioId(id); setPage(0); setFocused(null); setView({ x: 0, y: 36, scale: 0.94 });
  };
  const changeScale = (nextScale: number, anchor?: Point) => {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (!anchor || !stageRef.current) { setView((current) => ({ ...current, scale })); return; }
    const rect = stageRef.current.getBoundingClientRect();
    const ax = anchor.x - rect.left; const ay = anchor.y - rect.top;
    setView((current) => {
      const ratio = scale / current.scale;
      return { scale, x: ax - (ax - current.x) * ratio, y: ay - (ay - current.y) * ratio };
    });
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault(); changeScale(view.scale + (event.deltaY > 0 ? -0.09 : 0.09), { x: event.clientX, y: event.clientY });
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, view }; pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: view.scale }; dragRef.current = null;
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      changeScale(pinchRef.current.scale * (distance / pinchRef.current.distance), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setView({ ...drag.view, x: drag.view.x + event.clientX - drag.start.x, y: drag.view.y + event.clientY - drag.start.y });
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null; if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  const hiddenCurrentPage = primary.some((item) => item.opacity < 0.96);
  const hiddenOtherPages = pageCount > 1;
  const outerExtent = Math.max(...slots.map((x) => Math.abs(x)), ...visiblePrimary.map((item) => Math.abs(item.x)), 0);

  return (
    <main className="page">
      <section className="labHeader">
        <div><strong>NETWORK STRESS LAB · V25</strong><span>Elastic reveal · live frontier · no ghost space</span></div>
        <div className="metrics">{metrics.map(([label, value]) => <span key={label} className={value ? 'bad' : 'good'}>{label} {value}</span>)}</div>
      </section>

      <section className="scenarioBar" aria-label="Stress scenarios">
        {SCENARIOS.map((item) => <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => setScenario(item.id)}><b>{item.label}</b><small>{item.note}</small></button>)}
      </section>

      <section className="summary">
        <div><b>{scenario.label}</b><span>{scenario.total} members · {scenario.direct} direct · depth {scenario.depth}</span></div>
        <p>숨겨진 사람은 빈 공간을 차지하지 않습니다. 확대 진행도만큼 레이아웃이 바깥으로 열리고 Available도 현재 보이는 경계를 따라 이동합니다.</p>
      </section>

      <section className="networkShell">
        <div className="toolbar">
          <div><b>NETWORK</b><span>{focused ? `${shortId(focused)} branch` : 'Overview'}</span></div>
          <div className="toolbarActions">
            {focused ? <button type="button" onClick={() => setFocused(null)}>Overview</button> : null}
            <button type="button" onClick={() => setView({ x: 0, y: 36, scale: 0.94 })}>◎</button>
            <button type="button" onClick={() => changeScale(view.scale + 0.12)}>+</button>
            <button type="button" onClick={() => changeScale(view.scale - 0.12)}>−</button>
          </div>
        </div>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <div className="zoomHud">{Math.round(view.scale * 100)}% · elastic layout · drag / wheel / pinch</div>
          {pageCount > 1 ? <div className="pager"><button type="button" onClick={() => { setFocused(null); setPage((current) => (current - 1 + pageCount) % pageCount); }}>‹</button><span>Direct {safePage + 1}/{pageCount}</span><button type="button" onClick={() => { setFocused(null); setPage((current) => (current + 1) % pageCount); }}>›</button></div> : null}

          <div className="world" style={{ width: worldW, height: worldH, marginLeft: -worldW / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg width={worldW} height={worldH} viewBox={`0 0 ${worldW} ${worldH}`} className="edges" aria-hidden="true">
              <defs>
                <linearGradient id="base25" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(225,199,111,.16)"/><stop offset="1" stopColor="rgba(225,199,111,.055)"/></linearGradient>
                <linearGradient id="flow25" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={worldH}>
                  <stop offset="0" stopColor="rgba(244,183,40,0)"/><stop offset=".10" stopColor="rgba(244,183,40,0)"/><stop offset=".20" stopColor="rgba(244,183,40,.72)"/><stop offset=".34" stopColor="rgba(244,183,40,0)"/><stop offset="1" stopColor="rgba(244,183,40,0)"/>
                  <animateTransform attributeName="gradientTransform" type="translate" values={`0 -${Math.round(worldH * 0.36)};0 ${Math.round(worldH * 0.50)}`} dur="5.6s" repeatCount="indefinite"/>
                </linearGradient>
                <filter id="softGlow25" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
              </defs>
              {curves.map((curve) => <path key={`${curve.id}-base`} d={curve.d} className={`curveBase ${curve.slot ? 'slotBase' : ''}`} style={{ opacity: curve.opacity }}/>) }
              {curves.filter((curve) => curve.slot || curve.active).map((curve) => <path key={`${curve.id}-flow`} d={curve.d} className="curveFlow" style={{ opacity: curve.slot ? 0.62 : 0.42 }}/>) }
              <path d={`M${rootX} ${ROOT_Y + 31} C${rootX} ${ROOT_Y + 42}, ${rootX} ${FAN_Y - 8}, ${rootX} ${FAN_Y}`} className="rootTrunk"/>
              {(hiddenCurrentPage || hiddenOtherPages) && visiblePrimary.length ? <>
                <path d={`M${rootX - outerExtent - 26} ${DIRECT_Y + 10} C${rootX - outerExtent - 42} ${DIRECT_Y + 16},${rootX - outerExtent - 54} ${DIRECT_Y + 24},${rootX - outerExtent - 70} ${DIRECT_Y + 24}`} className="continuation"/>
                <path d={`M${rootX + outerExtent + 26} ${DIRECT_Y + 10} C${rootX + outerExtent + 42} ${DIRECT_Y + 16},${rootX + outerExtent + 54} ${DIRECT_Y + 24},${rootX + outerExtent + 70} ${DIRECT_Y + 24}`} className="continuation"/>
              </> : null}
            </svg>

            <button type="button" className="node rootNode" style={{ left: rootX, top: ROOT_Y }}><span className="nodeCircle">●</span><b>YOU</b><small>{scenario.total} network · {scenario.direct} direct</small></button>
            {primary.map((item) => <button key={item.id} type="button" className={`node personNode ${focused === item.id ? 'focused' : ''}`} style={{ left: toWorldX(item.x), top: DIRECT_Y, opacity: item.opacity, transform: `translate(-50%,-${PERSON_DIAMETER / 2}px) scale(${0.86 + item.opacity * 0.14})`, pointerEvents: item.opacity > 0.55 ? 'auto' : 'none' }} onClick={() => { if ((graph.get(item.id)?.children.length ?? 0) > 0) setFocused(item.id); }}><span className="nodeCircle">●</span><b>{shortId(item.id)}</b><small>{descendants(graph, item.id)} network · {graph.get(item.id)?.children.length ?? 0} direct</small></button>)}
            {focusLayout.placed.map((node) => <button key={`branch-${node.id}`} type="button" className="node branchNode" style={{ left: toWorldX(node.x), top: node.y, opacity: node.opacity, transform: `translate(-50%,-${PERSON_DIAMETER / 2}px) scale(${0.84 + node.opacity * 0.16})`, pointerEvents: node.opacity > 0.6 ? 'auto' : 'none' }}><span className="nodeCircle">●</span><b>{shortId(node.id)}</b><small>{descendants(graph, node.id)} network</small></button>)}
            {slots.map((x, index) => <button key={`slot-${index}`} type="button" className="emptySlot" style={{ left: toWorldX(x), top: DIRECT_Y }}><span className="slotCircle">+</span><b>Available</b><small>Invite slot</small></button>)}
          </div>
        </div>
      </section>

      <section className="rules">
        <span><b>1 · No ghost space</b>opacity 0인 미래 노드는 초기 폭과 캔버스 계산에서 제외</span>
        <span><b>2 · Elastic reveal</b>새 노드보다 공간이 살짝 먼저 열리고 줌 진행도에 맞춰 바깥으로 연속 확장</span>
        <span><b>3 · Live frontier</b>Available은 실제로 드러난 사람의 바깥 경계를 따라 자연스럽게 이동</span>
        <span><b>4 · Stable core</b>처음 두 사람은 고정하고 새 direct가 바깥으로 자라므로 시선이 흔들리지 않음</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}.labHeader,.scenarioBar,.summary,.networkShell,.rules{width:min(calc(100vw - 20px),920px);margin-left:auto;margin-right:auto;box-sizing:border-box}
        .labHeader{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}.metrics{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.metrics span{padding:4px 6px;border-radius:8px;font-size:.43rem;border:1px solid rgba(255,255,255,.06)}.metrics .good{color:#79b38a;background:rgba(89,147,104,.05)}.metrics .bad{color:#df8577;background:rgba(190,80,67,.07)}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:76px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.42rem;color:#6e685f}
        .summary{padding:8px 11px 10px;display:flex;align-items:center;justify-content:space-between;gap:16px}.summary>div{display:grid;gap:2px}.summary b{font-size:.68rem}.summary span,.summary p{font-size:.49rem;color:#777066}.summary p{max-width:560px;line-height:1.5;margin:0}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.toolbar{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.05)}.toolbar>div:first-child{display:grid;gap:1px}.toolbar b{font-size:.54rem;letter-spacing:.08em;color:#c6a858}.toolbar span{font-size:.43rem;color:#736d63}.toolbarActions{display:flex;gap:5px}.toolbarActions button,.pager button{min-width:30px;height:27px;padding:0 8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;color:#a89f91;background:#0d0d0b;font-size:.55rem}
        .stage{height:min(68svh,650px);min-height:470px;position:relative;overflow:hidden;touch-action:none;cursor:grab;background:radial-gradient(circle at 50% 12%,rgba(244,183,40,.025),transparent 34%),#080807}.stage:active{cursor:grabbing}.zoomHud,.pager{position:absolute;z-index:20;top:9px;border:1px solid rgba(255,255,255,.05);background:rgba(10,10,8,.84);backdrop-filter:blur(8px);border-radius:9px;color:#726b61;font-size:.44rem}.zoomHud{left:10px;padding:6px 8px}.pager{right:10px;padding:3px;display:flex;align-items:center;gap:6px}.pager span{font-size:.44rem;color:#81796d}
        .world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.curveBase,.rootTrunk,.continuation{fill:none;stroke-linecap:round}.curveBase{stroke:url(#base25);stroke-width:1.05}.slotBase{stroke:rgba(196,157,55,.18)}.rootTrunk{stroke:rgba(217,181,78,.22);stroke-width:1.12}.curveFlow{fill:none;stroke:url(#flow25);stroke-width:3.2;stroke-linecap:round;filter:url(#softGlow25);mix-blend-mode:screen}.continuation{stroke:rgba(219,192,112,.12);stroke-width:1.05}
        .node,.emptySlot{position:absolute;width:104px;display:grid;justify-items:center;align-content:start;gap:4px;color:#ddd7ca;z-index:4;transform-origin:50% ${PERSON_DIAMETER / 2}px}.nodeCircle,.slotCircle{border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.nodeCircle{width:${PERSON_DIAMETER}px;height:${PERSON_DIAMETER}px;border:1px solid rgba(210,174,65,.36);color:#e1b744;font-size:.64rem}.rootNode{transform:translate(-50%,-31px)}.rootNode .nodeCircle{width:62px;height:62px;border-color:rgba(244,183,40,.62);box-shadow:0 0 28px rgba(244,183,40,.035)}.node b,.emptySlot b{font-size:.49rem;font-weight:750;white-space:nowrap}.rootNode b{font-size:.57rem}.node small,.emptySlot small{font-size:.4rem;color:#6f685e;white-space:nowrap}.personNode,.branchNode{transition:opacity 80ms linear,transform 80ms linear}.personNode.focused .nodeCircle{border-color:rgba(244,183,40,.75);box-shadow:0 0 20px rgba(244,183,40,.08)}
        .emptySlot{z-index:5;opacity:.76;transform:translate(-50%,-${SLOT_DIAMETER / 2}px)}.slotCircle{width:${SLOT_DIAMETER}px;height:${SLOT_DIAMETER}px;border:1px dashed rgba(226,181,62,.48);color:#c79f36;font-size:.9rem;animation:slotBreath 4.6s ease-in-out infinite}.emptySlot b{color:#9f9270}.emptySlot small{color:#6d6557}.rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding-top:9px}.rules span{display:grid;gap:3px;padding:9px 10px;border:1px solid rgba(255,255,255,.05);border-radius:11px;background:#0b0b09;color:#70695f;font-size:.45rem;line-height:1.5}.rules b{color:#a58c4c;font-size:.48rem}@keyframes slotBreath{0%,74%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}84%{box-shadow:0 0 20px rgba(244,183,40,.1)}}
        @media(prefers-reduced-motion:reduce){.slotCircle{animation:none}.curveFlow{display:none}.personNode,.branchNode{transition:none}}@media(max-width:640px){.labHeader{align-items:flex-start;flex-direction:column}.metrics{justify-content:flex-start}.summary{align-items:flex-start;flex-direction:column;gap:5px}.summary p{max-width:none}.stage{height:60svh;min-height:470px}.rules{grid-template-columns:1fr 1fr}.node,.emptySlot{width:94px}.node small,.emptySlot small{font-size:.37rem}}@media(max-width:410px){.rules{grid-template-columns:1fr}.metrics span{font-size:.4rem}.stage{min-height:440px}}
      `}</style>
    </main>
  );
}
