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

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type RawNode = { wallet: string; parentWallet: string | null; status: Status; order: number; joinedAt: string };
type ApiChild = { wallet: string; status: Status; joinedAt: string; network: number; direct: number; qualified: number; depth: number };
type ApiPayload = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  breadcrumb: string[];
  summary: { network: number; direct: number; qualified: number; depth: number };
  children: ApiChild[];
  depthLimitReached: boolean;
};
type LayoutNode = ApiChild & { parentWallet: string | null; x: number; y: number; localDepth: number; branch: string | null };
type PointerInfo = { point: Point; start: Point; nodeWallet: string | null; control: boolean };
type NavEntry = { viewedRoot: string; view: View };
type SlotPoint = { x: number; y: number; path: string; side: 'left' | 'right' };

const WORLD_W = 1540;
const WORLD_H = 1840;
const ROOT = { x: WORLD_W / 2, y: 128 };
const ROOT_VIEW: View = { x: 0, y: 52, scale: 0.82 };
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.84;
const SERVER_INVITE_LIMIT = 5;
const AUTH_WALLET = `0x${'1'.padStart(40, '0')}`;
const TAP_SLOP = 9;
const DIRECT_GAP = 190;
const SLOT_GAP = 150;

const ZOOM_THRESHOLDS = {
  detailIn: 1.13,
  detailOut: 1.03,
  deepIn: 1.43,
  deepOut: 1.31,
  ultraIn: 1.66,
  ultraOut: 1.54,
};

