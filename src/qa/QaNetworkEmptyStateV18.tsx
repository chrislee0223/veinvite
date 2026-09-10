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
type SlotAnchor = {
  serverSlot: number;
  visualLane: number;
  x: number;
  y: number;
  path: string;
  state: SlotState;
  inviteeWallet: string | null;
};
type LaneZone = { owner: string; depth: number; left: number; right: number; branch: string | null };
type LayoutResult = { nodes: Map<string, LayoutNode>; zones: LaneZone[] };
type InFlightNetwork = { wallet: string; controller: AbortController; promise: Promise<ApiPayload> };
type InFlightSlots = { wallet: string; controller: AbortController; promise: Promise<ReferralLinkPayload> };

const WORLD_H = 1840;
const ROOT_Y = 128;
const ROOT_CHILD_Y = 330;
const ROOT_VIEW: View = { x: 0, y: 52, scale: 0.82 };
const MIN_SCALE = 0.66;
const MAX_SCALE = 1.84;
const TAP_SLOP = 9;
const DIRECT_GAP = 190;
const ROOT_CAPS = [5, 7, 9, 9] as const;
const MAX_CACHE_ITEMS = 80;
const REFRESH_MIN_MS = 15_000;
const LIVE_REFRESH_MS = 20_000;

const ZOOM = {
  detailIn: 1.13,
  detailOut: 1.03,
  deepIn: 1.43,
  deepOut: 1.31,
  ultraIn: 1.66,
  ultraOut: 1.54,
};

