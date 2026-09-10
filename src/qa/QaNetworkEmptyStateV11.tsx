'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type PointerInfo = { point: Point; interactive: boolean };
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type RawNode = { id: string; wallet: string; parentWallet: string | null; status: Status; joinedAt: string; order: number };
type LayoutNode = RawNode & { depth: number; x: number; y: number; group: string | null; network: number; direct: number };
type HistoryEntry = { view: View; focusGroup: string | null };
type Graph = { nodes: RawNode[]; byWallet: Map<string, RawNode>; children: Map<string, RawNode[]>; guardedCount: number };
type ApiPayload = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  breadcrumb: string[];
  summary: { network: number; direct: number; qualified: number; depth: number };
  children: Array<{ wallet: string; status: Status; joinedAt: string; network: number; direct: number; qualified: number; depth: number }>;
  depthLimitReached: boolean;
};

const WORLD_W = 1320;
const WORLD_H = 1320;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.78;
const ROOT_VIEW: View = { x: 0, y: 44, scale: 0.84 };
const ROOT = { x: 660, y: 120 };
const ACTIVE = { x: 430, y: 286 };
const EMPTY = { x: 890, y: 286 };
const DETAIL_EXPAND_AT = 1.22;
const DETAIL_COLLAPSE_AT = 1.08;
const DEEP_EXPAND_AT = 1.48;
const DEEP_COLLAPSE_AT = 1.34;
const ULTRA_EXPAND_AT = 1.66;
const AUTH_WALLET = `0x${'1'.padStart(40, '0')}`;
const ACTIVE_WALLET = `0x${'2'.padStart(40, '0')}`;

function makeWallet(seed: number) {
  return `0x${seed.toString(16).padStart(40, '0')}`;
}

function statusFor(seed: number): Status {
  return seed % 5 === 0 ? 'IN_PROGRESS' : seed % 3 === 0 ? 'QUALIFIED' : 'REWARDED';
}

function makeBaseFixture(): RawNode[] {
  const nodes: RawNode[] = [
    { id: 'you', wallet: AUTH_WALLET, parentWallet: null, status: 'REWARDED', joinedAt: '2026-08-01T00:00:00Z', order: 0 },
    { id: 'a', wallet: ACTIVE_WALLET, parentWallet: AUTH_WALLET, status: 'REWARDED', joinedAt: '2026-08-02T00:00:00Z', order: 0 },
  ];
  let seed = 100;
  const branchCounts = [5, 3, 7, 2, 6, 4];
  const top: RawNode[] = [];

  for (let i = 0; i < branchCounts.length; i += 1) {
    const node: RawNode = {
      id: `a${i + 1}`,
      wallet: makeWallet(seed++),
      parentWallet: ACTIVE_WALLET,
      status: statusFor(seed),
      joinedAt: `2026-08-${String(4 + i).padStart(2, '0')}T00:00:00Z`,
      order: i,
    };
    nodes.push(node);
    top.push(node);
  }

  top.forEach((parent, branchIndex) => {
    const childCount = branchCounts[branchIndex];
    for (let j = 0; j < childCount; j += 1) {
      const child: RawNode = {
        id: `b${branchIndex + 1}${j + 1}`,
        wallet: makeWallet(seed++),
        parentWallet: parent.wallet,
        status: statusFor(seed),
        joinedAt: `2026-08-${String(12 + ((branchIndex + j) % 15)).padStart(2, '0')}T00:00:00Z`,
        order: j,
      };
      nodes.push(child);

      const grandCount = (branchIndex + j) % 3 === 0 ? 2 : (branchIndex + j) % 4 === 0 ? 1 : 0;
      for (let k = 0; k < grandCount; k += 1) {
        const grand: RawNode = {
          id: `c${branchIndex + 1}${j + 1}${k + 1}`,
          wallet: makeWallet(seed++),
          parentWallet: child.wallet,
          status: statusFor(seed),
          joinedAt: `2026-09-${String(1 + ((branchIndex + j + k) % 8)).padStart(2, '0')}T00:00:00Z`,
          order: k,
        };
        nodes.push(grand);

        if ((branchIndex + j + k) % 5 === 0) {
          nodes.push({
            id: `d${branchIndex + 1}${j + 1}${k + 1}`,
            wallet: makeWallet(seed++),
            parentWallet: grand.wallet,
            status: statusFor(seed),
            joinedAt: '2026-09-09T00:00:00Z',
            order: 0,
          });
        }
      }
    }
  });

  // Deliberately malformed rows: rehearsal verifies that unreachable/cyclic data cannot break the canvas.
  nodes.push({ id: 'bad-orphan', wallet: makeWallet(9001), parentWallet: makeWallet(9999), status: 'IN_PROGRESS', joinedAt: '2026-09-09T00:00:00Z', order: 0 });
  nodes.push({ id: 'bad-cycle-1', wallet: makeWallet(9002), parentWallet: makeWallet(9003), status: 'IN_PROGRESS', joinedAt: '2026-09-09T00:00:00Z', order: 0 });
  nodes.push({ id: 'bad-cycle-2', wallet: makeWallet(9003), parentWallet: makeWallet(9002), status: 'IN_PROGRESS', joinedAt: '2026-09-09T00:00:00Z', order: 0 });
  return nodes;
}

