'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type GraphNode = { id: string; children: string[] };
type ScenarioId = 'zero' | 'one' | 'five' | 'balanced30' | 'deep10' | 'direct50' | 'hundred' | 'fiveHundred' | 'worst';
type Scenario = {
  id: ScenarioId;
  label: string;
  note: string;
  direct: number;
  total: number;
  depth: number;
  fanout: number;
  openSlots: number;
};
type View = { x: number; y: number; scale: number };
type PlacedNode = { id: string; x: number; y: number; depth: number; opacity: number; parent: string | null };
type Edge = { parent: string; child: string; points: Array<{ x: number; y: number }>; opacity: number };

const ROOT = 'root';
const PAGE_SIZE = 8;
const DIRECT_SLOT_ORDER = [3, 4, 2, 5, 1, 6, 0, 7] as const;
const DIRECT_SLOT_X = [-420, -300, -180, -60, 60, 180, 300, 420] as const;
const ROOT_Y = 90;
const DIRECT_Y = 320;
const RAIL_Y = 205;
const CHILD_GAP_Y = 190;
const NODE_W = 96;
const NODE_H = 72;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.78;

const SCENARIOS: Scenario[] = [
  { id: 'zero', label: '0명', note: 'Available 2개만', direct: 0, total: 0, depth: 0, fanout: 0, openSlots: 2 },
  { id: 'one', label: '1명', note: 'Person + Available', direct: 1, total: 1, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'five', label: '5명', note: '작은 direct', direct: 5, total: 9, depth: 2, fanout: 2, openSlots: 1 },
  { id: 'balanced30', label: '30명', note: '균형형', direct: 6, total: 30, depth: 4, fanout: 3, openSlots: 1 },
  { id: 'deep10', label: '10세대', note: '한쪽으로 깊은 구조', direct: 2, total: 16, depth: 10, fanout: 1, openSlots: 1 },
  { id: 'direct50', label: '직접 50명', note: '가로 폭 스트레스', direct: 50, total: 50, depth: 1, fanout: 0, openSlots: 1 },
  { id: 'hundred', label: '100명', note: '중형 네트워크', direct: 18, total: 100, depth: 5, fanout: 4, openSlots: 1 },
  { id: 'fiveHundred', label: '500명', note: '대형 스트레스', direct: 40, total: 500, depth: 6, fanout: 5, openSlots: 1 },
  { id: 'worst', label: '최악 구조', note: '불균형·다분기', direct: 12, total: 140, depth: 8, fanout: 6, openSlots: 2 },
];

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function shortId(id: string) { return id === ROOT ? 'YOU' : `0x…${id.replace('n', '').padStart(4, '0')}`; }
function smoothReveal(scale: number, start: number, end: number) {
  if (scale <= start) return 0;
  if (scale >= end) return 1;
  const t = (scale - start) / (end - start);
  return t * t * (3 - 2 * t);
}

function makeGraph(s: Scenario) {
  const graph = new Map<string, GraphNode>();
  graph.set(ROOT, { id: ROOT, children: [] });
  if (!s.total || !s.direct) return graph;

  let nextId = 1;
  const depths = new Map<string, number>([[ROOT, 0]]);
  const rootChildren: string[] = [];
  for (let i = 0; i < s.direct && nextId <= s.total; i += 1) {
    const id = `n${nextId++}`;
    rootChildren.push(id);
    depths.set(id, 1);
    graph.set(id, { id, children: [] });
  }
  graph.set(ROOT, { id: ROOT, children: rootChildren });

  if (s.id === 'deep10') {
    let cursor = rootChildren[0];
    for (let depth = 2; depth <= s.depth && nextId <= s.total; depth += 1) {
      const id = `n${nextId++}`;
      graph.get(cursor)!.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, depth);
      cursor = id;
    }
    while (nextId <= s.total) {
      const id = `n${nextId++}`;
      graph.get(rootChildren[1])!.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, 2);
    }
    return graph;
  }

  const queue = [...rootChildren];
  let qi = 0;
  while (nextId <= s.total && qi < queue.length) {
    const parent = queue[qi++];
    const depth = depths.get(parent) ?? 1;
    if (depth >= s.depth) continue;
    const seed = Number(parent.replace('n', '')) || 1;
    const maxChildren = s.id === 'worst' ? Math.max(1, Math.min(s.fanout, 1 + (seed % s.fanout))) : Math.max(1, Math.min(s.fanout, 2 + (seed % Math.max(1, s.fanout - 1))));
    for (let c = 0; c < maxChildren && nextId <= s.total; c += 1) {
      const id = `n${nextId++}`;
      graph.get(parent)!.children.push(id);
      graph.set(id, { id, children: [] });
      depths.set(id, depth + 1);
      queue.push(id);
    }
  }

  while (nextId <= s.total) {
    const parent = rootChildren[(nextId - 1) % rootChildren.length];
    const id = `n${nextId++}`;
    graph.get(parent)!.children.push(id);
    graph.set(id, { id, children: [] });
  }
  return graph;
}

