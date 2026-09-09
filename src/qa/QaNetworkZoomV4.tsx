'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type DemoNode = { id: string; wallet: string; parentId: string | null; status: Status };
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerState = { point: Point; interactive: boolean };

const WORLD_W = 760;
const WORLD_H = 1060;
const CENTER_X = WORLD_W / 2;
const ROOT_Y = 108;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.92;
const ROOT_SCALE = 0.78;

const DEMO_NODES: DemoNode[] = [
  { id: 'you', wallet: '0x0000000000000000000000000000000000000001', parentId: null, status: 'REWARDED' },
  { id: 'a', wallet: '0xA100000000000000000000000000000000000001', parentId: 'you', status: 'REWARDED' },
  { id: 'b', wallet: '0xB200000000000000000000000000000000000002', parentId: 'you', status: 'QUALIFIED' },
  { id: 'c', wallet: '0xC300000000000000000000000000000000000003', parentId: 'you', status: 'REWARDED' },
  { id: 'd', wallet: '0xD400000000000000000000000000000000000004', parentId: 'you', status: 'IN_PROGRESS' },
  { id: 'a1', wallet: '0xA110000000000000000000000000000000000011', parentId: 'a', status: 'QUALIFIED' },
  { id: 'a2', wallet: '0xA120000000000000000000000000000000000012', parentId: 'a', status: 'REWARDED' },
  { id: 'a3', wallet: '0xA130000000000000000000000000000000000013', parentId: 'a', status: 'IN_PROGRESS' },
  { id: 'a4', wallet: '0xA140000000000000000000000000000000000014', parentId: 'a', status: 'QUALIFIED' },
  { id: 'b1', wallet: '0xB210000000000000000000000000000000000021', parentId: 'b', status: 'REWARDED' },
  { id: 'b2', wallet: '0xB220000000000000000000000000000000000022', parentId: 'b', status: 'QUALIFIED' },
  { id: 'b3', wallet: '0xB230000000000000000000000000000000000023', parentId: 'b', status: 'IN_PROGRESS' },
  { id: 'c1', wallet: '0xC310000000000000000000000000000000000031', parentId: 'c', status: 'QUALIFIED' },
  { id: 'c2', wallet: '0xC320000000000000000000000000000000000032', parentId: 'c', status: 'IN_PROGRESS' },
  { id: 'c3', wallet: '0xC330000000000000000000000000000000000033', parentId: 'c', status: 'REWARDED' },
  { id: 'c4', wallet: '0xC340000000000000000000000000000000000034', parentId: 'c', status: 'QUALIFIED' },
  { id: 'd1', wallet: '0xD410000000000000000000000000000000000041', parentId: 'd', status: 'QUALIFIED' },
  { id: 'd2', wallet: '0xD420000000000000000000000000000000000042', parentId: 'd', status: 'IN_PROGRESS' },
  { id: 'd3', wallet: '0xD430000000000000000000000000000000000043', parentId: 'd', status: 'REWARDED' },
  { id: 'a11', wallet: '0xA111000000000000000000000000000000000111', parentId: 'a1', status: 'REWARDED' },
  { id: 'a12', wallet: '0xA112000000000000000000000000000000000112', parentId: 'a1', status: 'QUALIFIED' },
  { id: 'a13', wallet: '0xA113000000000000000000000000000000000113', parentId: 'a1', status: 'IN_PROGRESS' },
  { id: 'a21', wallet: '0xA121000000000000000000000000000000000121', parentId: 'a2', status: 'QUALIFIED' },
  { id: 'a22', wallet: '0xA122000000000000000000000000000000000122', parentId: 'a2', status: 'REWARDED' },
  { id: 'b11', wallet: '0xB211000000000000000000000000000000000211', parentId: 'b1', status: 'QUALIFIED' },
  { id: 'b12', wallet: '0xB212000000000000000000000000000000000212', parentId: 'b1', status: 'REWARDED' },
  { id: 'b13', wallet: '0xB213000000000000000000000000000000000213', parentId: 'b1', status: 'IN_PROGRESS' },
  { id: 'c11', wallet: '0xC311000000000000000000000000000000000311', parentId: 'c1', status: 'QUALIFIED' },
  { id: 'c12', wallet: '0xC312000000000000000000000000000000000312', parentId: 'c1', status: 'REWARDED' },
  { id: 'd11', wallet: '0xD411000000000000000000000000000000000411', parentId: 'd1', status: 'QUALIFIED' },
  { id: 'd12', wallet: '0xD412000000000000000000000000000000000412', parentId: 'd1', status: 'IN_PROGRESS' },
  { id: 'a111', wallet: '0xA111100000000000000000000000000000001111', parentId: 'a11', status: 'QUALIFIED' },
  { id: 'a112', wallet: '0xA111200000000000000000000000000000001112', parentId: 'a11', status: 'REWARDED' },
  { id: 'b111', wallet: '0xB211100000000000000000000000000000002111', parentId: 'b11', status: 'IN_PROGRESS' },
];