const BASE_FIXTURE = makeBaseFixture();
const FIRST_BRANCH_WALLET = BASE_FIXTURE.find((node) => node.id === 'a1')!.wallet;
const EXTRA_NODE: RawNode = {
  id: 'b1-extra',
  wallet: makeWallet(7777),
  parentWallet: FIRST_BRANCH_WALLET,
  status: 'IN_PROGRESS',
  joinedAt: '2026-09-10T05:30:00Z',
  order: 99,
};

function normalizeGraph(raw: RawNode[]): Graph {
  const unique = new Map<string, RawNode>();
  for (const node of raw) if (!unique.has(node.wallet)) unique.set(node.wallet, node);

  const rawChildren = new Map<string, RawNode[]>();
  for (const node of unique.values()) {
    if (!node.parentWallet) continue;
    const list = rawChildren.get(node.parentWallet) ?? [];
    list.push(node);
    rawChildren.set(node.parentWallet, list);
  }
  for (const list of rawChildren.values()) list.sort((a, b) => a.order - b.order || a.wallet.localeCompare(b.wallet));

  const accepted: RawNode[] = [];
  const visited = new Set<string>();
  const queue = [AUTH_WALLET];
  while (queue.length) {
    const wallet = queue.shift()!;
    if (visited.has(wallet)) continue;
    const node = unique.get(wallet);
    if (!node) continue;
    visited.add(wallet);
    accepted.push(node);
    for (const child of rawChildren.get(wallet) ?? []) {
      if (child.wallet !== wallet && !visited.has(child.wallet)) queue.push(child.wallet);
    }
  }

  const children = new Map<string, RawNode[]>();
  for (const node of accepted) {
    if (!node.parentWallet || !visited.has(node.parentWallet)) continue;
    const list = children.get(node.parentWallet) ?? [];
    list.push(node);
    children.set(node.parentWallet, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.wallet.localeCompare(b.wallet));

  return { nodes: accepted, byWallet: new Map(accepted.map((node) => [node.wallet, node])), children, guardedCount: raw.length - accepted.length };
}

function countDescendants(graph: Graph, wallet: string): number {
  let total = 0;
  const queue = [...(graph.children.get(wallet) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node.wallet)) continue;
    seen.add(node.wallet);
    total += 1;
    queue.push(...(graph.children.get(node.wallet) ?? []));
  }
  return total;
}

function countQualified(graph: Graph, wallet: string): number {
  let total = 0;
  const queue = [...(graph.children.get(wallet) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node.wallet)) continue;
    seen.add(node.wallet);
    if (node.status !== 'IN_PROGRESS') total += 1;
    queue.push(...(graph.children.get(node.wallet) ?? []));
  }
  return total;
}

function breadcrumbFor(graph: Graph, wallet: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = graph.byWallet.get(wallet) ?? null;
  while (current && !seen.has(current.wallet)) {
    seen.add(current.wallet);
    path.unshift(current.wallet);
    current = current.parentWallet ? graph.byWallet.get(current.parentWallet) ?? null : null;
  }
  return path;
}