function makeWallet(seed: number) {
  return `0x${seed.toString(16).padStart(40, '0')}`;
}
function statusFor(seed: number): Status {
  return seed % 7 === 0 ? 'IN_PROGRESS' : seed % 3 === 0 ? 'QUALIFIED' : 'REWARDED';
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function shortWallet(wallet: string) {
  return wallet === AUTH_WALLET ? 'YOU' : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}
function stableOffset(index: number) {
  if (index === 0) return 0;
  const step = Math.ceil(index / 2);
  return index % 2 === 1 ? -step : step;
}

function createFixture(): RawNode[] {
  const nodes: RawNode[] = [
    { wallet: AUTH_WALLET, parentWallet: null, status: 'REWARDED', order: 0, joinedAt: '2026-08-01T00:00:00Z' },
  ];
  let seed = 200;
  const directCounts = [8, 4, 7];
  directCounts.forEach((count, topIndex) => {
    const top: RawNode = {
      wallet: makeWallet(seed++), parentWallet: AUTH_WALLET, status: statusFor(seed), order: topIndex,
      joinedAt: `2026-08-${String(4 + topIndex).padStart(2, '0')}T00:00:00Z`,
    };
    nodes.push(top);
    for (let i = 0; i < count; i += 1) {
      const child: RawNode = {
        wallet: makeWallet(seed++), parentWallet: top.wallet, status: statusFor(seed), order: i,
        joinedAt: `2026-08-${String(10 + ((topIndex + i) % 16)).padStart(2, '0')}T00:00:00Z`,
      };
      nodes.push(child);
      const level3 = (topIndex + i) % 3 === 0 ? 3 : (topIndex + i) % 2 === 0 ? 2 : 1;
      for (let j = 0; j < level3; j += 1) {
        const grand: RawNode = {
          wallet: makeWallet(seed++), parentWallet: child.wallet, status: statusFor(seed), order: j,
          joinedAt: `2026-09-${String(1 + ((i + j) % 8)).padStart(2, '0')}T00:00:00Z`,
        };
        nodes.push(grand);
        if ((topIndex + i + j) % 2 === 0) {
          const d4: RawNode = { wallet: makeWallet(seed++), parentWallet: grand.wallet, status: statusFor(seed), order: 0, joinedAt: '2026-09-08T00:00:00Z' };
          nodes.push(d4);
          if ((i + j) % 3 === 0) {
            const d5: RawNode = { wallet: makeWallet(seed++), parentWallet: d4.wallet, status: statusFor(seed), order: 0, joinedAt: '2026-09-09T00:00:00Z' };
            nodes.push(d5);
            if ((i + j) % 4 === 0) nodes.push({ wallet: makeWallet(seed++), parentWallet: d5.wallet, status: statusFor(seed), order: 0, joinedAt: '2026-09-10T00:00:00Z' });
          }
        }
      }
    }
  });
  nodes.push({ wallet: makeWallet(9901), parentWallet: makeWallet(9999), status: 'IN_PROGRESS', order: 0, joinedAt: '2026-09-10T00:00:00Z' });
  nodes.push({ wallet: makeWallet(9902), parentWallet: makeWallet(9903), status: 'IN_PROGRESS', order: 0, joinedAt: '2026-09-10T00:00:00Z' });
  nodes.push({ wallet: makeWallet(9903), parentWallet: makeWallet(9902), status: 'IN_PROGRESS', order: 0, joinedAt: '2026-09-10T00:00:00Z' });
  return nodes;
}

function buildServerStore(raw: RawNode[]) {
  const unique = new Map<string, RawNode>();
  raw.forEach((node) => { if (!unique.has(node.wallet)) unique.set(node.wallet, node); });
  const rawChildren = new Map<string, RawNode[]>();
  unique.forEach((node) => {
    if (!node.parentWallet) return;
    const list = rawChildren.get(node.parentWallet) ?? [];
    list.push(node);
    rawChildren.set(node.parentWallet, list);
  });
  rawChildren.forEach((list) => list.sort((a, b) => a.order - b.order || a.wallet.localeCompare(b.wallet)));

  const accepted = new Map<string, RawNode>();
  const queue = [AUTH_WALLET];
  while (queue.length) {
    const wallet = queue.shift()!;
    if (accepted.has(wallet)) continue;
    const node = unique.get(wallet);
    if (!node) continue;
    accepted.set(wallet, node);
    for (const child of rawChildren.get(wallet) ?? []) if (child.wallet !== wallet && !accepted.has(child.wallet)) queue.push(child.wallet);
  }

  const children = new Map<string, RawNode[]>();
  accepted.forEach((node) => {
    if (!node.parentWallet || !accepted.has(node.parentWallet)) return;
    const list = children.get(node.parentWallet) ?? [];
    list.push(node);
    children.set(node.parentWallet, list);
  });
  children.forEach((list) => list.sort((a, b) => a.order - b.order || a.wallet.localeCompare(b.wallet)));

  const descendantCache = new Map<string, number>();
  const qualifiedCache = new Map<string, number>();
  const countDescendants = (wallet: string): number => {
    const cached = descendantCache.get(wallet);
    if (cached !== undefined) return cached;
    let total = 0;
    const stack = [...(children.get(wallet) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const node = stack.pop()!;
      if (seen.has(node.wallet)) continue;
      seen.add(node.wallet); total += 1;
      stack.push(...(children.get(node.wallet) ?? []));
    }
    descendantCache.set(wallet, total);
    return total;
  };
  const countQualified = (wallet: string): number => {
    const cached = qualifiedCache.get(wallet);
    if (cached !== undefined) return cached;
    let total = 0;
    const stack = [...(children.get(wallet) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const node = stack.pop()!;
      if (seen.has(node.wallet)) continue;
      seen.add(node.wallet);
      if (node.status !== 'IN_PROGRESS') total += 1;
      stack.push(...(children.get(node.wallet) ?? []));
    }
    qualifiedCache.set(wallet, total);
    return total;
  };
  const breadcrumb = (wallet: string) => {
    const path: string[] = [];
    const seen = new Set<string>();
    let current = accepted.get(wallet) ?? null;
    while (current && !seen.has(current.wallet)) {
      seen.add(current.wallet); path.unshift(current.wallet);
      current = current.parentWallet ? accepted.get(current.parentWallet) ?? null : null;
    }
    return path;
  };
  const payloadFor = (wallet: string): ApiPayload => {
    const focus = accepted.get(wallet) ?? accepted.get(AUTH_WALLET)!;
    const crumbs = breadcrumb(focus.wallet);
    const direct = children.get(focus.wallet) ?? [];
    return {
      rootWallet: AUTH_WALLET,
      focusWallet: focus.wallet,
      focusDepth: Math.max(0, crumbs.length - 1),
      breadcrumb: crumbs,
      summary: { network: countDescendants(focus.wallet), direct: direct.length, qualified: countQualified(focus.wallet), depth: Math.max(0, crumbs.length - 1) },
      children: direct.map((child) => ({
        wallet: child.wallet, status: child.status, joinedAt: child.joinedAt,
        network: countDescendants(child.wallet), direct: (children.get(child.wallet) ?? []).length,
        qualified: countQualified(child.wallet), depth: crumbs.length,
      })),
      depthLimitReached: direct.some((child) => (children.get(child.wallet)?.length ?? 0) > 0),
    };
  };
  return { accepted, payloadFor, guarded: raw.length - accepted.size };
}

const SERVER = buildServerStore(createFixture());
function fakeNetworkApi(wallet: string, latency = 190): Promise<ApiPayload> {
  return new Promise((resolve) => window.setTimeout(() => resolve(SERVER.payloadFor(wallet)), latency));
}

function childEdge(parent: LayoutNode, child: LayoutNode) {
  const sy = parent.y + (parent.localDepth === 0 ? 44 : 38);
  const ey = child.y - 37;
  const mid = sy + (ey - sy) * .42;
  return `M${parent.x} ${sy} C${parent.x} ${mid} ${child.x} ${mid} ${child.x} ${ey}`;
}
function continuationPath(node: LayoutNode, length = 72) {
  const sy = node.y + (node.localDepth === 0 ? 44 : 38);
  const ey = sy + length;
  return `M${node.x} ${sy} C${node.x} ${sy + 18} ${node.x} ${ey - 13} ${node.x} ${ey}`;
}

function buildAvailableSlots(memberXs: number[], count: number): SlotPoint[] {
  if (count <= 0) return [];
  const minMember = memberXs.length ? Math.min(...memberXs) : ROOT.x;
  const maxMember = memberXs.length ? Math.max(...memberXs) : ROOT.x;
  const points: SlotPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const isRight = count === 1 || index % 2 === 1;
    const layer = count === 1 ? 1 : Math.floor(index / 2) + 1;
    const x = isRight ? maxMember + SLOT_GAP * layer : minMember - SLOT_GAP * layer;
    const y = 330;
    const bend = isRight ? 58 : -58;
    const path = `M${ROOT.x} ${ROOT.y + 44} C${ROOT.x + bend} 202 ${x - bend * .45} 234 ${x} ${y - 38}`;
    points.push({ x, y, path, side: isRight ? 'right' : 'left' });
  }
  return points;
}

export function QaNetworkEmptyStateV13() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const viewRef = useRef<View>(ROOT_VIEW);
  const pendingViewRef = useRef<View | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);

  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>(ROOT_VIEW);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [viewedRoot, setViewedRoot] = useState(AUTH_WALLET);
  const [payloads, setPayloads] = useState<Map<string, ApiPayload>>(() => new Map());
  const [loadingWallets, setLoadingWallets] = useState<Set<string>>(() => new Set());
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [history, setHistory] = useState<NavEntry[]>([]);
  const [showHint, setShowHint] = useState(true);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [simulatedDirect, setSimulatedDirect] = useState(false);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(300, WORLD_W * scale * .68);
    const minY = Math.min(-450, stageSize.height * .52 - WORLD_H * scale);
    const maxY = Math.max(270, stageSize.height * .44);
    return { scale, x: clamp(next.x, -horizontalReach, horizontalReach), y: clamp(next.y, minY, maxY) };
  }, [stageSize.height]);

  const commitView = useCallback((next: View) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    pendingViewRef.current = clamped;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingViewRef.current) setView(pendingViewRef.current);
      pendingViewRef.current = null;
    });
  }, [clampView]);

  const stopCamera = useCallback(() => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    cameraTimerRef.current = null;
    setCameraMoving(false);
  }, []);
  const animateTo = useCallback((next: View) => {
    stopCamera(); setCameraMoving(true); commitView(next);
    cameraTimerRef.current = window.setTimeout(() => { cameraTimerRef.current = null; setCameraMoving(false); }, 460);
  }, [commitView, stopCamera]);

  const loadPayload = useCallback(async (wallet: string) => {
    if (payloads.has(wallet) || loadingWallets.has(wallet)) return;
    setLoadingWallets((current) => new Set(current).add(wallet));
    try {
      const payload = await fakeNetworkApi(wallet);
      setPayloads((current) => { const next = new Map(current); next.set(wallet, payload); return next; });
    } finally {
      setLoadingWallets((current) => { const next = new Set(current); next.delete(wallet); return next; });
    }
  }, [loadingWallets, payloads]);

  useEffect(() => { void loadPayload(AUTH_WALLET); }, [loadPayload]);
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage); window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setShowHint(false), 5000); return () => window.clearTimeout(timer); }, []);
  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const scale = view.scale;
    setZoomLevel((current) => {
      if (current === 0 && scale >= ZOOM_THRESHOLDS.detailIn) return 1;
      if (current === 1 && scale <= ZOOM_THRESHOLDS.detailOut) return 0;
      if (current === 1 && scale >= ZOOM_THRESHOLDS.deepIn) return 2;
      if (current === 2 && scale <= ZOOM_THRESHOLDS.deepOut) return 1;
      if (current === 2 && scale >= ZOOM_THRESHOLDS.ultraIn) return 3;
      if (current === 3 && scale <= ZOOM_THRESHOLDS.ultraOut) return 2;
      return current;
    });
  }, [view.scale]);

  const rootPayload = payloads.get(viewedRoot) ?? null;
  const isOwnNetwork = viewedRoot === AUTH_WALLET;
  const openSlots = isOwnNetwork ? Math.max(0, SERVER_INVITE_LIMIT - (rootPayload?.summary.direct ?? 0) - (simulatedDirect ? 1 : 0)) : 0;

  useEffect(() => {
    if (zoomLevel < 1 || !rootPayload) return;
    rootPayload.children.slice(0, 3).forEach((child) => { if (child.direct > 0) void loadPayload(child.wallet); });
  }, [loadPayload, rootPayload, zoomLevel]);

  const layout = useMemo(() => {
    const nodes = new Map<string, LayoutNode>();
    const summary = rootPayload?.summary ?? { network: 0, direct: 0, qualified: 0, depth: 0 };
    nodes.set(viewedRoot, {
      wallet: viewedRoot, parentWallet: null, status: 'REWARDED', joinedAt: '',
      network: summary.network, direct: summary.direct, qualified: summary.qualified, depth: summary.depth,
      x: ROOT.x, y: ROOT.y, localDepth: 0, branch: null,
    });
    const rootChildren = rootPayload?.children ?? [];
    rootChildren.forEach((child, index) => {
      const x = ROOT.x + stableOffset(index) * DIRECT_GAP;
      nodes.set(child.wallet, { ...child, parentWallet: viewedRoot, x, y: 330, localDepth: 1, branch: child.wallet });
    });
    const queue = rootChildren.map((child) => child.wallet);
    while (queue.length) {
      const parentWallet = queue.shift()!;
      const parent = nodes.get(parentWallet); if (!parent) continue;
      const payload = payloads.get(parentWallet); if (!payload) continue;
      const limit = zoomLevel <= 1 ? 5 : zoomLevel === 2 ? 7 : 10;
      payload.children.slice(0, limit).forEach((child, index) => {
        if (nodes.has(child.wallet)) return;
        const localDepth = parent.localDepth + 1;
        const gap = localDepth === 2 ? 56 : localDepth === 3 ? 42 : localDepth === 4 ? 34 : 28;
        nodes.set(child.wallet, {
          ...child, parentWallet, x: parent.x + stableOffset(index) * gap,
          y: 330 + localDepth * 205, localDepth, branch: parent.branch,
        });
        queue.push(child.wallet);
      });
    }
    const byDepth = new Map<number, LayoutNode[]>();
    nodes.forEach((node) => { const row = byDepth.get(node.localDepth) ?? []; row.push(node); byDepth.set(node.localDepth, row); });
    byDepth.forEach((row, depth) => {
      if (depth <= 1) return;
      row.sort((a, b) => a.x - b.x || a.wallet.localeCompare(b.wallet));
      const minGap = depth === 2 ? 66 : depth === 3 ? 54 : 48;
      for (let i = 1; i < row.length; i += 1) if (row[i].x - row[i - 1].x < minGap) row[i].x = row[i - 1].x + minGap;
    });
    return nodes;
  }, [payloads, rootPayload, viewedRoot, zoomLevel]);

  const visibleNodes = useMemo(() => {
    const semantic = [...layout.values()].filter((node) => node.localDepth <= 1 || (node.localDepth === 2 && zoomLevel >= 1) || (node.localDepth === 3 && zoomLevel >= 2) || (node.localDepth >= 4 && zoomLevel >= 3));
    const margin = 300;
    return semantic.filter((node) => {
      const sx = stageSize.width / 2 + view.x + (node.x - WORLD_W / 2) * view.scale;
      const sy = view.y + node.y * view.scale;
      return sx > -margin && sx < stageSize.width + margin && sy > -margin && sy < stageSize.height + margin;
    });
  }, [layout, stageSize.height, stageSize.width, view, zoomLevel]);
  const visibleWallets = useMemo(() => new Set(visibleNodes.map((node) => node.wallet)), [visibleNodes]);
  const visibleEdges = useMemo(() => visibleNodes.flatMap((child) => {
    if (!child.parentWallet) return [];
    const parent = layout.get(child.parentWallet);
    return parent && visibleWallets.has(parent.wallet) ? [{ parent, child }] : [];
  }), [layout, visibleNodes, visibleWallets]);
  const continuationNodes = useMemo(() => visibleNodes.filter((node) => {
    if (node.direct <= 0) return false;
    const payload = payloads.get(node.wallet);
    if (!payload) return true;
    const rendered = [...layout.values()].filter((child) => child.parentWallet === node.wallet).length;
    return payload.children.length > rendered || node.direct > rendered;
  }), [layout, payloads, visibleNodes]);

  const rootMemberXs = useMemo(() => (rootPayload?.children ?? []).map((child) => layout.get(child.wallet)?.x).filter((x): x is number => typeof x === 'number'), [layout, rootPayload]);
  const available = useMemo(() => buildAvailableSlots(rootMemberXs, openSlots), [openSlots, rootMemberXs]);
  const selected = selectedWallet ? layout.get(selectedWallet) ?? null : null;
  const currentBreadcrumb = rootPayload?.breadcrumb ?? [viewedRoot];

  const focusNode = useCallback(async (wallet: string) => {
    const node = layout.get(wallet); if (!node || node.direct <= 0) return;
    setSelectedWallet(null); setShowHint(false); await loadPayload(wallet);
    const scale = Math.max(viewRef.current.scale, node.localDepth <= 1 ? 1.26 : 1.48);
    animateTo({ x: -(node.x - WORLD_W / 2) * scale, y: stageSize.height * .31 - node.y * scale, scale });
  }, [animateTo, layout, loadPayload, stageSize.height]);

  const reroot = useCallback(async (wallet: string) => {
    if (wallet === viewedRoot) return;
    const payload = payloads.get(wallet) ?? await fakeNetworkApi(wallet);
    setPayloads((current) => { const next = new Map(current); next.set(wallet, payload); return next; });
    setHistory((current) => [...current.slice(-6), { viewedRoot, view: viewRef.current }]);
    setViewedRoot(wallet); setSelectedWallet(null); setZoomLevel(0); animateTo(ROOT_VIEW);
  }, [animateTo, payloads, viewedRoot]);
  const returnToYou = useCallback(async () => {
    if (!payloads.has(AUTH_WALLET)) {
      const payload = await fakeNetworkApi(AUTH_WALLET);
      setPayloads((current) => { const next = new Map(current); next.set(AUTH_WALLET, payload); return next; });
    }
    setViewedRoot(AUTH_WALLET); setHistory([]); setSelectedWallet(null); setZoomLevel(0); animateTo(ROOT_VIEW);
  }, [animateTo, payloads]);
  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setViewedRoot(previous.viewedRoot); setSelectedWallet(null); animateTo(previous.view);
      return current.slice(0, -1);
    });
  }, [animateTo]);

  const zoomAround = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return;
    stopCamera(); setShowHint(false);
    const current = viewRef.current;
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (px - current.x) / current.scale;
    const worldY = (py - current.y) / current.scale;
    commitView({ scale, x: px - worldX * scale, y: py - worldY * scale });
  }, [commitView, stopCamera]);
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAround(event.clientX, event.clientY, viewRef.current.scale * clamp(Math.exp(-event.deltaY * .0018), .94, 1.06));
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const control = Boolean(target.closest('[data-network-control="true"]'));
    const nodeWallet = target.closest('[data-node-wallet]')?.getAttribute('data-node-wallet') ?? null;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { point, start: point, nodeWallet, control });
    stopCamera(); setShowHint(false);
    if (!control) { try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} }
    if (pointersRef.current.size === 1) previousPointRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((item) => item.point);
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y); previousPointRef.current = null;
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointersRef.current.get(event.pointerId); if (!info) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { ...info, point });
    if (pointersRef.current.size === 1) {
      if (info.control) return;
      const previous = previousPointRef.current; if (!previous) { previousPointRef.current = point; return; }
      const current = viewRef.current;
      commitView({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y });
      previousPointRef.current = point; return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((item) => item.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistanceRef.current) zoomAround((a.x + b.x) / 2, (a.y + b.y) / 2, viewRef.current.scale * (distance / pinchDistanceRef.current));
      pinchDistanceRef.current = distance;
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointersRef.current.get(event.pointerId);
    pointersRef.current.delete(event.pointerId);
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (info && !info.control && info.nodeWallet && pointersRef.current.size === 0) {
      const moved = Math.hypot(info.point.x - info.start.x, info.point.y - info.start.y);
      if (moved <= TAP_SLOP) setSelectedWallet(info.nodeWallet);
    }
    if (pointersRef.current.size === 1) { previousPointRef.current = [...pointersRef.current.values()][0].point; pinchDistanceRef.current = null; }
    else if (pointersRef.current.size === 0) { previousPointRef.current = null; pinchDistanceRef.current = null; }
  };

  return (
    <main className="qaPage">
      <section className="notice">
        <div><strong>AVAILABLE PLACEMENT · QA V13</strong><span>v12 누적 · members grouped · slots outside · stable positions</span></div>
        <div className="qaActions"><small>{SERVER.accepted.size} valid · {SERVER.guarded} guarded</small><button type="button" onClick={() => setSimulatedDirect((value) => !value)}>{simulatedDirect ? 'slot reset' : 'fill 1 slot'}</button></div>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock"><span>NETWORK</span><h1>{isOwnNetwork ? 'My Network' : `${shortWallet(viewedRoot)} Network`}</h1></div>
          <div className="totals"><span className="metric"><b>{rootPayload?.summary.network ?? '—'}</b><em>Members</em></span><i /><span className="metric"><b>{openSlots}</b><em>Open slots</em></span></div>
        </header>

        {viewedRoot !== AUTH_WALLET ? <div className="breadcrumb" data-network-control="true">{currentBreadcrumb.map((wallet, index) => <span key={wallet}><button type="button" onClick={() => void reroot(wallet)}>{index === 0 ? 'YOU' : shortWallet(wallet)}</button>{index < currentBreadcrumb.length - 1 ? <i>›</i> : null}</span>)}</div> : null}

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{loadingWallets.size ? 'Loading…' : zoomLevel === 0 ? '전체 구조' : zoomLevel === 1 ? '상세 보기' : '깊은 세대'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>선이 더 이어진 곳에는 아직 보이지 않은 세대가 있습니다.<br />확대하면 필요한 가지부터 자연스럽게 펼쳐집니다.</span></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <linearGradient id="continuationFadeV13" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(222,209,176,.44)" /><stop offset="62%" stopColor="rgba(211,198,165,.22)" /><stop offset="100%" stopColor="rgba(211,198,165,0)" /></linearGradient>
                <filter id="slotGlowV13" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="6" /></filter>
              </defs>
              {visibleEdges.map(({ parent, child }) => <path key={`${parent.wallet}-${child.wallet}`} d={childEdge(parent, child)} className={`treeEdge depth${child.localDepth}`} vectorEffect="non-scaling-stroke" />)}
              {continuationNodes.map((node) => <path key={`tail-${node.wallet}`} d={continuationPath(node)} className="continuationTail" vectorEffect="non-scaling-stroke" />)}
              {isOwnNetwork && available.map((slot, index) => <g key={`slot-${index}`}><path d={slot.path} className="availableBase" vectorEffect="non-scaling-stroke" /><path d={slot.path} className="availableGlow" style={{ animationDelay: `${index * 2.9}s` }} vectorEffect="non-scaling-stroke" /></g>)}
            </svg>

            {visibleNodes.map((node) => {
              const isRoot = node.wallet === viewedRoot;
              const loading = loadingWallets.has(node.wallet);
              const showLabel = isRoot || node.localDepth <= 1 || (node.localDepth === 2 && zoomLevel >= 1) || (node.localDepth >= 3 && zoomLevel >= 2);
              return <button key={node.wallet} type="button" className={`person ${isRoot ? 'root' : 'child'} ${node.localDepth >= 2 ? 'mini' : ''}`} style={{ left: node.x, top: node.y }} data-node-wallet={node.wallet}><span className="avatar">●</span><b>{isRoot && node.wallet === AUTH_WALLET ? 'YOU' : shortWallet(node.wallet)}</b>{showLabel ? <small>{loading ? 'Loading…' : node.direct ? `${node.network} network · ${node.direct} direct` : 'Leaf'}</small> : null}</button>;
            })}
            {isOwnNetwork && available.map((slot, index) => <button key={`available-${index}`} type="button" className="emptySlot" style={{ left: slot.x, top: slot.y }} data-network-control="true"><span className="slotAvatar"><i>+</i></span><b>Available</b><small>Invite slot</small></button>)}
          </div>

          {selected ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{selected.wallet === AUTH_WALLET ? 'YOU' : shortWallet(selected.wallet)}</strong><small>{selected.direct} direct · {selected.network} network</small></div><button type="button" onClick={() => setSelectedWallet(null)}>×</button></div><p>{selected.direct ? '아래 세대가 있습니다. 필요한 순간에만 다음 children을 불러옵니다.' : '현재 데이터 기준 더 아래 세대가 없는 leaf 노드입니다.'}</p>{selected.direct > 0 ? <div className="cardActions"><button type="button" className="branchCta" onClick={() => void focusNode(selected.wallet)}>아래 세대 보기</button>{selected.wallet !== viewedRoot ? <button type="button" className="networkCta" onClick={() => void reroot(selected.wallet)}>이 네트워크 보기</button> : null}</div> : null}</aside> : null}

          <div className="controls" data-network-control="true"><button type="button" className="youButton" onClick={() => void returnToYou()}><span>◎</span><b>YOU</b></button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale + .16 })}>+</button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale - .16 })}>−</button></div>
        </div>
      </section>

      <section className="tips"><span><b>Members stay together</b>실제 사람 사이에는 Available이 끼지 않음</span><span><b>Slots live outside</b>1개는 오른쪽 · 2개는 좌우 끝</span><span><b>Stable network</b>슬롯 상태가 바뀌어도 기존 사람 좌표는 유지</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div:first-child{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.5rem}.qaActions{display:flex;align-items:center;gap:6px}.qaActions button{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.16);border-radius:8px;background:rgba(244,183,40,.055);color:#c7a451;font-size:.45rem}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}.totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.42rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}.breadcrumb{min-height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;overflow:auto;border-bottom:1px solid rgba(255,255,255,.035)}.breadcrumb span{display:flex;align-items:center;gap:4px;flex:0 0 auto}.breadcrumb button{color:#817b72;font-size:.45rem}.breadcrumb span:last-child button{color:#c2b59a}.breadcrumb i{color:#4e4a43}.stage{position:relative;height:clamp(570px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 19%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 90%)}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform;transition:none}.world.cameraMoving{transition:transform .46s cubic-bezier(.2,.72,.25,1)}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.treeEdge{fill:none;stroke:rgba(211,198,165,.31);stroke-width:1.05;stroke-linecap:round}.treeEdge.depth2{stroke:rgba(211,198,165,.25);stroke-width:.94}.treeEdge.depth3{stroke:rgba(211,198,165,.20);stroke-width:.86}.treeEdge.depth4,.treeEdge.depth5,.treeEdge.depth6{stroke:rgba(211,198,165,.16);stroke-width:.78}.continuationTail{fill:none;stroke:url(#continuationFadeV13);stroke-width:1.12;stroke-linecap:round}.availableBase{fill:none;stroke:rgba(244,183,40,.085);stroke-width:.85;stroke-linecap:round}.availableGlow{fill:none;stroke:rgba(250,200,74,.36);stroke-width:1.7;stroke-linecap:round;filter:url(#slotGlowV13);opacity:0;animation:slotFlow 5.8s ease-in-out infinite}.person,.emptySlot{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;border:0;background:transparent;color:#d8d2c7;text-align:center;white-space:nowrap;touch-action:none}.person{min-width:86px}.person .avatar{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.28);border-radius:50%;background:#11100d;color:#d9b34f;font-size:.6rem;box-shadow:0 5px 22px rgba(0,0,0,.32)}.person.root .avatar{width:48px;height:48px;border-color:rgba(244,183,40,.5);background:#15130d}.person.mini .avatar{width:35px;height:35px}.person b{font-size:.49rem}.person small{color:#746f67;font-size:.4rem}.emptySlot{min-width:68px;opacity:.72}.slotAvatar{width:32px;height:32px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.25);border-radius:50%;background:rgba(244,183,40,.018)}.slotAvatar i{font-style:normal;color:#a88d4a;font-size:.78rem}.emptySlot b{font-size:.43rem;color:#a79a79}.emptySlot small{font-size:.36rem;color:#5e594f}.hud{position:absolute;z-index:8;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.82)}.hud span,.hud small{font-size:.43rem;color:#817a70}.backNetwork{position:absolute;z-index:9;left:10px;top:42px;height:29px;padding:0 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(12,12,9,.9);color:#a7a095;font-size:.48rem}.gestureHint{position:absolute;z-index:8;left:50%;top:82px;transform:translateX(-50%);display:flex;gap:7px;width:max-content;max-width:82%;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:11px;background:rgba(12,12,9,.88);pointer-events:none;animation:hintOut 5s forwards}.gestureHint b{color:#c8a04a}.gestureHint span{color:#817a70;font-size:.44rem;line-height:1.45}.slotCard{position:absolute;z-index:12;left:10px;right:10px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 54px));padding:10px;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:rgba(14,14,11,.96)}.slotCard>div:first-child{display:flex;align-items:center;gap:8px}.cardAvatar{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.24);border-radius:50%;color:#c9a54d}.slotCard>div>div{display:grid;gap:2px;flex:1}.slotCard strong{font-size:.58rem}.slotCard small{color:#736d64;font-size:.43rem}.slotCard>div>button{width:28px;height:28px;color:#8b8478}.slotCard p{margin:8px 0;color:#8a8378;font-size:.46rem;line-height:1.45}.cardActions{display:flex;gap:6px}.cardActions button{flex:1;height:31px;border-radius:9px;font-size:.47rem}.branchCta{border:1px solid rgba(244,183,40,.16);background:rgba(244,183,40,.07);color:#d1ad55}.networkCta{border:1px solid rgba(255,255,255,.065);background:#12110e;color:#aaa296}.controls{position:absolute;z-index:10;right:10px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 54px));display:grid;gap:6px;justify-items:end}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.9);color:#bcb3a5;font-size:.75rem}.controls .youButton{width:auto;min-width:58px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border-color:rgba(244,183,40,.12);color:#ceb668}.youButton b{font-size:.48rem}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}@keyframes slotFlow{0%,12%,76%,100%{opacity:0}28%,58%{opacity:.7}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}@media(max-width:430px){.notice{align-items:flex-start}.qaActions small{display:none}.topBar{padding:8px 11px}.metric em{font-size:.39rem}.stage{height:clamp(570px,73svh,700px)}.controls .zoomControl{display:none}.tips{grid-template-columns:1fr}.tips span{padding:6px}}@media(prefers-reduced-motion:reduce){.gestureHint,.availableGlow{animation:none}.world.cameraMoving{transition:none}}
      `}</style>
    </main>
  );
}

export default QaNetworkEmptyStateV13;