const NODE_BY_ID = new Map(DEMO_NODES.map((node) => [node.id, node]));
const CHILDREN = new Map<string, DemoNode[]>();
for (const node of DEMO_NODES) {
  if (!node.parentId) continue;
  const list = CHILDREN.get(node.parentId) ?? [];
  list.push(node);
  CHILDREN.set(node.parentId, list);
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}
function childrenOf(id: string) { return CHILDREN.get(id) ?? []; }
function shortWallet(wallet: string) { return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`; }
function statusLabel(status: Status) { return status === 'REWARDED' ? 'Rewarded' : status === 'QUALIFIED' ? 'Qualified' : 'In Progress'; }
function descendantsOf(id: string) {
  const result: DemoNode[] = [];
  const stack = [...childrenOf(id)];
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    stack.push(...childrenOf(node.id));
  }
  return result;
}
function networkCount(id: string) { return descendantsOf(id).length; }
function qualifiedCount(id: string) { return descendantsOf(id).filter((node) => node.status !== 'IN_PROGRESS').length; }
function pathTo(id: string) {
  const path: DemoNode[] = [];
  let current = NODE_BY_ID.get(id) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? NODE_BY_ID.get(current.parentId) ?? null : null;
  }
  return path;
}
function spread(count: number, center: number, width: number) {
  if (count <= 1) return [center];
  const step = width / (count - 1);
  return Array.from({ length: count }, (_, index) => center - width / 2 + step * index);
}

export function QaNetworkZoomV4() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const previousPointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ distance: number } | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const dragDistanceRef = useRef(0);

  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>({ x: 0, y: 18, scale: ROOT_SCALE });
  const [viewRootId, setViewRootId] = useState('you');
  const [activeChildId, setActiveChildId] = useState<string | null>('a');
  const [detailFocusId, setDetailFocusId] = useState<string | null>('a1');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const root = NODE_BY_ID.get(viewRootId)!;
  const rootChildren = childrenOf(viewRootId);
  const firstProgress = smoothStep(0.78, 1.04, view.scale);
  const secondProgress = smoothStep(1.02, 1.34, view.scale);
  const thirdProgress = smoothStep(1.34, 1.72, view.scale);
  const detailProgress = smoothStep(0.92, 1.10, view.scale);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setHintVisible(false), 5200);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontal = Math.max(90, (WORLD_W * scale - stageSize.width) / 2 + 120);
    const minY = -(WORLD_H * scale - stageSize.height + 110);
    return { scale, x: clamp(next.x, -horizontal, horizontal), y: clamp(next.y, minY, 92) };
  }, [stageSize.height, stageSize.width]);

  const cancelCamera = useCallback(() => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    cameraTimerRef.current = null;
    setCameraMoving(false);
  }, []);

  const startCamera = useCallback((next: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(clampView(next));
    cameraTimerRef.current = window.setTimeout(() => {
      setCameraMoving(false);
      cameraTimerRef.current = null;
    }, 560);
  }, [clampView]);

  useEffect(() => {
    setView((current) => clampView(current));
  }, [clampView]);

  const positions = useMemo(() => {
    const rootChildXs = spread(rootChildren.length, CENTER_X, Math.min(560, Math.max(170, (rootChildren.length - 1) * 170)));
    const childPos = new Map<string, Point>();
    rootChildren.forEach((child, index) => childPos.set(child.id, { x: rootChildXs[index], y: 300 }));

    const active = activeChildId ? NODE_BY_ID.get(activeChildId) : null;
    const activePos = active ? childPos.get(active.id) : null;
    const grandchildren = active ? childrenOf(active.id) : [];
    const grandXs = spread(grandchildren.length, activePos?.x ?? CENTER_X, Math.min(350, Math.max(110, (grandchildren.length - 1) * 98)));
    const grandPos = new Map<string, Point>();
    grandchildren.forEach((node, index) => grandPos.set(node.id, { x: grandXs[index], y: 525 }));

    const detail = detailFocusId ? NODE_BY_ID.get(detailFocusId) : null;
    const detailPos = detail ? grandPos.get(detail.id) : null;
    const great = detail ? childrenOf(detail.id) : [];
    const greatXs = spread(great.length, detailPos?.x ?? activePos?.x ?? CENTER_X, Math.min(280, Math.max(90, (great.length - 1) * 88)));
    const greatPos = new Map<string, Point>();
    great.forEach((node, index) => greatPos.set(node.id, { x: greatXs[index], y: 750 }));
    return { childPos, grandPos, greatPos, grandchildren, great };
  }, [activeChildId, detailFocusId, rootChildren]);

  useEffect(() => {
    if (activeChildId && rootChildren.some((node) => node.id === activeChildId)) return;
    const first = rootChildren[0] ?? null;
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
  }, [activeChildId, rootChildren]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    cancelCamera();
    setHintVisible(false);
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return clampView({ scale, x: px - worldX * scale, y: py - worldY * scale });
    });
  }, [cancelCamera, clampView]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = clamp(Math.exp(-event.deltaY * 0.0017), 0.94, 1.06);
    zoomAroundPoint(event.clientX, event.clientY, view.scale * factor);
  };

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const interactive = Boolean((event.target as HTMLElement).closest('[data-network-interactive="true"]'));
    pointersRef.current.set(event.pointerId, { point, interactive });
    dragDistanceRef.current = 0;
    setHintVisible(false);
    if (pointersRef.current.size === 1) previousPointerRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      previousPointerRef.current = null;
      cancelCamera();
    }
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const existing = pointersRef.current.get(event.pointerId);
    if (!existing) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { ...existing, point });

    if (pointersRef.current.size === 1) {
      if (existing.interactive) return;
      const previous = previousPointerRef.current;
      if (!previous) { previousPointerRef.current = point; return; }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
      cancelCamera();
      setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }));
      previousPointerRef.current = point;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchRef.current?.distance) zoomAroundPoint(center.x, center.y, view.scale * (distance / pinchRef.current.distance));
      pinchRef.current = { distance };
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) previousPointerRef.current = [...pointersRef.current.values()][0].point;
    if (pointersRef.current.size === 0) {
      previousPointerRef.current = null;
      pinchRef.current = null;
    }
  };

  const enterNetwork = (id: string) => {
    if (networkCount(id) === 0) return;
    const first = childrenOf(id)[0] ?? null;
    setViewRootId(id);
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
    setSelectedId(null);
    startCamera({ x: 0, y: 18, scale: 0.96 });
  };

  const returnToYou = () => {
    setViewRootId('you');
    setActiveChildId('a');
    setDetailFocusId('a1');
    setSelectedId(null);
    startCamera({ x: 0, y: 18, scale: ROOT_SCALE });
  };

  const jumpToAncestor = (id: string) => {
    if (id === 'you') { returnToYou(); return; }
    const first = childrenOf(id)[0] ?? null;
    setViewRootId(id);
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
    setSelectedId(null);
    startCamera({ x: 0, y: 18, scale: 0.96 });
  };

  const chooseChild = (id: string) => {
    setActiveChildId(id);
    setDetailFocusId(childrenOf(id)[0]?.id ?? null);
    setSelectedId(id);
  };

  const focusPath = pathTo(viewRootId);
  const crumbItems = focusPath.length <= 4 ? focusPath : [focusPath[0], null, ...focusPath.slice(-2)] as Array<DemoNode | null>;
  const selected = selectedId ? NODE_BY_ID.get(selectedId) ?? null : null;

  const childLineOpacity = 0.30 + firstProgress * 0.24;
  const summaryOpacity = 1 - firstProgress;
  const childOpacity = firstProgress;

  return (
    <main className="qaPage">
      <section className="notice" data-network-interactive="true">
        <div><strong>ZOOM NETWORK · QA V4</strong><span>샘플 데이터 · Production과 완전히 분리</span></div>
        <small>Semantic Zoom · 연결선 유지 · 연속 전환 애니메이션</small>
      </section>

      <section className="networkShell">
        <header className="topBar" data-network-interactive="true">
          <div><span>NETWORK</span><h1>{viewRootId === 'you' ? 'My Network' : `${shortWallet(root.wallet)} Network`}</h1></div>
          <div className="totals"><b>{networkCount(viewRootId)}</b><span>Members</span>{viewRootId !== 'you' ? <><i /><b className="muted">{networkCount('you')}</b><span>My Network</span></> : null}</div>
        </header>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDownCapture={onPointerDownCapture} onPointerMoveCapture={onPointerMoveCapture} onPointerUpCapture={onPointerEndCapture} onPointerCancelCapture={onPointerEndCapture}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-interactive="true"><span>{view.scale < 1.0 ? '전체 구조' : view.scale < 1.34 ? '가지 보기' : '상세 세대'}</span><small>{Math.round(view.scale * 100)}%</small></div>

          {focusPath.length > 1 ? <nav className="breadcrumb" data-network-interactive="true" aria-label="Network path" dir="ltr">
            {crumbItems.map((node, index) => node ? <span key={node.id}><i>{index ? '›' : ''}</i><button type="button" onClick={() => jumpToAncestor(node.id)}>{node.id === 'you' ? 'YOU' : shortWallet(node.wallet)}</button></span> : <span key="ellipsis"><i>›</i><b>…</b></span>)}
          </nav> : null}

          {hintVisible ? <div className="gestureHint" data-network-interactive="true"><b>↗</b><span>핀치·휠로 확대하면<br />다음 세대가 자연스럽게 펼쳐집니다</span></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              {rootChildren.map((child) => {
                const pos = positions.childPos.get(child.id)!;
                return <line key={`root-${child.id}`} className={activeChildId === child.id ? 'related' : ''} x1={CENTER_X} y1={ROOT_Y + 25} x2={pos.x} y2={pos.y - 36} style={{ opacity: childLineOpacity } as CSSProperties} />;
              })}
              {activeChildId ? positions.grandchildren.map((node) => {
                const parent = positions.childPos.get(activeChildId)!;
                const target = positions.grandPos.get(node.id)!;
                const x = mix(parent.x, target.x, secondProgress);
                const y = mix(parent.y + 8, target.y, secondProgress);
                return <line key={`${activeChildId}-${node.id}`} className="related growthLine" x1={parent.x} y1={parent.y + 25} x2={x} y2={y - 28} style={{ opacity: secondProgress * 0.54 } as CSSProperties} />;
              }) : null}
              {detailFocusId ? positions.great.map((node) => {
                const parent = positions.grandPos.get(detailFocusId);
                const target = positions.greatPos.get(node.id);
                if (!parent || !target) return null;
                const x = mix(parent.x, target.x, thirdProgress);
                const y = mix(parent.y + 8, target.y, thirdProgress);
                return <line key={`${detailFocusId}-${node.id}`} className="related growthLine" x1={parent.x} y1={parent.y + 25} x2={x} y2={y - 28} style={{ opacity: thirdProgress * 0.54 } as CSSProperties} />;
              }) : null}
            </svg>

            <button type="button" className="person root reveal" style={{ left: CENTER_X, top: ROOT_Y } as CSSProperties} data-network-interactive="true" onClick={() => setSelectedId(null)}>
              <span className="avatar" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="2.7" fill="currentColor"/><path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
              <b>{viewRootId === 'you' ? 'YOU' : shortWallet(root.wallet)}</b><small>{rootChildren.length} Direct</small>
            </button>

            {rootChildren.map((child, index) => {
              const pos = positions.childPos.get(child.id)!;
              const branchTotal = networkCount(child.id) + 1;
              const active = activeChildId === child.id;
              return <span key={`pair-${child.id}`}>
                <button type="button" className={`branchSummary ${active ? 'active' : ''}`} style={{ left: pos.x, top: pos.y, opacity: summaryOpacity, transform: `translate(-50%,-50%) scale(${0.9 + summaryOpacity * 0.1})`, pointerEvents: summaryOpacity > 0.45 ? 'auto' : 'none' } as CSSProperties} data-network-interactive="true" onClick={() => {
                  setActiveChildId(child.id); setDetailFocusId(childrenOf(child.id)[0]?.id ?? null); setSelectedId(null);
                  const rect = stageRef.current?.getBoundingClientRect();
                  if (rect) startCamera({ x: view.x, y: view.y, scale: Math.max(1.04, view.scale) });
                }}><span className="groupIcon" aria-hidden="true">•••</span><b>{branchTotal}</b><small>members</small></button>

                <button type="button" className={`person ${active ? 'active' : ''}`} style={{ left: pos.x, top: pos.y, opacity: childOpacity, transform: `translate(-50%,-50%) scale(${0.76 + childOpacity * 0.24})`, pointerEvents: childOpacity > 0.42 ? 'auto' : 'none' } as CSSProperties} data-network-interactive="true" onClick={() => chooseChild(child.id)}>
                  <span className="avatar" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="2.7" fill="currentColor"/><path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
                  <b dir="ltr">{shortWallet(child.wallet)}</b><small style={{ opacity: detailProgress }}>{networkCount(child.id)} network</small>
                </button>
              </span>;
            })}

            {activeChildId ? positions.grandchildren.map((node, index) => {
              const parent = positions.childPos.get(activeChildId)!;
              const target = positions.grandPos.get(node.id)!;
              const stagger = clamp(secondProgress * 1.18 - index * 0.08, 0, 1);
              const x = mix(parent.x, target.x, stagger);
              const y = mix(parent.y + 24, target.y, stagger);
              return <button key={node.id} type="button" className={`person ${detailFocusId === node.id ? 'active' : ''}`} style={{ left: x, top: y, opacity: stagger, transform: `translate(-50%,-50%) scale(${0.68 + stagger * 0.32})`, pointerEvents: stagger > 0.45 ? 'auto' : 'none' } as CSSProperties} data-network-interactive="true" onClick={() => { setDetailFocusId(node.id); setSelectedId(node.id); }}>
                <span className="avatar" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="2.7" fill="currentColor"/><path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
                <b dir="ltr">{shortWallet(node.wallet)}</b><small style={{ opacity: detailProgress }}>{networkCount(node.id)} network</small>
              </button>;
            }) : null}

            {activeChildId && networkCount(activeChildId) > 0 ? (() => {
              const pos = positions.childPos.get(activeChildId)!;
              const count = networkCount(activeChildId);
              return <button type="button" className="cluster" style={{ left: pos.x, top: pos.y + 98, opacity: firstProgress * (1 - secondProgress), transform: `translate(-50%,-50%) scale(${0.82 + (1 - secondProgress) * 0.18})`, pointerEvents: secondProgress < 0.55 ? 'auto' : 'none' } as CSSProperties} data-network-interactive="true" onClick={() => {
                const rect = stageRef.current?.getBoundingClientRect(); if (rect) startCamera({ x: view.x, y: view.y, scale: Math.max(1.34, view.scale) });
              }}><span className="stack" aria-hidden="true"><i/><i/><i/></span><b>+{count}</b></button>;
            })() : null}

            {detailFocusId ? positions.great.map((node, index) => {
              const parent = positions.grandPos.get(detailFocusId);
              const target = positions.greatPos.get(node.id);
              if (!parent || !target) return null;
              const stagger = clamp(thirdProgress * 1.18 - index * 0.10, 0, 1);
              const x = mix(parent.x, target.x, stagger);
              const y = mix(parent.y + 24, target.y, stagger);
              return <button key={node.id} type="button" className="person" style={{ left: x, top: y, opacity: stagger, transform: `translate(-50%,-50%) scale(${0.68 + stagger * 0.32})`, pointerEvents: stagger > 0.45 ? 'auto' : 'none' } as CSSProperties} data-network-interactive="true" onClick={() => setSelectedId(node.id)}>
                <span className="avatar" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="2.7" fill="currentColor"/><path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
                <b dir="ltr">{shortWallet(node.wallet)}</b><small style={{ opacity: detailProgress }}>{networkCount(node.id)} network</small>
              </button>;
            }) : null}
          </div>

          {selected ? <aside className="profileCard" data-network-interactive="true">
            <div className="profileHead"><span className="cardAvatar" aria-hidden="true">●</span><div><strong dir="ltr">{shortWallet(selected.wallet)}</strong><small>{statusLabel(selected.status)}</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div>
            <div className="metrics"><span><b>{networkCount(selected.id)}</b>Network Members</span><span><b>{childrenOf(selected.id).length}</b>Direct Invites</span><span><b>{qualifiedCount(selected.id)}</b>Qualified</span></div>
            {networkCount(selected.id) > 0 ? <button type="button" className="focusButton" onClick={() => enterNetwork(selected.id)}>이 네트워크 보기</button> : <div className="emptyNetwork">하위 네트워크 없음</div>}
          </aside> : null}

          <div className="controls" data-network-interactive="true"><button type="button" aria-label="YOU로 돌아가기" onClick={returnToYou}>◎</button><button type="button" aria-label="확대" onClick={() => startCamera({ ...view, scale: view.scale + 0.18 })}>+</button><button type="button" aria-label="축소" onClick={() => startCamera({ ...view, scale: view.scale - 0.18 })}>−</button></div>
        </div>
      </section>

      <section className="tips" data-network-interactive="true"><span><b>첫 화면</b> 연결선으로 구조 인지</span><span><b>확대</b> +N → 사람 전환</span><span><b>프로필</b> 정보 보기</span><span><b>Network</b> 임시 중심 변경</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem;line-height:1.35}.notice small{text-align:right;max-width:220px}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{height:62px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.045)}.topBar>div:first-child{display:grid;gap:2px}.topBar>div:first-child span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.topBar h1{margin:0;font-size:.91rem;color:#f5f1e8}.totals{display:flex;align-items:baseline;gap:4px;color:#6f6a62;font-size:.47rem;white-space:nowrap}.totals b{color:#d8d1c5;font-size:.66rem}.totals .muted{color:#938a7b}.totals i{width:1px;height:9px;margin:0 3px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(560px,72svh,760px);overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.045),transparent 32%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.65),transparent 88%)}.hud{position:absolute;z-index:30;right:10px;top:10px;height:27px;padding:0 8px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px)}.hud span{color:#b7aa91;font-size:.49rem;font-weight:800}.hud small{color:#6b645a;font-size:.44rem}.breadcrumb{position:absolute;z-index:30;left:10px;top:10px;max-width:calc(100% - 145px);height:27px;padding:0 7px;display:flex;align-items:center;gap:4px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px);white-space:nowrap;animation:crumbIn .26s ease both}.breadcrumb span{display:flex;align-items:center;gap:4px}.breadcrumb button{border:0;background:transparent;color:#a99c85;font:inherit;font-size:.45rem;cursor:pointer}.breadcrumb span:first-child button{color:#d4ad4e;font-weight:900}.breadcrumb i,.breadcrumb b{font-style:normal;color:#4f4a43;font-size:.43rem}.gestureHint{position:absolute;z-index:28;left:50%;bottom:72px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid rgba(244,183,40,.13);border-radius:13px;background:rgba(16,15,12,.88);backdrop-filter:blur(12px);box-shadow:0 12px 30px rgba(0,0,0,.25);animation:hintIn .3s ease both;pointer-events:none}.gestureHint b{color:#d8ad48;font-size:.9rem}.gestureHint span{color:#aaa08f;font-size:.49rem;line-height:1.42;white-space:nowrap}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform 560ms cubic-bezier(.2,.78,.2,1)}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke:rgba(211,202,186,.22);stroke-width:1.25;stroke-linecap:round;transition:opacity 80ms linear,stroke 180ms ease}.edges line.related{stroke:rgba(229,184,71,.48)}.growthLine{stroke-dasharray:4 3}.person,.branchSummary,.cluster{position:absolute;z-index:5;font:inherit;cursor:pointer;will-change:opacity,transform,left,top}.person{width:88px;min-height:68px;padding:3px;border:0;background:transparent;color:#9e9587;display:flex;flex-direction:column;align-items:center;gap:4px;transition:filter 170ms ease}.person.active .avatar,.person:hover .avatar{border-color:rgba(244,183,40,.48);box-shadow:0 0 0 4px rgba(244,183,40,.055),0 0 18px rgba(244,183,40,.11)}.person.root{transform:translate(-50%,-50%);color:#d5ae50}.avatar{width:31px;height:31px;display:grid;place-items:center;border:1px solid rgba(208,193,160,.18);border-radius:50%;background:#151410;color:#807768;box-shadow:0 6px 15px rgba(0,0,0,.24);transition:box-shadow 180ms ease,border-color 180ms ease}.root .avatar{width:39px;height:39px;border-color:rgba(244,183,40,.46);color:#d1aa4e;background:#17150f}.person b{max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b4ab9e;font-size:.52rem;line-height:1.1}.root b{color:#d4ad50}.person small{color:#625c53;font-size:.42rem;transition:opacity 120ms linear}.branchSummary{width:72px;height:72px;border:1px solid rgba(207,193,161,.15);border-radius:50%;background:radial-gradient(circle at 50% 35%,rgba(244,183,40,.095),rgba(23,21,16,.96));color:#b8ad9b;display:grid;place-items:center;align-content:center;gap:0;box-shadow:0 10px 28px rgba(0,0,0,.26)}.branchSummary.active{border-color:rgba(244,183,40,.43);box-shadow:0 0 0 4px rgba(244,183,40,.045),0 10px 28px rgba(0,0,0,.26)}.branchSummary .groupIcon{height:10px;color:#9a8d74;font-size:.55rem;letter-spacing:1px}.branchSummary b{color:#e0d7c8;font-size:.72rem}.branchSummary small{color:#71695d;font-size:.4rem}.cluster{transform:translate(-50%,-50%);height:30px;padding:0 10px;border:1px solid rgba(244,183,40,.16);border-radius:999px;background:#15130e;color:#c49c42;display:flex;align-items:center;gap:6px;box-shadow:0 8px 22px rgba(0,0,0,.24)}.cluster b{font-size:.5rem}.stack{width:13px;height:11px;position:relative}.stack i{position:absolute;width:8px;height:8px;border:1px solid rgba(190,171,129,.36);border-radius:50%;background:#16140f}.stack i:nth-child(1){left:0;top:2px}.stack i:nth-child(2){left:3px;top:0}.stack i:nth-child(3){left:5px;top:3px}.profileCard{position:absolute;z-index:45;left:50%;bottom:12px;transform:translateX(-50%);width:min(calc(100% - 24px),370px);padding:11px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(20,19,16,.96);backdrop-filter:blur(16px);box-shadow:0 20px 55px rgba(0,0,0,.42);animation:cardIn .22s ease both}.profileHead{display:flex;align-items:center;gap:8px}.cardAvatar{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#191710;color:#c9a143;font-size:.45rem}.profileHead>div{display:grid;gap:1px;flex:1}.profileHead strong{color:#ddd4c5;font-size:.59rem}.profileHead small{color:#7b7367;font-size:.43rem}.profileHead>button{width:26px;height:26px;border:0;background:transparent;color:#6f685e;font-size:1rem}.metrics{margin-top:9px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.metrics span{padding:7px 4px;border-radius:10px;background:rgba(255,255,255,.026);color:#6f685d;font-size:.4rem;text-align:center}.metrics b{display:block;margin-bottom:2px;color:#cfc5b4;font-size:.63rem}.focusButton,.emptyNetwork{margin-top:8px;width:100%;height:34px;border-radius:10px;font:inherit;font-size:.49rem;font-weight:800}.focusButton{border:1px solid rgba(244,183,40,.22);background:rgba(244,183,40,.09);color:#d7ad4a}.emptyNetwork{display:grid;place-items:center;border:1px solid rgba(255,255,255,.055);color:#696257;background:rgba(255,255,255,.018)}.controls{position:absolute;z-index:35;right:10px;bottom:12px;display:grid;gap:5px}.controls button{width:32px;height:32px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(16,16,14,.9);color:#918778;font:inherit;font-size:.72rem;box-shadow:0 7px 18px rgba(0,0,0,.24)}.controls button:first-child{color:#d2a848;border-color:rgba(244,183,40,.15)}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.tips span{padding:7px 8px;border-radius:10px;background:rgba(255,255,255,.018);color:#686158;font-size:.45rem}.tips b{color:#a79061}.person:focus-visible,.branchSummary:focus-visible,.cluster:focus-visible,.controls button:focus-visible,.breadcrumb button:focus-visible,.focusButton:focus-visible{outline:2px solid rgba(244,183,40,.58);outline-offset:2px}@keyframes cardIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes crumbIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@keyframes hintIn{from{opacity:0;transform:translate(-50%,7px)}to{opacity:1;transform:translate(-50%,0)}}@media(max-width:420px){.notice small{display:none}.topBar{padding:0 12px}.totals span{font-size:.42rem}.stage{height:clamp(550px,73svh,710px)}.tips{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){.world.cameraMoving,.person,.branchSummary,.cluster,.edges line,.profileCard,.breadcrumb,.gestureHint{transition:none!important;animation:none!important}}
      `}</style>
    </main>
  );
}
