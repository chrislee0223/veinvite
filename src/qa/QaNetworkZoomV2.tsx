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

type DemoStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type DemoNode = {
  id: string;
  wallet: string;
  parentId: string | null;
  depth: number;
  x: number;
  y: number;
  network: number;
  direct: number;
  qualified: number;
  status: DemoStatus;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const WORLD_W = 760;
const WORLD_H = 1180;
const CENTER_X = WORLD_W / 2;
const MIN_SCALE = 0.64;
const MAX_SCALE = 1.9;
const ROOT_SCALE = 0.74;

const DEMO_NODES: DemoNode[] = [
  { id: 'you', wallet: '0x0000000000000000000000000000000000000001', parentId: null, depth: 0, x: 380, y: 92, network: 63, direct: 4, qualified: 47, status: 'REWARDED' },
  { id: 'a', wallet: '0xA100000000000000000000000000000000000001', parentId: 'you', depth: 1, x: 110, y: 292, network: 19, direct: 4, qualified: 15, status: 'REWARDED' },
  { id: 'b', wallet: '0xB200000000000000000000000000000000000002', parentId: 'you', depth: 1, x: 290, y: 292, network: 17, direct: 3, qualified: 13, status: 'QUALIFIED' },
  { id: 'c', wallet: '0xC300000000000000000000000000000000000003', parentId: 'you', depth: 1, x: 470, y: 292, network: 15, direct: 4, qualified: 11, status: 'REWARDED' },
  { id: 'd', wallet: '0xD400000000000000000000000000000000000004', parentId: 'you', depth: 1, x: 650, y: 292, network: 12, direct: 3, qualified: 8, status: 'IN_PROGRESS' },

  { id: 'a1', wallet: '0xA110000000000000000000000000000000000011', parentId: 'a', depth: 2, x: 34, y: 525, network: 6, direct: 3, qualified: 5, status: 'QUALIFIED' },
  { id: 'a2', wallet: '0xA120000000000000000000000000000000000012', parentId: 'a', depth: 2, x: 92, y: 525, network: 5, direct: 2, qualified: 4, status: 'REWARDED' },
  { id: 'a3', wallet: '0xA130000000000000000000000000000000000013', parentId: 'a', depth: 2, x: 150, y: 525, network: 4, direct: 2, qualified: 3, status: 'IN_PROGRESS' },
  { id: 'a4', wallet: '0xA140000000000000000000000000000000000014', parentId: 'a', depth: 2, x: 208, y: 525, network: 3, direct: 1, qualified: 2, status: 'QUALIFIED' },

  { id: 'b1', wallet: '0xB210000000000000000000000000000000000021', parentId: 'b', depth: 2, x: 238, y: 525, network: 7, direct: 3, qualified: 5, status: 'REWARDED' },
  { id: 'b2', wallet: '0xB220000000000000000000000000000000000022', parentId: 'b', depth: 2, x: 290, y: 525, network: 5, direct: 2, qualified: 4, status: 'QUALIFIED' },
  { id: 'b3', wallet: '0xB230000000000000000000000000000000000023', parentId: 'b', depth: 2, x: 342, y: 525, network: 4, direct: 2, qualified: 3, status: 'IN_PROGRESS' },

  { id: 'c1', wallet: '0xC310000000000000000000000000000000000031', parentId: 'c', depth: 2, x: 392, y: 525, network: 5, direct: 2, qualified: 4, status: 'QUALIFIED' },
  { id: 'c2', wallet: '0xC320000000000000000000000000000000000032', parentId: 'c', depth: 2, x: 444, y: 525, network: 4, direct: 2, qualified: 3, status: 'IN_PROGRESS' },
  { id: 'c3', wallet: '0xC330000000000000000000000000000000000033', parentId: 'c', depth: 2, x: 496, y: 525, network: 3, direct: 1, qualified: 2, status: 'REWARDED' },
  { id: 'c4', wallet: '0xC340000000000000000000000000000000000034', parentId: 'c', depth: 2, x: 548, y: 525, network: 2, direct: 1, qualified: 1, status: 'QUALIFIED' },

  { id: 'd1', wallet: '0xD410000000000000000000000000000000000041', parentId: 'd', depth: 2, x: 600, y: 525, network: 5, direct: 2, qualified: 3, status: 'QUALIFIED' },
  { id: 'd2', wallet: '0xD420000000000000000000000000000000000042', parentId: 'd', depth: 2, x: 650, y: 525, network: 4, direct: 2, qualified: 3, status: 'IN_PROGRESS' },
  { id: 'd3', wallet: '0xD430000000000000000000000000000000000043', parentId: 'd', depth: 2, x: 700, y: 525, network: 2, direct: 1, qualified: 2, status: 'REWARDED' },

  { id: 'a11', wallet: '0xA111000000000000000000000000000000000111', parentId: 'a1', depth: 3, x: 10, y: 760, network: 2, direct: 1, qualified: 2, status: 'REWARDED' },
  { id: 'a12', wallet: '0xA112000000000000000000000000000000000112', parentId: 'a1', depth: 3, x: 46, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'a13', wallet: '0xA113000000000000000000000000000000000113', parentId: 'a1', depth: 3, x: 82, y: 760, network: 1, direct: 0, qualified: 0, status: 'IN_PROGRESS' },
  { id: 'a21', wallet: '0xA121000000000000000000000000000000000121', parentId: 'a2', depth: 3, x: 108, y: 760, network: 2, direct: 1, qualified: 2, status: 'QUALIFIED' },
  { id: 'a22', wallet: '0xA122000000000000000000000000000000000122', parentId: 'a2', depth: 3, x: 148, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },
  { id: 'a31', wallet: '0xA131000000000000000000000000000000000131', parentId: 'a3', depth: 3, x: 168, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'a32', wallet: '0xA132000000000000000000000000000000000132', parentId: 'a3', depth: 3, x: 204, y: 760, network: 1, direct: 0, qualified: 0, status: 'IN_PROGRESS' },

  { id: 'b11', wallet: '0xB211000000000000000000000000000000000211', parentId: 'b1', depth: 3, x: 216, y: 760, network: 2, direct: 1, qualified: 2, status: 'QUALIFIED' },
  { id: 'b12', wallet: '0xB212000000000000000000000000000000000212', parentId: 'b1', depth: 3, x: 252, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },
  { id: 'b13', wallet: '0xB213000000000000000000000000000000000213', parentId: 'b1', depth: 3, x: 288, y: 760, network: 1, direct: 0, qualified: 0, status: 'IN_PROGRESS' },
  { id: 'b21', wallet: '0xB221000000000000000000000000000000000221', parentId: 'b2', depth: 3, x: 306, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'b22', wallet: '0xB222000000000000000000000000000000000222', parentId: 'b2', depth: 3, x: 338, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },

  { id: 'c11', wallet: '0xC311000000000000000000000000000000000311', parentId: 'c1', depth: 3, x: 376, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'c12', wallet: '0xC312000000000000000000000000000000000312', parentId: 'c1', depth: 3, x: 408, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },
  { id: 'c21', wallet: '0xC321000000000000000000000000000000000321', parentId: 'c2', depth: 3, x: 430, y: 760, network: 1, direct: 0, qualified: 0, status: 'IN_PROGRESS' },
  { id: 'c22', wallet: '0xC322000000000000000000000000000000000322', parentId: 'c2', depth: 3, x: 462, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'c31', wallet: '0xC331000000000000000000000000000000000331', parentId: 'c3', depth: 3, x: 502, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },

  { id: 'd11', wallet: '0xD411000000000000000000000000000000000411', parentId: 'd1', depth: 3, x: 584, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'd12', wallet: '0xD412000000000000000000000000000000000412', parentId: 'd1', depth: 3, x: 616, y: 760, network: 1, direct: 0, qualified: 0, status: 'IN_PROGRESS' },
  { id: 'd21', wallet: '0xD421000000000000000000000000000000000421', parentId: 'd2', depth: 3, x: 640, y: 760, network: 1, direct: 0, qualified: 1, status: 'QUALIFIED' },
  { id: 'd22', wallet: '0xD422000000000000000000000000000000000422', parentId: 'd2', depth: 3, x: 672, y: 760, network: 1, direct: 0, qualified: 1, status: 'REWARDED' },
];

const TOP_BRANCHES = ['a', 'b', 'c', 'd'];
const NODE_BY_ID = new Map(DEMO_NODES.map((node) => [node.id, node]));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`;
}

function childrenOf(id: string) {
  return DEMO_NODES.filter((node) => node.parentId === id);
}

function pathTo(id: string) {
  const path: DemoNode[] = [];
  let current = NODE_BY_ID.get(id) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? NODE_BY_ID.get(current.parentId) ?? null : null;
  }
  return path;
}

function branchOf(id: string) {
  const path = pathTo(id);
  return path.find((node) => node.depth === 1)?.id ?? null;
}

function statusLabel(status: DemoStatus) {
  if (status === 'REWARDED') return 'Rewarded';
  if (status === 'QUALIFIED') return 'Qualified';
  return 'In Progress';
}

function zoomLabel(scale: number) {
  if (scale < 0.82) return '전체 구조';
  if (scale < 1.1) return '사람 보기';
  if (scale < 1.45) return '가지 보기';
  return '상세 세대';
}

export function QaNetworkZoomV2() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const previousPointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);
  const cameraTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<View>({ x: 0, y: 18, scale: ROOT_SCALE });
  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState('you');
  const [cameraMoving, setCameraMoving] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({
      width: stage.clientWidth || 390,
      height: stage.clientHeight || 650,
    });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
  }, []);

  const zoomLevel = view.scale < 0.82 ? 0 : view.scale < 1.1 ? 1 : view.scale < 1.45 ? 2 : 3;

  const activeBranch = useMemo(() => {
    const centerWorldX = CENTER_X - view.x / view.scale;
    let best = TOP_BRANCHES[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of TOP_BRANCHES) {
      const node = NODE_BY_ID.get(id)!;
      const distance = Math.abs(node.x - centerWorldX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }, [view.x, view.scale]);

  const detailFocus = useMemo(() => {
    const focused = NODE_BY_ID.get(focusedId);
    if (focused && focused.depth >= 2 && branchOf(focused.id) === activeBranch) return focused.id;
    const selected = selectedId ? NODE_BY_ID.get(selectedId) : null;
    if (selected && selected.depth >= 2 && branchOf(selected.id) === activeBranch) return selected.id;
    return childrenOf(activeBranch)[0]?.id ?? activeBranch;
  }, [focusedId, selectedId, activeBranch]);

  const visibleIds = useMemo(() => {
    const ids = new Set<string>(['you', ...TOP_BRANCHES]);
    if (zoomLevel >= 2) {
      for (const child of childrenOf(activeBranch)) ids.add(child.id);
    }
    if (zoomLevel >= 3) {
      for (const child of childrenOf(detailFocus)) ids.add(child.id);
    }
    return ids;
  }, [zoomLevel, activeBranch, detailFocus]);

  const visibleNodes = useMemo(
    () => DEMO_NODES.filter((node) => visibleIds.has(node.id)),
    [visibleIds],
  );

  const selected = selectedId ? NODE_BY_ID.get(selectedId) ?? null : null;
  const focusPath = useMemo(() => pathTo(focusedId), [focusedId]);

  const startCamera = useCallback((nextView: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(nextView);
    cameraTimerRef.current = window.setTimeout(() => {
      setCameraMoving(false);
      cameraTimerRef.current = null;
    }, 540);
  }, []);

  const focusNode = useCallback((id: string) => {
    const node = NODE_BY_ID.get(id);
    if (!node) return;
    setFocusedId(id);
    setSelectedId(id === 'you' ? null : id);
    const nextScale = node.depth === 0 ? ROOT_SCALE : node.depth === 1 ? 1.18 : node.depth === 2 ? 1.52 : 1.72;
    startCamera({
      scale: nextScale,
      x: -(node.x - CENTER_X) * nextScale,
      y: stageSize.height * 0.31 - node.y * nextScale,
    });
  }, [stageSize.height, startCamera]);

  const returnToYou = useCallback(() => {
    setSelectedId(null);
    setFocusedId('you');
    startCamera({ x: 0, y: 18, scale: ROOT_SCALE });
  }, [startCamera]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    setCameraMoving(false);
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return {
        scale,
        x: px - worldX * scale,
        y: py - worldY * scale,
      };
    });
  }, []);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.11 : 0.9;
    zoomAroundPoint(event.clientX, event.clientY, view.scale * factor);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    suppressClickRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }

    if (pointersRef.current.size === 1) {
      previousPointerRef.current = point;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = {
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
      previousPointerRef.current = null;
      suppressClickRef.current = true;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setCameraMoving(false);

    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = previousPointerRef.current;
      if (previous) {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        dragDistanceRef.current += Math.hypot(dx, dy);
        if (dragDistanceRef.current > 5) suppressClickRef.current = true;
        setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
      }
      previousPointerRef.current = current;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previous = pinchRef.current;
      if (previous && previous.distance > 0) {
        const nextScale = view.scale * (distance / previous.distance);
        zoomAroundPoint(center.x, center.y, nextScale);
      }
      pinchRef.current = { center, distance };
      suppressClickRef.current = true;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      previousPointerRef.current = Array.from(pointersRef.current.values())[0];
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      previousPointerRef.current = null;
      pinchRef.current = null;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  const clusterButtons = useMemo(() => {
    const clusters: Array<{ id: string; parentId: string; x: number; y: number; count: number }> = [];
    if (zoomLevel === 1) {
      for (const id of TOP_BRANCHES) {
        const node = NODE_BY_ID.get(id)!;
        clusters.push({ id: `cluster-${id}`, parentId: id, x: node.x, y: node.y + 112, count: Math.max(0, node.network - 1) });
      }
    } else if (zoomLevel === 2) {
      for (const id of TOP_BRANCHES) {
        if (id === activeBranch) continue;
        const node = NODE_BY_ID.get(id)!;
        clusters.push({ id: `cluster-${id}`, parentId: id, x: node.x, y: node.y + 112, count: Math.max(0, node.network - 1) });
      }
      for (const child of childrenOf(activeBranch)) {
        if (child.direct > 0) clusters.push({ id: `cluster-${child.id}`, parentId: child.id, x: child.x, y: child.y + 102, count: child.network });
      }
    } else if (zoomLevel >= 3) {
      for (const child of childrenOf(activeBranch)) {
        if (child.id !== detailFocus && child.direct > 0) clusters.push({ id: `cluster-${child.id}`, parentId: child.id, x: child.x, y: child.y + 102, count: child.network });
      }
    }
    return clusters;
  }, [zoomLevel, activeBranch, detailFocus]);

  return (
    <main className="qaPage">
      <section className="notice" data-network-interactive="true">
        <div>
          <strong>ZOOM NETWORK · QA V2</strong>
          <span>샘플 데이터 · Production과 완전히 분리</span>
        </div>
        <small>확대할수록 보고 있는 가지의 다음 세대가 나타납니다.</small>
      </section>

      <section className="networkShell">
        <header className="topBar" data-network-interactive="true">
          <div>
            <span>NETWORK</span>
            <h1>My Network</h1>
          </div>
          <div className="totals">
            <b>63</b><span>Members</span><i /><b className="growth">+11</b><span>This Round</span>
          </div>
        </header>

        <div
          ref={stageRef}
          className="stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
            if (suppressClickRef.current || dragDistanceRef.current > 5) return;
            setSelectedId(null);
          }}
        >
          <div className="ambient" aria-hidden="true" />

          <div className="hud" data-network-interactive="true">
            <span>{zoomLabel(view.scale)}</span>
            <small>{Math.round(view.scale * 100)}%</small>
          </div>

          {focusPath.length > 1 ? (
            <div className="breadcrumb" data-network-interactive="true">
              <button type="button" onClick={returnToYou}>YOU</button>
              {focusPath.slice(1).map((node, index) => (
                <span key={node.id}><i>›</i>{index === focusPath.length - 2 ? <b>{shortWallet(node.wallet)}</b> : shortWallet(node.wallet)}</span>
              ))}
            </div>
          ) : null}

          <div
            className={`world ${cameraMoving ? 'cameraMoving' : ''}`}
            style={{
              width: WORLD_W,
              height: WORLD_H,
              marginLeft: -WORLD_W / 2,
              transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
            }}
          >
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              {visibleNodes.filter((node) => node.parentId && visibleIds.has(node.parentId)).map((node) => {
                const parent = NODE_BY_ID.get(node.parentId!)!;
                const related = node.id === activeBranch || branchOf(node.id) === activeBranch;
                return (
                  <line
                    key={`${parent.id}-${node.id}`}
                    className={related ? 'related' : ''}
                    x1={parent.x}
                    y1={parent.y + 22}
                    x2={node.x}
                    y2={node.y - 22}
                  />
                );
              })}
            </svg>

            {zoomLevel === 0 ? TOP_BRANCHES.map((id) => {
              const node = NODE_BY_ID.get(id)!;
              return (
                <button
                  key={`summary-${id}`}
                  type="button"
                  className={`branchSummary reveal ${activeBranch === id ? 'active' : ''}`}
                  style={{ left: node.x, top: node.y } as CSSProperties}
                  data-network-interactive="true"
                  onClick={() => focusNode(id)}
                >
                  <span>{node.network}</span>
                  <small>members</small>
                </button>
              );
            }) : null}

            {visibleNodes.map((node) => {
              if (zoomLevel === 0 && node.depth === 1) return null;
              const isRoot = node.id === 'you';
              const dim = node.depth > 0 && branchOf(node.id) !== activeBranch && zoomLevel >= 2;
              const isSelected = selectedId === node.id;
              const isFocused = focusedId === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`person reveal ${isRoot ? 'root' : ''} ${dim ? 'dim' : ''} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                  style={{ left: node.x, top: node.y } as CSSProperties}
                  data-network-interactive="true"
                  onClick={() => {
                    if (node.id === 'you') returnToYou();
                    else setSelectedId(node.id);
                  }}
                  onDoubleClick={() => {
                    if (node.id !== 'you') focusNode(node.id);
                  }}
                >
                  <span className="avatar" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="6" r="2.7" fill="currentColor" />
                      <path d="M5 15.4c1.1-2.2 2.8-3.3 5-3.3s3.9 1.1 5 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <b>{isRoot ? 'YOU' : shortWallet(node.wallet)}</b>
                  <small>{isRoot ? `${node.direct} Direct` : `${node.network} network`}</small>
                </button>
              );
            })}

            {clusterButtons.map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                className="cluster reveal"
                style={{ left: cluster.x, top: cluster.y } as CSSProperties}
                data-network-interactive="true"
                onClick={() => focusNode(cluster.parentId)}
              >
                <span className="stack" aria-hidden="true"><i /><i /><i /></span>
                <b>+{cluster.count}</b>
              </button>
            ))}
          </div>

          {selected ? (
            <aside className="profileCard" data-network-interactive="true">
              <div className="profileHead">
                <span className="cardAvatar" aria-hidden="true">●</span>
                <div><strong>{shortWallet(selected.wallet)}</strong><small>{statusLabel(selected.status)}</small></div>
                <button type="button" aria-label="닫기" onClick={() => setSelectedId(null)}>×</button>
              </div>
              <div className="metrics">
                <span><b>{selected.network}</b>Network Members</span>
                <span><b>{selected.direct}</b>Direct Invites</span>
                <span><b>{selected.qualified}</b>Qualified</span>
              </div>
              <button type="button" className="focusButton" onClick={() => focusNode(selected.id)}>이 네트워크 보기</button>
            </aside>
          ) : null}

          <div className="controls" data-network-interactive="true">
            <button type="button" aria-label="YOU로 돌아가기" onClick={returnToYou}>◎</button>
            <button type="button" aria-label="확대" onClick={() => {
              const rect = stageRef.current?.getBoundingClientRect();
              if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale + 0.16);
            }}>+</button>
            <button type="button" aria-label="축소" onClick={() => {
              const rect = stageRef.current?.getBoundingClientRect();
              if (rect) zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale - 0.16);
            }}>−</button>
          </div>
        </div>
      </section>

      <section className="tips" data-network-interactive="true">
        <span><b>드래그</b> 이동</span>
        <span><b>휠·핀치</b> 확대/축소</span>
        <span><b>프로필 클릭</b> 정보 보기</span>
        <span><b>Focus</b> 다음 세대 보기</span>
      </section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem;line-height:1.35}.notice small{text-align:right;max-width:210px}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{height:62px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.045)}.topBar>div:first-child{display:grid;gap:2px}.topBar>div:first-child span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.topBar h1{margin:0;font-size:.91rem;color:#f5f1e8}.totals{display:flex;align-items:baseline;gap:4px;color:#6f6a62;font-size:.47rem;white-space:nowrap}.totals b{color:#d8d1c5;font-size:.66rem}.totals .growth{color:#e4b33e}.totals i{width:1px;height:9px;margin:0 3px;background:rgba(255,255,255,.08)}.stage{position:relative;height:clamp(560px,72svh,760px);overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.035),transparent 31%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.65),transparent 85%)}.hud{position:absolute;z-index:30;right:10px;top:10px;height:27px;padding:0 8px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px)}.hud span{color:#b7aa91;font-size:.49rem;font-weight:800}.hud small{color:#6b645a;font-size:.44rem}.breadcrumb{position:absolute;z-index:30;left:10px;top:10px;max-width:calc(100% - 145px);height:27px;padding:0 7px;display:flex;align-items:center;gap:4px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:rgba(14,14,12,.86);backdrop-filter:blur(10px);white-space:nowrap}.breadcrumb button{border:0;background:transparent;color:#d4ad4e;font:inherit;font-size:.47rem;font-weight:900;cursor:pointer}.breadcrumb span{display:flex;align-items:center;gap:4px;color:#746d62;font-size:.43rem}.breadcrumb i{font-style:normal;color:#4f4a43}.breadcrumb b{max-width:86px;overflow:hidden;text-overflow:ellipsis;color:#a99c85}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform 520ms cubic-bezier(.2,.78,.2,1)}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke:rgba(211,202,186,.12);stroke-width:1;stroke-linecap:round;transition:stroke 250ms ease,opacity 250ms ease}.edges line.related{stroke:rgba(226,181,68,.31)}.person,.branchSummary,.cluster{position:absolute;z-index:5;transform:translate(-50%,-50%);font:inherit;cursor:pointer}.person{width:86px;min-height:68px;padding:3px;border:0;background:transparent;color:#9e9587;display:flex;flex-direction:column;align-items:center;gap:4px;transition:opacity 210ms ease,filter 210ms ease}.person.dim{opacity:.3;filter:saturate(.45)}.person.root{color:#d5ae50}.person.selected .avatar,.person.focused .avatar{border-color:rgba(244,183,40,.62);box-shadow:0 0 0 4px rgba(244,183,40,.07),0 0 20px rgba(244,183,40,.14)}.avatar{width:31px;height:31px;display:grid;place-items:center;border:1px solid rgba(208,193,160,.18);border-radius:50%;background:#151410;color:#807768;box-shadow:0 6px 15px rgba(0,0,0,.24);transition:box-shadow 220ms ease,border-color 220ms ease}.root .avatar{width:38px;height:38px;border-color:rgba(244,183,40,.42);color:#d1aa4e;background:#17150f}.person b{max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b4ab9e;font-size:.52rem;line-height:1.1}.root b{color:#d4ad50}.person small{color:#625c53;font-size:.42rem}.branchSummary{width:74px;height:74px;border:1px solid rgba(210,194,159,.12);border-radius:50%;background:radial-gradient(circle at 40% 30%,rgba(244,183,40,.07),transparent 55%),#12110e;color:#8c806e;display:grid;place-content:center;gap:1px;text-align:center;box-shadow:0 12px 28px rgba(0,0,0,.24);transition:border-color 220ms ease,box-shadow 220ms ease,transform 220ms ease}.branchSummary.active{border-color:rgba(244,183,40,.34);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 12px 30px rgba(0,0,0,.26)}.branchSummary span{color:#c3a04e;font-size:.78rem;font-weight:900}.branchSummary small{color:#6c6459;font-size:.42rem}.cluster{width:64px;height:50px;padding:0;border:0;background:transparent;color:#b49753;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}.stack{height:22px;display:flex;align-items:center}.stack i{width:22px;height:22px;margin-left:-8px;border:1px solid rgba(204,188,151,.14);border-radius:50%;background:#151410}.stack i:first-child{margin-left:0}.cluster b{margin-top:-1px;font-size:.54rem}.reveal{animation:reveal .42s cubic-bezier(.18,.82,.24,1) both}.profileCard{position:absolute;z-index:50;left:10px;right:10px;bottom:10px;padding:11px;border:1px solid rgba(255,255,255,.075);border-radius:17px;background:rgba(16,16,14,.94);backdrop-filter:blur(18px);box-shadow:0 18px 60px rgba(0,0,0,.42);animation:cardIn .22s ease both}.profileHead{display:grid;grid-template-columns:32px 1fr 28px;align-items:center;gap:8px}.cardAvatar{width:30px;height:30px;border:1px solid rgba(244,183,40,.25);border-radius:50%;display:grid;place-items:center;color:#b4903d;font-size:.38rem;background:#17150f}.profileHead>div{display:grid;gap:2px}.profileHead strong{font-size:.62rem;color:#d7d0c3}.profileHead small{font-size:.45rem;color:#8a7d67}.profileHead>button{width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#756e64;font-size:1rem;cursor:pointer}.metrics{margin:10px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.metrics span{min-width:0;padding:7px 6px;border-radius:10px;background:rgba(255,255,255,.025);color:#6f685f;font-size:.4rem;line-height:1.25}.metrics b{display:block;margin-bottom:2px;color:#c5bcae;font-size:.65rem}.focusButton{width:100%;height:34px;border:1px solid rgba(244,183,40,.16);border-radius:10px;background:rgba(244,183,40,.07);color:#d7af4f;font:inherit;font-size:.55rem;font-weight:900;cursor:pointer}.controls{position:absolute;z-index:45;right:10px;bottom:10px;display:flex;flex-direction:column;gap:5px}.profileCard~.controls{bottom:164px}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:rgba(15,15,13,.9);color:#928775;font:inherit;font-size:.75rem;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2)}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.tips span{padding:7px 5px;border:1px solid rgba(255,255,255,.04);border-radius:10px;background:rgba(255,255,255,.018);color:#625d55;font-size:.43rem;text-align:center}.tips b{display:block;margin-bottom:2px;color:#918673;font-size:.45rem}@keyframes reveal{from{opacity:0;transform:translate(-50%,-42%) scale(.82)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(min-width:700px){.qaPage{padding-top:18px}.profileCard{left:auto;right:12px;bottom:14px;width:224px}.profileCard~.controls{bottom:14px;right:248px}.stage{height:680px}.notice small{max-width:250px}}@media(max-width:470px){.notice{align-items:flex-start;flex-direction:column}.notice small{text-align:left;max-width:none}.tips{grid-template-columns:repeat(2,1fr)}.stage{height:calc(100svh - 218px);min-height:560px;max-height:720px}.totals span{display:none}.totals i{margin:0 1px}}@media(prefers-reduced-motion:reduce){.world.cameraMoving,.person,.branchSummary,.edges line{transition:none!important}.reveal,.profileCard{animation:none!important}}
      `}</style>
    </main>
  );
}