function descendants(graph: Map<string, GraphNode>, id: string): number {
  const node = graph.get(id);
  if (!node) return 0;
  let count = 0;
  for (const child of node.children) count += 1 + descendants(graph, child);
  return count;
}

function directOpacity(index: number, scale: number) {
  if (index < 2) return 1;
  if (index < 4) return smoothReveal(scale, 1.00, 1.12);
  if (index < 6) return smoothReveal(scale, 1.18, 1.31);
  return smoothReveal(scale, 1.36, 1.50);
}

function depthOpacity(depth: number, scale: number) {
  if (depth <= 1) return 1;
  if (depth === 2) return smoothReveal(scale, 1.18, 1.30);
  if (depth === 3) return smoothReveal(scale, 1.36, 1.49);
  return smoothReveal(scale, 1.54, 1.68);
}

function buildFocusedLayout(graph: Map<string, GraphNode>, focused: string | null, focusX: number, scale: number) {
  const placed: PlacedNode[] = [];
  const edges: Edge[] = [];
  if (!focused) return { placed, edges };
  const maxDepth = scale < 1.18 ? 1 : scale < 1.36 ? 2 : scale < 1.54 ? 3 : 4;
  const childCap = 5;
  const unit = 112;

  const measure = (id: string, depth: number): number => {
    if (depth >= maxDepth) return 1;
    const children = (graph.get(id)?.children ?? []).slice(0, childCap);
    if (!children.length) return 1;
    return Math.max(1, children.reduce((sum, child) => sum + measure(child, depth + 1), 0));
  };

  const rootWidth = measure(focused, 1) * unit;
  const placeChildren = (parentId: string, parentX: number, parentY: number, depth: number, left: number, width: number) => {
    if (depth >= maxDepth) return;
    const children = (graph.get(parentId)?.children ?? []).slice(0, childCap);
    if (!children.length) return;
    const weights = children.map((id) => measure(id, depth + 1));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    let cursor = left;
    children.forEach((childId, index) => {
      const childWidth = width * (weights[index] / weightTotal);
      const childX = cursor + childWidth / 2;
      const childY = DIRECT_Y + depth * CHILD_GAP_Y;
      const opacity = depthOpacity(depth + 1, scale);
      placed.push({ id: childId, x: childX, y: childY, depth: depth + 1, opacity, parent: parentId });
      const midY = parentY + Math.max(56, (childY - parentY) * 0.52);
      edges.push({ parent: parentId, child: childId, opacity, points: [{ x: parentX, y: parentY + 38 }, { x: parentX, y: midY }, { x: childX, y: midY }, { x: childX, y: childY - 36 }] });
      placeChildren(childId, childX, childY, depth + 1, cursor, childWidth);
      cursor += childWidth;
    });
  };

  placeChildren(focused, focusX, DIRECT_Y, 1, focusX - rootWidth / 2, rootWidth);
  return { placed, edges };
}

