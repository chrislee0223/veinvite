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
type LayoutNode = ApiChild & {
  parentWallet: string | null;
  x: number;
  y: number;
  localDepth: number;
  branch: string | null;
  synthetic?: boolean;
};
type Edge = { parent: LayoutNode; child: LayoutNode };
type PointerInfo = { point: Point; start: Point; nodeWallet: string | null; control: boolean };
type NavEntry = { viewedRoot: string; view: View };
type SlotId = 'slot-left-1' | 'slot-right-1';
type SlotAnchor = { id: SlotId; side: 'left' | 'right'; x: number; y: number; path: string; wallet: string };

const WORLD_W = 1540;
const WORLD_H = 1840;
const ROOT = { x: WORLD_W / 2, y: 128 };
const ROOT_VIEW: View = { x: 0, y: 52, scale: 0.82 };
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.84;
const AUTH_WALLET = `0x${'1'.padStart(40, '0')}`;
const TAP_SLOP = 9;
const DIRECT_GAP = 190;
const SLOT_GAP = 150;
const SERVER_SLOT_IDS: SlotId[] = ['slot-left-1', 'slot-right-1'];
const FILL_SEQUENCE: SlotId[] = ['slot-right-1', 'slot-left-1'];

const ZOOM = {
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
function syntheticWallet(id: SlotId) {
  return id === 'slot-left-1' ? `0x${'f15a'.padStart(40, '0')}` : `0x${'f15b'.padStart(40, '0')}`;
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
function resolveZoomLevel(current: number, scale: number) {
  let next = current;
  for (let guard = 0; guard < 8; guard += 1) {
    if (next === 0 && scale >= ZOOM.detailIn) { next = 1; continue; }
    if (next === 1 && scale >= ZOOM.deepIn) { next = 2; continue; }
    if (next === 2 && scale >= ZOOM.ultraIn) { next = 3; continue; }
    if (next === 3 && scale <= ZOOM.ultraOut) { next = 2; continue; }
    if (next === 2 && scale <= ZOOM.deepOut) { next = 1; continue; }
    if (next === 1 && scale <= ZOOM.detailOut) { next = 0; continue; }
    break;
  }
  return next;
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
  const countDescendants = (wallet: string) => {
    const cached = descendantCache.get(wallet); if (cached !== undefined) return cached;
    let total = 0; const stack = [...(children.get(wallet) ?? [])]; const seen = new Set<string>();
    while (stack.length) { const node = stack.pop()!; if (seen.has(node.wallet)) continue; seen.add(node.wallet); total += 1; stack.push(...(children.get(node.wallet) ?? [])); }
    descendantCache.set(wallet, total); return total;
  };
  const countQualified = (wallet: string) => {
    const cached = qualifiedCache.get(wallet); if (cached !== undefined) return cached;
    let total = 0; const stack = [...(children.get(wallet) ?? [])]; const seen = new Set<string>();
    while (stack.length) { const node = stack.pop()!; if (seen.has(node.wallet)) continue; seen.add(node.wallet); if (node.status !== 'IN_PROGRESS') total += 1; stack.push(...(children.get(node.wallet) ?? [])); }
    qualifiedCache.set(wallet, total); return total;
  };
  const breadcrumb = (wallet: string) => {
    const path: string[] = []; const seen = new Set<string>(); let current = accepted.get(wallet) ?? null;
    while (current && !seen.has(current.wallet)) { seen.add(current.wallet); path.unshift(current.wallet); current = current.parentWallet ? accepted.get(current.parentWallet) ?? null : null; }
    return path;
  };
  const payloadFor = (wallet: string): ApiPayload => {
    const focus = accepted.get(wallet) ?? accepted.get(AUTH_WALLET)!;
    const crumbs = breadcrumb(focus.wallet); const direct = children.get(focus.wallet) ?? [];
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

function edgePath(parent: LayoutNode, child: LayoutNode) {
  const sy = parent.y + (parent.localDepth === 0 ? 44 : 38);
  const stem = sy + 24;
  const ey = child.y - 37;
  const bendY = stem + Math.max(22, (ey - stem) * .56);
  return `M${parent.x} ${sy} L${parent.x} ${stem} C${parent.x} ${bendY} ${child.x} ${bendY} ${child.x} ${ey}`;
}
function continuationPath(node: LayoutNode, length = 74) {
  const sy = node.y + (node.localDepth === 0 ? 44 : 38);
  const ey = sy + length;
  return `M${node.x} ${sy} C${node.x} ${sy + 18} ${node.x} ${ey - 13} ${node.x} ${ey}`;
}
function slotAnchor(id: SlotId, memberXs: number[]): SlotAnchor {
  const minMember = memberXs.length ? Math.min(...memberXs) : ROOT.x - DIRECT_GAP;
  const maxMember = memberXs.length ? Math.max(...memberXs) : ROOT.x + DIRECT_GAP;
  const side = id === 'slot-left-1' ? 'left' : 'right';
  const x = side === 'left' ? minMember - SLOT_GAP : maxMember + SLOT_GAP;
  const bend = side === 'left' ? -58 : 58;
  const y = 330;
  return {
    id, side, x, y,
    path: `M${ROOT.x} ${ROOT.y + 44} C${ROOT.x + bend} 202 ${x - bend * .45} 234 ${x} ${y - 38}`,
    wallet: syntheticWallet(id),
  };
}
function orderCrossings(edges: Edge[]) {
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i]; const b = edges[j];
      if (a.child.localDepth !== b.child.localDepth || a.parent.wallet === b.parent.wallet) continue;
      const parentDelta = a.parent.x - b.parent.x;
      const childDelta = a.child.x - b.child.x;
      if (parentDelta * childDelta < 0) count += 1;
    }
  }
  return count;
}

export function QaNetworkEmptyStateV15() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const viewRef = useRef<View>(ROOT_VIEW);
  const pendingViewRef = useRef<View | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const payloadsRef = useRef<Map<string, ApiPayload>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

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
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);
  const [availableSlotIds, setAvailableSlotIds] = useState<SlotId[]>(SERVER_SLOT_IDS);
  const [transitioningSlot, setTransitioningSlot] = useState<SlotId | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

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
    cameraTimerRef.current = window.setTimeout(() => { cameraTimerRef.current = null; setCameraMoving(false); }, reduceMotion ? 1 : 460);
  }, [commitView, reduceMotion, stopCamera]);

  const loadPayload = useCallback(async (wallet: string) => {
    const cached = payloadsRef.current.get(wallet);
    if (cached) return cached;
    if (inFlightRef.current.has(wallet)) return null;
    inFlightRef.current.add(wallet);
    setLoadingWallets((current) => new Set(current).add(wallet));
    try {
      const payload = await fakeNetworkApi(wallet);
      const next = new Map(payloadsRef.current); next.set(wallet, payload); payloadsRef.current = next; setPayloads(next);
      return payload;
    } finally {
      inFlightRef.current.delete(wallet);
      setLoadingWallets((current) => { const next = new Set(current); next.delete(wallet); return next; });
    }
  }, []);

  useEffect(() => { void loadPayload(AUTH_WALLET); }, [loadPayload]);
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage); window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches); sync(); media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setShowHint(false), 5000); return () => window.clearTimeout(timer); }, []);
  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => { setZoomLevel((current) => resolveZoomLevel(current, view.scale)); }, [view.scale]);
  useEffect(() => {
    if (!transitioningSlot) return;
    const timer = window.setTimeout(() => setTransitioningSlot(null), 900);
    return () => window.clearTimeout(timer);
  }, [transitioningSlot]);
  useEffect(() => {
    if (!inviteNotice) return;
    const timer = window.setTimeout(() => setInviteNotice(null), 2300);
    return () => window.clearTimeout(timer);
  }, [inviteNotice]);

  const rootPayload = payloads.get(viewedRoot) ?? null;
  const isOwnNetwork = viewedRoot === AUTH_WALLET;
  const filledSlotIds = useMemo(() => SERVER_SLOT_IDS.filter((id) => !availableSlotIds.includes(id)), [availableSlotIds]);
  const baseRootXs = useMemo(() => (rootPayload?.children ?? []).map((_, index) => ROOT.x + stableOffset(index) * DIRECT_GAP), [rootPayload]);
  const anchors = useMemo(() => SERVER_SLOT_IDS.map((id) => slotAnchor(id, baseRootXs)), [baseRootXs]);
  const availableAnchors = useMemo(() => anchors.filter((slot) => availableSlotIds.includes(slot.id)), [anchors, availableSlotIds]);
  const filledAnchors = useMemo(() => anchors.filter((slot) => filledSlotIds.includes(slot.id)), [anchors, filledSlotIds]);

  useEffect(() => {
    if (zoomLevel < 1 || !rootPayload) return;
    rootPayload.children.forEach((child) => { if (child.direct > 0) void loadPayload(child.wallet); });
  }, [loadPayload, rootPayload, zoomLevel]);

  const layout = useMemo(() => {
    const nodes = new Map<string, LayoutNode>();
    const summary = rootPayload?.summary ?? { network: 0, direct: 0, qualified: 0, depth: 0 };
    const ownExtra = isOwnNetwork ? filledSlotIds.length : 0;
    nodes.set(viewedRoot, {
      wallet: viewedRoot, parentWallet: null, status: 'REWARDED', joinedAt: '',
      network: summary.network + ownExtra, direct: summary.direct + ownExtra, qualified: summary.qualified,
      depth: summary.depth, x: ROOT.x, y: ROOT.y, localDepth: 0, branch: null,
    });

    const rootChildren = rootPayload?.children ?? [];
    rootChildren.forEach((child, index) => {
      nodes.set(child.wallet, { ...child, parentWallet: viewedRoot, x: ROOT.x + stableOffset(index) * DIRECT_GAP, y: 330, localDepth: 1, branch: child.wallet });
    });
    if (isOwnNetwork) {
      filledAnchors.forEach((slot) => {
        nodes.set(slot.wallet, {
          wallet: slot.wallet, parentWallet: viewedRoot, status: 'IN_PROGRESS', joinedAt: 'QA synthetic',
          network: 0, direct: 0, qualified: 0, depth: 1, x: slot.x, y: slot.y, localDepth: 1, branch: slot.wallet, synthetic: true,
        });
      });
    }

    if (zoomLevel === 0 || !rootChildren.length) return nodes;
    const baseBranchNodes = rootChildren.map((child) => nodes.get(child.wallet)!).filter(Boolean);
    const sortedBranches = [...baseBranchNodes].sort((a, b) => a.x - b.x);
    const maxDepth = zoomLevel === 1 ? 2 : zoomLevel === 2 ? 3 : 4;

    const placeChildren = (parent: LayoutNode, left: number, right: number, focused: boolean) => {
      if (parent.localDepth >= maxDepth) return;
      const payload = payloads.get(parent.wallet); if (!payload || !payload.children.length) return;
      const width = Math.max(44, right - left);
      const requestedCap = focused ? (zoomLevel === 1 ? 5 : zoomLevel === 2 ? 7 : 9) : 3;
      const capByWidth = Math.max(1, Math.floor((width - 18) / 48));
      const capacity = Math.max(1, Math.min(requestedCap, capByWidth));
      const children = payload.children.slice(0, capacity);
      const maxStep = Math.ceil(Math.max(0, capacity - 1) / 2);
      const gap = maxStep ? Math.min(focused ? 58 : 52, (width - 24) / (2 * maxStep)) : 0;
      const center = (left + right) / 2;
      const placed: LayoutNode[] = [];

      children.forEach((child, index) => {
        const x = clamp(center + stableOffset(index) * gap, left + 18, right - 18);
        const localDepth = parent.localDepth + 1;
        const next: LayoutNode = {
          ...child, parentWallet: parent.wallet, x, y: 330 + localDepth * 205,
          localDepth, branch: parent.branch ?? parent.wallet,
        };
        nodes.set(child.wallet, next); placed.push(next);
      });

      const byX = [...placed].sort((a, b) => a.x - b.x || a.wallet.localeCompare(b.wallet));
      byX.forEach((child, index) => {
        const childLeft = index === 0 ? left : (byX[index - 1].x + child.x) / 2 + 4;
        const childRight = index === byX.length - 1 ? right : (child.x + byX[index + 1].x) / 2 - 4;
        placeChildren(child, childLeft, childRight, focused);
      });
    };

    sortedBranches.forEach((branch, index) => {
      if (focusedBranch && focusedBranch !== branch.wallet) return;
      let left = index === 0 ? branch.x - DIRECT_GAP / 2 + 8 : (sortedBranches[index - 1].x + branch.x) / 2 + 8;
      let right = index === sortedBranches.length - 1 ? branch.x + DIRECT_GAP / 2 - 8 : (branch.x + sortedBranches[index + 1].x) / 2 - 8;
      const focused = focusedBranch === branch.wallet;
      if (focused) {
        left = Math.max(130, branch.x - 310);
        right = Math.min(WORLD_W - 130, branch.x + 310);
      }
      placeChildren(branch, left, right, focused);
    });
    return nodes;
  }, [filledAnchors, filledSlotIds.length, focusedBranch, isOwnNetwork, payloads, rootPayload, viewedRoot, zoomLevel]);

  const visibleNodes = useMemo(() => {
    const margin = 300;
    return [...layout.values()].filter((node) => {
      const sx = stageSize.width / 2 + view.x + (node.x - WORLD_W / 2) * view.scale;
      const sy = view.y + node.y * view.scale;
      return sx > -margin && sx < stageSize.width + margin && sy > -margin && sy < stageSize.height + margin;
    });
  }, [layout, stageSize.height, stageSize.width, view]);
  const visibleWallets = useMemo(() => new Set(visibleNodes.map((node) => node.wallet)), [visibleNodes]);
  const visibleEdges = useMemo(() => visibleNodes.flatMap((child) => {
    if (!child.parentWallet) return [];
    const parent = layout.get(child.parentWallet);
    return parent && visibleWallets.has(parent.wallet) ? [{ parent, child }] : [];
  }), [layout, visibleNodes, visibleWallets]);
  const crossingCount = useMemo(() => orderCrossings(visibleEdges), [visibleEdges]);
  const continuationNodes = useMemo(() => visibleNodes.filter((node) => {
    if (node.synthetic || node.direct <= 0) return false;
    const payload = payloads.get(node.wallet);
    if (!payload) return true;
    const visibleChildCount = payload.children.filter((child) => visibleWallets.has(child.wallet)).length;
    return node.direct > visibleChildCount || payload.children.some((child) => !visibleWallets.has(child.wallet));
  }), [payloads, visibleNodes, visibleWallets]);
  const selected = selectedWallet ? layout.get(selectedWallet) ?? null : null;
  const currentBreadcrumb = rootPayload?.breadcrumb ?? [viewedRoot];

  const focusNode = useCallback(async (wallet: string) => {
    const node = layout.get(wallet); if (!node || node.direct <= 0 || node.synthetic) return;
    setSelectedWallet(null); setShowHint(false); await loadPayload(wallet);
    const branch = node.localDepth === 1 ? node.wallet : node.branch;
    if (branch) setFocusedBranch(branch);
    const scale = Math.max(viewRef.current.scale, node.localDepth <= 1 ? 1.30 : 1.50);
    animateTo({ x: -(node.x - WORLD_W / 2) * scale, y: stageSize.height * .31 - node.y * scale, scale });
  }, [animateTo, layout, loadPayload, stageSize.height]);

  const reroot = useCallback(async (wallet: string) => {
    if (wallet === viewedRoot || !SERVER.accepted.has(wallet)) return;
    const payload = payloadsRef.current.get(wallet) ?? await loadPayload(wallet); if (!payload) return;
    setHistory((current) => [...current.slice(-6), { viewedRoot, view: viewRef.current }]);
    setViewedRoot(wallet); setSelectedWallet(null); setFocusedBranch(null); setZoomLevel(0); animateTo(ROOT_VIEW);
  }, [animateTo, loadPayload, viewedRoot]);
  const returnToYou = useCallback(async () => {
    await loadPayload(AUTH_WALLET);
    setViewedRoot(AUTH_WALLET); setHistory([]); setSelectedWallet(null); setFocusedBranch(null); setZoomLevel(0); animateTo(ROOT_VIEW);
  }, [animateTo, loadPayload]);
  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setViewedRoot(previous.viewedRoot); setSelectedWallet(null); setFocusedBranch(null); animateTo(previous.view);
      return current.slice(0, -1);
    });
  }, [animateTo]);

  const advanceSlots = () => {
    if (!isOwnNetwork) return;
    if (availableSlotIds.length === 0) { setAvailableSlotIds(SERVER_SLOT_IDS); setTransitioningSlot(null); return; }
    const nextToFill = FILL_SEQUENCE.find((id) => availableSlotIds.includes(id)); if (!nextToFill) return;
    setTransitioningSlot(nextToFill); setAvailableSlotIds((current) => current.filter((id) => id !== nextToFill));
  };
  const slotButtonLabel = availableSlotIds.length === 2 ? 'fill RIGHT' : availableSlotIds.length === 1 ? 'fill LEFT' : 'reset 2 slots';

  const zoomAround = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return;
    stopCamera(); setShowHint(false);
    const current = viewRef.current;
    const px = clientX - rect.left - rect.width / 2; const py = clientY - rect.top;
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (px - current.x) / current.scale; const worldY = (py - current.y) / current.scale;
    commitView({ scale, x: px - worldX * scale, y: py - worldY * scale });
  }, [commitView, stopCamera]);
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault(); zoomAround(event.clientX, event.clientY, viewRef.current.scale * clamp(Math.exp(-event.deltaY * .0018), .94, 1.06));
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
    const point = { x: event.clientX, y: event.clientY }; pointersRef.current.set(event.pointerId, { ...info, point });
    if (pointersRef.current.size === 1) {
      if (info.control) return;
      const previous = previousPointRef.current; if (!previous) { previousPointRef.current = point; return; }
      const current = viewRef.current; commitView({ ...current, x: current.x + point.x - previous.x, y: current.y + point.y - previous.y }); previousPointRef.current = point; return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((item) => item.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistanceRef.current) zoomAround((a.x + b.x) / 2, (a.y + b.y) / 2, viewRef.current.scale * (distance / pinchDistanceRef.current));
      pinchDistanceRef.current = distance;
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointersRef.current.get(event.pointerId); pointersRef.current.delete(event.pointerId);
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (info && !info.control && info.nodeWallet && pointersRef.current.size === 0) {
      const moved = Math.hypot(info.point.x - info.start.x, info.point.y - info.start.y); if (moved <= TAP_SLOP) setSelectedWallet(info.nodeWallet);
    }
    if (pointersRef.current.size === 1) { previousPointRef.current = [...pointersRef.current.values()][0].point; pinchDistanceRef.current = null; }
    else if (pointersRef.current.size === 0) { previousPointRef.current = null; pinchDistanceRef.current = null; }
  };

  const displayMembers = (rootPayload?.summary.network ?? 0) + (isOwnNetwork ? filledSlotIds.length : 0);

  return (
    <main className="qaPage">
      <section className="notice">
        <div><strong>NON-CROSSING SUBTREES · QA V15</strong><span>v14 누적 · parent-owned lanes · focus expansion · crossing guard</span></div>
        <div className="qaActions"><small className={crossingCount ? 'bad' : 'good'}>{crossingCount} crossings</small>{isOwnNetwork ? <button type="button" onClick={advanceSlots}>{slotButtonLabel}</button> : null}</div>
      </section>

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock"><span>NETWORK</span><h1>{isOwnNetwork ? 'My Network' : `${shortWallet(viewedRoot)} Network`}</h1></div>
          <div className="totals"><span className="metric"><b>{rootPayload ? displayMembers : '—'}</b><em>Members</em></span><i />{isOwnNetwork ? <span className="metric"><b>{availableSlotIds.length}</b><em>Open slots</em></span> : <span className="metric"><b>{rootPayload?.summary.direct ?? '—'}</b><em>Direct</em></span>}</div>
        </header>

        {!isOwnNetwork ? <div className="breadcrumb" data-network-control="true">{currentBreadcrumb.map((wallet, index) => <span key={wallet}><button type="button" onClick={() => void reroot(wallet)}>{index === 0 ? 'YOU' : shortWallet(wallet)}</button>{index < currentBreadcrumb.length - 1 ? <i>›</i> : null}</span>)}</div> : null}

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{loadingWallets.size ? 'Loading…' : zoomLevel === 0 ? '전체 구조' : focusedBranch ? '가지 집중' : zoomLevel === 1 ? '상세 보기' : '깊은 세대'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {focusedBranch ? <button type="button" className="clearFocus" data-network-control="true" onClick={() => setFocusedBranch(null)}>전체 가지 보기</button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>각 부모의 자식은 자기 구역 안에서만 펼쳐집니다.<br />더 많은 자식은 가지를 선택하면 넓게 펼쳐집니다.</span></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <linearGradient id="continuationFadeV15" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(222,209,176,.46)" /><stop offset="64%" stopColor="rgba(211,198,165,.22)" /><stop offset="100%" stopColor="rgba(211,198,165,0)" /></linearGradient>
                <filter id="slotGlowV15" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="5.5" /></filter>
                {isOwnNetwork && availableAnchors.map((slot, index) => {
                  const dx = slot.x - ROOT.x; const dy = slot.y - (ROOT.y + 44);
                  return <linearGradient key={slot.id} id={`slotFlow-${slot.id}`} gradientUnits="userSpaceOnUse" x1={ROOT.x} y1={ROOT.y + 44} x2={slot.x} y2={slot.y - 38}>
                    <stop offset="0" stopColor="rgba(250,200,74,0)" /><stop offset=".30" stopColor="rgba(250,200,74,0)" /><stop offset=".48" stopColor="rgba(250,200,74,.16)" /><stop offset=".56" stopColor="rgba(250,200,74,.62)" /><stop offset=".66" stopColor="rgba(250,200,74,.16)" /><stop offset=".84" stopColor="rgba(250,200,74,0)" /><stop offset="1" stopColor="rgba(250,200,74,0)" />
                    {!reduceMotion ? <animateTransform attributeName="gradientTransform" type="translate" values={`${-dx * .78} ${-dy * .78};${-dx * .78} ${-dy * .78};0 0;${dx * .78} ${dy * .78};${dx * .78} ${dy * .78}`} keyTimes="0;0.18;0.46;0.66;1" dur="8s" begin={`${index * 4}s`} repeatCount="indefinite" /> : null}
                  </linearGradient>;
                })}
              </defs>
              {visibleEdges.map(({ parent, child }) => <path key={`${parent.wallet}-${child.wallet}`} d={edgePath(parent, child)} className={`treeEdge depth${child.localDepth}`} vectorEffect="non-scaling-stroke" />)}
              {continuationNodes.map((node) => <path key={`tail-${node.wallet}`} d={continuationPath(node)} className="continuationTail" vectorEffect="non-scaling-stroke" />)}
              {isOwnNetwork && availableAnchors.map((slot) => <g key={`slot-${slot.id}`}><path d={slot.path} className="availableBase" vectorEffect="non-scaling-stroke" /><path d={slot.path} className="availableFlow" stroke={`url(#slotFlow-${slot.id})`} vectorEffect="non-scaling-stroke" /></g>)}
            </svg>

            {visibleNodes.map((node) => {
              const isRoot = node.wallet === viewedRoot; const loading = loadingWallets.has(node.wallet);
              return <button key={node.wallet} type="button" className={`person ${isRoot ? 'root' : 'child'} ${node.localDepth >= 2 ? 'mini' : ''} ${node.synthetic && transitioningSlot ? 'arriving' : ''}`} style={{ left: node.x, top: node.y }} data-node-wallet={node.wallet}><span className="avatar">●</span><b>{isRoot && node.wallet === AUTH_WALLET ? 'YOU' : shortWallet(node.wallet)}</b><small>{loading ? 'Loading…' : node.direct ? `${node.network} network · ${node.direct} direct` : node.synthetic ? 'New direct · same slot' : 'Leaf'}</small></button>;
            })}
            {isOwnNetwork && availableAnchors.map((slot, index) => <button key={slot.id} type="button" className="emptySlot" style={{ left: slot.x, top: slot.y }} data-network-control="true" onClick={() => setInviteNotice(`${slot.side === 'left' ? 'Left' : 'Right'} slot · 실제 앱에서는 친구 초대하기로 연결`)}><span className="slotAvatar" style={{ animationDelay: `${3.9 + index * 4}s` }}><i>+</i></span><b>Available</b><small>Invite slot</small></button>)}
          </div>

          {selected ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{selected.wallet === AUTH_WALLET ? 'YOU' : shortWallet(selected.wallet)}</strong><small>{selected.direct} direct · {selected.network} network</small></div><button type="button" onClick={() => setSelectedWallet(null)}>×</button></div><p>{selected.direct ? '이 노드 아래의 다음 세대는 부모 전용 구역 안에서만 펼쳐집니다.' : '현재 데이터 기준 더 아래 세대가 없는 leaf 노드입니다.'}</p>{selected.direct > 0 && !selected.synthetic ? <div className="cardActions"><button type="button" className="branchCta" onClick={() => void focusNode(selected.wallet)}>이 가지 펼치기</button>{selected.wallet !== viewedRoot ? <button type="button" className="networkCta" onClick={() => void reroot(selected.wallet)}>이 네트워크 보기</button> : null}</div> : null}</aside> : null}
          {inviteNotice ? <div className="inviteToast" role="status" data-network-control="true">{inviteNotice}</div> : null}

          <div className="controls" data-network-control="true"><button type="button" className="youButton" onClick={() => void returnToYou()}><span>◎</span><b>YOU</b></button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale + .16 })}>+</button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale - .16 })}>−</button></div>
        </div>
      </section>

      <section className="tips"><span><b>Parent-owned lanes</b>서로 다른 부모의 자식 영역을 섞지 않음</span><span><b>No forced crowding</b>공간이 부족하면 continuation을 남기고 일부만 표시</span><span><b>Crossing guard</b>현재 보이는 서로 다른 subtree의 순서 교차를 실시간 검사</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div:first-child{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.5rem}.qaActions{display:flex;align-items:center;gap:6px}.qaActions small.good{color:#769c6e}.qaActions small.bad{color:#d17a68}.qaActions button{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.16);border-radius:8px;background:rgba(244,183,40,.055);color:#c7a451;font-size:.45rem}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}.totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.42rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}.breadcrumb{min-height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;overflow:auto;border-bottom:1px solid rgba(255,255,255,.035)}.breadcrumb span{display:flex;align-items:center;gap:4px;flex:0 0 auto}.breadcrumb button{color:#817b72;font-size:.45rem}.breadcrumb span:last-child button{color:#c2b59a}.breadcrumb i{color:#4e4a43}.stage{position:relative;height:clamp(570px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 19%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 90%)}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform;transition:none}.world.cameraMoving{transition:transform .46s cubic-bezier(.2,.72,.25,1)}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.treeEdge{fill:none;stroke:rgba(211,198,165,.31);stroke-width:1.05;stroke-linecap:round;stroke-linejoin:round}.treeEdge.depth2{stroke:rgba(211,198,165,.27);stroke-width:.96}.treeEdge.depth3{stroke:rgba(211,198,165,.21);stroke-width:.88}.treeEdge.depth4{stroke:rgba(211,198,165,.17);stroke-width:.8}.continuationTail{fill:none;stroke:url(#continuationFadeV15);stroke-width:1.13;stroke-linecap:round}.availableBase{fill:none;stroke:rgba(244,183,40,.085);stroke-width:.85;stroke-linecap:round}.availableFlow{fill:none;stroke-width:2.7;stroke-linecap:round;filter:url(#slotGlowV15);opacity:.9}.person,.emptySlot{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;border:0;background:transparent;text-align:center;white-space:nowrap;touch-action:none}.person{min-width:86px;color:#d8d2c7}.person .avatar{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.28);border-radius:50%;background:#11100d;color:#d9b34f;font-size:.6rem;box-shadow:0 5px 22px rgba(0,0,0,.32)}.person.root .avatar{width:48px;height:48px;border-color:rgba(244,183,40,.5);background:#15130d}.person.mini .avatar{width:35px;height:35px}.person b{font-size:.49rem}.person small{color:#746f67;font-size:.4rem}.person.arriving{animation:memberArrive .9s ease-out}.emptySlot{min-width:68px;opacity:.72;color:#a79a79}.slotAvatar{width:32px;height:32px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.25);border-radius:50%;background:rgba(244,183,40,.018);animation:slotBreath 8s ease-in-out infinite}.slotAvatar i{font-style:normal;color:#a88d4a;font-size:.78rem}.emptySlot b{font-size:.43rem}.emptySlot small{font-size:.36rem;color:#5e594f}.hud{position:absolute;z-index:8;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.82)}.hud span,.hud small{font-size:.43rem;color:#817a70}.backNetwork,.clearFocus{position:absolute;z-index:9;top:42px;height:29px;padding:0 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(12,12,9,.9);color:#a7a095;font-size:.48rem}.backNetwork{left:10px}.clearFocus{right:10px}.gestureHint{position:absolute;z-index:8;left:50%;top:82px;transform:translateX(-50%);display:flex;gap:7px;width:max-content;max-width:82%;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:11px;background:rgba(12,12,9,.88);pointer-events:none;animation:hintOut 5s forwards}.gestureHint b{color:#c8a04a}.gestureHint span{color:#817a70;font-size:.44rem;line-height:1.45}.slotCard{position:absolute;z-index:12;left:10px;right:10px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 54px));padding:10px;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:rgba(14,14,11,.96)}.slotCard>div:first-child{display:flex;align-items:center;gap:8px}.cardAvatar{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.24);border-radius:50%;color:#c9a54d}.slotCard>div>div{display:grid;gap:2px;flex:1}.slotCard strong{font-size:.58rem}.slotCard small{color:#736d64;font-size:.43rem}.slotCard>div>button{width:28px;height:28px;color:#8b8478}.slotCard p{margin:8px 0;color:#8a8378;font-size:.46rem;line-height:1.45}.cardActions{display:flex;gap:6px}.cardActions button{flex:1;height:31px;border-radius:9px;font-size:.47rem}.branchCta{border:1px solid rgba(244,183,40,.16);background:rgba(244,183,40,.07);color:#d1ad55}.networkCta{border:1px solid rgba(255,255,255,.065);background:#12110e;color:#aaa296}.inviteToast{position:absolute;z-index:13;left:50%;bottom:max(86px,calc(env(safe-area-inset-bottom) + 68px));transform:translateX(-50%);max-width:82%;padding:8px 10px;border:1px solid rgba(244,183,40,.12);border-radius:10px;background:rgba(16,15,11,.96);color:#b6a77f;font-size:.45rem;white-space:nowrap}.controls{position:absolute;z-index:10;right:10px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 54px));display:grid;gap:6px;justify-items:end}.controls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(13,13,10,.9);color:#bcb3a5;font-size:.75rem}.controls .youButton{width:auto;min-width:58px;padding:0 9px;display:flex;align-items:center;justify-content:center;gap:5px;border-color:rgba(244,183,40,.12);color:#ceb668}.youButton b{font-size:.48rem}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{padding:8px 7px;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#0c0c0a;color:#6f6961;font-size:.45rem;line-height:1.35;text-align:center}.tips b{display:block;margin-bottom:2px;color:#a79d8d;font-size:.48rem}@keyframes slotBreath{0%,42%,100%{box-shadow:0 0 0 rgba(244,183,40,0);border-color:rgba(244,183,40,.25)}52%{box-shadow:0 0 13px rgba(244,183,40,.11);border-color:rgba(244,183,40,.38)}}@keyframes memberArrive{0%{opacity:.18;transform:translate(-50%,-50%) scale(.82)}55%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}100%{transform:translate(-50%,-50%) scale(1)}}@keyframes hintOut{0%,78%{opacity:1}100%{opacity:0}}@media(max-width:430px){.notice{align-items:flex-start}.qaActions small{display:none}.topBar{padding:8px 11px}.metric em{font-size:.39rem}.stage{height:clamp(570px,73svh,700px)}.controls .zoomControl{display:none}.tips{grid-template-columns:1fr}.tips span{padding:6px}.inviteToast{white-space:normal;text-align:center}}@media(prefers-reduced-motion:reduce){.gestureHint,.slotAvatar,.person.arriving{animation:none}.world.cameraMoving{transition:none}}
      `}</style>
    </main>
  );
}

export default QaNetworkEmptyStateV15;
