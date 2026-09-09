'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type DemoNode = { id: string; wallet: string; parentId: string | null; status: Status };
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerState = { point: Point; interactive: boolean };

type LayoutNode = DemoNode & { x: number; y: number; relDepth: number };

const WORLD_W = 760;
const WORLD_H = 1040;
const CENTER_X = WORLD_W / 2;
const MIN_SCALE = 0.64;
const MAX_SCALE = 1.92;
const ROOT_SCALE = 0.74;

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
  { id: 'a31', wallet: '0xA131000000000000000000000000000000000131', parentId: 'a3', status: 'QUALIFIED' },
  { id: 'a32', wallet: '0xA132000000000000000000000000000000000132', parentId: 'a3', status: 'IN_PROGRESS' },
  { id: 'b11', wallet: '0xB211000000000000000000000000000000000211', parentId: 'b1', status: 'QUALIFIED' },
  { id: 'b12', wallet: '0xB212000000000000000000000000000000000212', parentId: 'b1', status: 'REWARDED' },
  { id: 'b13', wallet: '0xB213000000000000000000000000000000000213', parentId: 'b1', status: 'IN_PROGRESS' },
  { id: 'b21', wallet: '0xB221000000000000000000000000000000000221', parentId: 'b2', status: 'QUALIFIED' },
  { id: 'b22', wallet: '0xB222000000000000000000000000000000000222', parentId: 'b2', status: 'REWARDED' },
  { id: 'c11', wallet: '0xC311000000000000000000000000000000000311', parentId: 'c1', status: 'QUALIFIED' },
  { id: 'c12', wallet: '0xC312000000000000000000000000000000000312', parentId: 'c1', status: 'REWARDED' },
  { id: 'c21', wallet: '0xC321000000000000000000000000000000000321', parentId: 'c2', status: 'IN_PROGRESS' },
  { id: 'c22', wallet: '0xC322000000000000000000000000000000000322', parentId: 'c2', status: 'QUALIFIED' },
  { id: 'd11', wallet: '0xD411000000000000000000000000000000000411', parentId: 'd1', status: 'QUALIFIED' },
  { id: 'd12', wallet: '0xD412000000000000000000000000000000000412', parentId: 'd1', status: 'IN_PROGRESS' },
  { id: 'd21', wallet: '0xD421000000000000000000000000000000000421', parentId: 'd2', status: 'QUALIFIED' },
  { id: 'd22', wallet: '0xD422000000000000000000000000000000000422', parentId: 'd2', status: 'REWARDED' },
  { id: 'a111', wallet: '0xA111100000000000000000000000000000001111', parentId: 'a11', status: 'QUALIFIED' },
  { id: 'a112', wallet: '0xA111200000000000000000000000000000001112', parentId: 'a11', status: 'REWARDED' },
  { id: 'b111', wallet: '0xB211100000000000000000000000000000002111', parentId: 'b11', status: 'IN_PROGRESS' },
  { id: 'c111', wallet: '0xC311100000000000000000000000000000003111', parentId: 'c11', status: 'QUALIFIED' },
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
function childrenOf(id: string) { return CHILDREN.get(id) ?? []; }
function shortWallet(wallet: string) { return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`; }
function statusLabel(status: Status) { return status === 'REWARDED' ? 'Rewarded' : status === 'QUALIFIED' ? 'Qualified' : 'In Progress'; }

function pathTo(id: string) {
  const path: DemoNode[] = [];
  let current = NODE_BY_ID.get(id) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? NODE_BY_ID.get(current.parentId) ?? null : null;
  }
  return path;
}

function isDescendant(rootId: string, id: string) {
  if (rootId === id) return true;
  let current = NODE_BY_ID.get(id) ?? null;
  while (current?.parentId) {
    if (current.parentId === rootId) return true;
    current = NODE_BY_ID.get(current.parentId) ?? null;
  }
  return false;
}

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

function directCount(id: string) { return childrenOf(id).length; }
function networkCount(id: string) { return descendantsOf(id).length; }
function qualifiedCount(id: string) { return descendantsOf(id).filter((node) => node.status !== 'IN_PROGRESS').length; }

function zoomLabel(tier: number) {
  if (tier === 0) return '전체 구조';
  if (tier === 1) return '사람 보기';
  if (tier === 2) return '가지 보기';
  return '상세 세대';
}

export function QaNetworkZoomV3() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const previousPointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);
  const cameraTimerRef = useRef<number | null>(null);

  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>({ x: 0, y: 18, scale: ROOT_SCALE });
  const [zoomTier, setZoomTier] = useState(0);
  const [viewRootId, setViewRootId] = useState('you');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>('a');
  const [detailFocusId, setDetailFocusId] = useState<string | null>('a1');
  const [cameraMoving, setCameraMoving] = useState(false);

  const root = NODE_BY_ID.get(viewRootId)!;
  const rootChildren = childrenOf(viewRootId);
  const myNetworkCount = networkCount('you');

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontal = Math.max(0, (WORLD_W * scale + stageSize.width) / 2 - 86);
    const minY = -(WORLD_H * scale - 96);
    const maxY = stageSize.height - 96;
    return { scale, x: clamp(next.x, -horizontal, horizontal), y: clamp(next.y, minY, maxY) };
  }, [stageSize.height, stageSize.width]);

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

  useEffect(() => setView((current) => clampView(current)), [clampView]);
  useEffect(() => () => { if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current); }, []);

  useEffect(() => {
    const s = view.scale;
    setZoomTier((tier) => {
      if (tier === 0) return s > 0.86 ? 1 : 0;
      if (tier === 1) return s < 0.78 ? 0 : s > 1.16 ? 2 : 1;
      if (tier === 2) return s < 1.04 ? 1 : s > 1.52 ? 3 : 2;
      return s < 1.38 ? 2 : 3;
    });
  }, [view.scale]);

  useEffect(() => {
    if (activeChildId && rootChildren.some((node) => node.id === activeChildId)) return;
    const first = rootChildren[0] ?? null;
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
  }, [activeChildId, rootChildren, viewRootId]);

  const visibleIds = useMemo(() => {
    const ids = new Set<string>([viewRootId]);
    if (zoomTier >= 1) for (const child of rootChildren) ids.add(child.id);
    if (zoomTier >= 2 && activeChildId) for (const child of childrenOf(activeChildId)) ids.add(child.id);
    if (zoomTier >= 3 && detailFocusId) for (const child of childrenOf(detailFocusId)) ids.add(child.id);
    return ids;
  }, [activeChildId, detailFocusId, rootChildren, viewRootId, zoomTier]);

  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleIds]);

  const layoutNodes = useMemo(() => {
    const visible = [...visibleIds].map((id) => NODE_BY_ID.get(id)!).filter(Boolean);
    const relDepth = new Map<string, number>();
    relDepth.set(viewRootId, 0);
    const queue = [viewRootId];
    while (queue.length) {
      const parent = queue.shift()!;
      const depth = relDepth.get(parent) ?? 0;
      for (const child of childrenOf(parent)) {
        if (!visibleIds.has(child.id)) continue;
        relDepth.set(child.id, depth + 1);
        queue.push(child.id);
      }
    }

    const leafOrder = new Map<string, number>();
    let cursor = 0;
    const assignLeaves = (id: string): number => {
      const kids = childrenOf(id).filter((child) => visibleIds.has(child.id));
      if (!kids.length) {
        const value = cursor++;
        leafOrder.set(id, value);
        return value;
      }
      const childValues = kids.map((child) => assignLeaves(child.id));
      const value = (childValues[0] + childValues[childValues.length - 1]) / 2;
      leafOrder.set(id, value);
      return value;
    };
    assignLeaves(viewRootId);
    const leafCount = Math.max(1, cursor);
    const gap = leafCount <= 1 ? 0 : Math.min(112, 650 / (leafCount - 1));
    const width = gap * Math.max(0, leafCount - 1);
    const startX = CENTER_X - width / 2;
    const rootRawX = startX + (leafOrder.get(viewRootId) ?? 0) * gap;
    const shift = CENTER_X - rootRawX;

    return visible.map((node) => ({
      ...node,
      relDepth: relDepth.get(node.id) ?? 0,
      x: clamp(startX + (leafOrder.get(node.id) ?? 0) * gap + shift, 42, WORLD_W - 42),
      y: 96 + (relDepth.get(node.id) ?? 0) * 224,
    })) as LayoutNode[];
  }, [viewRootId, visibleIds]);

  const layoutById = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes]);
  const selected = selectedId ? NODE_BY_ID.get(selectedId) ?? null : null;

  const clusterButtons = useMemo(() => {
    const clusters: Array<{ nodeId: string; x: number; y: number; count: number }> = [];
    for (const node of layoutNodes) {
      if (node.id === viewRootId || !childrenOf(node.id).length) continue;
      const hidden = descendantsOf(node.id).filter((desc) => !visibleIds.has(desc.id)).length;
      if (hidden > 0) clusters.push({ nodeId: node.id, x: node.x, y: node.y + 78, count: hidden });
    }
    return clusters;
  }, [layoutNodes, viewRootId, visibleIds]);

  const startCamera = useCallback((next: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(clampView(next));
    cameraTimerRef.current = window.setTimeout(() => { setCameraMoving(false); cameraTimerRef.current = null; }, 540);
  }, [clampView]);

  const cancelCamera = useCallback(() => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    cameraTimerRef.current = null;
    setCameraMoving(false);
  }, []);

  const enterNetwork = useCallback((id: string) => {
    if (!NODE_BY_ID.has(id) || networkCount(id) === 0) return;
    const first = childrenOf(id)[0] ?? null;
    setViewRootId(id);
    setSelectedId(null);
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
    setZoomTier(1);
    startCamera({ x: 0, y: 18, scale: 1.0 });
  }, [startCamera]);

  const returnToYou = useCallback(() => {
    setViewRootId('you');
    setSelectedId(null);
    setActiveChildId('a');
    setDetailFocusId('a1');
    setZoomTier(0);
    startCamera({ x: 0, y: 18, scale: ROOT_SCALE });
  }, [startCamera]);

  const jumpToAncestor = useCallback((id: string) => {
    if (id === 'you') { returnToYou(); return; }
    const first = childrenOf(id)[0] ?? null;
    setViewRootId(id);
    setSelectedId(null);
    setActiveChildId(first?.id ?? null);
    setDetailFocusId(first ? childrenOf(first.id)[0]?.id ?? null : null);
    setZoomTier(1);
    startCamera({ x: 0, y: 18, scale: 1.0 });
  }, [returnToYou, startCamera]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    cancelCamera();
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
    const factor = event.deltaY < 0 ? 1.105 : 0.905;
    zoomAroundPoint(event.clientX, event.clientY, view.scale * factor);
  };

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const interactive = Boolean((event.target as HTMLElement).closest('[data-network-interactive="true"]'));
    pointersRef.current.set(event.pointerId, { point, interactive });
    dragDistanceRef.current = 0;
    if (pointersRef.current.size === 1) {
      previousPointerRef.current = point;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const values = [...pointersRef.current.values()].map((value) => value.point);
      const [a, b] = values;
      pinchRef.current = { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
      previousPointerRef.current = null;
      suppressClickRef.current = true;
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
      if (dragDistanceRef.current > 5) suppressClickRef.current = true;
      cancelCamera();
      setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }));
      previousPointerRef.current = point;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previous = pinchRef.current;
      if (previous?.distance) zoomAroundPoint(center.x, center.y, view.scale * (distance / previous.distance));
      pinchRef.current = { center, distance };
      suppressClickRef.current = true;
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      previousPointerRef.current = [...pointersRef.current.values()][0].point;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      previousPointerRef.current = null;
      pinchRef.current = null;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  const pickNode = (node: DemoNode) => {
    setSelectedId(node.id);
    if (node.parentId === viewRootId) {
      setActiveChildId(node.id);
      setDetailFocusId(childrenOf(node.id)[0]?.id ?? null);
    } else if (activeChildId && isDescendant(activeChildId, node.id)) {
      setDetailFocusId(node.id);
    }
  };

  const expandCluster = (id: string) => {
    if (childrenOf(id).length === 0) return;
    if (id === activeChildId || (activeChildId && isDescendant(activeChildId, id))) {
      setDetailFocusId(id);
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, Math.max(view.scale, 1.6));
      return;
    }
    setActiveChildId(id);
    setDetailFocusId(childrenOf(id)[0]?.id ?? null);
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, Math.max(view.scale, 1.26));
  };

  const focusPath = pathTo(viewRootId);
  const crumbItems = focusPath.length <= 4 ? focusPath : [focusPath[0], null, ...focusPath.slice(-2)] as Array<DemoNode | null>;

  return (
    <main className="qaPage">
      <section className="notice" data-network-interactive="true">
        <div><strong>ZOOM NETWORK · QA V3</strong><span>샘플 데이터 · Production과 완전히 분리</span></div>
        <small>Re-root · 고정 가지 · 안전한 +N · 모바일 핀치 개선</small>
      </section>

      <section className="networkShell">
        <header className="topBar" data-network-interactive="true">
          <div><span>NETWORK</span><h1>{viewRootId === 'you' ? 'My Network' : `${shortWallet(root.wallet)} Network`}</h1></div>
          <div className="totals"><b>{networkCount(viewRootId)}</b><span>Members</span>{viewRootId !== 'you' ? <><i /><b className="muted">{myNetworkCount}</b><span>My Network</span></> : null}</div>
        </header>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDownCapture={onPointerDownCapture} onPointerMoveCapture={onPointerMoveCapture} onPointerUpCapture={onPointerEndCapture} onPointerCancelCapture={onPointerEndCapture} onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
          if (suppressClickRef.current || dragDistanceRef.current > 5) return;
          setSelectedId(null);
        }}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-interactive="true"><span>{zoomLabel(zoomTier)}</span><small>{Math.round(view.scale * 100)}%</small></div>

          {focusPath.length > 1 ? (
            <nav className="breadcrumb" data-network-interactive="true" aria-label="Network path">
              {crumbItems.map((node, index) => node ? (
                <span key={node.id}><i>{index ? '›' : ''}</i><button type="button" onClick={() => jumpToAncestor(node.id)}>{node.id === 'you' ? 'YOU' : shortWallet(node.wallet)}</button></span>
              ) : <span key="ellipsis"><i>›</i><b>…</b></span>)}
            </nav>
          ) : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              {layoutNodes.filter((node) => node.parentId && visibleIds.has(node.parentId)).map((node, index) => {
                const parent = layoutById.get(node.parentId!);
                if (!parent) return null;
                const active = node.id === activeChildId || (activeChildId ? isDescendant(activeChildId, node.id) : false);
                return <line key={`${parent.id}-${node.id}`} className={active ? 'related' : ''} style={{ animationDelay: `${Math.min(index * 28, 160)}ms` }} x1={parent.x} y1={parent.y + 23} x2={node.x} y2={node.y - 23} />;
              })}
            </svg>

            {zoomTier === 0 ? rootChildren.map((child, index) => {
              const count = networkCount(child.id) + 1;
              const x = rootChildren.length === 1 ? CENTER_X : 92 + index * ((WORLD_W - 184) / Math.max(1, rootChildren.length - 1));
              return <button key={child.id} type="button" className={`branchSummary reveal ${activeChildId === child.id ? 'active' : ''}`} style={{ left: x, top: 300, animationDelay: `${index * 45}ms` } as CSSProperties} data-network-interactive="true" onClick={() => {
                setActiveChildId(child.id);
                setDetailFocusId(childrenOf(child.id)[0]?.id ?? null);
                const rect = stageRef.current?.getBoundingClientRect();
                if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.0);
              }}><span>{count}</span><small>members</small></button>;
            }) : null}

            {layoutNodes.map((node, index) => {
              if (zoomTier === 0 && node.id !== viewRootId) return null;
              const isRoot = node.id === viewRootId;
              const isYou = node.id === 'you';
              const active = isRoot || node.id === activeChildId || (activeChildId ? isDescendant(activeChildId, node.id) : false);
              const selectedNow = selectedId === node.id;
              return <button key={`${viewRootId}-${node.id}`} type="button" aria-label={isYou ? 'YOU' : shortWallet(node.wallet)} className={`person reveal ${isRoot ? 'root' : ''} ${!active && zoomTier >= 2 ? 'dim' : ''} ${selectedNow ? 'selected' : ''}`} style={{ left: node.x, top: node.y, animationDelay: `${Math.min(index * 34, 180)}ms` } as CSSProperties} data-network-interactive="true" onClick={() => isRoot ? setSelectedId(null) : pickNode(node)}>
                <span className="avatar" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="2.7" fill="currentColor" /><path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
                <b>{isRoot ? (isYou ? 'YOU' : shortWallet(node.wallet)) : shortWallet(node.wallet)}</b>
                <small>{isRoot ? `${directCount(node.id)} Direct` : `${networkCount(node.id)} network`}</small>
              </button>;
            })}

            {clusterButtons.map((cluster, index) => <button key={`${viewRootId}-${cluster.nodeId}-cluster`} type="button" className="cluster reveal" style={{ left: cluster.x, top: cluster.y, animationDelay: `${Math.min(index * 35, 150)}ms` } as CSSProperties} data-network-interactive="true" onClick={() => expandCluster(cluster.nodeId)} aria-label={`${cluster.count} hidden members`}><span className="stack" aria-hidden="true"><i /><i /><i /></span><b>+{cluster.count}</b></button>)}
          </div>

          {selected ? <aside className="profileCard" data-network-interactive="true">
            <div className="profileHead"><span className="cardAvatar" aria-hidden="true">●</span><div><strong>{shortWallet(selected.wallet)}</strong><small>{statusLabel(selected.status)}</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button></div>
            <div className="metrics"><span><b>{networkCount(selected.id)}</b>Network Members</span><span><b>{directCount(selected.id)}</b>Direct Invites</span><span><b>{qualifiedCount(selected.id)}</b>Qualified</span></div>
            {networkCount(selected.id) > 0 ? <button type="button" className="focusButton" onClick={() => enterNetwork(selected.id)}>이 네트워크 보기</button> : <div className="emptyNetwork">하위 네트워크 없음</div>}
          </aside> : null}

          <div className="controls" data-network-interactive="true"><button type="button" aria-label="YOU로 돌아가기" onClick={returnToYou}>◎</button><button type="button" aria-label="확대" onClick={() => { const rect = stageRef.current?.getBoundingClientRect(); if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale + 0.16); }}>+</button><button type="button" aria-label="축소" onClick={() => { const rect = stageRef.current?.getBoundingClientRect(); if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale - 0.16); }}>−</button></div>
        </div>
      </section>

      <section className="tips" data-network-interactive="true"><span><b>드래그</b> 이동</span><span><b>휠·핀치</b> 확대/축소</span><span><b>프로필 클릭</b> 정보 보기</span><span><b>Network 보기</b> 임시 중심 변경</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem;line-height:1.35}.notice small{text-align:right;max-width:250px}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{height:62px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.045)}.topBar>div:first-child{display:grid;gap:2px;min-width:0}.topBar>div:first-child span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.topBar h1{margin:0;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.91rem;color:#f5f1e8}.totals{display:flex;align-items:baseline;gap:4px;color:#6f6a62;font-size:.47rem;white-space:nowrap}.totals b{color:#d8d1c5;font-size:.66rem}.totals .muted{color:#857d72}.totals i{width:1px;height:9px;margin:0 3px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(560px,72svh,760px);overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.035),transparent 31%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.65),transparent 85%)}.hud{position:absolute;z-index:30;right:10px;top:10px;height:27px;padding:0 8px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px)}.hud span{color:#b7aa91;font-size:.49rem;font-weight:800}.hud small{color:#6b645a;font-size:.44rem}.breadcrumb{position:absolute;z-index:30;left:10px;top:10px;max-width:calc(100% - 145px);height:27px;padding:0 7px;display:flex;align-items:center;gap:3px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px);white-space:nowrap;direction:ltr;unicode-bidi:isolate}.breadcrumb span{display:flex;align-items:center;gap:3px}.breadcrumb i{font-style:normal;color:#4f4a43;font-size:.43rem}.breadcrumb b{color:#625c54}.breadcrumb button{max-width:88px;overflow:hidden;text-overflow:ellipsis;border:0;background:transparent;color:#83796a;font:inherit;font-size:.45rem;cursor:pointer}.breadcrumb span:last-child button{color:#c1aa72;font-weight:900}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform 520ms cubic-bezier(.2,.78,.2,1)}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke:rgba(211,202,186,.12);stroke-width:1;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:edgeIn .34s ease forwards}.edges line.related{stroke:rgba(226,181,68,.31)}.person,.branchSummary,.cluster{position:absolute;z-index:5;transform:translate(-50%,-50%);font:inherit;cursor:pointer}.person{width:86px;min-height:68px;padding:3px;border:0;background:transparent;color:#9e9587;display:flex;flex-direction:column;align-items:center;gap:4px;transition:opacity 210ms ease,filter 210ms ease}.person.dim{opacity:.28;filter:saturate(.42)}.person.root{color:#d5ae50}.person.selected .avatar{border-color:rgba(244,183,40,.62);box-shadow:0 0 0 4px rgba(244,183,40,.07),0 0 20px rgba(244,183,40,.14)}.avatar{width:31px;height:31px;display:grid;place-items:center;border:1px solid rgba(208,193,160,.18);border-radius:50%;background:#151410;color:#807768;box-shadow:0 6px 15px rgba(0,0,0,.24);transition:box-shadow 220ms ease,border-color 220ms ease}.root .avatar{width:38px;height:38px;border-color:rgba(244,183,40,.42);color:#d1aa4e;background:#17150f;box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 22px rgba(0,0,0,.28)}.person b{max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b4ab9e;font-size:.52rem;line-height:1.1}.root b{color:#d4ad50}.person small{color:#625c53;font-size:.42rem}.branchSummary{width:74px;height:74px;border:1px solid rgba(210,194,159,.12);border-radius:50%;background:radial-gradient(circle at 40% 30%,rgba(244,183,40,.07),transparent 55%),#12110e;color:#8c806e;display:grid;place-content:center;gap:1px;text-align:center;box-shadow:0 12px 28px rgba(0,0,0,.24);transition:border-color 220ms ease,box-shadow 220ms ease}.branchSummary.active{border-color:rgba(244,183,40,.34);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 12px 30px rgba(0,0,0,.26)}.branchSummary span{color:#c3a04e;font-size:.78rem;font-weight:900}.branchSummary small{color:#6c6459;font-size:.42rem}.cluster{width:64px;height:50px;padding:0;border:0;background:transparent;color:#b49753;display:flex;flex-direction:column;align-items:center;justify-content:center}.stack{height:22px;display:flex;align-items:center}.stack i{width:22px;height:22px;margin-left:-8px;border:1px solid rgba(204,188,151,.14);border-radius:50%;background:#151410}.stack i:first-child{margin-left:0}.cluster b{margin-top:-1px;font-size:.54rem}.reveal{animation:reveal .42s cubic-bezier(.18,.82,.24,1) both}.profileCard{position:absolute;z-index:50;left:10px;right:10px;bottom:10px;padding:11px;border:1px solid rgba(255,255,255,.075);border-radius:17px;background:rgba(16,16,14,.94);backdrop-filter:blur(18px);box-shadow:0 18px 60px rgba(0,0,0,.42);animation:cardIn .22s ease both}.profileHead{display:grid;grid-template-columns:32px 1fr 28px;align-items:center;gap:8px}.cardAvatar{width:30px;height:30px;border:1px solid rgba(244,183,40,.25);border-radius:50%;display:grid;place-items:center;color:#b4903d;font-size:.38rem;background:#17150f}.profileHead>div{display:grid;gap:2px}.profileHead strong{font-size:.62rem;color:#d7d0c3}.profileHead small{font-size:.45rem;color:#8a7d67}.profileHead>button{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#756e64;font-size:1rem;cursor:pointer}.metrics{margin:10px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.metrics span{min-width:0;padding:7px 6px;border-radius:10px;background:rgba(255,255,255,.025);color:#6f685f;font-size:.4rem;line-height:1.25}.metrics b{display:block;margin-bottom:2px;color:#c5bcae;font-size:.65rem}.focusButton{width:100%;height:34px;border:1px solid rgba(244,183,40,.16);border-radius:10px;background:rgba(244,183,40,.07);color:#d7af4f;font:inherit;font-size:.55rem;font-weight:900;cursor:pointer}.emptyNetwork{height:32px;display:grid;place-items:center;border:1px dashed rgba(255,255,255,.06);border-radius:10px;color:#675f55;font-size:.5rem}.controls{position:absolute;z-index:45;right:10px;bottom:10px;display:flex;flex-direction:column;gap:5px}.profileCard~.controls{bottom:164px}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:rgba(15,15,13,.9);color:#928775;font:inherit;font-size:.75rem;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2)}button:focus-visible{outline:2px solid rgba(244,183,40,.65);outline-offset:2px}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.tips span{padding:7px 5px;border:1px solid rgba(255,255,255,.04);border-radius:10px;background:rgba(255,255,255,.018);color:#625d55;font-size:.43rem;text-align:center}.tips b{display:block;margin-bottom:2px;color:#918673;font-size:.45rem}@keyframes reveal{from{opacity:0;transform:translate(-50%,-42%) scale(.82)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes edgeIn{to{stroke-dashoffset:0}}@media(min-width:700px){.qaPage{padding-top:18px}.profileCard{left:auto;right:12px;bottom:14px;width:224px}.profileCard~.controls{bottom:14px;right:248px}.stage{height:680px}}@media(max-width:470px){.notice{align-items:flex-start;flex-direction:column}.notice small{text-align:left;max-width:none}.tips{grid-template-columns:repeat(2,1fr)}.stage{height:calc(100svh - 218px);min-height:560px;max-height:720px}.totals span{display:none}.totals i{margin:0 1px}.topBar h1{max-width:190px}}@media(prefers-reduced-motion:reduce){.world.cameraMoving,.person,.branchSummary{transition:none!important}.reveal,.profileCard,.edges line{animation:none!important;stroke-dashoffset:0!important}}
      `}</style>
    </main>
  );
}