function apiPayload(graph: Graph, focusWallet: string): ApiPayload {
  const focus = graph.byWallet.get(focusWallet) ?? graph.byWallet.get(AUTH_WALLET)!;
  const crumbs = breadcrumbFor(graph, focus.wallet);
  const directChildren = graph.children.get(focus.wallet) ?? [];
  return {
    rootWallet: AUTH_WALLET,
    focusWallet: focus.wallet,
    focusDepth: Math.max(0, crumbs.length - 1),
    breadcrumb: crumbs,
    summary: {
      network: countDescendants(graph, focus.wallet),
      direct: directChildren.length,
      qualified: countQualified(graph, focus.wallet),
      depth: Math.max(0, crumbs.length - 1),
    },
    children: directChildren.map((child) => ({
      wallet: child.wallet,
      status: child.status,
      joinedAt: child.joinedAt,
      network: countDescendants(graph, child.wallet),
      direct: (graph.children.get(child.wallet) ?? []).length,
      qualified: countQualified(graph, child.wallet),
      depth: crumbs.length,
    })),
    depthLimitReached: directChildren.some((child) => (graph.children.get(child.wallet)?.length ?? 0) > 0),
  };
}

function stableOffset(index: number) {
  if (index === 0) return 0;
  const step = Math.ceil(index / 2);
  return index % 2 === 1 ? -step : step;
}

