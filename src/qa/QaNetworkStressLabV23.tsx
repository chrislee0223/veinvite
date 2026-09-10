'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type GraphNode = { id: string; children: string[] };
type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'deep10' | 'direct50' | 'hundred' | 'fiveHundred' | 'worst';
type Scenario = { id: ScenarioId; label: string; note: string; direct: number; total: number; depth: number; fanout: number; openSlots: number };
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type DisplayNode = { id: string; x: number; y: number; opacity: number; kind: 'root' | 'person' | 'slot' | 'branch'; parent: string | null; label: string };
type Curve = { id: string; parent: string; child: string; d: string; points: Point[]; opacity: number; active?: boolean; slot?: boolean };
type PlacedBranch = { id: string; x: number; y: number; opacity: number; parent: string };

const ROOT = 'root';
const ROOT_Y = 92;
const FAN_Y = 174;
const DIRECT_Y = 330;
const CHILD_GAP_Y = 194;
const NODE_W = 98;
const NODE_H = 78;
const MIN_SCALE = .82;
const MAX_SCALE = 1.78;

const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available 2개', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: 'Person + Available', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'five', label: '5명', note: '작은 direct', direct: 5, total: 9, depth: 2, fanout: 2, openSlots: 1 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 1 },
  { id: 'deep10', label: '10세대', note: '깊은 한쪽 가지', direct: 2, total: 16, depth: 10, fanout: 1, openSlots: 1 },
  { id: 'direct50', label: '직접 50명', note: 'direct 스트레스', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'hundred', label: '100명', note: '중형 네트워크', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 1 },
  { id: 'fiveHundred', label: '500명', note: '대형 스트레스', direct: 40, total: 500, depth: 6, fanout: 5, openSlots: 1 },
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
    depths.set(id, 1);
    graph.set(id, { id, children: [] });
  }
  graph.set(ROOT, { id: ROOT, children: roots });

  if (s.id === 'deep10') {
    let cursor = roots[0];
    for (let depth = 2; depth <= s.depth && nextId <= s.total; depth += 1) {
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
  let qi = 0;
  while (nextId <= s.total && qi < queue.length) {
    const parent = queue[qi++];
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
  const children = graph.get(id)?.children ?? [];
  return children.reduce((sum, child) => sum + 1 + descendants(graph, child), 0);
}

function directOpacity(index: number, scale: number, compact: boolean) {
  if (index < 2) return 1;
  if (index < 4) return smoothReveal(scale, 1.00, 1.13);
  if (index < 6) return smoothReveal(scale, 1.18, 1.32);
  if (compact) return 0;
  return smoothReveal(scale, 1.38, 1.54);
}

function depthOpacity(depth: number, scale: number) {
  if (depth <= 1) return 1;
  if (depth === 2) return smoothReveal(scale, 1.14, 1.29);
  if (depth === 3) return smoothReveal(scale, 1.34, 1.49);
  return smoothReveal(scale, 1.52, 1.69);
}

function overviewSlots(personCount: number, openSlots: number) {
  if (personCount === 0) {
    return { people: [] as number[], slots: openSlots >= 2 ? [-112, 112] : openSlots === 1 ? [0] : [] };
  }
  if (personCount === 1) {
    return { people: [-128], slots: openSlots >= 1 ? [128, ...(openSlots > 1 ? [330] : [])] : [] };
  }
  if (openSlots >= 2) {
    return {
      people: [-330, 330, -500, 500, -670, 670, -840, 840].slice(0, personCount),
      slots: [-118, 118],
    };
  }
  if (openSlots === 1) {
    return {
      people: [-176, 176, -356, 356, -536, 536, -716, 716].slice(0, personCount),
      slots: [0],
    };
  }
  return {
    people: [-108, 108, -286, 286, -464, 464, -642, 642].slice(0, personCount),
    slots: [],
  };
}

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * b.x + 3 * mt * t ** 2 * c.x + t ** 3 * d.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * b.y + 3 * mt * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function makeCurve(id: string, parent: string, child: string, start: Point, end: Point, opacity: number, options?: { active?: boolean; slot?: boolean }): Curve {
  const dy = Math.max(80, end.y - start.y);
  const c1 = { x: start.x, y: start.y + dy * .42 };
  const c2 = { x: end.x, y: end.y - dy * .48 };
  const d = `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  const points = Array.from({ length: 19 }, (_, i) => cubicPoint(start, c1, c2, end, i / 18));
  return { id, parent, child, d, points, opacity, active: options?.active, slot: options?.slot };
}

function buildFocusedLayout(graph: Map<string, GraphNode>, focused: string | null, focusX: number, scale: number) {
  const placed: PlacedBranch[] = [];
  const curves: Curve[] = [];
  if (!focused) return { placed, curves };
  const maxDepth = scale < 1.16 ? 1 : scale < 1.34 ? 2 : scale < 1.52 ? 3 : 4;
  const childCap = 5;
  const unit = 118;

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
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = left;
    children.forEach((childId, index) => {
      const childWidth = width * (weights[index] / total);
      const cx = cursor + childWidth / 2;
      const cy = DIRECT_Y + depth * CHILD_GAP_Y;
      const opacity = depthOpacity(depth + 1, scale);
      placed.push({ id: childId, x: cx, y: cy, opacity, parent: parentId });
      curves.push(makeCurve(`branch-${parentId}-${childId}`, parentId, childId, { x: px, y: py + 40 }, { x: cx, y: cy - 42 }, Math.min(1, opacity * 1.22 + .06), { active: true }));
      place(childId, cx, cy, depth + 1, cursor, childWidth);
      cursor += childWidth;
    });
  };

  place(focused, focusX, DIRECT_Y, 1, focusX - rootWidth / 2, rootWidth);
  return { placed, curves };
}

function properCross(a1: Point, a2: Point, b1: Point, b2: Point) {
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function QaNetworkStressLabV23() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 36, scale: .94 });
  const [compact, setCompact] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{ id: number; start: Point; view: View } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number; center: Point } | null>(null);

  useEffect(() => {
    const sync = () => setCompact(window.innerWidth <= 640);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const graph = useMemo(() => makeGraph(scenario), [scenario]);
  const rootChildren = graph.get(ROOT)?.children ?? [];
  const pageSize = compact ? 6 : 8;
  const pageCount = Math.max(1, Math.ceil(rootChildren.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageIds = rootChildren.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const slots = overviewSlots(pageIds.length, scenario.openSlots);

  const primary = pageIds.map((id, index) => ({ id, x: slots.people[index] ?? 0, opacity: directOpacity(index, view.scale, compact) }));
  const visiblePrimary = primary.filter((item) => item.opacity > .035);
  const focusedPrimary = primary.find((item) => item.id === focused) ?? null;
  const focusLayout = useMemo(() => buildFocusedLayout(graph, focusedPrimary?.id ?? null, focusedPrimary?.x ?? 0, view.scale), [focusedPrimary?.id, focusedPrimary?.x, graph, view.scale]);

  const contentXs = [...primary.map((item) => item.x), ...slots.slots, ...focusLayout.placed.map((node) => node.x)];
  const minX = Math.min(-600, ...contentXs.map((x) => x - 120));
  const maxX = Math.max(600, ...contentXs.map((x) => x + 120));
  const worldW = Math.ceil(maxX - minX + 300);
  const rootX = -minX + 150;
  const toWorldX = (x: number) => rootX + x;
  const worldH = Math.max(980, ...focusLayout.placed.map((node) => node.y + 180)) + 120;

  const directCurves = visiblePrimary.map((item) => makeCurve(
    `direct-${item.id}`,
    ROOT,
    item.id,
    { x: rootX, y: FAN_Y },
    { x: toWorldX(item.x), y: DIRECT_Y - 43 },
    Math.min(1, item.opacity * 1.28 + .06),
    { active: focused === item.id },
  ));
  const slotCurves = slots.slots.map((x, index) => makeCurve(
    `slot-${index}`,
    ROOT,
    `slot-${index}`,
    { x: rootX, y: FAN_Y },
    { x: toWorldX(x), y: DIRECT_Y - 43 },
    1,
    { slot: true },
  ));
  const branchCurves = focusLayout.curves.map((curve) => ({ ...curve, d: curve.d.replaceAll(/(-?\d+(?:\.\d+)?)/g, (raw) => raw), points: curve.points.map((p) => ({ x: toWorldX(p.x), y: p.y })) }));
  const branchCurvesWorld = focusLayout.curves.map((curve) => {
    const pts = curve.points.map((p) => ({ x: toWorldX(p.x), y: p.y }));
    if (pts.length < 4) return { ...curve, points: pts };
    const start = pts[0];
    const end = pts[pts.length - 1];
    return makeCurve(curve.id, curve.parent, curve.child, start, end, curve.opacity, { active: true });
  });
  void branchCurves;
  const curves = [...directCurves, ...slotCurves, ...branchCurvesWorld];

  const displayNodes: DisplayNode[] = [
    { id: ROOT, x: rootX, y: ROOT_Y, opacity: 1, kind: 'root', parent: null, label: 'YOU' },
    ...visiblePrimary.map((item) => ({ id: item.id, x: toWorldX(item.x), y: DIRECT_Y, opacity: item.opacity, kind: 'person' as const, parent: ROOT, label: shortId(item.id) })),
    ...slots.slots.map((x, index) => ({ id: `slot-${index}`, x: toWorldX(x), y: DIRECT_Y, opacity: 1, kind: 'slot' as const, parent: ROOT, label: 'Available' })),
    ...focusLayout.placed.filter((node) => node.opacity > .035).map((node) => ({ id: node.id, x: toWorldX(node.x), y: node.y, opacity: node.opacity, kind: 'branch' as const, parent: node.parent, label: shortId(node.id) })),
  ];

  const duplicateCount = displayNodes.length - new Set(displayNodes.map((node) => node.id)).size;
  let nodeOverlap = 0;
  let labelOverlap = 0;
  for (let i = 0; i < displayNodes.length; i += 1) {
    for (let j = i + 1; j < displayNodes.length; j += 1) {
      const a = displayNodes[i];
      const b = displayNodes[j];
      if (Math.abs(a.x - b.x) < NODE_W * .9 && Math.abs(a.y - b.y) < NODE_H * .8) nodeOverlap += 1;
      if (Math.abs(a.y - b.y) < 38 && Math.abs(a.x - b.x) < 126) labelOverlap += 1;
    }
  }
  let lineCross = 0;
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      const a = curves[i];
      const b = curves[j];
      if (a.parent === b.parent || a.child === b.child || a.parent === b.child || a.child === b.parent) continue;
      outer: for (let ai = 0; ai < a.points.length - 1; ai += 1) {
        for (let bi = 0; bi < b.points.length - 1; bi += 1) {
          if (properCross(a.points[ai], a.points[ai + 1], b.points[bi], b.points[bi + 1])) { lineCross += 1; break outer; }
        }
      }
    }
  }
  let edgeNodeOverlap = 0;
  curves.forEach((curve) => {
    displayNodes.forEach((node) => {
      if (node.id === curve.parent || node.id === curve.child) return;
      if (curve.points.some((p) => Math.abs(p.x - node.x) < 37 && Math.abs(p.y - node.y) < 31)) edgeNodeOverlap += 1;
    });
  });
  const clipped = displayNodes.filter((node) => node.x < 70 || node.x > worldW - 70 || node.y < 55 || node.y > worldH - 70).length;

  const setScenario = (id: ScenarioId) => {
    setScenarioId(id);
    setPage(0);
    setFocused(null);
    setView({ x: 0, y: 36, scale: .94 });
  };

  const changeScale = (nextScale: number, anchor?: Point) => {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (!anchor || !stageRef.current) { setView((v) => ({ ...v, scale })); return; }
    const rect = stageRef.current.getBoundingClientRect();
    const ax = anchor.x - rect.left;
    const ay = anchor.y - rect.top;
    setView((v) => {
      const ratio = scale / v.scale;
      return { scale, x: ax - (ax - v.x) * ratio, y: ay - (ay - v.y) * ratio };
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeScale(view.scale + (event.deltaY > 0 ? -.09 : .09), { x: event.clientX, y: event.clientY });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, view };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale: view.scale,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      dragRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      changeScale(pinchRef.current.scale * (distance / pinchRef.current.distance), center);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setView({ ...drag.view, x: drag.view.x + event.clientX - drag.start.x, y: drag.view.y + event.clientY - drag.start.y });
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  const hiddenCurrentPage = pageIds.some((_, index) => directOpacity(index, view.scale, compact) < .96);
  const hiddenOtherPages = pageCount > 1;
  const metrics = [
    ['Line crossing', lineCross],
    ['Node overlap', nodeOverlap],
    ['Available overlap', displayNodes.filter((n) => n.kind === 'slot').some((slot) => displayNodes.some((n) => n.id !== slot.id && Math.abs(n.x - slot.x) < 94 && Math.abs(n.y - slot.y) < 72)) ? 1 : 0],
    ['Edge-node', edgeNodeOverlap],
    ['Label overlap', labelOverlap],
    ['Clipped', clipped],
    ['Duplicate', duplicateCount],
  ] as const;

  return (
    <main className="page">
      <section className="labHeader">
        <div><strong>NETWORK STRESS LAB · V23</strong><span>Reserved invite lanes · soft curves · selective flow</span></div>
        <div className="metrics">{metrics.map(([label, value]) => <span key={label} className={value ? 'bad' : 'good'}>{label} {value}</span>)}</div>
      </section>

      <section className="scenarioBar" aria-label="Stress scenarios">
        {SCENARIOS.map((item) => <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => setScenario(item.id)}><b>{item.label}</b><small>{item.note}</small></button>)}
      </section>

      <section className="summary">
        <div><b>{scenario.label}</b><span>{scenario.total} members · {scenario.direct} direct · depth {scenario.depth}</span></div>
        <p>Available 자리를 먼저 예약하고, 기본 2명에서 확대할수록 direct를 추가 공개합니다. 긴 가로 rail은 제거했습니다.</p>
      </section>

      <section className="networkShell">
        <div className="toolbar">
          <div><b>NETWORK</b><span>{focused ? `${shortId(focused)} branch` : 'Overview'}</span></div>
          <div className="toolbarActions">
            {focused ? <button type="button" onClick={() => setFocused(null)}>Overview</button> : null}
            <button type="button" onClick={() => setView({ x: 0, y: 36, scale: .94 })}>◎</button>
            <button type="button" onClick={() => changeScale(view.scale + .12)}>+</button>
            <button type="button" onClick={() => changeScale(view.scale - .12)}>−</button>
          </div>
        </div>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <div className="zoomHud">{Math.round(view.scale * 100)}% · drag / wheel / pinch</div>
          {pageCount > 1 ? <div className="pager"><button type="button" onClick={() => { setFocused(null); setPage((p) => (p - 1 + pageCount) % pageCount); }}>‹</button><span>Direct {safePage + 1}/{pageCount}</span><button type="button" onClick={() => { setFocused(null); setPage((p) => (p + 1) % pageCount); }}>›</button></div> : null}

          <div className="world" style={{ width: worldW, height: worldH, marginLeft: -worldW / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg width={worldW} height={worldH} viewBox={`0 0 ${worldW} ${worldH}`} className="edges" aria-hidden="true">
              <defs>
                <linearGradient id="fade23" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(225,199,111,.2)"/><stop offset="1" stopColor="rgba(225,199,111,.08)"/></linearGradient>
                <linearGradient id="movingBand23" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={worldH}>
                  <stop offset="0" stopColor="rgba(244,183,40,0)"/><stop offset=".08" stopColor="rgba(244,183,40,0)"/><stop offset=".17" stopColor="rgba(244,183,40,.9)"/><stop offset=".28" stopColor="rgba(244,183,40,0)"/><stop offset="1" stopColor="rgba(244,183,40,0)"/>
                  <animateTransform attributeName="gradientTransform" type="translate" values={`0 -${Math.round(worldH * .34)};0 ${Math.round(worldH * .54)}`} dur="4.8s" repeatCount="indefinite"/>
                </linearGradient>
                <filter id="softGlow23" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
              </defs>

              {curves.map((curve) => <path key={`${curve.id}-base`} d={curve.d} className={`curveBase ${curve.slot ? 'slotBase' : ''}`} style={{ opacity: curve.opacity }}/>) }
              {curves.filter((curve) => curve.slot || curve.active).map((curve) => <path key={`${curve.id}-flow`} d={curve.d} className="curveFlow" style={{ opacity: curve.slot ? .78 : .48 }}/>) }
              <path d={`M${rootX} ${ROOT_Y + 44} C${rootX} ${ROOT_Y + 58}, ${rootX} ${FAN_Y - 16}, ${rootX} ${FAN_Y}`} className="rootTrunk"/>
              {(hiddenCurrentPage || hiddenOtherPages) && visiblePrimary.length ? <>
                <path d={`M${rootX - 455} ${DIRECT_Y + 18} C${rootX - 500} ${DIRECT_Y + 32},${rootX - 520} ${DIRECT_Y + 45},${rootX - 548} ${DIRECT_Y + 45}`} className="continuation"/>
                <path d={`M${rootX + 455} ${DIRECT_Y + 18} C${rootX + 500} ${DIRECT_Y + 32},${rootX + 520} ${DIRECT_Y + 45},${rootX + 548} ${DIRECT_Y + 45}`} className="continuation"/>
              </> : null}
            </svg>

            <button type="button" className="node rootNode" style={{ left: rootX, top: ROOT_Y }}><span>●</span><b>YOU</b><small>{scenario.total} network · {scenario.direct} direct</small></button>

            {primary.map((item) => <button key={item.id} type="button" className={`node personNode ${focused === item.id ? 'focused' : ''}`} style={{ left: toWorldX(item.x), top: DIRECT_Y, opacity: item.opacity, transform: `translate(-50%,-50%) scale(${.86 + item.opacity * .14})`, pointerEvents: item.opacity > .55 ? 'auto' : 'none' }} onClick={() => { if ((graph.get(item.id)?.children.length ?? 0) > 0) setFocused(item.id); }}><span>●</span><b>{shortId(item.id)}</b><small>{descendants(graph, item.id)} network · {graph.get(item.id)?.children.length ?? 0} direct</small></button>)}

            {focusLayout.placed.map((node) => <button key={`branch-${node.id}`} type="button" className="node branchNode" style={{ left: toWorldX(node.x), top: node.y, opacity: node.opacity, transform: `translate(-50%,-50%) scale(${.84 + node.opacity * .16})`, pointerEvents: node.opacity > .6 ? 'auto' : 'none' }}><span>●</span><b>{shortId(node.id)}</b><small>{descendants(graph, node.id)} network</small></button>)}

            {slots.slots.map((x, index) => <button key={`slot-node-${index}`} type="button" className="emptySlot" style={{ left: toWorldX(x), top: DIRECT_Y }}><span>+</span><b>Available</b><small>Invite slot</small></button>)}
          </div>
        </div>
      </section>

      <section className="rules">
        <span><b>1 · Reserved Available lanes</b>빈 슬롯 위치부터 확보한 뒤 사람을 배치해 확대해도 서로 침범하지 않음</span>
        <span><b>2 · Soft fan curves</b>긴 가로 조직도 rail 없이 짧은 trunk에서 보이는 노드만 부드럽게 연결</span>
        <span><b>3 · Selective motion</b>Available과 선택한 가지에만 선 자체를 타고 흐르는 넓은 빛을 사용</span>
        <span><b>4 · Stronger QA guard</b>Available·라벨·선↔노드까지 자동 충돌 검사</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}.labHeader,.scenarioBar,.summary,.networkShell,.rules{width:min(calc(100vw - 20px),920px);margin-left:auto;margin-right:auto;box-sizing:border-box}.labHeader{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}.metrics{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.metrics span{padding:4px 6px;border-radius:8px;font-size:.43rem;border:1px solid rgba(255,255,255,.06)}.metrics .good{color:#79b38a;background:rgba(89,147,104,.05)}.metrics .bad{color:#df8577;background:rgba(190,80,67,.07)}
        .scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:76px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.42rem;color:#6e685f}
        .summary{padding:8px 11px 10px;display:flex;align-items:center;justify-content:space-between;gap:16px}.summary>div{display:grid;gap:2px}.summary b{font-size:.68rem}.summary span,.summary p{font-size:.49rem;color:#777066}.summary p{max-width:560px;line-height:1.5;margin:0}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}.toolbar{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.05)}.toolbar>div:first-child{display:grid;gap:1px}.toolbar b{font-size:.54rem;letter-spacing:.08em;color:#c6a858}.toolbar span{font-size:.43rem;color:#736d63}.toolbarActions{display:flex;gap:5px}.toolbarActions button,.pager button{min-width:30px;height:27px;padding:0 8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;color:#a89f91;background:#0d0d0b;font-size:.55rem}.stage{height:min(68svh,650px);min-height:470px;position:relative;overflow:hidden;touch-action:none;cursor:grab;background:radial-gradient(circle at 50% 12%,rgba(244,183,40,.025),transparent 34%),#080807}.stage:active{cursor:grabbing}.zoomHud,.pager{position:absolute;z-index:20;top:9px;border:1px solid rgba(255,255,255,.05);background:rgba(10,10,8,.84);backdrop-filter:blur(8px);border-radius:9px;color:#726b61;font-size:.44rem}.zoomHud{left:10px;padding:6px 8px}.pager{right:10px;padding:3px;display:flex;align-items:center;gap:6px}.pager span{font-size:.44rem;color:#81796d}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.curveBase,.rootTrunk,.continuation{fill:none;stroke-linecap:round}.curveBase{stroke:url(#fade23);stroke-width:1.15}.slotBase{stroke:rgba(196,157,55,.25)}.rootTrunk{stroke:rgba(217,181,78,.28);stroke-width:1.25}.curveFlow{fill:none;stroke:url(#movingBand23);stroke-width:3.1;stroke-linecap:round;filter:url(#softGlow23);mix-blend-mode:screen}.continuation{stroke:rgba(219,192,112,.16);stroke-width:1.1;stroke-dasharray:1 0}.node,.emptySlot{position:absolute;translate:-50% -50%;width:104px;min-height:82px;display:grid;justify-items:center;align-content:start;gap:4px;color:#ddd7ca;z-index:4}.node>span,.emptySlot>span{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:#0d0d0b}.node>span{border:1px solid rgba(210,174,65,.36);color:#e1b744;font-size:.64rem}.rootNode>span{width:62px;height:62px;border-color:rgba(244,183,40,.62);box-shadow:0 0 28px rgba(244,183,40,.035)}.node b,.emptySlot b{font-size:.49rem;font-weight:750;white-space:nowrap}.rootNode b{font-size:.57rem}.node small,.emptySlot small{font-size:.4rem;color:#6f685e;white-space:nowrap}.personNode,.branchNode{transition:opacity 80ms linear,transform 80ms linear}.personNode.focused>span{border-color:rgba(244,183,40,.75);box-shadow:0 0 20px rgba(244,183,40,.08)}.emptySlot{z-index:5}.emptySlot>span{border:1px dashed rgba(226,181,62,.62);color:#d5aa39;font-size:1rem;animation:slotBreath 3.8s ease-in-out infinite}.emptySlot b{color:#bbaa7f}.emptySlot small{color:#756c5b}.rules{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding-top:9px}.rules span{display:grid;gap:3px;padding:9px 10px;border:1px solid rgba(255,255,255,.05);border-radius:11px;background:#0b0b09;color:#70695f;font-size:.45rem;line-height:1.5}.rules b{color:#a58c4c;font-size:.48rem}@keyframes slotBreath{0%,72%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}82%{box-shadow:0 0 22px rgba(244,183,40,.12)}}@media(prefers-reduced-motion:reduce){.emptySlot>span{animation:none}.curveFlow{display:none}.personNode,.branchNode{transition:none}}@media(max-width:640px){.labHeader{align-items:flex-start;flex-direction:column}.metrics{justify-content:flex-start}.summary{align-items:flex-start;flex-direction:column;gap:5px}.summary p{max-width:none}.stage{height:60svh;min-height:470px}.rules{grid-template-columns:1fr 1fr}.node,.emptySlot{width:94px}.node small,.emptySlot small{font-size:.37rem}}@media(max-width:410px){.rules{grid-template-columns:1fr}.metrics span{font-size:.4rem}.stage{min-height:440px}}
      `}</style>
    </main>
  );
}