class StaleRequestError extends Error {
  constructor() {
    super('Stale network request.');
    this.name = 'StaleRequestError';
  }
}

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
  return keyWallet(wallet) === keyWallet(authWallet)
    ? 'YOU'
    : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
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
function worldWidthFor(directCount: number, slotCount: number) {
  return Math.max(1540, 1180 + Math.max(0, directCount + slotCount - 5) * DIRECT_GAP);
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
function slotPath(rootX: number, x: number, y: number) {
  const bend = x < rootX ? -58 : 58;
  return `M${rootX} ${ROOT_Y + 44} C${rootX + bend} 202 ${x - bend * .45} 234 ${x} ${y - 38}`;
}
function segmentsCross(a: Edge, b: Edge) {
  if (a.parent.wallet === b.parent.wallet || a.child.wallet === b.child.wallet) return false;
  const a1 = { x: a.parent.x, y: a.parent.y + 62 };
  const a2 = { x: a.child.x, y: a.child.y - 37 };
  const b1 = { x: b.parent.x, y: b.parent.y + 62 };
  const b2 = { x: b.child.x, y: b.child.y - 37 };
  const orient = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
function layoutConflicts(edges: Edge[], zones: LaneZone[]) {
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      if (segmentsCross(edges[i], edges[j])) count += 1;
    }
  }
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const a = zones[i];
      const b = zones[j];
      if (a.depth !== b.depth || a.owner === b.owner || a.branch === b.branch) continue;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) count += 1;
    }
  }
  return count;
}
async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null);
  if (value === null) throw new Error(`VeInvite returned an invalid response (${response.status}).`);
  return value as T;
}
async function fetchNetworkApi(
  rootWallet: string,
  focusWallet: string,
  signal: AbortSignal,
): Promise<ApiPayload> {
  const expectedRoot = keyWallet(rootWallet);
  const expectedFocus = keyWallet(focusWallet);
  const params = new URLSearchParams({ wallet: expectedRoot });
  if (expectedFocus !== expectedRoot) params.set('focus', expectedFocus);
  const response = await fetch(`/api/network?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await readJson<ApiPayload | { error?: string; code?: string }>(response);
  if (!response.ok) {
    const message = 'error' in payload && payload.error
      ? payload.error
      : `Network request failed (${response.status}).`;
    throw new Error(message);
  }
  if (
    !('rootWallet' in payload) ||
    !payload.rootWallet ||
    !payload.focusWallet ||
    !payload.summary ||
    !Array.isArray(payload.children)
  ) {
    throw new Error('Network response was incomplete.');
  }
  const normalized: ApiPayload = {
    ...payload,
    rootWallet: keyWallet(payload.rootWallet),
    focusWallet: keyWallet(payload.focusWallet),
    breadcrumb: Array.isArray(payload.breadcrumb)
      ? payload.breadcrumb.map(keyWallet)
      : [keyWallet(payload.focusWallet)],
    children: payload.children.map((child) => ({ ...child, wallet: keyWallet(child.wallet) })),
  };
  if (normalized.rootWallet !== expectedRoot || normalized.focusWallet !== expectedFocus) {
    throw new Error('Network response did not match the requested wallet.');
  }
  return normalized;
}
async function fetchSlotApi(rootWallet: string, signal: AbortSignal): Promise<ReferralLinkPayload> {
  const params = new URLSearchParams({ inviter: keyWallet(rootWallet) });
  const response = await fetch(`/api/referral-links?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await readJson<ReferralLinkPayload | { error?: string }>(response);
  if (!response.ok) {
    const message = 'error' in payload && payload.error
      ? payload.error
      : `Invite-slot request failed (${response.status}).`;
    throw new Error(message);
  }
  if (
    !('slotAvailability' in payload) ||
    !payload.slotAvailability ||
    !Array.isArray(payload.slotAvailability.slots)
  ) {
    throw new Error('Invite-slot response was incomplete.');
  }
  const seen = new Set<number>();
  for (const slot of payload.slotAvailability.slots) {
    if (!Number.isInteger(slot.slot) || slot.slot < 1 || seen.has(slot.slot)) {
      throw new Error('Invite-slot response contained invalid slot identities.');
    }
    seen.add(slot.slot);
  }
  return payload;
}

export function QaNetworkEmptyStateV18() {
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
  const authWalletRef = useRef(authWallet);
  authWalletRef.current = authWallet;
  const viewedRootRef = useRef('');
  const generationRef = useRef(0);
  const payloadsRef = useRef<Map<string, ApiPayload>>(new Map());
  const networkRequestsRef = useRef<Map<string, InFlightNetwork>>(new Map());
  const slotRequestRef = useRef<InFlightSlots | null>(null);
  const slotAvailabilityRef = useRef<SlotAvailability | null>(null);
  const referralKeyRef = useRef<string | null>(null);
  const memberLaneRef = useRef<Map<string, number>>(new Map());
  const serverSlotLaneRef = useRef<Map<number, number>>(new Map());
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
  const [rootPage, setRootPage] = useState(0);
  const [pageByParent, setPageByParent] = useState<Map<string, number>>(() => new Map());
  const [laneVersion, setLaneVersion] = useState(0);

  useEffect(() => {
    viewedRootRef.current = viewedRoot;
  }, [viewedRoot]);

  const rootPayload = viewedRoot ? payloads.get(viewedRoot) ?? null : null;
  const authRootPayload = authWallet ? payloads.get(authWallet) ?? null : null;
  const worldW = worldWidthFor(
    Math.max(authRootPayload?.children.length ?? 0, rootPayload?.children.length ?? 0),
    slotAvailability?.slots.length ?? 2,
  );
  const rootX = worldW / 2;

  const clampView = useCallback((next: View): View => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const horizontalReach = Math.max(360, worldW * scale * .58);
    const minY = Math.min(-450, stageSize.height * .52 - WORLD_H * scale);
    const maxY = Math.max(270, stageSize.height * .44);
    return {
      scale,
      x: clamp(next.x, -horizontalReach, horizontalReach),
      y: clamp(next.y, minY, maxY),
    };
  }, [stageSize.height, worldW]);

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
    stopCamera();
    setCameraMoving(true);
    commitView(next);
    cameraTimerRef.current = window.setTimeout(() => {
      cameraTimerRef.current = null;
      setCameraMoving(false);
    }, reduceMotion ? 1 : 460);
  }, [commitView, reduceMotion, stopCamera]);

  const abortAllRequests = useCallback(() => {
    networkRequestsRef.current.forEach((entry) => entry.controller.abort());
    networkRequestsRef.current.clear();
    slotRequestRef.current?.controller.abort();
    slotRequestRef.current = null;
  }, []);

  const writeCache = useCallback((focus: string, payload: ApiPayload) => {
    const next = new Map(payloadsRef.current);
    next.delete(focus);
    next.set(focus, payload);
    while (next.size > MAX_CACHE_ITEMS) {
      const oldest = next.keys().next().value as string | undefined;
      if (!oldest) break;
      next.delete(oldest);
    }
    payloadsRef.current = next;
    setPayloads(next);
  }, []);

  const loadPayload = useCallback((focusWallet: string, force = false): Promise<ApiPayload> => {
    const requestRoot = authWalletRef.current;
    if (!requestRoot) return Promise.reject(new Error('Connect a wallet first.'));
    const focus = keyWallet(focusWallet || requestRoot);
    const cached = payloadsRef.current.get(focus);
    if (cached && !force) return Promise.resolve(cached);
    const requestKey = `${requestRoot}:${focus}`;
    const existing = networkRequestsRef.current.get(requestKey);
    if (existing) return existing.promise;

    const requestGeneration = generationRef.current;
    const controller = new AbortController();
    setLoadingWallets((current) => new Set(current).add(focus));
    const promise = fetchNetworkApi(requestRoot, focus, controller.signal)
      .then((payload) => {
        if (
          generationRef.current !== requestGeneration ||
          authWalletRef.current !== requestRoot
        ) {
          throw new StaleRequestError();
        }
        writeCache(focus, payload);
        setLoadError('');
        return payload;
      })
      .catch((error: unknown) => {
        if (
          error instanceof StaleRequestError ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          throw error;
        }
        setLoadError(error instanceof Error ? error.message : 'Failed to load network.');
        throw error;
      })
      .finally(() => {
        networkRequestsRef.current.delete(requestKey);
        setLoadingWallets((current) => {
          const next = new Set(current);
          next.delete(focus);
          return next;
        });
      });

    networkRequestsRef.current.set(requestKey, {
      wallet: requestRoot,
      controller,
      promise,
    });
    return promise;
  }, [writeCache]);

  const loadSlots = useCallback((force = false): Promise<ReferralLinkPayload> => {
    const requestRoot = authWalletRef.current;
    if (!requestRoot) return Promise.reject(new Error('Connect a wallet first.'));
    const current = slotRequestRef.current;
    if (current?.wallet === requestRoot) return current.promise;
    if (current && current.wallet !== requestRoot) {
      current.controller.abort();
      slotRequestRef.current = null;
    }
    if (!force && slotAvailabilityRef.current) {
      return Promise.resolve({
        referralLink: referralKeyRef.current
          ? {
              key: referralKeyRef.current,
              createdAt: '',
              slotsAvailable: slotAvailabilityRef.current.slotsAvailable,
            }
          : null,
        slotAvailability: slotAvailabilityRef.current,
      });
    }

    const requestGeneration = generationRef.current;
    const controller = new AbortController();
    let promise!: Promise<ReferralLinkPayload>;
    promise = fetchSlotApi(requestRoot, controller.signal)
      .then((payload) => {
        if (
          generationRef.current !== requestGeneration ||
          authWalletRef.current !== requestRoot
        ) {
          throw new StaleRequestError();
        }
        const previous = slotAvailabilityRef.current;
        if (previous) {
          for (const slot of payload.slotAvailability.slots) {
            const prior = previous.slots.find((item) => item.slot === slot.slot);
            if (
              prior?.state === 'AVAILABLE' &&
              slot.state !== 'AVAILABLE' &&
              slot.inviteeWallet
            ) {
              setRecentArrivalWallet(keyWallet(slot.inviteeWallet));
            }
          }
        }
        slotAvailabilityRef.current = payload.slotAvailability;
        referralKeyRef.current = payload.referralLink?.key ?? null;
        setSlotAvailability(payload.slotAvailability);
        setReferralKey(referralKeyRef.current);
        setSlotError('');
        return payload;
      })
      .catch((error: unknown) => {
        if (
          error instanceof StaleRequestError ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          throw error;
        }
        setSlotError(error instanceof Error ? error.message : 'Failed to load invite slots.');
        throw error;
      })
      .finally(() => {
        if (slotRequestRef.current?.promise === promise) slotRequestRef.current = null;
      });

    slotRequestRef.current = { wallet: requestRoot, controller, promise };
    return promise;
  }, []);

  const refreshData = useCallback(async (immediate = false) => {
    const root = authWalletRef.current;
    if (!root) return;
    const now = Date.now();
    if (!immediate && now - lastRefreshRef.current < REFRESH_MIN_MS) return;
    lastRefreshRef.current = now;
    const currentView = viewedRootRef.current || root;
    const targets = [...new Set([root, currentView])];
    await Promise.allSettled([
      ...targets.map((target) => loadPayload(target, true)),
      loadSlots(true),
    ]);
  }, [loadPayload, loadSlots]);

  useEffect(() => {
    generationRef.current += 1;
    const serial = generationRef.current;
    abortAllRequests();
    payloadsRef.current = new Map();
    slotAvailabilityRef.current = null;
    referralKeyRef.current = null;
    memberLaneRef.current = new Map();
    serverSlotLaneRef.current = new Map();
    setPayloads(new Map());
    setSlotAvailability(null);
    setReferralKey(null);
    setLoadingWallets(new Set());
    setRootPage(0);
    setPageByParent(new Map());
    setLaneVersion((value) => value + 1);
    setLoadError('');
    setSlotError('');
    setAuthError('');
    setSelectedWallet(null);
    setFocusedBranch(null);
    setHistory([]);
    setZoomLevel(0);
    viewRef.current = ROOT_VIEW;
    setView(ROOT_VIEW);

    if (!authWallet) {
      setViewedRoot('');
      viewedRootRef.current = '';
      setBooting(false);
      return;
    }

    setViewedRoot(authWallet);
    viewedRootRef.current = authWallet;
    setBooting(true);

    void (async () => {
      try {
        await ensureWalletSession(authWallet);
        if (generationRef.current !== serial || authWalletRef.current !== authWallet) return;
        setAuthError('');
        lastRefreshRef.current = Date.now();
        await Promise.allSettled([
          loadPayload(authWallet, true),
          loadSlots(true),
        ]);
      } catch (error) {
        if (generationRef.current !== serial || authWalletRef.current !== authWallet) return;
        setAuthError(error instanceof Error ? error.message : 'Wallet verification failed.');
      } finally {
        if (generationRef.current === serial && authWalletRef.current === authWallet) {
          setBooting(false);
        }
      }
    })();

    return () => {
      if (generationRef.current === serial) {
        generationRef.current += 1;
        abortAllRequests();
      }
    };
    // Only a canonical wallet change should restart bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authWallet]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({
      width: stage.clientWidth || 390,
      height: stage.clientHeight || 650,
    });
    sync();
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(sync)
      : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [authWallet]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, [authWallet]);

  useEffect(() => () => {
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    setZoomLevel((current) => resolveZoomLevel(current, view.scale));
  }, [view.scale]);

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
      void refreshData(false);
    };
    const onReferralUpdated = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshData(true);
    };
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < LIVE_REFRESH_MS) return;
      void refreshData(true);
    }, LIVE_REFRESH_MS);

    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('veinvite-referral-updated', onReferralUpdated);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('veinvite-referral-updated', onReferralUpdated);
    };
  }, [authWallet, refreshData]);

  useEffect(() => {
    if (!authRootPayload) return;
    let changed = false;

    // If a server slot already had a visual lane while AVAILABLE, give a newly
    // confirmed invitee that exact lane before assigning generic lanes.
    if (slotAvailability) {
      for (const slot of slotAvailability.slots) {
        if (slot.state === 'AVAILABLE' || !slot.inviteeWallet) continue;
        const invitee = keyWallet(slot.inviteeWallet);
        const existingLane = serverSlotLaneRef.current.get(slot.slot);
        if (existingLane !== undefined && !memberLaneRef.current.has(invitee)) {
          memberLaneRef.current.set(invitee, existingLane);
          changed = true;
        }
      }
    }

    const used = new Set(memberLaneRef.current.values());
    authRootPayload.children.forEach((child, index) => {
      const walletKey = keyWallet(child.wallet);
      if (memberLaneRef.current.has(walletKey)) return;
      let lane = stableOffset(index);
      while (used.has(lane)) {
        lane = lane <= 0 ? Math.abs(lane) + 1 : -(lane + 1);
      }
      memberLaneRef.current.set(walletKey, lane);
      used.add(lane);
      changed = true;
    });

    if (slotAvailability) {
      for (const slot of slotAvailability.slots) {
        const invitee = slot.inviteeWallet ? keyWallet(slot.inviteeWallet) : null;
        let currentLane = serverSlotLaneRef.current.get(slot.slot);

        if (slot.state !== 'AVAILABLE' && invitee) {
          const memberLane = memberLaneRef.current.get(invitee);
          if (memberLane !== undefined && currentLane === undefined) {
            serverSlotLaneRef.current.set(slot.slot, memberLane);
            currentLane = memberLane;
            changed = true;
          }
        }

        const memberLanes = new Set(memberLaneRef.current.values());
        const slotLanes = new Set(serverSlotLaneRef.current.values());
        const allUsed = [...memberLanes, ...slotLanes];
        const minLane = allUsed.length ? Math.min(0, ...allUsed) : 0;
        const maxLane = allUsed.length ? Math.max(0, ...allUsed) : 0;
        const laneNowOccupiedByMember = currentLane !== undefined && memberLanes.has(currentLane);

        if (slot.state === 'AVAILABLE' && (currentLane === undefined || laneNowOccupiedByMember)) {
          serverSlotLaneRef.current.set(
            slot.slot,
            slot.slot % 2 === 1 ? minLane - 1 : maxLane + 1,
          );
          changed = true;
        } else if (slot.state !== 'AVAILABLE' && currentLane === undefined) {
          serverSlotLaneRef.current.set(
            slot.slot,
            slot.slot % 2 === 1 ? minLane - 1 : maxLane + 1,
          );
          changed = true;
        }
      }
    }

    if (changed) setLaneVersion((value) => value + 1);
  }, [authRootPayload, slotAvailability]);

  const isOwnNetwork = Boolean(authWallet && viewedRoot === authWallet);
  const rootRenderCap = ROOT_CAPS[zoomLevel] ?? ROOT_CAPS[ROOT_CAPS.length - 1];
  const rootChildren = rootPayload?.children ?? [];
  const rootPageCount = Math.max(1, Math.ceil(rootChildren.length / rootRenderCap));
  const safeRootPage = Math.min(rootPage, rootPageCount - 1);

  useEffect(() => {
    if (rootPage !== safeRootPage) setRootPage(safeRootPage);
  }, [rootPage, safeRootPage]);

  const rootVisibleChildren = useMemo(() => {
    const start = safeRootPage * rootRenderCap;
    const page = rootChildren.slice(start, start + rootRenderCap);
    if (!isOwnNetwork || !slotAvailability) return page;
    const occupiedWallets = new Set(
      slotAvailability.slots
        .filter((slot) => slot.state !== 'AVAILABLE' && slot.inviteeWallet)
        .map((slot) => keyWallet(slot.inviteeWallet!)),
    );
    const slotMembers = rootChildren.filter((child) =>
      occupiedWallets.has(keyWallet(child.wallet)),
    );
    const seen = new Set<string>();
    return [...page, ...slotMembers].filter((child) => {
      const walletKey = keyWallet(child.wallet);
      if (seen.has(walletKey)) return false;
      seen.add(walletKey);
      return true;
    });
  }, [isOwnNetwork, rootChildren, rootRenderCap, safeRootPage, slotAvailability]);

  const laneForRootWallet = useCallback((walletAddress: string, fallbackIndex: number) => {
    const stored = memberLaneRef.current.get(keyWallet(walletAddress));
    return stored === undefined ? stableOffset(fallbackIndex) : stored;
  }, []);

  const slotAnchors = useMemo<SlotAnchor[]>(() => {
    if (!isOwnNetwork || !slotAvailability) return [];
    return slotAvailability.slots.flatMap((slot) => {
      let lane = serverSlotLaneRef.current.get(slot.slot);
      if (slot.inviteeWallet) {
        const memberLane = memberLaneRef.current.get(keyWallet(slot.inviteeWallet));
        if (memberLane !== undefined) lane = memberLane;
      }
      if (lane === undefined) return [];
      const x = rootX + lane * DIRECT_GAP;
      return [{
        serverSlot: slot.slot,
        visualLane: lane,
        x,
        y: ROOT_CHILD_Y,
        path: slotPath(rootX, x, ROOT_CHILD_Y),
        state: slot.state,
        inviteeWallet: slot.inviteeWallet ? keyWallet(slot.inviteeWallet) : null,
      }];
    });
  }, [isOwnNetwork, laneVersion, rootX, slotAvailability]);

  const slotAnchorByWallet = useMemo(() => {
    const map = new Map<string, SlotAnchor>();
    slotAnchors.forEach((anchor) => {
      if (anchor.inviteeWallet) map.set(anchor.inviteeWallet, anchor);
    });
    return map;
  }, [slotAnchors]);

  const availableAnchors = useMemo(
    () => slotAnchors.filter((anchor) => anchor.state === 'AVAILABLE'),
    [slotAnchors],
  );

  const pendingAnchors = useMemo(() => {
    if (!rootPayload) return [] as SlotAnchor[];
    const childWallets = new Set(rootPayload.children.map((child) => keyWallet(child.wallet)));
    return slotAnchors.filter((anchor) => {
      if (anchor.state === 'AVAILABLE') return false;
      return !anchor.inviteeWallet || !childWallets.has(anchor.inviteeWallet);
    });
  }, [rootPayload, slotAnchors]);

  const activeExpandBranch = useMemo(() => {
    if (focusedBranch) return focusedBranch;
    const centerWorldX = rootX - view.x / Math.max(view.scale, .01);
    return rootVisibleChildren
      .map((child, index) => ({
        child,
        x: rootX + laneForRootWallet(child.wallet, index) * DIRECT_GAP,
      }))
      .filter(({ child }) => child.direct > 0 && payloads.has(keyWallet(child.wallet)))
      .sort((a, b) => Math.abs(a.x - centerWorldX) - Math.abs(b.x - centerWorldX))[0]
      ?.child.wallet ?? null;
  }, [focusedBranch, laneForRootWallet, payloads, rootVisibleChildren, rootX, view.scale, view.x]);

  useEffect(() => {
    if (zoomLevel < 1 || !rootPayload || !rootVisibleChildren.length) return;
    if (focusedBranch) {
      const child = rootVisibleChildren.find((item) => keyWallet(item.wallet) === focusedBranch);
      if (child?.direct) void loadPayload(child.wallet).catch(() => undefined);
      return;
    }
    const centerWorldX = rootX - view.x / Math.max(view.scale, .01);
    const candidate = rootVisibleChildren
      .map((child, index) => ({
        child,
        x: rootX + laneForRootWallet(child.wallet, index) * DIRECT_GAP,
      }))
      .filter(({ child }) => child.direct > 0)
      .sort((a, b) => Math.abs(a.x - centerWorldX) - Math.abs(b.x - centerWorldX))[0]
      ?.child;
    if (candidate) void loadPayload(candidate.wallet).catch(() => undefined);
  }, [focusedBranch, laneForRootWallet, loadPayload, rootPayload, rootVisibleChildren, rootX, view.scale, view.x, zoomLevel]);

  const layoutResult = useMemo<LayoutResult>(() => {
    const nodes = new Map<string, LayoutNode>();
    const zones: LaneZone[] = [];
    if (!viewedRoot) return { nodes, zones };

    const summary = rootPayload?.summary ?? {
      network: 0,
      direct: 0,
      qualified: 0,
      thisRound: null,
      depth: 0,
    };
    nodes.set(viewedRoot, {
      wallet: viewedRoot,
      parentWallet: null,
      status: 'REWARDED',
      joinedAt: null,
      network: summary.network,
      direct: summary.direct,
      qualified: summary.qualified,
      thisRound: summary.thisRound,
      depth: summary.depth,
      x: rootX,
      y: ROOT_Y,
      localDepth: 0,
      branch: null,
    });

    rootVisibleChildren.forEach((child, index) => {
      const walletKey = keyWallet(child.wallet);
      const lane = isOwnNetwork
        ? laneForRootWallet(walletKey, index)
        : stableOffset(index);
      nodes.set(walletKey, {
        ...child,
        wallet: walletKey,
        parentWallet: viewedRoot,
        x: rootX + lane * DIRECT_GAP,
        y: ROOT_CHILD_Y,
        localDepth: 1,
        branch: walletKey,
      });
    });

    if (zoomLevel === 0 || !rootVisibleChildren.length) return { nodes, zones };
    const maxDepth = zoomLevel === 1 ? 2 : zoomLevel === 2 ? 3 : 4;

    const placeChildren = (
      parent: LayoutNode,
      center: number,
      halfWidth: number,
      focused: boolean,
    ) => {
      if (parent.localDepth >= maxDepth) return;
      const payload = payloads.get(parent.wallet);
      if (!payload || !payload.children.length) return;
      const cap = focused
        ? (zoomLevel === 1 ? 5 : zoomLevel === 2 ? 7 : 9)
        : 3;
      const page = focused ? (pageByParent.get(parent.wallet) ?? 0) : 0;
      const pageCount = Math.max(1, Math.ceil(payload.children.length / cap));
      const safePage = clamp(page, 0, pageCount - 1);
      const children = payload.children.slice(safePage * cap, safePage * cap + cap);
      const slotSpan = Math.max(
        42,
        Math.min(focused ? 68 : 56, (halfWidth * 2 - 16) / Math.max(3, children.length)),
      );
      zones.push({
        owner: parent.wallet,
        depth: parent.localDepth + 1,
        left: center - halfWidth,
        right: center + halfWidth,
        branch: parent.branch,
      });

      children.forEach((child, index) => {
        const x = clamp(
          center + stableOffset(index) * slotSpan,
          center - halfWidth + 18,
          center + halfWidth - 18,
        );
        const localDepth = parent.localDepth + 1;
        const walletKey = keyWallet(child.wallet);
        const next: LayoutNode = {
          ...child,
          wallet: walletKey,
          parentWallet: parent.wallet,
          x,
          y: ROOT_CHILD_Y + localDepth * 205,
          localDepth,
          branch: parent.branch ?? parent.wallet,
        };
        nodes.set(walletKey, next);
        placeChildren(next, x, Math.max(24, slotSpan / 2 - 3), focused);
      });
    };

    const baseBranches = rootVisibleChildren
      .map((child) => nodes.get(keyWallet(child.wallet))!)
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);

    baseBranches.forEach((branch) => {
      if (!activeExpandBranch || branch.wallet !== keyWallet(activeExpandBranch)) return;
      const focused = focusedBranch === branch.wallet;
      const availableHalf = Math.max(
        56,
        Math.min(360, branch.x - 80, worldW - branch.x - 80),
      );
      placeChildren(
        branch,
        branch.x,
        focused ? availableHalf : DIRECT_GAP / 2 - 12,
        focused,
      );
    });

    return { nodes, zones };
  }, [
    activeExpandBranch,
    focusedBranch,
    isOwnNetwork,
    laneForRootWallet,
    pageByParent,
    payloads,
    rootPayload,
    rootVisibleChildren,
    rootX,
    viewedRoot,
    worldW,
    zoomLevel,
  ]);

  const layout = layoutResult.nodes;
  const visibleNodes = useMemo(() => {
    const margin = 300;
    return [...layout.values()].filter((node) => {
      const sx = stageSize.width / 2 + view.x + (node.x - worldW / 2) * view.scale;
      const sy = view.y + node.y * view.scale;
      return (
        sx > -margin &&
        sx < stageSize.width + margin &&
        sy > -margin &&
        sy < stageSize.height + margin
      );
    });
  }, [layout, stageSize.height, stageSize.width, view, worldW]);

  const visibleWallets = useMemo(
    () => new Set(visibleNodes.map((node) => node.wallet)),
    [visibleNodes],
  );

  const semanticChildrenByParent = useMemo(() => {
    const counts = new Map<string, number>();
    layout.forEach((node) => {
      if (node.parentWallet) {
        counts.set(node.parentWallet, (counts.get(node.parentWallet) ?? 0) + 1);
      }
    });
    return counts;
  }, [layout]);

  const allSemanticEdges = useMemo(() =>
    [...layout.values()].flatMap((child) => {
      if (!child.parentWallet) return [];
      const parent = layout.get(child.parentWallet);
      return parent ? [{ parent, child }] : [];
    }), [layout]);

  const visibleEdges = useMemo(() =>
    allSemanticEdges.filter(({ parent, child }) =>
      visibleWallets.has(parent.wallet) && visibleWallets.has(child.wallet),
    ), [allSemanticEdges, visibleWallets]);

  const conflictCount = useMemo(
    () => layoutConflicts(allSemanticEdges, layoutResult.zones),
    [allSemanticEdges, layoutResult.zones],
  );

  const continuationNodes = useMemo(() =>
    visibleNodes.filter((node) => {
      if (node.direct <= 0) return false;
      const payload = payloads.get(node.wallet);
      if (!payload) return true;
      const semanticCount = semanticChildrenByParent.get(node.wallet) ?? 0;
      return semanticCount < node.direct;
    }), [payloads, semanticChildrenByParent, visibleNodes]);

  const selected = selectedWallet ? layout.get(selectedWallet) ?? null : null;
  const currentBreadcrumb = rootPayload?.breadcrumb ?? (
    viewedRoot ? [authWallet, viewedRoot].filter(Boolean) : []
  );

  const focusNode = useCallback(async (walletToFocus: string) => {
    const node = layout.get(keyWallet(walletToFocus));
    if (!node || node.direct <= 0) return;
    setSelectedWallet(null);
    setShowHint(false);
    try {
      await loadPayload(node.wallet);
      const branch = node.localDepth === 1 ? node.wallet : node.branch;
      if (branch) setFocusedBranch(branch);
      const scale = Math.max(
        viewRef.current.scale,
        node.localDepth <= 1 ? 1.30 : 1.50,
      );
      animateTo({
        x: -(node.x - worldW / 2) * scale,
        y: stageSize.height * .31 - node.y * scale,
        scale,
      });
    } catch {}
  }, [animateTo, layout, loadPayload, stageSize.height, worldW]);

  const showNextConnections = useCallback(async (walletToPage: string) => {
    const node = layout.get(keyWallet(walletToPage));
    if (!node || node.direct <= 0) return;
    try {
      const payload = await loadPayload(node.wallet);
      const cap = zoomLevel === 1 ? 5 : zoomLevel === 2 ? 7 : 9;
      const pageCount = Math.max(1, Math.ceil(payload.children.length / cap));
      setPageByParent((current) => {
        const next = new Map(current);
        next.set(node.wallet, ((next.get(node.wallet) ?? 0) + 1) % pageCount);
        return next;
      });
      const branch = node.localDepth === 1 ? node.wallet : node.branch;
      if (branch) setFocusedBranch(branch);
    } catch {}
  }, [layout, loadPayload, zoomLevel]);

  const reroot = useCallback(async (walletToView: string) => {
    const walletKey = keyWallet(walletToView);
    if (!authWallet || walletKey === viewedRoot) return;
    try {
      await loadPayload(walletKey);
      setHistory((current) => [
        ...current.slice(-6),
        { viewedRoot, view: viewRef.current },
      ]);
      setViewedRoot(walletKey);
      viewedRootRef.current = walletKey;
      setSelectedWallet(null);
      setFocusedBranch(null);
      setRootPage(0);
      setZoomLevel(0);
      animateTo(ROOT_VIEW);
    } catch {}
  }, [animateTo, authWallet, loadPayload, viewedRoot]);

  const returnToYou = useCallback(async () => {
    if (!authWallet) return;
    try { await loadPayload(authWallet); } catch {}
    setViewedRoot(authWallet);
    viewedRootRef.current = authWallet;
    setHistory([]);
    setSelectedWallet(null);
    setFocusedBranch(null);
    setRootPage(0);
    setZoomLevel(0);
    animateTo(ROOT_VIEW);
  }, [animateTo, authWallet, loadPayload]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setViewedRoot(previous.viewedRoot);
      viewedRootRef.current = previous.viewedRoot;
      setSelectedWallet(null);
      setFocusedBranch(null);
      animateTo(previous.view);
      return current.slice(0, -1);
    });
  }, [animateTo]);

  const changeRootPage = useCallback((delta: number) => {
    if (rootPageCount <= 1) return;
    const nextPage = (safeRootPage + delta + rootPageCount) % rootPageCount;
    setRootPage(nextPage);
    const start = nextPage * rootRenderCap;
    const page = rootChildren.slice(start, start + rootRenderCap);
    if (!page.length) return;
    const xs = page.map((child, index) =>
      rootX + laneForRootWallet(child.wallet, start + index) * DIRECT_GAP,
    );
    const center = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    animateTo({
      ...viewRef.current,
      x: -(center - worldW / 2) * viewRef.current.scale,
    });
  }, [
    animateTo,
    laneForRootWallet,
    rootChildren,
    rootPageCount,
    rootRenderCap,
    rootX,
    safeRootPage,
    worldW,
  ]);

  const verifyAndRetry = useCallback(async () => {
    if (!authWallet) return;
    setAuthError('');
    try {
      await ensureWalletSession(authWallet);
      setAuthError('');
      await refreshData(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Wallet verification failed.');
    }
  }, [authWallet, ensureWalletSession, refreshData]);

  const zoomAround = useCallback((clientX: number, clientY: number, nextScale: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    stopCamera();
    setShowHint(false);
    const current = viewRef.current;
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top;
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (px - current.x) / current.scale;
    const worldY = (py - current.y) / current.scale;
    commitView({
      scale,
      x: px - worldX * scale,
      y: py - worldY * scale,
    });
  }, [commitView, stopCamera]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAround(
      event.clientX,
      event.clientY,
      viewRef.current.scale * clamp(Math.exp(-event.deltaY * .0018), .94, 1.06),
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const control = Boolean(target.closest('[data-network-control="true"]'));
    const nodeWallet = target.closest('[data-node-wallet]')?.getAttribute('data-node-wallet') ?? null;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, {
      point,
      start: point,
      nodeWallet,
      control,
    });
    stopCamera();
    setShowHint(false);
    if (!control) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }
    if (pointersRef.current.size === 1) previousPointRef.current = point;
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((item) => item.point);
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      previousPointRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointersRef.current.get(event.pointerId);
    if (!info) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, { ...info, point });
    if (pointersRef.current.size === 1) {
      if (info.control) return;
      const previous = previousPointRef.current;
      if (!previous) {
        previousPointRef.current = point;
        return;
      }
      const current = viewRef.current;
      commitView({
        ...current,
        x: current.x + point.x - previous.x,
        y: current.y + point.y - previous.y,
      });
      previousPointRef.current = point;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()].map((item) => item.point);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistanceRef.current) {
        zoomAround(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          viewRef.current.scale * (distance / pinchDistanceRef.current),
        );
      }
      pinchDistanceRef.current = distance;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const info = pointersRef.current.get(event.pointerId);
    pointersRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {}
    if (info && !info.control && info.nodeWallet && pointersRef.current.size === 0) {
      const moved = Math.hypot(
        info.point.x - info.start.x,
        info.point.y - info.start.y,
      );
      if (moved <= TAP_SLOP) setSelectedWallet(keyWallet(info.nodeWallet));
    }
    if (pointersRef.current.size === 1) {
      previousPointRef.current = [...pointersRef.current.values()][0].point;
      pinchDistanceRef.current = null;
    } else if (pointersRef.current.size === 0) {
      previousPointRef.current = null;
      pinchDistanceRef.current = null;
    }
  };

  const hiddenRootDirect = Math.max(
    0,
    (rootPayload?.summary.direct ?? 0) - rootVisibleChildren.length,
  );
  const slotCount = isOwnNetwork ? slotAvailability?.slotsAvailable : null;
  const loading = booting || isAuthenticating;

  if (!authWallet) {
    return (
      <main className="qaPage">
        <section className="notice">
          <div>
            <strong>LIVE STABILITY · QA V18</strong>
            <span>v17 누적 · wallet-race guard · visual lanes · live refresh</span>
          </div>
        </section>
        <section className="connectCard">
          <span>NETWORK</span>
          <h1>Connect your wallet</h1>
          <p>실제 VeInvite 네트워크 데이터를 안정화된 v18 구조로 확인합니다.</p>
          <button type="button" onClick={openWallet} disabled={isWalletActionPending}>
            {isWalletActionPending ? 'Opening…' : 'Connect wallet'}
          </button>
        </section>
        <style jsx>{`
          .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}
          .notice,.connectCard{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin:auto}
          .notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035)}
          .notice div{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span{color:#7f786d;font-size:.5rem}
          .connectCard{margin-top:80px;padding:26px;border:1px solid rgba(255,255,255,.06);border-radius:20px;background:#0b0b09;text-align:center}
          .connectCard>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.connectCard h1{margin:8px 0;font-size:1.1rem}
          .connectCard p{margin:0 auto 18px;max-width:330px;color:#827c72;font-size:.7rem;line-height:1.6}
          .connectCard button{height:40px;padding:0 16px;border:1px solid rgba(244,183,40,.2);border-radius:11px;background:rgba(244,183,40,.08);color:#d1ad54;font-size:.65rem}
        `}</style>
      </main>
    );
  }

  return (
    <main className="qaPage">
      <section className="notice">
        <div>
          <strong>LIVE STABILITY · QA V18</strong>
          <span>v17 누적 · request cancellation · visual lane separation · pageable continuation</span>
        </div>
        <div className="qaActions">
          <small className={conflictCount ? 'bad' : 'good'}>{conflictCount} layout conflicts</small>
          {hiddenRootDirect ? <small>{hiddenRootDirect} root hidden</small> : null}
          <small className="live">LIVE API</small>
          <button type="button" onClick={() => void refreshData(true)} disabled={loading}>↻ refresh</button>
        </div>
      </section>

      {authError ? (
        <section className="errorStrip">
          <span>{authError}</span>
          <button type="button" onClick={() => void verifyAndRetry()}>Verify & retry</button>
        </section>
      ) : null}

      {(loadError || slotError) && rootPayload ? (
        <section className="staleStrip">
          <span>{loadError || slotError} · 기존 데이터는 유지했습니다.</span>
          <button type="button" onClick={() => void refreshData(true)}>Retry</button>
        </section>
      ) : null}

      <section className="networkShell">
        <header className="topBar">
          <div className="titleBlock">
            <span>NETWORK</span>
            <h1>{isOwnNetwork ? 'My Network' : `${shortWallet(viewedRoot, authWallet)} Network`}</h1>
          </div>
          <div className="totals">
            <span className="metric"><b>{rootPayload ? rootPayload.summary.network : '—'}</b><em>Members</em></span>
            <i />
            {isOwnNetwork
              ? <span className="metric"><b>{slotCount ?? '—'}</b><em>Open slots</em></span>
              : <span className="metric"><b>{rootPayload?.summary.direct ?? '—'}</b><em>Direct</em></span>}
          </div>
        </header>

        {!isOwnNetwork && currentBreadcrumb.length ? (
          <div className="breadcrumb" data-network-control="true">
            {currentBreadcrumb.map((crumb, index) => (
              <span key={`${crumb}-${index}`}>
                <button type="button" onClick={() => void reroot(crumb)}>
                  {index === 0 ? 'YOU' : shortWallet(crumb, authWallet)}
                </button>
                {index < currentBreadcrumb.length - 1 ? <i>›</i> : null}
              </span>
            ))}
          </div>
        ) : null}

        <div
          ref={stageRef}
          className="stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
        >
          <div className="ambient" aria-hidden="true" />
          <div className="hud" data-network-control="true">
            <span>{
              loadingWallets.size || booting
                ? 'Loading…'
                : zoomLevel === 0
                  ? '전체 구조'
                  : focusedBranch
                    ? '가지 집중'
                    : zoomLevel === 1
                      ? '상세 보기'
                      : '깊은 세대'
            }</span>
            <small>{Math.round(view.scale * 100)}%</small>
          </div>

          {rootPageCount > 1 ? (
            <div className="rootPager" data-network-control="true">
              <button type="button" onClick={() => changeRootPage(-1)}>‹</button>
              <span>{safeRootPage + 1}/{rootPageCount}</span>
              <button type="button" onClick={() => changeRootPage(1)}>›</button>
            </div>
          ) : null}

          {history.length ? (
            <button type="button" className="backNetwork" data-network-control="true" onClick={goBack}>← <span>Back</span></button>
          ) : null}
          {focusedBranch ? (
            <button type="button" className="clearFocus" data-network-control="true" onClick={() => setFocusedBranch(null)}>전체 가지 보기</button>
          ) : null}
          {showHint ? (
            <div className="gestureHint" data-network-control="true">
              <b>↗</b>
              <span>실제 네트워크를 사용합니다.<br />새 연결도 기존 위치를 흔들지 않습니다.</span>
            </div>
          ) : null}

          {!rootPayload && !loading ? (
            <div className="emptyLoad" data-network-control="true">
              <b>{loadError || authError || 'Network data is unavailable.'}</b>
              <button type="button" onClick={() => void refreshData(true)}>Retry</button>
            </div>
          ) : null}

          <div
            className={`world ${cameraMoving ? 'cameraMoving' : ''}`}
            style={{
              width: worldW,
              height: WORLD_H,
              marginLeft: -worldW / 2,
              transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
            }}
          >
            <svg className="edges" width={worldW} height={WORLD_H} viewBox={`0 0 ${worldW} ${WORLD_H}`} aria-hidden="true">
              <defs>
                <linearGradient id="continuationFadeV18" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(222,209,176,.46)" />
                  <stop offset="64%" stopColor="rgba(211,198,165,.22)" />
                  <stop offset="100%" stopColor="rgba(211,198,165,0)" />
                </linearGradient>
                <filter id="slotGlowV18" x="-160%" y="-160%" width="420%" height="420%">
                  <feGaussianBlur stdDeviation="5.5" />
                </filter>
                {availableAnchors.map((slot, index) => {
                  const dx = slot.x - rootX;
                  const dy = slot.y - (ROOT_Y + 44);
                  return (
                    <linearGradient
                      key={slot.serverSlot}
                      id={`slotFlowV18-${slot.serverSlot}`}
                      gradientUnits="userSpaceOnUse"
                      x1={rootX}
                      y1={ROOT_Y + 44}
                      x2={slot.x}
                      y2={slot.y - 38}
                    >
                      <stop offset="0" stopColor="rgba(250,200,74,0)" />
                      <stop offset=".30" stopColor="rgba(250,200,74,0)" />
                      <stop offset=".48" stopColor="rgba(250,200,74,.16)" />
                      <stop offset=".56" stopColor="rgba(250,200,74,.62)" />
                      <stop offset=".66" stopColor="rgba(250,200,74,.16)" />
                      <stop offset=".84" stopColor="rgba(250,200,74,0)" />
                      <stop offset="1" stopColor="rgba(250,200,74,0)" />
                      {!reduceMotion ? (
                        <animateTransform
                          attributeName="gradientTransform"
                          type="translate"
                          values={`${-dx * .78} ${-dy * .78};${-dx * .78} ${-dy * .78};0 0;${dx * .78} ${dy * .78};${dx * .78} ${dy * .78}`}
                          keyTimes="0;0.18;0.46;0.66;1"
                          dur="8s"
                          begin={`${index * 4}s`}
                          repeatCount="indefinite"
                        />
                      ) : null}
                    </linearGradient>
                  );
                })}
              </defs>

              {visibleEdges.map(({ parent, child }) => {
                const anchor = isOwnNetwork && parent.wallet === viewedRoot
                  ? slotAnchorByWallet.get(child.wallet)
                  : null;
                return (
                  <path
                    key={`${parent.wallet}-${child.wallet}`}
                    d={anchor?.path ?? edgePath(parent, child)}
                    className={`treeEdge depth${child.localDepth}`}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {continuationNodes.map((node) => (
                <path
                  key={`tail-${node.wallet}`}
                  d={continuationPath(node)}
                  className="continuationTail"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {pendingAnchors.map((anchor) => (
                <path
                  key={`pending-${anchor.serverSlot}`}
                  d={anchor.path}
                  className="pendingEdge"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {availableAnchors.map((slot) => (
                <g key={`slot-${slot.serverSlot}`}>
                  <path d={slot.path} className="availableBase" vectorEffect="non-scaling-stroke" />
                  <path
                    d={slot.path}
                    className="availableFlow"
                    stroke={`url(#slotFlowV18-${slot.serverSlot})`}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
            </svg>

            {visibleNodes.map((node) => {
              const isRoot = node.wallet === viewedRoot;
              const nodeLoading = loadingWallets.has(node.wallet);
              return (
                <button
                  key={node.wallet}
                  type="button"
                  className={`person ${isRoot ? 'root' : 'child'} ${node.localDepth >= 2 ? 'mini' : ''} ${recentArrivalWallet === node.wallet ? 'arriving' : ''}`}
                  style={{ left: node.x, top: node.y }}
                  data-node-wallet={node.wallet}
                >
                  <span className="avatar">●</span>
                  <b>{isRoot && node.wallet === authWallet ? 'YOU' : shortWallet(node.wallet, authWallet)}</b>
                  <small>{
                    nodeLoading
                      ? 'Loading…'
                      : node.direct
                        ? `${node.network} network · ${node.direct} direct`
                        : 'Leaf'
                  }</small>
                </button>
              );
            })}

            {pendingAnchors.map((anchor) => (
              <div
                key={`pending-node-${anchor.serverSlot}`}
                className="pendingSlot"
                style={{ left: anchor.x, top: anchor.y }}
              >
                <span className="slotAvatar pending">…</span>
                <b>{anchor.state === 'PENDING' ? 'Pending' : 'Joining'}</b>
                <small>Invite in progress</small>
              </div>
            ))}

            {availableAnchors.map((slot, index) => (
              <button
                key={slot.serverSlot}
                type="button"
                className="emptySlot"
                style={{ left: slot.x, top: slot.y }}
                data-network-control="true"
                onClick={() => setInviteNotice(
                  referralKey
                    ? '친구 초대에 사용할 수 있는 슬롯입니다.'
                    : '초대 링크 생성 전에도 사용할 수 있는 슬롯입니다.',
                )}
              >
                <span className="slotAvatar" style={{ animationDelay: `${3.9 + index * 4}s` }}><i>+</i></span>
                <b>Available</b>
                <small>Invite slot</small>
              </button>
            ))}
          </div>

          {selected ? (
            <aside className="slotCard" data-network-control="true">
              <div>
                <span className="cardAvatar">●</span>
                <div>
                  <strong>{selected.wallet === authWallet ? 'YOU' : shortWallet(selected.wallet, authWallet)}</strong>
                  <small>{selected.direct} direct · {selected.network} network</small>
                </div>
                <button type="button" onClick={() => setSelectedWallet(null)}>×</button>
              </div>
              <p>{
                selected.direct
                  ? '하위 연결은 현재 가지 안에서만 펼쳐지고, 기존 위치는 유지됩니다.'
                  : '현재 서버 데이터 기준 leaf 노드입니다.'
              }</p>
              {selected.direct > 0 ? (
                <div className="cardActions">
                  <button type="button" className="branchCta" onClick={() => void focusNode(selected.wallet)}>이 가지 펼치기</button>
                  {(payloads.get(selected.wallet)?.children.length ?? 0) > (semanticChildrenByParent.get(selected.wallet) ?? 0)
                    ? <button type="button" className="moreCta" onClick={() => void showNextConnections(selected.wallet)}>다음 연결 보기</button>
                    : null}
                  {selected.wallet !== viewedRoot
                    ? <button type="button" className="networkCta" onClick={() => void reroot(selected.wallet)}>이 네트워크 보기</button>
                    : null}
                </div>
              ) : null}
            </aside>
          ) : null}

          {inviteNotice ? (
            <div className="inviteToast" role="status" data-network-control="true">{inviteNotice}</div>
          ) : null}

          <div className="controls" data-network-control="true">
            <button type="button" className="youButton" onClick={() => void returnToYou()}><span>◎</span><b>YOU</b></button>
            <button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale + .16 })}>+</button>
            <button type="button" className="zoomControl" onClick={() => commitView({ ...viewRef.current, scale: viewRef.current.scale - .16 })}>−</button>
          </div>
        </div>
      </section>

      <section className="tips">
        <span><b>Wallet race guard</b>이전 지갑의 늦은 응답은 폐기하고 진행 중 요청도 취소</span>
        <span><b>Visual lanes</b>서버 슬롯 번호와 화면 위치를 분리해 재사용되어도 사람 위치 유지</span>
        <span><b>Live + pageable</b>이벤트 즉시 갱신, 열린 화면 주기 갱신, 9명 이후도 탐색 가능</span>
      </section>

      <style jsx>{`
        .qaPage{min-height:100svh;padding:12px 0 28px;background:#080807;color:#f3efe6}
        .notice,.networkShell,.tips,.errorStrip,.staleStrip{width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin-left:auto;margin-right:auto}
        .notice{margin-bottom:8px;padding:9px 11px;border:1px solid rgba(244,183,40,.12);border-radius:13px;background:rgba(244,183,40,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}
        .notice>div:first-child{display:grid;gap:2px}.notice strong{color:#d7ac42;font-size:.56rem;letter-spacing:.08em}.notice span,.notice small{color:#7f786d;font-size:.5rem}
        .qaActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}.qaActions small.good{color:#769c6e}.qaActions small.bad{color:#d17a68}.qaActions small.live{color:#6fae7d}
        .qaActions button{height:25px;padding:0 7px;border:1px solid rgba(244,183,40,.16);border-radius:8px;background:rgba(244,183,40,.055);color:#c7a451;font-size:.45rem}
        .errorStrip,.staleStrip{margin-bottom:8px;padding:8px 10px;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.5rem}
        .errorStrip{border:1px solid rgba(209,122,104,.18);background:rgba(209,122,104,.05);color:#c9897c}.staleStrip{border:1px solid rgba(212,175,86,.16);background:rgba(212,175,86,.04);color:#a9915c}
        .errorStrip button,.staleStrip button{padding:5px 7px;border:1px solid currentColor;border-radius:7px}
        .networkShell{overflow:hidden;border:1px solid rgba(255,255,255,.055);border-radius:20px;background:#0b0b09}
        .topBar{min-height:62px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.045)}
        .titleBlock{display:grid;gap:2px}.titleBlock>span{color:#817353;font-size:.5rem;font-weight:900;letter-spacing:.14em}.titleBlock h1{margin:0;font-size:.91rem}
        .totals{display:flex;align-items:center;gap:7px}.metric{display:flex;align-items:baseline;gap:3px}.metric b{font-size:.66rem}.metric em{font-style:normal;color:#6f6a62;font-size:.42rem}.totals i{width:1px;height:12px;background:rgba(255,255,255,.08)}
        .breadcrumb{min-height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;overflow:auto;border-bottom:1px solid rgba(255,255,255,.035)}
        .breadcrumb span{display:flex;align-items:center;gap:4px;flex:0 0 auto}.breadcrumb button{color:#817b72;font-size:.45rem}.breadcrumb span:last-child button{color:#c2b59a}.breadcrumb i{color:#4e4a43}
        .stage{position:relative;height:clamp(570px,73svh,760px);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background:radial-gradient(circle at 50% 19%,rgba(244,183,40,.055),transparent 34%),#0b0b09}
        .stage:active{cursor:grabbing}.ambient{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.42),transparent 90%)}
        .world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform;transition:none}.world.cameraMoving{transition:transform .46s cubic-bezier(.2,.72,.25,1)}
        .edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.treeEdge{fill:none;stroke:rgba(211,198,165,.31);stroke-width:1.05;stroke-linecap:round;stroke-linejoin:round}.treeEdge.depth2{stroke:rgba(211,198,165,.27);stroke-width:.96}.treeEdge.depth3{stroke:rgba(211,198,165,.21);stroke-width:.88}.treeEdge.depth4{stroke:rgba(211,198,165,.17);stroke-width:.8}
        .continuationTail{fill:none;stroke:url(#continuationFadeV18);stroke-width:1.13;stroke-linecap:round}.pendingEdge{fill:none;stroke:rgba(211,198,165,.16);stroke-width:1;stroke-dasharray:4 5}.availableBase{fill:none;stroke:rgba(244,183,40,.085);stroke-width:.85;stroke-linecap:round}.availableFlow{fill:none;stroke-width:2.7;stroke-linecap:round;filter:url(#slotGlowV18);opacity:.9}
        .person,.emptySlot,.pendingSlot{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:3px;border:0;background:transparent;text-align:center;white-space:nowrap;touch-action:none}.person{min-width:86px;color:#d8d2c7}
        .person .avatar{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.28);border-radius:50%;background:#11100d;color:#d9b34f;font-size:.6rem;box-shadow:0 5px 22px rgba(0,0,0,.32)}
        .person.root .avatar{width:48px;height:48px;border-color:rgba(244,183,40,.5);background:#15130d}.person.mini .avatar{width:35px;height:35px}.person b{font-size:.49rem}.person small{color:#746f67;font-size:.4rem}.person.arriving{animation:memberArrive .9s ease-out}
        .emptySlot,.pendingSlot{min-width:68px;opacity:.72;color:#a79a79}.slotAvatar{width:32px;height:32px;display:grid;place-items:center;border:1px dashed rgba(244,183,40,.25);border-radius:50%;background:rgba(244,183,40,.018);animation:slotBreath 8s ease-in-out infinite}.slotAvatar.pending{animation:none;border-style:solid}.slotAvatar i{font-style:normal;color:#a88d4a;font-size:.78rem}.emptySlot b,.pendingSlot b{font-size:.43rem}.emptySlot small,.pendingSlot small{font-size:.36rem;color:#5e594f}
        .hud{position:absolute;z-index:8;top:10px;left:10px;display:flex;gap:7px;padding:5px 7px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.82)}.hud span,.hud small{font-size:.43rem;color:#817a70}
        .rootPager{position:absolute;z-index:9;top:10px;right:10px;display:flex;align-items:center;gap:4px;padding:3px 5px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(10,10,8,.82)}.rootPager button{width:24px;height:24px;color:#a79f92}.rootPager span{font-size:.42rem;color:#777168}
        .backNetwork,.clearFocus{position:absolute;z-index:9;top:44px;height:29px;padding:0 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(12,12,9,.9);color:#a7a095;font-size:.48rem}.backNetwork{left:10px}.clearFocus{right:10px}
        .gestureHint{position:absolute;z-index:8;left:50%;top:82px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid rgba(244,183,40,.1);border-radius:11px;background:rgba(12,11,8,.88);pointer-events:none}.gestureHint b{color:#c59b3b}.gestureHint span{font-size:.45rem;color:#7a7469;line-height:1.45}
        .emptyLoad{position:absolute;z-index:14;left:50%;top:44%;transform:translate(-50%,-50%);display:grid;gap:9px;justify-items:center;color:#8d8579;font-size:.55rem}.emptyLoad button{height:30px;padding:0 9px;border:1px solid rgba(244,183,40,.16);border-radius:8px;color:#c7a451}
        .slotCard{position:absolute;z-index:20;left:50%;bottom:78px;transform:translateX(-50%);width:min(calc(100% - 28px),370px);padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(13,13,10,.96);box-shadow:0 14px 40px rgba(0,0,0,.38)}
        .slotCard>div:first-child{display:flex;align-items:center;gap:9px}.cardAvatar{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.24);border-radius:50%;color:#cba54a;font-size:.48rem}.slotCard strong{display:block;font-size:.58rem}.slotCard small{color:#746f67;font-size:.42rem}.slotCard>div:first-child>button{margin-left:auto;color:#756f65;font-size:.9rem}.slotCard p{margin:9px 0;color:#8c8579;font-size:.48rem;line-height:1.55}
        .cardActions{display:flex;gap:6px;flex-wrap:wrap}.cardActions button{flex:1 1 105px;height:32px;border-radius:9px;font-size:.46rem}.branchCta{border:1px solid rgba(244,183,40,.18);background:rgba(244,183,40,.07);color:#cfaa50}.moreCta{border:1px solid rgba(197,160,74,.12);background:rgba(197,160,74,.035);color:#aa9156}.networkCta{border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);color:#979084}
        .inviteToast{position:absolute;z-index:22;left:50%;bottom:128px;transform:translateX(-50%);max-width:calc(100% - 30px);padding:7px 9px;border:1px solid rgba(244,183,40,.14);border-radius:9px;background:rgba(17,15,10,.95);color:#c9ad6d;font-size:.46rem;text-align:center}
        .controls{position:absolute;z-index:10;right:10px;bottom:max(14px,env(safe-area-inset-bottom));display:flex;gap:6px}.controls button{height:32px;border:1px solid rgba(255,255,255,.065);border-radius:10px;background:rgba(12,12,9,.9);color:#9a9388}.youButton{padding:0 9px;display:flex;align-items:center;gap:5px}.youButton span{color:#c5a04a}.youButton b{font-size:.44rem}.zoomControl{width:32px;font-size:.78rem}
        .tips{margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tips span{min-height:49px;padding:8px;border:1px solid rgba(255,255,255,.045);border-radius:11px;background:rgba(255,255,255,.015);color:#6f6a62;font-size:.43rem;line-height:1.45}.tips b{display:block;margin-bottom:2px;color:#9b9282;font-size:.45rem}
        @keyframes slotBreath{0%,72%,100%{box-shadow:0 0 0 rgba(244,183,40,0)}78%{box-shadow:0 0 15px rgba(244,183,40,.16)}84%{box-shadow:0 0 0 rgba(244,183,40,0)}}
        @keyframes memberArrive{0%{opacity:.25;transform:translate(-50%,-50%) scale(.82)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}100%{transform:translate(-50%,-50%) scale(1)}}
        @media(max-width:520px){.qaPage{padding-top:7px}.notice,.networkShell,.tips,.errorStrip,.staleStrip{width:calc(100vw - 12px)}.notice{padding:8px}.notice span{display:none}.stage{height:calc(100svh - 128px);min-height:560px}.tips{display:none}.controls{bottom:max(22px,calc(env(safe-area-inset-bottom) + 12px))}}
        @media(prefers-reduced-motion:reduce){.world.cameraMoving{transition:none}.slotAvatar,.person.arriving{animation:none}.availableFlow{display:none}}
      `}</style>
    </main>
  );
}
