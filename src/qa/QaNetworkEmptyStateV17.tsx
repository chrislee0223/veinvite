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

import { useWalletAuthentication } from '@/hooks/useWalletAuthentication';
import { useWalletLauncher } from '@/components/WalletControl';

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Status = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type ApiChild = {
  wallet: string;
  status: Status;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};
type ApiPayload = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    qualified: number;
    thisRound: number | null;
    depth: number;
  };
  round: { id: number; startAt: string; endAt: string } | null;
  children: ApiChild[];
  depthLimitReached: boolean;
};
type SlotState = 'AVAILABLE' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
type SlotId = 1 | 2;
type SlotStatus = { slot: number; state: SlotState; inviteeWallet: string | null };
type SlotAvailability = {
  limit: number;
  slotsAvailable: number;
  availableSlotIds: number[];
  occupiedSlotIds: number[];
  slots: SlotStatus[];
};
type ReferralLinkPayload = {
  referralLink: { key: string; createdAt: string; slotsAvailable: number } | null;
  slotAvailability: SlotAvailability;
};
type LayoutNode = ApiChild & {
  parentWallet: string | null;
  x: number;
  y: number;
  localDepth: number;
  branch: string | null;
};
type Edge = { parent: LayoutNode; child: LayoutNode };
type PointerInfo = { point: Point; start: Point; nodeWallet: string | null; control: boolean };
type NavEntry = { viewedRoot: string; view: View };
type SlotAnchor = { id: SlotId; side: 'left' | 'right'; x: number; y: number; path: string };
type LaneZone = { owner: string; depth: number; left: number; right: number; branch: string | null };
type LayoutResult = { nodes: Map<string, LayoutNode>; zones: LaneZone[] };

const WORLD_W = 1540;
const WORLD_H = 1840;
const ROOT = { x: WORLD_W / 2, y: 128 };
const ROOT_VIEW: View = { x: 0, y: 52, scale: 0.82 };
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.84;
const TAP_SLOP = 9;
const DIRECT_GAP = 190;
const SLOT_GAP = 150;
const ROOT_CAPS = [5, 7, 9, 9] as const;
const SLOT_IDS: SlotId[] = [1, 2];
const REFRESH_MIN_MS = 15_000;

const ZOOM = {
  detailIn: 1.13,
  detailOut: 1.03,
  deepIn: 1.43,
  deepOut: 1.31,
  ultraIn: 1.66,
  ultraOut: 1.54,
};

function keyWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}
function validWallet(wallet: string) {
  return /^0x[0-9a-f]{40}$/.test(keyWallet(wallet));
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function shortWallet(wallet: string, authWallet: string) {
  return keyWallet(wallet) === keyWallet(authWallet) ? 'YOU' : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
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

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null);
  if (value === null) throw new Error(`VeInvite returned an invalid response (${response.status}).`);
  return value as T;
}

async function fetchNetworkApi(rootWallet: string, focusWallet: string): Promise<ApiPayload> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (keyWallet(focusWallet) !== keyWallet(rootWallet)) params.set('focus', focusWallet);
  const response = await fetch(`/api/network?${params.toString()}`, {
    method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  const payload = await readJson<ApiPayload | { error?: string; code?: string }>(response);
  if (!response.ok) {
    const message = 'error' in payload && payload.error ? payload.error : `Network request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!('rootWallet' in payload) || !payload.rootWallet || !payload.focusWallet || !payload.summary || !Array.isArray(payload.children)) {
    throw new Error('Network response was incomplete.');
  }
  return {
    ...payload,
    rootWallet: keyWallet(payload.rootWallet),
    focusWallet: keyWallet(payload.focusWallet),
    breadcrumb: Array.isArray(payload.breadcrumb) ? payload.breadcrumb.map(keyWallet) : [keyWallet(payload.focusWallet)],
    children: payload.children.map((child) => ({ ...child, wallet: keyWallet(child.wallet) })),
  };
}

async function fetchSlotApi(rootWallet: string): Promise<ReferralLinkPayload> {
  const params = new URLSearchParams({ inviter: rootWallet });
  const response = await fetch(`/api/referral-links?${params.toString()}`, {
    method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  const payload = await readJson<ReferralLinkPayload | { error?: string }>(response);
  if (!response.ok) {
    const message = 'error' in payload && payload.error ? payload.error : `Invite-slot request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!('slotAvailability' in payload) || !payload.slotAvailability || !Array.isArray(payload.slotAvailability.slots)) {
    throw new Error('Invite-slot response was incomplete.');
  }
  return payload;
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
  const side = id === 1 ? 'left' : 'right';
  const x = side === 'left' ? minMember - SLOT_GAP : maxMember + SLOT_GAP;
  const bend = side === 'left' ? -58 : 58;
  const y = 330;
  return {
    id, side, x, y,
    path: `M${ROOT.x} ${ROOT.y + 44} C${ROOT.x + bend} 202 ${x - bend * .45} 234 ${x} ${y - 38}`,
  };
}
function segmentsCross(a: Edge, b: Edge) {
  if (a.parent.wallet === b.parent.wallet || a.child.wallet === b.child.wallet) return false;
  const a1 = { x: a.parent.x, y: a.parent.y + 62 };
  const a2 = { x: a.child.x, y: a.child.y - 37 };
  const b1 = { x: b.parent.x, y: b.parent.y + 62 };
  const b2 = { x: b.child.x, y: b.child.y - 37 };
  const orient = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a1, a2, b1); const o2 = orient(a1, a2, b2); const o3 = orient(b1, b2, a1); const o4 = orient(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
function layoutConflicts(edges: Edge[], zones: LaneZone[]) {
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length; j += 1) if (segmentsCross(edges[i], edges[j])) count += 1;
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i]; const b = zones[j];
      if (a.depth !== b.depth || a.owner === b.owner || a.branch === b.branch) continue;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) count += 1;
    }
  }
  return count;
}