function segmentProperCross(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
  const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function QaNetworkStressLabV22() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('balanced30');
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 34, scale: .94 });
  const [drag, setDrag] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[3];
  const graph = useMemo(() => makeGraph(scenario), [scenario]);
  const rootChildren = graph.get(ROOT)?.children ?? [];
  const pageCount = Math.max(1, Math.ceil(rootChildren.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageIds = rootChildren.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const primary = useMemo(() => pageIds.map((id, index) => {
    const slot = DIRECT_SLOT_ORDER[index] ?? index;
    return { id, x: DIRECT_SLOT_X[slot] ?? 0, opacity: directOpacity(index, view.scale) };
  }), [pageIds, view.scale]);

  const visiblePrimary = primary.filter((item) => item.opacity > .04);
  const focusItem = primary.find((item) => item.id === focused) ?? null;
  const focusLayout = useMemo(() => buildFocusedLayout(graph, focusItem?.id ?? null, focusItem?.x ?? 0, view.scale), [focusItem?.id, focusItem?.x, graph, view.scale]);

  const slotXs = useMemo(() => {
    if (scenario.openSlots <= 0) return [] as number[];
    if (!rootChildren.length) return scenario.openSlots === 1 ? [0] : [-92, 92];
    if (rootChildren.length === 1) return [92];
    if (scenario.openSlots === 1) return [270];
    return [-270, 270];
  }, [rootChildren.length, scenario.openSlots]);

  const contentXs = [...primary.map((item) => item.x), ...focusLayout.placed.map((item) => item.x), ...slotXs];
  const minX = Math.min(-560, ...contentXs.map((x) => x - 90));
  const maxX = Math.max(560, ...contentXs.map((x) => x + 90));
  const worldW = Math.ceil(maxX - minX + 280);
  const rootX = -minX + 140;
  const toWorldX = (x: number) => rootX + x;
  const maxY = Math.max(900, ...focusLayout.placed.map((node) => node.y + 140));
  const worldH = maxY + 120;

  const directEdgePaths = visiblePrimary.map((item) => ({ id: item.id, opacity: item.opacity, x: toWorldX(item.x) }));
  const hiddenCurrentPage = pageIds.some((_, index) => directOpacity(index, view.scale) < .95);
  const hiddenOtherPages = pageCount > 1;

  const allPlaced = [
    { id: ROOT, x: rootX, y: ROOT_Y, depth: 0, opacity: 1, parent: null },
    ...visiblePrimary.map((item) => ({ id: item.id, x: toWorldX(item.x), y: DIRECT_Y, depth: 1, opacity: item.opacity, parent: ROOT })),
    ...focusLayout.placed.filter((item) => item.opacity > .04).map((item) => ({ ...item, x: toWorldX(item.x) })),
  ];

  const duplicateCount = allPlaced.length - new Set(allPlaced.map((node) => node.id)).size;
  let nodeOverlap = 0;
  for (let i = 0; i < allPlaced.length; i += 1) {
    for (let j = i + 1; j < allPlaced.length; j += 1) {
      const a = allPlaced[i];
      const b = allPlaced[j];
      if (Math.abs(a.x - b.x) < NODE_W * .82 && Math.abs(a.y - b.y) < NODE_H * .82) nodeOverlap += 1;
    }
  }
  let lineCross = 0;
  for (let i = 0; i < focusLayout.edges.length; i += 1) {
    for (let j = i + 1; j < focusLayout.edges.length; j += 1) {
      const a = focusLayout.edges[i];
      const b = focusLayout.edges[j];
      if (a.parent === b.parent || a.child === b.child || a.parent === b.child || a.child === b.parent) continue;
      for (let ai = 0; ai < a.points.length - 1; ai += 1) {
        for (let bi = 0; bi < b.points.length - 1; bi += 1) {
          if (segmentProperCross(a.points[ai], a.points[ai + 1], b.points[bi], b.points[bi + 1])) lineCross += 1;
        }
      }
    }
  }
  const clipped = allPlaced.filter((node) => node.x < 50 || node.x > worldW - 50 || node.y < 45 || node.y > worldH - 60).length;

  const setScenario = (id: ScenarioId) => {
    setScenarioId(id);
    setPage(0);
    setFocused(null);
    setView({ x: 0, y: 34, scale: .94 });
  };

  const changeScale = (nextScale: number, anchorX?: number, anchorY?: number) => {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (!stageRef.current || anchorX === undefined || anchorY === undefined) {
      setView((v) => ({ ...v, scale }));
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const px = anchorX - rect.left;
    const py = anchorY - rect.top;
    setView((v) => {
      const ratio = scale / v.scale;
      return { scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -.10 : .10;
    changeScale(view.scale + delta, event.clientX, event.clientY);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, vx: view.x, vy: view.y });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setView((v) => ({ ...v, x: drag.vx + event.clientX - drag.x, y: drag.vy + event.clientY - drag.y }));
  };
  const onPointerEnd = () => setDrag(null);

  const railItems = [...directEdgePaths.map((item) => item.x), ...slotXs.map(toWorldX)];
  const railMin = railItems.length ? Math.min(...railItems) : rootX;
  const railMax = railItems.length ? Math.max(...railItems) : rootX;

  return (
    <main className="page">
      <section className="labHeader">
        <div><strong>NETWORK STRESS LAB · V22</strong><span>Overview → semantic reveal → focused branch</span></div>
        <div className="metrics">
          <span className={lineCross ? 'bad' : 'good'}>Line crossing {lineCross}</span>
          <span className={nodeOverlap ? 'bad' : 'good'}>Node overlap {nodeOverlap}</span>
          <span className={clipped ? 'bad' : 'good'}>Clipped {clipped}</span>
          <span className={duplicateCount ? 'bad' : 'good'}>Duplicate {duplicateCount}</span>
        </div>
      </section>

      <section className="scenarioBar" aria-label="Stress scenarios">
        {SCENARIOS.map((item) => <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => setScenario(item.id)}><b>{item.label}</b><small>{item.note}</small></button>)}
      </section>

      <section className="summary">
        <div><b>{scenario.label}</b><span>{scenario.total} members · {scenario.direct} direct · depth {scenario.depth}</span></div>
        <p>첫 화면은 네트워크 크기와 상관없이 최대 2명의 실제 사람 + Available을 중심으로 유지하고, 확대할수록 추가 direct가 바깥쪽에서 서서히 나타납니다.</p>
      </section>

      <section className="networkShell">
        <div className="toolbar">
          <div><b>NETWORK</b><span>{focused ? `${shortId(focused)} branch` : 'Overview'}</span></div>
          <div className="toolbarActions">
            {focused ? <button type="button" onClick={() => setFocused(null)}>Overview</button> : null}
            <button type="button" onClick={() => setView({ x: 0, y: 34, scale: .94 })}>◎</button>
            <button type="button" onClick={() => changeScale(view.scale + .12)}>+</button>
            <button type="button" onClick={() => changeScale(view.scale - .12)}>−</button>
          </div>
        </div>

        <div ref={stageRef} className={`stage ${drag ? 'dragging' : ''}`} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          <div className="zoomHud">{Math.round(view.scale * 100)}% · drag / wheel</div>
          {pageCount > 1 ? <div className="pager"><button type="button" onClick={() => { setFocused(null); setPage((p) => (p - 1 + pageCount) % pageCount); }}>‹</button><span>Direct {safePage + 1}/{pageCount}</span><button type="button" onClick={() => { setFocused(null); setPage((p) => (p + 1) % pageCount); }}>›</button></div> : null}

          <div className="world" style={{ width: worldW, height: worldH, marginLeft: -worldW / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg width={worldW} height={worldH} viewBox={`0 0 ${worldW} ${worldH}`} className="edges" aria-hidden="true">
              <defs>
                <linearGradient id="tailFade22" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(225,199,111,0)"/><stop offset="50%" stopColor="rgba(225,199,111,.34)"/><stop offset="100%" stopColor="rgba(225,199,111,0)"/></linearGradient>
                <linearGradient id="slotFlow22" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(244,183,40,.1)"/><stop offset=".55" stopColor="rgba(244,183,40,.85)"/><stop offset="1" stopColor="rgba(244,183,40,.12)"/><animateTransform attributeName="gradientTransform" type="translate" values="0 -180;0 180" dur="3.6s" repeatCount="indefinite"/></linearGradient>
              </defs>

              {railItems.length ? <>
                <path d={`M${rootX} ${ROOT_Y + 43} V${RAIL_Y}`} className="trunk"/>
                <path d={`M${railMin} ${RAIL_Y} H${railMax}`} className="rail"/>
              </> : null}
              {directEdgePaths.map((item) => <path key={`direct-${item.id}`} d={`M${item.x} ${RAIL_Y} V${DIRECT_Y - 38}`} className="directEdge" style={{ opacity: item.opacity }}/>) }
              {slotXs.map((x, index) => <g key={`slot-${index}`}><path d={`M${toWorldX(x)} ${RAIL_Y} V${DIRECT_Y - 38}`} className="slotEdgeBase"/><path d={`M${toWorldX(x)} ${RAIL_Y} V${DIRECT_Y - 38}`} className="slotEdgeFlow"/></g>)}
              {(hiddenCurrentPage || hiddenOtherPages) && railItems.length ? <>
                <path d={`M${railMin - 70} ${RAIL_Y} H${railMin - 8}`} className="fadeTail"/>
                <path d={`M${railMax + 8} ${RAIL_Y} H${railMax + 70}`} className="fadeTail"/>
              </> : null}

              {focusLayout.edges.filter((edge) => edge.opacity > .03).map((edge) => {
                const pts = edge.points.map((p) => ({ x: toWorldX(p.x), y: p.y }));
                const d = `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y} L${pts[2].x} ${pts[2].y} L${pts[3].x} ${pts[3].y}`;
                return <path key={`${edge.parent}-${edge.child}`} d={d} className="branchEdge" style={{ opacity: edge.opacity }}/>;
              })}
            </svg>

            <button type="button" className="node rootNode" style={{ left: rootX, top: ROOT_Y }}><span>●</span><b>YOU</b><small>{scenario.total} network · {scenario.direct} direct</small></button>

            {primary.map((item, index) => <button key={item.id} type="button" className={`node personNode ${focused === item.id ? 'focused' : ''}`} style={{ left: toWorldX(item.x), top: DIRECT_Y, opacity: item.opacity, transform: `translate(-50%,-50%) scale(${.88 + item.opacity * .12})`, pointerEvents: item.opacity > .55 ? 'auto' : 'none' }} onClick={() => { if ((graph.get(item.id)?.children.length ?? 0) > 0) setFocused(item.id); }}><span>●</span><b>{shortId(item.id)}</b><small>{descendants(graph, item.id)} network · {graph.get(item.id)?.children.length ?? 0} direct</small></button>)}

            {focusLayout.placed.map((node) => <button key={`branch-${node.id}`} type="button" className="node branchNode" style={{ left: toWorldX(node.x), top: node.y, opacity: node.opacity, transform: `translate(-50%,-50%) scale(${.86 + node.opacity * .14})`, pointerEvents: node.opacity > .6 ? 'auto' : 'none' }}><span>●</span><b>{shortId(node.id)}</b><small>{descendants(graph, node.id)} network</small></button>)}

            {slotXs.map((x, index) => <button key={`slot-node-${index}`} type="button" className="emptySlot" style={{ left: toWorldX(x), top: DIRECT_Y }}><span>+</span><b>Available</b><small>Invite slot</small></button>)}
          </div>
        </div>
      </section>

      <section className="rules">
        <span><b>1 · Stable first frame</b>0명이면 Available 2개, 네트워크가 커져도 첫 화면의 실제 사람은 2명 중심</span>
        <span><b>2 · Progressive direct reveal</b>확대할수록 2 → 4 → 6 → 8명만 부드럽게 추가 공개</span>
        <span><b>3 · No fan spaghetti</b>YOU에서 여러 곡선을 뿌리지 않고 하나의 trunk + 정돈된 rail로 direct 연결</span>
        <span><b>4 · Focused subtree</b>특정 사람을 눌렀을 때만 그 가지의 하위 세대를 subtree 폭 계산 후 펼침</span>
      </section>

      <style jsx>{`
        .page{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f1eee5}.labHeader,.scenarioBar,.summary,.networkShell,.rules{width:min(calc(100vw - 20px),820px);margin-left:auto;margin-right:auto;box-sizing:border-box}.labHeader{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid rgba(244,183,40,.14);border-radius:14px;background:#0c0c0a}.labHeader>div:first-child{display:grid;gap:2px}.labHeader strong{font-size:.58rem;letter-spacing:.09em;color:#d9b653}.labHeader span{font-size:.48rem;color:#7e776c}.metrics{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.metrics span{padding:4px 6px;border-radius:8px;font-size:.44rem;border:1px solid rgba(255,255,255,.06)}.metrics .good{color:#7db28a;background:rgba(89,147,104,.05)}.metrics .bad{color:#df8577;background:rgba(190,80,67,.07)}.scenarioBar{display:flex;gap:6px;overflow-x:auto;padding:9px 1px 7px;scrollbar-width:none}.scenarioBar::-webkit-scrollbar{display:none}.scenarioBar button{flex:0 0 auto;min-width:74px;padding:7px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#0c0c0a;color:#8c857a;text-align:left;display:grid;gap:1px}.scenarioBar button.active{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.08);color:#ddb958}.scenarioBar b{font-size:.52rem}.scenarioBar small{font-size:.42rem;color:#6e685f}.summary{padding:8px 11px 10px;display:flex;align-items:center;justify-content:space-between;gap:16px}.summary>div{display:grid;gap:2px}.summary b{font-size:.68rem}.summary span,.summary p{font-size:.49rem;color:#777066}.summary p{max-width:500px;line-height:1.5;margin:0}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.065);border-radius:18px;background:#0b0b09}.toolbar{min-height:58px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.045)}.toolbar>div:first-child{display:grid;gap:2px}.toolbar b{font-size:.5rem;letter-spacing:.12em;color:#8d7b50}.toolbar span{font-size:.67rem;font-weight:800}.toolbarActions{display:flex;gap:5px}.toolbarActions button,.pager button{min-width:30px;height:30px;padding:0 8px;border:1px solid rgba(244,183,40,.13);border-radius:9px;background:rgba(244,183,40,.04);color:#c3a24f;font-size:.6rem}.stage{position:relative;height:min(70svh,650px);min-height:510px;overflow:hidden;touch-action:none;cursor:grab;background:radial-gradient(circle at 50% 4%,rgba(244,183,40,.025),transparent 34%),#090908}.stage.dragging{cursor:grabbing}.zoomHud{position:absolute;z-index:5;top:10px;left:10px;padding:5px 7px;border-radius:8px;background:rgba(8,8,7,.72);border:1px solid rgba(255,255,255,.05);font-size:.44rem;color:#706a61}.pager{position:absolute;z-index:6;right:10px;top:9px;display:flex;align-items:center;gap:5px}.pager span{font-size:.45rem;color:#81796d}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.trunk,.rail,.directEdge,.branchEdge{fill:none;stroke:rgba(210,197,160,.34);stroke-width:1.1;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}.trunk{stroke:rgba(226,193,97,.47);stroke-width:1.25}.rail{stroke:rgba(205,193,161,.26)}.directEdge{transition:opacity .16s linear}.branchEdge{transition:opacity .16s linear}.fadeTail{fill:none;stroke:url(#tailFade22);stroke-width:1.2;vector-effect:non-scaling-stroke}.slotEdgeBase,.slotEdgeFlow{fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round}.slotEdgeBase{stroke:rgba(244,183,40,.18);stroke-width:1.1}.slotEdgeFlow{stroke:url(#slotFlow22);stroke-width:2}.node,.emptySlot{position:absolute;z-index:2;transform:translate(-50%,-50%);width:96px;min-height:72px;border:none;background:transparent;color:#e9e4d8;display:grid;place-items:center;align-content:center;gap:3px;text-align:center}.node span,.emptySlot>span{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;border:1px solid rgba(222,184,80,.55);background:#0b0b09;color:#e1b94e;font-size:.65rem}.node b,.emptySlot b{font-size:.48rem;max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.node small,.emptySlot small{font-size:.39rem;color:#6e685f}.rootNode span{width:48px;height:48px;border-color:rgba(244,183,40,.75)}.rootNode b{font-size:.55rem}.personNode,.branchNode{transition:opacity .16s linear,transform .16s linear}.personNode.focused span{box-shadow:0 0 0 4px rgba(244,183,40,.06),0 0 24px rgba(244,183,40,.12);border-color:#dcb64f}.branchNode span{width:34px;height:34px;border-color:rgba(210,190,136,.32);color:#baa25f}.emptySlot>span{border-style:dashed;font-size:1rem;color:#e3b846;box-shadow:0 0 22px rgba(244,183,40,.045)}.rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding-top:8px}.rules span{padding:9px 10px;border:1px solid rgba(255,255,255,.045);border-radius:11px;background:#0b0b09;color:#777066;font-size:.47rem;line-height:1.45}.rules b{display:block;margin-bottom:2px;color:#b59a5a;font-size:.49rem}@media(max-width:620px){.labHeader{align-items:flex-start;flex-direction:column}.metrics{justify-content:flex-start}.summary{align-items:flex-start;flex-direction:column;gap:5px}.summary p{max-width:none}.stage{min-height:540px;height:66svh}.rules{grid-template-columns:1fr}.node,.emptySlot{width:88px}.node small,.emptySlot small{font-size:.37rem}}@media(prefers-reduced-motion:reduce){.personNode,.branchNode,.directEdge,.branchEdge{transition:none}.slotEdgeFlow{display:none}}
      `}</style>
    </main>
  );
}