function buildLayout(graph: Graph): LayoutNode[] {
  const result = new Map<string, LayoutNode>();
  const root = graph.byWallet.get(AUTH_WALLET)!;
  result.set(root.wallet, { ...root, depth: 0, x: ROOT.x, y: ROOT.y, group: null, network: countDescendants(graph, root.wallet), direct: (graph.children.get(root.wallet) ?? []).length });

  const active = graph.byWallet.get(ACTIVE_WALLET);
  if (!active) return [...result.values()];
  result.set(active.wallet, { ...active, depth: 1, x: ACTIVE.x, y: ACTIVE.y, group: 'active', network: countDescendants(graph, active.wallet), direct: (graph.children.get(active.wallet) ?? []).length });

  const top = graph.children.get(active.wallet) ?? [];
  top.forEach((node, index) => {
    result.set(node.wallet, { ...node, depth: 2, x: 110 + index * 175, y: 470, group: node.wallet, network: countDescendants(graph, node.wallet), direct: (graph.children.get(node.wallet) ?? []).length });
  });

  const queue = top.map((node) => node.wallet);
  while (queue.length) {
    const parentWallet = queue.shift()!;
    const parent = result.get(parentWallet);
    if (!parent) continue;
    const children = graph.children.get(parentWallet) ?? [];
    children.forEach((node, index) => {
      const depth = parent.depth + 1;
      const gap = depth === 3 ? 38 : depth === 4 ? 26 : 18;
      const y = depth === 3 ? 690 : depth === 4 ? 900 : 1090;
      result.set(node.wallet, {
        ...node,
        depth,
        x: parent.x + stableOffset(index) * gap,
        y,
        group: parent.group,
        network: countDescendants(graph, node.wallet),
        direct: (graph.children.get(node.wallet) ?? []).length,
      });
      queue.push(node.wallet);
    });
  }
  return [...result.values()];
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function smoothStep(start: number, end: number, value: number) {
  const x = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return x * x * (3 - 2 * x);
}
function continuationPath(node: LayoutNode, length = 58) {
  const startY = node.y + (node.depth <= 1 ? 42 : 38);
  const endY = startY + length;
  return `M${node.x} ${startY} C${node.x} ${startY + 14} ${node.x} ${endY - 11} ${node.x} ${endY}`;
}
function childEdge(parent: LayoutNode, child: LayoutNode) {
  const parentGap = parent.depth === 0 ? 43 : 39;
  const childGap = child.depth <= 2 ? 40 : 36;
  const sy = parent.y + parentGap;
  const ey = child.y - childGap;
  const mid = sy + (ey - sy) * 0.43;
  return `M${parent.x} ${sy} C${parent.x} ${mid} ${child.x} ${mid} ${child.x} ${ey}`;
}
function shortWallet(wallet: string) { return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`; }

export function QaNetworkEmptyStateV11() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>(ROOT_VIEW);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [simulatedAppend, setSimulatedAppend] = useState(false);

  const graph = useMemo(() => normalizeGraph(simulatedAppend ? [...BASE_FIXTURE, EXTRA_NODE] : BASE_FIXTURE), [simulatedAppend]);
  const layout = useMemo(() => buildLayout(graph), [graph]);
  const byWallet = useMemo(() => new Map(layout.map((node) => [node.wallet, node])), [layout]);
  const rootPayload = useMemo(() => apiPayload(graph, AUTH_WALLET), [graph]);
  const activePayload = useMemo(() => apiPayload(graph, ACTIVE_WALLET), [graph]);
  const selected = selectedWallet ? byWallet.get(selectedWallet) ?? null : null;
  const selectedPayload = selected ? apiPayload(graph, selected.wallet) : null;
  const detailProgress = smoothStep(1.08, 1.34, view.scale);
  const detailsExpanded = view.scale >= DETAIL_EXPAND_AT;
  const deepExpanded = Boolean(focusGroup) && view.scale >= DEEP_EXPAND_AT;
  const ultraExpanded = Boolean(focusGroup) && view.scale >= ULTRA_EXPAND_AT;

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
    const timer = window.setTimeout(() => setShowHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => { if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current); }, []);

  const stopCameraAnimation = useCallback(() => {
    if (cameraTimerRef.current) { window.clearTimeout(cameraTimerRef.current); cameraTimerRef.current = null; }
    setCameraMoving(false);
  }, []);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(250, WORLD_W * scale * 0.64);
    const minY = Math.min(-260, stageSize.height * 0.48 - WORLD_H * scale);
    const maxY = Math.max(230, stageSize.height * 0.42);
    return { scale, x: clamp(next.x, -horizontalReach, horizontalReach), y: clamp(next.y, minY, maxY) };
  }, [stageSize.height]);

  const animateTo = useCallback((next: View) => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    setCameraMoving(true);
    setView(clampView(next));
    cameraTimerRef.current = window.setTimeout(() => { cameraTimerRef.current = null; setCameraMoving(false); }, 470);
  }, [clampView]);

  const focusWorldPoint = useCallback((point: Point, scale: number, anchorY = stageSize.height * 0.40) => {
    animateTo({ x: -(point.x - WORLD_W / 2) * scale, y: anchorY - point.y * scale, scale });
  }, [animateTo, stageSize.height]);

  const returnToYou = useCallback(() => {
    setHistory([]); setSelectedWallet(null); setFocusGroup(null); animateTo(ROOT_VIEW);
  }, [animateTo]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setFocusGroup(previous.focusGroup);
      animateTo(previous.view);
      return current.slice(0, -1);
    });
    setSelectedWallet(null);
  }, [animateTo]);

  const focusSelectedBranch = useCallback((node: LayoutNode) => {
    const group = node.depth === 2 ? node.wallet : node.group;
    if (!group || group === 'active') return;
    const branchRoot = byWallet.get(group);
    if (!branchRoot) return;
    setHistory((current) => [...current.slice(-4), { view, focusGroup }]);
    setFocusGroup(group);
    setSelectedWallet(null);
    setShowHint(false);
    focusWorldPoint({ x: branchRoot.x, y: 610 }, Math.max(1.42, view.scale), stageSize.height * 0.40);
  }, [byWallet, focusGroup, focusWorldPoint, stageSize.height, view]);

  const zoomAroundPoint = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShowHint(false); stopCameraAnimation();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    setView((current) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return clampView({ scale, x: px - worldX * scale, y: py - worldY * scale });
    });
  }, [clampView, stopCameraAnimation]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = clamp(Math.exp(-event.deltaY * .0018), .94, 1.06);
    zoomAroundPoint(event.clientX, event.clientY, view.scale * factor);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interactive = Boolean((event.target as HTMLElement).closest('[data-network-control="true"]'));
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { point, interactive });
    setShowHint(false); stopCameraAnimation();
    if (!interactive) { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* browser fallback */ } }
    if (pointersRef.current.size === 1) previousPointRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      previousPointRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const existing = pointersRef.current.get(event.pointerId);
    if (!existing) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { ...existing, point });
    if (pointersRef.current.size === 1) {
      if (existing.interactive) return;
      const previous = previousPointRef.current;
      if (!previous) { previousPointRef.current = point; return; }
      setView((current) => clampView({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }));
      previousPointRef.current = point;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((value) => value.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistanceRef.current) zoomAroundPoint((a.x + b.x) / 2, (a.y + b.y) / 2, view.scale * (distance / pinchDistanceRef.current));
      pinchDistanceRef.current = distance;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* browser fallback */ }
    if (pointersRef.current.size === 1) {
      previousPointRef.current = [...pointersRef.current.values()][0].point;
      pinchDistanceRef.current = null;
    } else if (pointersRef.current.size === 0) {
      previousPointRef.current = null;
      pinchDistanceRef.current = null;
    }
  };

  const isVisible = useCallback((node: LayoutNode) => {
    if (node.depth <= 2) return true;
    if (node.depth === 3) return detailsExpanded;
    if (!focusGroup || node.group !== focusGroup) return false;
    if (node.depth === 4) return deepExpanded;
    return ultraExpanded;
  }, [deepExpanded, detailsExpanded, focusGroup, ultraExpanded]);

  const visibleNodes = layout.filter(isVisible);
  const visibleWallets = new Set(visibleNodes.map((node) => node.wallet));
  const edges = visibleNodes.flatMap((child) => {
    if (!child.parentWallet) return [];
    const parent = byWallet.get(child.parentWallet);
    return parent && visibleWallets.has(parent.wallet) ? [{ parent, child }] : [];
  });
  const continuationNodes = visibleNodes.filter((node) => {
    const children = graph.children.get(node.wallet) ?? [];
    return children.some((child) => !visibleWallets.has(child.wallet));
  });

  const rootStem = `M${ROOT.x} ${ROOT.y + 43} C${ROOT.x} ${ROOT.y + 56} ${ROOT.x} ${ROOT.y + 66} ${ROOT.x} ${ROOT.y + 76}`;
  const activeBranch = `M${ROOT.x} ${ROOT.y + 76} C${ROOT.x - 42} ${ROOT.y + 82} ${ACTIVE.x + 62} ${ACTIVE.y - 54} ${ACTIVE.x} ${ACTIVE.y - 39}`;
  const emptyBranch = `M${ROOT.x} ${ROOT.y + 76} C${ROOT.x + 42} ${ROOT.y + 82} ${EMPTY.x - 62} ${EMPTY.y - 54} ${EMPTY.x} ${EMPTY.y - 39}`;
  const emptyFlowPath = `${rootStem} C${ROOT.x + 42} ${ROOT.y + 82} ${EMPTY.x - 62} ${EMPTY.y - 54} ${EMPTY.x} ${EMPTY.y - 39}`;
  const selectedBranchName = focusGroup ? shortWallet(focusGroup) : null;

  return (
    <main className="qaPage">
      <section className="notice">
        <div><strong>NETWORK DATA REHEARSAL · QA V11</strong><span>v10 누적 · API-shaped fixture · stable auto-layout</span></div>
        <div className="qaActions"><small>{graph.nodes.length} valid · {graph.guardedCount} guarded</small><button type="button" onClick={() => setSimulatedAppend((value) => !value)}>{simulatedAppend ? '−1 reset' : '+1 simulate'}</button></div>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock"><span>NETWORK</span><h1>My Network</h1></div>
          <div className="totals"><span className="metric"><b>{rootPayload.summary.network}</b><em>Members</em></span><i /><span className="metric"><b>1</b><em>Open slot</em></span></div>
        </header>

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{selectedBranchName ? `YOU › ${selectedBranchName}` : detailsExpanded ? '상세 보기' : '전체 구조'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>선이 이어진 곳은 아직 보이지 않은 하위 세대가 있습니다.<br />확대하면 필요한 가지부터 단계적으로 나타납니다.</span></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <filter id="maskBlurV11" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="25" /></filter>
                <filter id="lineGlowV11" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <linearGradient id="continuationFadeV11" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(211,198,165,.31)" /><stop offset="55%" stopColor="rgba(211,198,165,.18)" /><stop offset="100%" stopColor="rgba(211,198,165,0)" /></linearGradient>
                <mask id="movingLightMaskV11" maskUnits="userSpaceOnUse" x="560" y="118" width="390" height="190"><rect x="560" y="118" width="390" height="190" fill="black" /><circle r="44" fill="white" filter="url(#maskBlurV11)"><animateMotion dur="5.3s" repeatCount="indefinite" path={emptyFlowPath} keyPoints="0;0;1;1" keyTimes="0;0.09;0.65;1" calcMode="linear" /></circle></mask>
              </defs>

              <path d={rootStem} className="mainEdge stemEdge" vectorEffect="non-scaling-stroke" />
              <path d={activeBranch} className="mainEdge activeEdge" vectorEffect="non-scaling-stroke" />
              <path d={emptyBranch} className="mainEdge emptyEdge" vectorEffect="non-scaling-stroke" />
              <g className="flowIllumination" mask="url(#movingLightMaskV11)"><path d={emptyFlowPath} className="litGlow" vectorEffect="non-scaling-stroke" /><path d={emptyFlowPath} className="litCore" vectorEffect="non-scaling-stroke" /></g>

              {edges.filter(({ child }) => child.wallet !== ACTIVE_WALLET).map(({ parent, child }, index) => {
                const dim = focusGroup && child.group && child.group !== focusGroup ? .22 : 1;
                const depthOpacity = child.depth === 2 ? .34 : child.depth === 3 ? .27 : .22;
                return <path key={`${parent.wallet}-${child.wallet}`} d={childEdge(parent, child)} className="treeEdge" style={{ opacity: depthOpacity * dim * (child.depth === 3 ? .62 + detailProgress * .38 : 1), transitionDelay: `${Math.min(220, index * 7)}ms` }} vectorEffect="non-scaling-stroke" />;
              })}

              {continuationNodes.map((node) => {
                const dim = focusGroup && node.group && node.group !== focusGroup ? .18 : .82;
                return <path key={`tail-${node.wallet}`} d={continuationPath(node)} className="continuationTail" style={{ opacity: dim }} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>

            <button type="button" className="person root" style={{ left: ROOT.x, top: ROOT.y }} data-network-control="true" onClick={() => setSelectedWallet(null)}><span className="avatar">●</span><b>YOU</b><small>{rootPayload.summary.direct} Direct · 1 Open Slot</small></button>
            <button type="button" className="person active" style={{ left: ACTIVE.x, top: ACTIVE.y }} data-network-control="true" onClick={() => setSelectedWallet(ACTIVE_WALLET)}><span className="avatar">●</span><b>{shortWallet(ACTIVE_WALLET)}</b><small>{activePayload.summary.network} network</small></button>
            <button type="button" className="emptySlot" style={{ left: EMPTY.x, top: EMPTY.y }} data-network-control="true" onClick={() => setSelectedWallet('empty')}><span className="slotAvatar"><i>+</i></span><b>Available</b><small>Next invite</small><span className="slotArrival" aria-hidden="true" /></button>

            {visibleNodes.filter((node) => node.depth >= 2).map((node, index) => {
              const dim = focusGroup && node.group !== focusGroup ? .28 : 1;
              const showLabel = node.depth === 2 ? view.scale >= .95 : node.depth === 3 ? view.scale >= 1.38 && (!focusGroup || node.group === focusGroup) : node.depth === 4 ? view.scale >= 1.56 : view.scale >= 1.70;
              const appear = node.depth === 2 ? 1 : node.depth === 3 ? detailProgress : node.depth === 4 ? (deepExpanded ? 1 : 0) : (ultraExpanded ? 1 : 0);
              return <button key={node.wallet} type="button" className={`person child ${node.depth >= 3 ? 'mini' : ''}`} style={{ left: node.x, top: node.y, opacity: appear * dim, transform: `translate(-50%,-50%) scale(${.84 + appear * .16})`, pointerEvents: appear > .45 ? 'auto' : 'none', transitionDelay: `${Math.min(260, 70 + index * 8)}ms` }} data-network-control="true" onClick={() => setSelectedWallet(node.wallet)}><span className="avatar">●</span>{showLabel ? <><b>{shortWallet(node.wallet)}</b><small>{node.network ? `${node.network} network` : 'Leaf'}</small></> : null}</button>;
            })}
          </div>

          {selectedWallet === 'empty' ? <aside className="slotCard" data-network-control="true"><div><span className="cardPlus">+</span><div><strong>Available invite slot</strong><small>Only your own Network can show this.</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedWallet(null)}>×</button></div><p>초대가 확정되면 이 슬롯 위치가 실제 사용자 노드로 바뀌며, 기존 네트워크 좌표는 유지됩니다.</p><button type="button" className="inviteCta">Invite a friend</button></aside> : null}
          {selected && selectedPayload ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{shortWallet(selected.wallet)}</strong><small>{selectedPayload.summary.direct} direct · {selectedPayload.summary.network} network</small></div><button type="button" aria-label="닫기" onClick={() => setSelectedWallet(null)}>×</button></div><p>{selected.direct ? `API형 데이터 기준 아래에 ${selected.direct}개의 직접 연결이 있습니다. 아직 화면에 안 보이는 세대는 continuation 선으로만 남습니다.` : '현재 데이터 기준 더 아래 연결이 없는 leaf 노드입니다.'}</p>{selected.depth >= 2 && selected.direct > 0 ? <button type="button" className="branchCta" onClick={() => focusSelectedBranch(selected)}>이 가지 자세히 보기</button> : null}</aside> : null}

          <div className="controls" data-network-control="true"><button type="button" className="youButton" aria-label="Return to YOU" onClick={returnToYou}><span>◎</span><b>YOU</b></button><button type="button" className="zoomControl" aria-label="확대" onClick={() => setView((current) => clampView({ ...current, scale: current.scale + .16 }))}>+</button><button type="button" className="zoomControl" aria-label="축소" onClick={() => setView((current) => clampView({ ...current, scale: current.scale - .16 }))}>−</button></div>
        </div>
      </section>

      <section className="tips"><span><b>API-shaped data</b>현재 /api/network 응답 형태를 기준으로 리허설</span><span><b>Stable append</b>새 사용자 추가 시 기존 형제 위치 유지</span><span><b>Guarded graph</b>orphan·cycle 데이터는 캔버스 진입 전 차단</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),560px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div:first-child{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.52rem}.qaActions{display:flex;align-items:center;gap:6px}.qaActions button{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.15);border-radius:8px;background:rgba(244,183,40,.055);color:#c7a451;font-size:.46rem}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09;box-shadow:0 22px 80px rgba(0,0,0,.24)}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}.totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.43rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}
        .stage{position:relative;height:clamp(560px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 20%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.05) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 88%)}.hud{position:absolute;z-index:7;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.76);pointer-events:none}.hud span{font-size:.49rem;color:#aaa296}.hud small{font-size:.47rem;color:#786c51}.backNetwork{position:absolute;z-index:9;top:10px;right:10px;height:29px;padding:0 10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(12,12,9,.9);color:#c5bdaf;font-size:.5rem}.gestureHint{position:absolute;z-index:7;top:42px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:11px;background:rgba(12,11,8,.9);pointer-events:none;animation:hintOut 5s ease forwards}.gestureHint b{color:#d6ac48}.gestureHint span{font-size:.53rem;line-height:1.35;color:#938a7b}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.world.cameraMoving{transition:transform .44s cubic-bezier(.22,.78,.22,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.mainEdge,.treeEdge,.continuationTail,.litGlow,.litCore{fill:none;stroke-linecap:round;stroke-linejoin:round}.mainEdge{stroke-width:1.25}.stemEdge{stroke:rgba(231,205,140,.28)}.activeEdge{stroke:rgba(225,194,115,.33)}.emptyEdge{stroke:rgba(244,183,40,.14)}.treeEdge{stroke:rgba(211,198,165,.30);stroke-width:.95;transition:opacity .20s ease}.continuationTail{stroke:url(#continuationFadeV11);stroke-width:.88;transition:opacity .18s ease}.flowIllumination{opacity:0;animation:illuminationCycle 5.3s ease-in-out infinite}.litGlow{stroke:rgba(244,183,40,.28);stroke-width:5;filter:url(#lineGlowV11)}.litCore{stroke:rgba(255,232,165,.88);stroke-width:1.28}
        .person,.emptySlot{position:absolute;z-index:3;transform:translate(-50%,-50%);border:0;outline:0;font:inherit}.person{width:82px;min-height:72px;padding:0;background:transparent;color:#e9e3d8;display:grid;justify-items:center;gap:4px}.avatar,.slotAvatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#17150f;border:1px solid rgba(226,193,111,.34);color:#d8b75c;font-size:.48rem}.person b,.emptySlot b{font-size:.52rem;font-weight:700;white-space:nowrap}.person small,.emptySlot small{font-size:.45rem;color:#7f786f;white-space:nowrap}.person.root{width:118px}.person.root .avatar{width:44px;height:44px;background:#201b10;border-color:rgba(244,183,40,.58);box-shadow:0 0 0 5px rgba(244,183,40,.035),0 8px 24px rgba(0,0,0,.28)}.person.root b{font-size:.64rem;color:#f2d98f}.person.active .avatar{border-color:rgba(244,183,40,.64);box-shadow:0 0 0 5px rgba(244,183,40,.04),0 8px 24px rgba(0,0,0,.3)}.person.child{transition:opacity .24s ease,transform .28s cubic-bezier(.22,.78,.22,1)}.person.mini .avatar{width:31px;height:31px}.emptySlot{width:84px;min-height:76px;padding:0;background:transparent;color:#e7c46c;display:grid;justify-items:center;gap:4px}.slotAvatar{position:relative;border-style:dashed;border-color:rgba(244,183,40,.5);background:rgba(244,183,40,.028);box-shadow:0 0 0 6px rgba(244,183,40,.014)}.slotAvatar i{font-style:normal;font-size:1.1rem;color:#f2ca65}.slotArrival{position:absolute;top:0;left:50%;width:44px;height:44px;transform:translate(-50%,0);border-radius:50%;border:1px solid rgba(244,183,40,.28);opacity:0;pointer-events:none;animation:slotArrivalV11 5.3s ease-in-out infinite}
        .slotCard{position:absolute;z-index:12;left:12px;right:12px;bottom:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(16,15,12,.96);box-shadow:0 18px 50px rgba(0,0,0,.38);backdrop-filter:blur(12px)}.slotCard>div{display:flex;align-items:center;gap:9px}.slotCard>div>div{display:grid;gap:2px;min-width:0}.slotCard strong{font-size:.65rem}.slotCard small{font-size:.49rem;color:#817a70}.slotCard>div>button{margin-left:auto;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.04);color:#8e877c}.slotCard p{margin:9px 0 0;font-size:.5rem;line-height:1.45;color:#91887a}.cardPlus,.cardAvatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:rgba(244,183,40,.08);border:1px solid rgba(244,183,40,.2);color:#d8b457}.inviteCta,.branchCta{margin-top:10px;width:100%;height:32px;border:1px solid rgba(244,183,40,.18);border-radius:9px;background:rgba(244,183,40,.08);color:#d8b457;font-size:.52rem;font-weight:700}.branchCta{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.07);color:#c6bba9}
        .controls{position:absolute;z-index:10;right:10px;bottom:max(10px,env(safe-area-inset-bottom));display:grid;gap:6px;justify-items:end}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.9);color:#bcb3a5;font-size:.75rem}.controls .youButton{width:auto;min-width:58px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border-color:rgba(244,183,40,.12);color:#ceb668}.youButton b{font-size:.48rem}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}
        @keyframes illuminationCycle{0%,7%{opacity:0}12%,62%{opacity:1}70%,100%{opacity:0}}@keyframes slotArrivalV11{0%,59%{transform:translate(-50%,0) scale(.97);opacity:0}66%{opacity:.46}74%{transform:translate(-50%,0) scale(1.1);opacity:0}100%{opacity:0}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}
        @media(max-width:430px){.notice{align-items:flex-start}.qaActions small{display:none}.topBar{padding:8px 11px}.metric em{font-size:.39rem}.stage{height:clamp(560px,73svh,700px)}.controls .zoomControl{display:none}.tips{grid-template-columns:1fr}.tips span{padding:6px}}
        @media(prefers-reduced-motion:reduce){.gestureHint,.flowIllumination,.slotArrival{animation:none}.flowIllumination{display:none}.world.cameraMoving,.treeEdge,.continuationTail,.person.child{transition:none}}
      `}</style>
    </main>
  );
}