export function QaNetworkEmptyStateV17() {
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const { ensureWalletSession, isAuthenticating } = useWalletAuthentication();
  const authWallet = wallet && validWallet(wallet) ? keyWallet(wallet) : '';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const previousPointRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const viewRef = useRef<View>(ROOT_VIEW);
  const pendingViewRef = useRef<View | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const payloadsRef = useRef<Map<string, ApiPayload>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<ApiPayload>>>(new Map());
  const slotAvailabilityRef = useRef<SlotAvailability | null>(null);
  const slotInFlightRef = useRef<Promise<ReferralLinkPayload> | null>(null);
  const bootstrapSerialRef = useRef(0);
  const lastRefreshRef = useRef(0);

  const [stageSize, setStageSize] = useState({ width: 390, height: 650 });
  const [view, setView] = useState<View>(ROOT_VIEW);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [viewedRoot, setViewedRoot] = useState('');
  const [payloads, setPayloads] = useState<Map<string, ApiPayload>>(() => new Map());
  const [loadingWallets, setLoadingWallets] = useState<Set<string>>(() => new Set());
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [history, setHistory] = useState<NavEntry[]>([]);
  const [showHint, setShowHint] = useState(true);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);
  const [slotAvailability, setSlotAvailability] = useState<SlotAvailability | null>(null);
  const [referralKey, setReferralKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [authError, setAuthError] = useState('');
  const [booting, setBooting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [recentArrivalWallet, setRecentArrivalWallet] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(360, WORLD_W * scale * .68);
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

  const loadPayload = useCallback((focusWallet: string, force = false): Promise<ApiPayload> => {
    if (!authWallet) return Promise.reject(new Error('Connect a wallet first.'));
    const focus = keyWallet(focusWallet || authWallet);
    const cached = payloadsRef.current.get(focus);
    if (cached && !force) return Promise.resolve(cached);
    const requestKey = `${authWallet}:${focus}`;
    const existing = inFlightRef.current.get(requestKey);
    if (existing) return existing;
    setLoadingWallets((current) => new Set(current).add(focus));
    const request = fetchNetworkApi(authWallet, focus)
      .then((payload) => {
        const next = new Map(payloadsRef.current); next.set(focus, payload); payloadsRef.current = next; setPayloads(next); setLoadError('');
        return payload;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load network.';
        setLoadError(message);
        throw error;
      })
      .finally(() => {
        inFlightRef.current.delete(requestKey);
        setLoadingWallets((current) => { const next = new Set(current); next.delete(focus); return next; });
      });
    inFlightRef.current.set(requestKey, request);
    return request;
  }, [authWallet]);

  const loadSlots = useCallback((force = false): Promise<ReferralLinkPayload> => {
    if (!authWallet) return Promise.reject(new Error('Connect a wallet first.'));
    if (slotInFlightRef.current) return slotInFlightRef.current;
    if (!force && slotAvailabilityRef.current) {
      return Promise.resolve({ referralLink: referralKey ? { key: referralKey, createdAt: '', slotsAvailable: slotAvailabilityRef.current.slotsAvailable } : null, slotAvailability: slotAvailabilityRef.current });
    }
    const request = fetchSlotApi(authWallet)
      .then((payload) => {
        const previous = slotAvailabilityRef.current;
        const next = payload.slotAvailability;
        if (previous) {
          for (const slot of next.slots) {
            const prior = previous.slots.find((item) => item.slot === slot.slot);
            if (prior?.state === 'AVAILABLE' && slot.state !== 'AVAILABLE' && slot.inviteeWallet) {
              setRecentArrivalWallet(keyWallet(slot.inviteeWallet));
            }
          }
        }
        slotAvailabilityRef.current = next;
        setSlotAvailability(next);
        setReferralKey(payload.referralLink?.key ?? null);
        setSlotError('');
        return payload;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load invite slots.';
        setSlotError(message);
        throw error;
      })
      .finally(() => { slotInFlightRef.current = null; });
    slotInFlightRef.current = request;
    return request;
  }, [authWallet, referralKey]);

  const refreshData = useCallback(async (forceFocus = viewedRoot || authWallet) => {
    if (!authWallet) return;
    lastRefreshRef.current = Date.now();
    await Promise.allSettled([
      loadPayload(forceFocus || authWallet, true),
      loadSlots(true),
    ]);
  }, [authWallet, loadPayload, loadSlots, viewedRoot]);

  useEffect(() => {
    const serial = bootstrapSerialRef.current + 1;
    bootstrapSerialRef.current = serial;
    payloadsRef.current = new Map(); setPayloads(new Map()); inFlightRef.current.clear();
    slotAvailabilityRef.current = null; setSlotAvailability(null); setReferralKey(null);
    setLoadError(''); setSlotError(''); setAuthError(''); setSelectedWallet(null); setFocusedBranch(null); setHistory([]); setZoomLevel(0); animateTo(ROOT_VIEW);
    if (!authWallet) { setViewedRoot(''); setBooting(false); return; }
    setViewedRoot(authWallet); setBooting(true);
    void (async () => {
      try {
        await ensureWalletSession(authWallet);
        if (bootstrapSerialRef.current !== serial) return;
        lastRefreshRef.current = Date.now();
        await Promise.allSettled([loadPayload(authWallet, true), loadSlots(true)]);
      } catch (error) {
        if (bootstrapSerialRef.current !== serial) return;
        setAuthError(error instanceof Error ? error.message : 'Wallet verification failed.');
      } finally {
        if (bootstrapSerialRef.current === serial) setBooting(false);
      }
    })();
  }, [authWallet, animateTo, ensureWalletSession, loadPayload, loadSlots]);

  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 390, height: stage.clientHeight || 650 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage); window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, [authWallet]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches); sync(); media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setShowHint(false), 5000); return () => window.clearTimeout(timer); }, [authWallet]);
  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);
  useEffect(() => { setZoomLevel((current) => resolveZoomLevel(current, view.scale)); }, [view.scale]);
  useEffect(() => {
    if (!inviteNotice) return;
    const timer = window.setTimeout(() => setInviteNotice(null), 2300);
    return () => window.clearTimeout(timer);
  }, [inviteNotice]);
  useEffect(() => {
    if (!recentArrivalWallet) return;
    const timer = window.setTimeout(() => setRecentArrivalWallet(null), 1200);
    return () => window.clearTimeout(timer);
  }, [recentArrivalWallet]);
  useEffect(() => {
    if (!authWallet) return;
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < REFRESH_MIN_MS) return;
      void refreshData(authWallet);
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('veinvite-referral-updated', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('veinvite-referral-updated', onReturn);
    };
  }, [authWallet, refreshData]);

  const rootPayload = viewedRoot ? payloads.get(viewedRoot) ?? null : null;
  const isOwnNetwork = Boolean(authWallet && viewedRoot === authWallet);
  const rootRenderCap = ROOT_CAPS[zoomLevel] ?? ROOT_CAPS[ROOT_CAPS.length - 1];
  const slotByWallet = useMemo(() => {
    const map = new Map<string, SlotId>();
    if (!isOwnNetwork || !slotAvailability) return map;
    slotAvailability.slots.forEach((slot) => {
      if ((slot.slot === 1 || slot.slot === 2) && slot.state !== 'AVAILABLE' && slot.inviteeWallet) map.set(keyWallet(slot.inviteeWallet), slot.slot);
    });
    return map;
  }, [isOwnNetwork, slotAvailability]);
  const rootVisibleChildren = useMemo(() => {
    const all = rootPayload?.children ?? [];
    if (!isOwnNetwork) return all.slice(0, rootRenderCap);
    const ordinary = all.filter((child) => !slotByWallet.has(keyWallet(child.wallet))).slice(0, rootRenderCap);
    const slotMembers = all.filter((child) => slotByWallet.has(keyWallet(child.wallet)));
    const seen = new Set<string>();
    return [...ordinary, ...slotMembers].filter((child) => {
      const key = keyWallet(child.wallet); if (seen.has(key)) return false; seen.add(key); return true;
    });
  }, [isOwnNetwork, rootPayload, rootRenderCap, slotByWallet]);
  const ordinaryRootChildren = useMemo(() => rootVisibleChildren.filter((child) => !slotByWallet.has(keyWallet(child.wallet))), [rootVisibleChildren, slotByWallet]);
  const ordinaryRootX = useMemo(() => new Map(ordinaryRootChildren.map((child, index) => [keyWallet(child.wallet), ROOT.x + stableOffset(index) * DIRECT_GAP])), [ordinaryRootChildren]);
  const baseRootXs = useMemo(() => ordinaryRootChildren.map((child) => ordinaryRootX.get(keyWallet(child.wallet)) ?? ROOT.x), [ordinaryRootChildren, ordinaryRootX]);
  const anchors = useMemo(() => SLOT_IDS.map((id) => slotAnchor(id, baseRootXs)), [baseRootXs]);
  const anchorById = useMemo(() => new Map(anchors.map((anchor) => [anchor.id, anchor])), [anchors]);
  const availableAnchors = useMemo(() => {
    if (!isOwnNetwork || !slotAvailability) return [];
    const ids = new Set(slotAvailability.availableSlotIds);
    return anchors.filter((anchor) => ids.has(anchor.id));
  }, [anchors, isOwnNetwork, slotAvailability]);
  const pendingAnchors = useMemo(() => {
    if (!isOwnNetwork || !slotAvailability || !rootPayload) return [] as Array<{ anchor: SlotAnchor; state: SlotState }>;
    const childWallets = new Set(rootPayload.children.map((child) => keyWallet(child.wallet)));
    return slotAvailability.slots.flatMap((slot) => {
      if (slot.state === 'AVAILABLE' || (slot.slot !== 1 && slot.slot !== 2)) return [];
      if (slot.inviteeWallet && childWallets.has(keyWallet(slot.inviteeWallet))) return [];
      const anchor = anchorById.get(slot.slot); return anchor ? [{ anchor, state: slot.state }] : [];
    });
  }, [anchorById, isOwnNetwork, rootPayload, slotAvailability]);

  useEffect(() => {
    if (zoomLevel < 1 || !rootPayload || !rootVisibleChildren.length) return;
    if (focusedBranch) {
      const child = rootVisibleChildren.find((item) => keyWallet(item.wallet) === focusedBranch);
      if (child?.direct) void loadPayload(child.wallet).catch(() => undefined);
      return;
    }
    const centerWorldX = ROOT.x - view.x / Math.max(view.scale, .01);
    const candidate = rootVisibleChildren
      .map((child) => {
        const slotId = slotByWallet.get(keyWallet(child.wallet));
        const x = slotId ? anchorById.get(slotId)?.x ?? ROOT.x : ordinaryRootX.get(keyWallet(child.wallet)) ?? ROOT.x;
        return { child, x };
      })
      .filter(({ child }) => child.direct > 0)
      .sort((a, b) => Math.abs(a.x - centerWorldX) - Math.abs(b.x - centerWorldX))[0]?.child;
    if (candidate) void loadPayload(candidate.wallet).catch(() => undefined);
  }, [anchorById, focusedBranch, loadPayload, ordinaryRootX, rootPayload, rootVisibleChildren, slotByWallet, view.scale, view.x, zoomLevel]);

  const layoutResult = useMemo<LayoutResult>(() => {
    const nodes = new Map<string, LayoutNode>();
    const zones: LaneZone[] = [];
    if (!viewedRoot) return { nodes, zones };
    const summary = rootPayload?.summary ?? { network: 0, direct: 0, qualified: 0, thisRound: null, depth: 0 };
    nodes.set(viewedRoot, {
      wallet: viewedRoot, parentWallet: null, status: 'REWARDED', joinedAt: null,
      network: summary.network, direct: summary.direct, qualified: summary.qualified, thisRound: summary.thisRound,
      depth: summary.depth, x: ROOT.x, y: ROOT.y, localDepth: 0, branch: null,
    });

    rootVisibleChildren.forEach((child) => {
      const slotId = slotByWallet.get(keyWallet(child.wallet));
      const anchor = slotId ? anchorById.get(slotId) : null;
      const x = anchor?.x ?? ordinaryRootX.get(keyWallet(child.wallet)) ?? ROOT.x;
      nodes.set(keyWallet(child.wallet), { ...child, wallet: keyWallet(child.wallet), parentWallet: viewedRoot, x, y: 330, localDepth: 1, branch: keyWallet(child.wallet) });
    });

    if (zoomLevel === 0 || !rootVisibleChildren.length) return { nodes, zones };
    const maxDepth = zoomLevel === 1 ? 2 : zoomLevel === 2 ? 3 : 4;
    const baseBranches = rootVisibleChildren.map((child) => nodes.get(keyWallet(child.wallet))!).filter(Boolean).sort((a, b) => a.x - b.x);

    const placeChildren = (parent: LayoutNode, center: number, halfWidth: number, focused: boolean) => {
      if (parent.localDepth >= maxDepth) return;
      const payload = payloads.get(parent.wallet); if (!payload || !payload.children.length) return;
      const reserveCap = focused ? 9 : 3;
      const visibleCap = focused ? (zoomLevel === 1 ? 5 : zoomLevel === 2 ? 7 : 9) : 3;
      const slotSpan = Math.max(42, Math.min(focused ? 68 : 56, (halfWidth * 2 - 16) / reserveCap));
      const capacityByZone = Math.max(1, Math.min(reserveCap, Math.floor((halfWidth * 2 - 12) / slotSpan)));
      const children = payload.children.slice(0, Math.min(visibleCap, capacityByZone));
      zones.push({ owner: parent.wallet, depth: parent.localDepth + 1, left: center - halfWidth, right: center + halfWidth, branch: parent.branch });
      children.forEach((child, index) => {
        const x = clamp(center + stableOffset(index) * slotSpan, center - halfWidth + 18, center + halfWidth - 18);
        const localDepth = parent.localDepth + 1;
        const walletKey = keyWallet(child.wallet);
        const next: LayoutNode = { ...child, wallet: walletKey, parentWallet: parent.wallet, x, y: 330 + localDepth * 205, localDepth, branch: parent.branch ?? parent.wallet };
        nodes.set(walletKey, next);
        placeChildren(next, x, Math.max(22, slotSpan / 2 - 4), focused);
      });
    };

    baseBranches.forEach((branch) => {
      if (focusedBranch && focusedBranch !== branch.wallet) return;
      const focused = focusedBranch === branch.wallet;
      const halfWidth = focused ? Math.min(310, branch.x - 130, WORLD_W - branch.x - 130) : DIRECT_GAP / 2 - 12;
      placeChildren(branch, branch.x, Math.max(56, halfWidth), focused);
    });
    return { nodes, zones };
  }, [anchorById, focusedBranch, ordinaryRootX, payloads, rootPayload, rootVisibleChildren, slotByWallet, viewedRoot, zoomLevel]);

  const layout = layoutResult.nodes;
  const visibleNodes = useMemo(() => {
    const margin = 300;
    return [...layout.values()].filter((node) => {
      const sx = stageSize.width / 2 + view.x + (node.x - WORLD_W / 2) * view.scale;
      const sy = view.y + node.y * view.scale;
      return sx > -margin && sx < stageSize.width + margin && sy > -margin && sy < stageSize.height + margin;
    });
  }, [layout, stageSize.height, stageSize.width, view]);
  const visibleWallets = useMemo(() => new Set(visibleNodes.map((node) => node.wallet)), [visibleNodes]);
  const semanticChildrenByParent = useMemo(() => {
    const counts = new Map<string, number>();
    layout.forEach((node) => { if (node.parentWallet) counts.set(node.parentWallet, (counts.get(node.parentWallet) ?? 0) + 1); });
    return counts;
  }, [layout]);
  const allSemanticEdges = useMemo(() => [...layout.values()].flatMap((child) => {
    if (!child.parentWallet) return [];
    const parent = layout.get(child.parentWallet);
    return parent ? [{ parent, child }] : [];
  }), [layout]);
  const visibleEdges = useMemo(() => allSemanticEdges.filter(({ parent, child }) => visibleWallets.has(parent.wallet) && visibleWallets.has(child.wallet)), [allSemanticEdges, visibleWallets]);
  const conflictCount = useMemo(() => layoutConflicts(allSemanticEdges, layoutResult.zones), [allSemanticEdges, layoutResult.zones]);
  const continuationNodes = useMemo(() => visibleNodes.filter((node) => {
    if (node.direct <= 0) return false;
    const payload = payloads.get(node.wallet);
    if (!payload) return true;
    const semanticCount = semanticChildrenByParent.get(node.wallet) ?? 0;
    return semanticCount < node.direct;
  }), [payloads, semanticChildrenByParent, visibleNodes]);
  const selected = selectedWallet ? layout.get(selectedWallet) ?? null : null;
  const currentBreadcrumb = rootPayload?.breadcrumb ?? (viewedRoot ? [authWallet, viewedRoot].filter(Boolean) : []);

  const focusNode = useCallback(async (walletToFocus: string) => {
    const node = layout.get(walletToFocus); if (!node || node.direct <= 0) return;
    setSelectedWallet(null); setShowHint(false);
    try {
      await loadPayload(walletToFocus);
      const branch = node.localDepth === 1 ? node.wallet : node.branch;
      if (branch) setFocusedBranch(branch);
      const scale = Math.max(viewRef.current.scale, node.localDepth <= 1 ? 1.30 : 1.50);
      animateTo({ x: -(node.x - WORLD_W / 2) * scale, y: stageSize.height * .31 - node.y * scale, scale });
    } catch {}
  }, [animateTo, layout, loadPayload, stageSize.height]);
  const reroot = useCallback(async (walletToView: string) => {
    const walletKey = keyWallet(walletToView);
    if (!authWallet || walletKey === viewedRoot) return;
    try {
      await loadPayload(walletKey);
      setHistory((current) => [...current.slice(-6), { viewedRoot, view: viewRef.current }]);
      setViewedRoot(walletKey); setSelectedWallet(null); setFocusedBranch(null); setZoomLevel(0); animateTo(ROOT_VIEW);
    } catch {}
  }, [animateTo, authWallet, loadPayload, viewedRoot]);
  const returnToYou = useCallback(async () => {
    if (!authWallet) return;
    try { await loadPayload(authWallet); } catch {}
    setViewedRoot(authWallet); setHistory([]); setSelectedWallet(null); setFocusedBranch(null); setZoomLevel(0); animateTo(ROOT_VIEW);
  }, [animateTo, authWallet, loadPayload]);
  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setViewedRoot(previous.viewedRoot); setSelectedWallet(null); setFocusedBranch(null); animateTo(previous.view);
      return current.slice(0, -1);
    });
  }, [animateTo]);

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

  const hiddenRootDirect = Math.max(0, (rootPayload?.summary.direct ?? 0) - rootVisibleChildren.length);
  const slotCount = isOwnNetwork ? slotAvailability?.slotsAvailable : null;
  const loading = booting || isAuthenticating;

  if (!authWallet) {
    return (
      <main className="qaPage">
        <section className="notice"><div><strong>LIVE DATA REHEARSAL · QA V17</strong><span>v16 누적 · 실제 /api/network + 정확한 invite slot ID</span></div></section>
        <section className="connectCard"><span>NETWORK</span><h1>Connect your wallet</h1><p>실제 VeInvite 네트워크 데이터를 불러오기 위해 지갑 연결이 필요합니다.</p><button type="button" onClick={openWallet} disabled={isWalletActionPending}>{isWalletActionPending ? 'Opening…' : 'Connect wallet'}</button></section>
        <style jsx>{`.qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.connectCard{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035)}.notice div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span{color:#7f786d;font-size:.5rem}.connectCard{margin-top:80px;padding:26px;border:1px solid rgba(255,255,255,.06);border-radius:20px;background:#0b0b09;text-align:center}.connectCard>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.connectCard h1{margin:8px 0;font-size:1.1rem}.connectCard p{margin:0 auto 18px;max-width:330px;color:#827c72;font-size:.7rem;line-height:1.6}.connectCard button{height:40px;padding:0 16px;border:1px solid rgba(244,183,40,.2);border-radius:11px;background:rgba(244,183,40,.08);color:#d1ad54;font-size:.65rem}`}</style>
      </main>
    );
  }

  return (
    <main className="qaPage">
      <section className="notice">
        <div><strong>LIVE DATA REHEARSAL · QA V17</strong><span>v16 누적 · actual /api/network · server slot identity · stale-data recovery</span></div>
        <div className="qaActions"><small className={conflictCount ? 'bad' : 'good'}>{conflictCount} layout conflicts</small>{hiddenRootDirect ? <small>{hiddenRootDirect} root hidden</small> : null}<small className="live">LIVE API</small><button type="button" onClick={() => void refreshData()} disabled={loading}>↻ refresh</button></div>
      </section>

      {authError ? <section className="errorStrip"><span>{authError}</span><button type="button" onClick={() => void ensureWalletSession(authWallet).then(() => refreshData(authWallet)).catch((error: unknown) => setAuthError(error instanceof Error ? error.message : 'Wallet verification failed.'))}>Verify & retry</button></section> : null}
      {(loadError || slotError) && rootPayload ? <section className="staleStrip"><span>{loadError || slotError} · 기존 데이터는 유지했습니다.</span><button type="button" onClick={() => void refreshData()}>Retry</button></section> : null}

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock"><span>NETWORK</span><h1>{isOwnNetwork ? 'My Network' : `${shortWallet(viewedRoot, authWallet)} Network`}</h1></div>
          <div className="totals"><span className="metric"><b>{rootPayload ? rootPayload.summary.network : '—'}</b><em>Members</em></span><i />{isOwnNetwork ? <span className="metric"><b>{slotCount ?? '—'}</b><em>Open slots</em></span> : <span className="metric"><b>{rootPayload?.summary.direct ?? '—'}</b><em>Direct</em></span>}</div>
        </header>

        {!isOwnNetwork && currentBreadcrumb.length ? <div className="breadcrumb" data-network-control="true">{currentBreadcrumb.map((crumb, index) => <span key={`${crumb}-${index}`}><button type="button" onClick={() => void reroot(crumb)}>{index === 0 ? 'YOU' : shortWallet(crumb, authWallet)}</button>{index < currentBreadcrumb.length - 1 ? <i>›</i> : null}</span>)}</div> : null}

        <div ref={stageRef} className="stage" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}>
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true"><span>{loadingWallets.size || booting ? 'Loading…' : zoomLevel === 0 ? '전체 구조' : focusedBranch ? '가지 집중' : zoomLevel === 1 ? '상세 보기' : '깊은 세대'}</span><small>{Math.round(view.scale * 100)}%</small></div>
          {history.length ? <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button> : null}
          {focusedBranch ? <button type="button" className="clearFocus" data-network-control="true" onClick={() => setFocusedBranch(null)}>전체 가지 보기</button> : null}
          {showHint ? <div className="gestureHint" data-network-control="true"><b>↗</b><span>실제 네트워크 데이터를 사용합니다.<br />하위 세대는 필요한 가지부터 불러옵니다.</span></div> : null}

          {!rootPayload && !loading ? <div className="emptyLoad" data-network-control="true"><b>{loadError || authError || 'Network data is unavailable.'}</b><button type="button" onClick={() => void refreshData(authWallet)}>Retry</button></div> : null}

          <div className={`world ${cameraMoving ? 'cameraMoving' : ''}`} style={{ width: WORLD_W, height: WORLD_H, marginLeft: -WORLD_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
            <svg className="edges" width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <linearGradient id="continuationFadeV17" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(222,209,176,.46)" /><stop offset="64%" stopColor="rgba(211,198,165,.22)" /><stop offset="100%" stopColor="rgba(211,198,165,0)" /></linearGradient>
                <filter id="slotGlowV17" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="5.5" /></filter>
                {availableAnchors.map((slot, index) => {
                  const dx = slot.x - ROOT.x; const dy = slot.y - (ROOT.y + 44);
                  return <linearGradient key={slot.id} id={`slotFlowV17-${slot.id}`} gradientUnits="userSpaceOnUse" x1={ROOT.x} y1={ROOT.y + 44} x2={slot.x} y2={slot.y - 38}>
                    <stop offset="0" stopColor="rgba(250,200,74,0)" /><stop offset=".30" stopColor="rgba(250,200,74,0)" /><stop offset=".48" stopColor="rgba(250,200,74,.16)" /><stop offset=".56" stopColor="rgba(250,200,74,.62)" /><stop offset=".66" stopColor="rgba(250,200,74,.16)" /><stop offset=".84" stopColor="rgba(250,200,74,0)" /><stop offset="1" stopColor="rgba(250,200,74,0)" />
                    {!reduceMotion ? <animateTransform attributeName="gradientTransform" type="translate" values={`${-dx * .78} ${-dy * .78};${-dx * .78} ${-dy * .78};0 0;${dx * .78} ${dy * .78};${dx * .78} ${dy * .78}`} keyTimes="0;0.18;0.46;0.66;1" dur="8s" begin={`${index * 4}s`} repeatCount="indefinite" /> : null}
                  </linearGradient>;
                })}
              </defs>
              {visibleEdges.map(({ parent, child }) => {
                const slotId = isOwnNetwork && parent.wallet === viewedRoot ? slotByWallet.get(child.wallet) : undefined;
                const anchor = slotId ? anchorById.get(slotId) : null;
                return <path key={`${parent.wallet}-${child.wallet}`} d={anchor?.path ?? edgePath(parent, child)} className={`treeEdge depth${child.localDepth}`} vectorEffect="non-scaling-stroke" />;
              })}
              {continuationNodes.map((node) => <path key={`tail-${node.wallet}`} d={continuationPath(node)} className="continuationTail" vectorEffect="non-scaling-stroke" />)}
              {pendingAnchors.map(({ anchor }) => <path key={`pending-${anchor.id}`} d={anchor.path} className="pendingEdge" vectorEffect="non-scaling-stroke" />)}
              {availableAnchors.map((slot) => <g key={`slot-${slot.id}`}><path d={slot.path} className="availableBase" vectorEffect="non-scaling-stroke" /><path d={slot.path} className="availableFlow" stroke={`url(#slotFlowV17-${slot.id})`} vectorEffect="non-scaling-stroke" /></g>)}
            </svg>

            {visibleNodes.map((node) => {
              const isRoot = node.wallet === viewedRoot; const nodeLoading = loadingWallets.has(node.wallet);
              return <button key={node.wallet} type="button" className={`person ${isRoot ? 'root' : 'child'} ${node.localDepth >= 2 ? 'mini' : ''} ${recentArrivalWallet === node.wallet ? 'arriving' : ''}`} style={{ left: node.x, top: node.y }} data-node-wallet={node.wallet}><span className="avatar">●</span><b>{isRoot && node.wallet === authWallet ? 'YOU' : shortWallet(node.wallet, authWallet)}</b><small>{nodeLoading ? 'Loading…' : node.direct ? `${node.network} network · ${node.direct} direct` : 'Leaf'}</small></button>;
            })}
            {pendingAnchors.map(({ anchor, state }) => <div key={`pending-node-${anchor.id}`} className="pendingSlot" style={{ left: anchor.x, top: anchor.y }}><span className="slotAvatar pending">…</span><b>{state === 'PENDING' ? 'Pending' : 'Joining'}</b><small>Slot {anchor.id}</small></div>)}
            {availableAnchors.map((slot, index) => <button key={slot.id} type="button" className="emptySlot" style={{ left: slot.x, top: slot.y }} data-network-control="true" onClick={() => setInviteNotice(`Slot ${slot.id} · ${referralKey ? '실제 초대 링크와 연결된 사용 가능 슬롯' : '초대 링크 생성 전에도 서버에서 확인되는 사용 가능 슬롯'}`)}><span className="slotAvatar" style={{ animationDelay: `${3.9 + index * 4}s` }}><i>+</i></span><b>Available</b><small>Invite slot {slot.id}</small></button>)}
          </div>

          {selected ? <aside className="slotCard" data-network-control="true"><div><span className="cardAvatar">●</span><div><strong>{selected.wallet === authWallet ? 'YOU' : shortWallet(selected.wallet, authWallet)}</strong><small>{selected.direct} direct · {selected.network} network</small></div><button type="button" onClick={() => setSelectedWallet(null)}>×</button></div><p>{selected.direct ? '실제 API 데이터를 고정 lane과 부모 전용 구역으로 펼칩니다.' : '현재 서버 데이터 기준 더 아래 세대가 없는 leaf 노드입니다.'}</p>{selected.direct > 0 ? <div className="cardActions"><button type="button" className="branchCta" onClick={() => void focusNode(selected.wallet)}>이 가지 펼치기</button>{selected.wallet !== viewedRoot ? <button type="button" className="networkCta" onClick={() => void reroot(selected.wallet)}>이 네트워크 보기</button> : null}</div> : null}</aside> : null}
          {inviteNotice ? <div className="inviteToast" role="status" data-network-control="true">{inviteNotice}</div> : null}

          <div className="controls" data-network-control="true"><button type="button" className="youButton" onClick={() => void returnToYou()}><span>◎</span><b>YOU</b></button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale + .16 })}>+</button><button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale - .16 })}>−</button></div>
        </div>
      </section>

      <section className="tips"><span><b>Real network API</b>가짜 fixture 없이 로그인 지갑의 실제 referral graph 사용</span><span><b>Stable slot identity</b>서버가 1번/2번 슬롯을 구분하고 링크가 없어도 상태 제공</span><span><b>Safe refresh</b>갱신 실패 시 기존 그래프를 지우지 않고 재시도 가능</span></section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}.notice,.networkShell,.tips,.errorStrip,.staleStrip{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin-left:auto;margin-right:auto}.notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.notice>div:first-child{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.5rem}.qaActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.qaActions small.good{color:#769c6e}.qaActions small.bad{color:#d17a68}.qaActions small.live{color:#63a778}.qaActions button,.errorStrip button,.staleStrip button{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.16);border-radius:8px;background:rgba(244,183,40,.055);color:#c7a451;font-size:.45rem}.errorStrip,.staleStrip{margin-bottom:8px;padding:7px 9px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.47rem}.errorStrip{border:1px solid rgba(209,122,104,.2);background:rgba(209,122,104,.05);color:#b9877a}.staleStrip{border:1px solid rgba(244,183,40,.14);background:rgba(244,183,40,.04);color:#9f9274}.networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09}.topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}.titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}.totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.42rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}.breadcrumb{min-height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;overflow:auto;border-bottom:1px solid rgba(255,255,255,.035)}.breadcrumb span{display:flex;align-items:center;gap:4px;flex:0 0 auto}.breadcrumb button{color:#817b72;font-size:.45rem}.breadcrumb span:last-child button{color:#c2b59a}.breadcrumb i{color:#4e4a43}.stage{position:relative;height:clamp(570px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 19%,rgba(244,183,40,.055),transparent 34%),#0b0b09}.stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 90%)}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform;transition:none}.world.cameraMoving{transition:transform .46s cubic-bezier(.2,.72,.25,1)}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.treeEdge{fill:none;stroke:rgba(211,198,165,.31);stroke-width:1.05;stroke-linecap:round;stroke-linejoin:round}.treeEdge.depth2{stroke:rgba(211,198,165,.27);stroke-width:.96}.treeEdge.depth3{stroke:rgba(211,198,165,.21);stroke-width:.88}.treeEdge.depth4{stroke:rgba(211,198,165,.17);stroke-width:.8}.continuationTail{fill:none;stroke:url(#continuationFadeV17);stroke-width:1.13;stroke-linecap:round}.pendingEdge{fill:none;stroke:rgba(211,198,165,.16);stroke-width:.9;stroke-dasharray:3 5}.availableBase{fill:none;stroke:rgba(244,183,40,.085);stroke-width:.85;stroke-linecap:round}.availableFlow{fill:none;stroke-width:2.7;stroke-linecap:round;filter:url(#slotGlowV17);opacity:.9}.person,.emptySlot,.pendingSlot{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;border:0;background:transparent;text-align:center;white-space:nowrap}.person,.emptySlot{touch-action:none}.person{min-width:86px;color:#d8d2c7}.person .avatar{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.28);border-radius:50%;background:#11100d;color:#d9b34f;font-size:.6rem;box-shadow:0 5px 22px rgba(0,0,0,.32)}.person.root .avatar{width:48px;height:48px;border-color:rgba(244,183,40,.5);background:#15130d}.person.mini .avatar{width:35px;height:35px}.person b{font-size:.49rem}.person small{color:#746f67;font-size:.4rem}.person.arriving{animation:memberArrive 1.05s ease-out}.emptySlot,.pendingSlot{min-width:68px;opacity:.72;color:#a79a79}.slotAvatar{width:32px;height:32px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.25);border-radius:50%;background:rgba(244,183,40,.018);animation:slotBreath 8s ease-in-out infinite}.slotAvatar.pending{border-style:solid;border-color:rgba(211,198,165,.16);color:#777066;animation:none}.slotAvatar i{font-style:normal;color:#a88d4a;font-size:.78rem}.emptySlot b,.pendingSlot b{font-size:.43rem}.emptySlot small,.pendingSlot small{font-size:.36rem;color:#5e594f}.hud{position:absolute;z-index:8;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.82)}.hud span,.hud small{font-size:.43rem;color:#817a70}.backNetwork,.clearFocus{position:absolute;z-index:9;top:42px;height:29px;padding:0 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(12,12,9,.9);color:#a7a095;font-size:.48rem}.backNetwork{left:10px}.clearFocus{right:10px}.gestureHint{position:absolute;z-index:8;left:50%;top:82px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:11px;background:rgba(12,11,8,.88);pointer-events:none}.gestureHint b{color:#c59b3b}.gestureHint span{font-size:.45rem;color:#7a7469;line-height:1.45}.emptyLoad{position:absolute;z-index:15;left:50%;top:44%;transform:translate(-50%,-50%);width:min(82%,310px);padding:16px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(13,13,10,.95);display:grid;justify-items:center;gap:10px;text-align:center}.emptyLoad b{font-size:.53rem;color:#968e82;font-weight:600}.emptyLoad button{height:30px;padding:0 10px;border:1px solid rgba(244,183,40,.18);border-radius:9px;color:#c8a44c;font-size:.48rem}.slotCard{position:absolute;z-index:20;left:50%;bottom:78px;transform:translateX(-50%);width:min(calc(100% - 28px),350px);padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(13,13,10,.96);box-shadow:0 14px 40px rgba(0,0,0,.38)}.slotCard>div:first-child{display:flex;align-items:center;gap:9px}.cardAvatar{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.24);border-radius:50%;color:#cba54a;font-size:.48rem}.slotCard strong{display:block;font-size:.58rem}.slotCard small{color:#746f67;font-size:.42rem}.slotCard>div:first-child>button{margin-left:auto;color:#756f65;font-size:.9rem}.slotCard p{margin:9px 0;color:#8c8579;font-size:.48rem;line-height:1.55}.cardActions{display:flex;gap:7px}.cardActions button{flex:1;height:32px;border-radius:9px;font-size:.48rem}.branchCta{border:1px solid rgba(244,183,40,.18);background:rgba(244,183,40,.07);color:#cfaa50}.networkCta{border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);color:#979084}.inviteToast{position:absolute;z-index:22;left:50%;bottom:128px;transform:translateX(-50%);padding:7px 9px;border:1px solid rgba(244,183,40,.14);border-radius:9px;background:rgba(17,15,10,.95);color:#c9ad6d;font-size:.46rem;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}.controls{position:absolute;z-index:10;right:10px;bottom:max(14px,env(safe-area-inset-bottom));display:flex;gap:6px}.controls button{height:32px;border:1px solid rgba(255,255,255,.065);border-radius:10px;background:rgba(12,12,9,.9);color:#9a9388}.youButton{padding:0 9px;display:flex;align-items:center;gap:5px}.youButton span{color:#c5a04a}.youButton b{font-size:.44rem}.zoomControl{width:32px;font-size:.78rem}.tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{min-height:49px;padding:8px;border:1px solid rgba(255,255,255,.045);border-radius:11px;background:rgba(255,255,255,.015);color:#6f6a62;font-size:.43rem;line-height:1.45}.tips b{display:block;margin-bottom:2px;color:#9b9282;font-size:.45rem}@keyframes slotBreath{0%,72%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}78%{box-shadow:0 0 15px rgba(244,183,40,.16)}84%{box-shadow:0 0 0 rgba(244,183,40,0)}}@keyframes memberArrive{0%{opacity:.2;transform:translate(-50%,-50%) scale(.82)}60%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{transform:translate(-50%,-50%) scale(1)}}@media(max-width:520px){.qaPage{padding-top:7px}.notice,.networkShell,.tips,.errorStrip,.staleStrip{width:calc(100vw - 12px)}.notice{padding:8px}.notice>div:first-child span{display:none}.stage{height:calc(100svh - 128px);min-height:560px}.tips{display:none}.controls{bottom:max(22px,calc(env(safe-area-inset-bottom) + 12px))}}@media(prefers-reduced-motion:reduce){.world.cameraMoving{transition:none}.slotAvatar,.person.arriving{animation:none}.availableFlow{display:none}}
      `}</style>
    </main>
  );
}
