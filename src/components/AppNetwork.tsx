'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  useGetAvatar,
  useVechainDomain,
} from '@vechain/vechain-kit';

import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Tone = 'focus' | 'near' | 'normal';

type NetworkChild = {
  wallet: string;
  status: MemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type SearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

type NetworkData = {
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
  round: {
    id: number;
    startAt: string;
    endAt: string;
  } | null;
  children: NetworkChild[];
  searchResults: SearchResult[];
  depthLimitReached: boolean;
};

type PersonVisual = {
  kind: 'person';
  key: string;
  wallet: string;
  x: number;
  y: number;
  depth: number;
  parentWallet: string | null;
  parentX: number;
  parentY: number;
  member: NetworkChild | null;
  root: boolean;
};

type ClusterVisual = {
  kind: 'cluster';
  key: string;
  parentWallet: string;
  x: number;
  y: number;
  depth: number;
  parentX: number;
  parentY: number;
  remaining: number;
};

type Visual = PersonVisual | ClusterVisual;

type EdgeVisual = {
  key: string;
  parentWallet: string;
  childWallet: string | null;
  parentDepth: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  fresh: boolean;
  stagger: number;
};

type PagerVisual = {
  parentWallet: string;
  x: number;
  y: number;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  depth: number;
};

type SavedState = {
  activePath: string[];
  pageByParent: Array<[string, number]>;
  collapsedParents: string[];
  view: View;
};

type BranchError = {
  wallet: string;
  parentDepth: number;
  message: string;
};

const PLANE_W = 3200;
const PLANE_H = 2800;
const CENTER_X = PLANE_W / 2;
const ROOT_Y = 118;
const LEVEL_GAP = 116;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.48;
const COLLAPSE_MS = 175;
const FRESH_MS = 920;
const SEARCH_DELAY_MS = 280;
const SESSION_PREFIX = 'veinvite-network-canvas-v1:';
const NETWORK_CANVAS_ENABLED =
  process.env.NEXT_PUBLIC_NETWORK_CANVAS_ENABLED !== 'false';

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`;
}

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sessionKey(wallet: string): string {
  return `${SESSION_PREFIX}${keyWallet(wallet)}`;
}

function readSavedState(wallet: string): SavedState | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (!Array.isArray(parsed.activePath) || !parsed.activePath.every((item) => typeof item === 'string')) {
      return null;
    }
    return {
      activePath: parsed.activePath,
      pageByParent: Array.isArray(parsed.pageByParent) ? parsed.pageByParent as Array<[string, number]> : [],
      collapsedParents: Array.isArray(parsed.collapsedParents) ? parsed.collapsedParents.filter((item): item is string => typeof item === 'string') : [],
      view: parsed.view && typeof parsed.view.x === 'number' && typeof parsed.view.y === 'number' && typeof parsed.view.scale === 'number'
        ? parsed.view
        : { x: 0, y: 30, scale: 1 },
    };
  } catch {
    return null;
  }
}

async function fetchNetwork(
  rootWallet: string,
  options: {
    focus?: string;
    query?: string;
    signal?: AbortSignal;
  } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (options.focus && keyWallet(options.focus) !== keyWallet(rootWallet)) {
    params.set('focus', options.focus);
  }
  if (options.query) params.set('q', options.query);

  const response = await fetch(`/api/network?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });

  const payload = await response.json().catch(() => null) as NetworkData | { error?: string } | null;
  if (!response.ok) {
    const message = payload && 'error' in payload && payload.error
      ? payload.error
      : 'Failed to load network.';
    throw new Error(message);
  }
  if (
    !payload ||
    !('rootWallet' in payload) ||
    !payload.rootWallet ||
    !payload.focusWallet ||
    !payload.summary ||
    !Array.isArray(payload.children)
  ) {
    throw new Error('Network response was incomplete.');
  }
  return payload as NetworkData;
}

function NeutralAvatar({ root = false }: { root?: boolean }) {
  const size = root ? 38 : 30;
  return (
    <span
      aria-hidden="true"
      className="neutralAvatar"
      style={{ width: size, height: size }}
    >
      <svg width={root ? 18 : 15} height={root ? 18 : 15} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="6.1" r="2.7" fill="currentColor" />
        <path d="M5 15.6c1.15-2.25 2.82-3.35 5-3.35s3.85 1.1 5 3.35" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function profileFilter(tone: Tone, root: boolean): string {
  if (root || tone === 'focus') return 'saturate(1) brightness(.96)';
  if (tone === 'near') return 'saturate(.52) brightness(.72)';
  return 'saturate(.78) brightness(.82)';
}

const NetworkIdentity = memo(function NetworkIdentity({
  address,
  root = false,
  tone,
  showLabel = true,
}: {
  address: string;
  root?: boolean;
  tone: Tone;
  showLabel?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(root);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { data: domainInfo } = useVechainDomain(shouldLoad ? address : undefined);
  const domain = domainInfo?.domain ?? '';
  const { data: avatarUrl } = useGetAvatar(domain);
  const size = root ? 38 : 30;
  const label = domain || shortWallet(address);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || shouldLoad) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span className="identity" ref={hostRef}>
      <span className="avatarSlot" style={{ width: size, height: size }}>
        <NeutralAvatar root={root} />
        {avatarUrl && !broken ? (
          <img
            src={avatarUrl}
            alt=""
            loading={root ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            style={{
              width: size,
              height: size,
              opacity: loaded ? 1 : 0,
              filter: profileFilter(tone, root),
            }}
          />
        ) : null}
      </span>
      {showLabel ? (
        <span className="identityLabel" dir={domain ? 'auto' : 'ltr'} title={domain || address}>
          {label}
        </span>
      ) : null}
    </span>
  );
});

function statusLabel(status: MemberStatus, locale: Locale): string {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  if (status === 'REWARDED') return t.rewarded;
  if (status === 'QUALIFIED') return t.qualified;
  return t.inProgress;
}

function buildLayout({
  rootWallet,
  activePath,
  cache,
  memberByWallet,
  pageByParent,
  collapsedParents,
  explorerParent,
  isMobile,
  freshParent,
}: {
  rootWallet: string;
  activePath: string[];
  cache: Map<string, NetworkData>;
  memberByWallet: Map<string, NetworkChild>;
  pageByParent: Map<string, number>;
  collapsedParents: Set<string>;
  explorerParent: string | null;
  isMobile: boolean;
  freshParent: string | null;
}) {
  const visuals: Visual[] = [];
  const edges: EdgeVisual[] = [];
  const pagers: PagerVisual[] = [];
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  const pageSize = isMobile ? 5 : 8;
  const previewSize = isMobile ? 4 : 5;
  const largeThreshold = isMobile ? 6 : 10;
  const startDepth = Math.max(0, activePath.length - (isMobile ? 4 : 5));
  const startWallet = activePath[startDepth] ?? rootWallet;
  const startY = startDepth > 0 ? ROOT_Y + 26 : ROOT_Y;

  positions.set(startWallet, { x: CENTER_X, y: startY, depth: startDepth });
  visuals.push({
    kind: 'person',
    key: `person:${startWallet}`,
    wallet: startWallet,
    x: CENTER_X,
    y: startY,
    depth: startDepth,
    parentWallet: startDepth > 0 ? activePath[startDepth - 1] ?? null : null,
    parentX: CENTER_X,
    parentY: startY,
    member: startDepth === 0 ? null : memberByWallet.get(startWallet) ?? null,
    root: startDepth === 0,
  });

  for (let depth = startDepth; depth < activePath.length; depth += 1) {
    const parentWallet = activePath[depth];
    const parentPosition = positions.get(parentWallet);
    const data = cache.get(parentWallet);
    if (!parentPosition || !data || collapsedParents.has(parentWallet)) break;

    const activeChild = activePath[depth + 1] ?? null;
    const children = data.children;
    if (children.length === 0) continue;

    let entries: Array<NetworkChild | 'cluster'>;
    let page = pageByParent.get(parentWallet) ?? 0;
    const activeIndex = activeChild
      ? children.findIndex((child) => keyWallet(child.wallet) === activeChild)
      : -1;
    const activeBeyondPreview = activeIndex >= previewSize;
    const showExplorer =
      children.length > largeThreshold &&
      (explorerParent === parentWallet || activeBeyondPreview);

    if (children.length <= largeThreshold) {
      entries = children;
    } else if (showExplorer) {
      if (activeIndex >= 0) page = Math.floor(activeIndex / pageSize);
      const pageCount = Math.ceil(children.length / pageSize);
      page = clamp(page, 0, pageCount - 1);
      entries = children.slice(page * pageSize, page * pageSize + pageSize);
      const start = page * pageSize;
      pagers.push({
        parentWallet,
        x: parentPosition.x,
        y: parentPosition.y + 58,
        page,
        pageCount,
        start: start + 1,
        end: Math.min(children.length, start + pageSize),
        total: children.length,
        depth,
      });
    } else {
      entries = [...children.slice(0, previewSize), 'cluster'];
    }

    const centerIndex = (entries.length - 1) / 2;
    const step = parentWallet === rootWallet
      ? (isMobile ? 70 : 130)
      : (isMobile ? 64 : 88);

    entries.forEach((entry, index) => {
      const offset = index - centerIndex;
      const childX = parentPosition.x + offset * step;
      const fanDrop = Math.min(10, Math.abs(offset) * 3);
      const childY = parentPosition.y + LEVEL_GAP + fanDrop;
      const stagger = Math.round(Math.abs(offset) * 34);

      if (entry === 'cluster') {
        const remaining = Math.max(0, children.length - previewSize);
        visuals.push({
          kind: 'cluster',
          key: `cluster:${parentWallet}`,
          parentWallet,
          x: childX,
          y: childY,
          depth: depth + 1,
          parentX: parentPosition.x,
          parentY: parentPosition.y,
          remaining,
        });
        edges.push({
          key: `${parentWallet}->cluster`,
          parentWallet,
          childWallet: null,
          parentDepth: depth,
          x1: parentPosition.x,
          y1: parentPosition.y + 20,
          x2: childX,
          y2: childY - 20,
          active: false,
          fresh: freshParent === parentWallet,
          stagger,
        });
        return;
      }

      const childWallet = keyWallet(entry.wallet);
      positions.set(childWallet, { x: childX, y: childY, depth: depth + 1 });
      if (!visuals.some((visual) => visual.kind === 'person' && visual.wallet === childWallet)) {
        visuals.push({
          kind: 'person',
          key: `person:${childWallet}`,
          wallet: childWallet,
          x: childX,
          y: childY,
          depth: depth + 1,
          parentWallet,
          parentX: parentPosition.x,
          parentY: parentPosition.y,
          member: entry,
          root: false,
        });
      }
      edges.push({
        key: `${parentWallet}->${childWallet}`,
        parentWallet,
        childWallet,
        parentDepth: depth,
        x1: parentPosition.x,
        y1: parentPosition.y + 20,
        x2: childX,
        y2: childY - 20,
        active: activeChild === childWallet,
        fresh: freshParent === parentWallet,
        stagger,
      });
    });

    if (activeChild && !positions.has(activeChild)) break;
  }

  return {
    visuals,
    edges,
    pagers,
    positions,
    startDepth,
    pageSize,
    previewSize,
    largeThreshold,
  };
}

export function AppNetwork({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const {
    wallet,
    openWallet,
    isWalletActionPending,
  } = useWalletLauncher();
  const rootWallet = wallet ? keyWallet(wallet) : '';
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, NetworkData>>(new Map());
  const requestSerialRef = useRef(0);
  const branchRequestRef = useRef<AbortController | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const freshTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const singlePointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);

  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [activePath, setActivePath] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<BranchError | null>(null);
  const [pageByParent, setPageByParent] = useState<Map<string, number>>(new Map());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [explorerParent, setExplorerParent] = useState<string | null>(null);
  const [collapseAfterDepth, setCollapseAfterDepth] = useState<number | null>(null);
  const [freshParent, setFreshParent] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 30, scale: 1 });
  const [stageSize, setStageSize] = useState({ width: 1000, height: 620 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const isMobile = stageSize.width < 640;

  const putCache = useCallback((data: NetworkData) => {
    cacheRef.current.set(keyWallet(data.focusWallet), data);
    setCacheVersion((value) => value + 1);
  }, []);

  const clearFreshSoon = useCallback(() => {
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => setFreshParent(null), FRESH_MS);
  }, []);

  const cancelBranchRequest = useCallback(() => {
    requestSerialRef.current += 1;
    branchRequestRef.current?.abort();
    branchRequestRef.current = null;
    setPendingWallet(null);
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
      setCollapseAfterDepth(null);
    }
    return requestSerialRef.current;
  }, []);

  const hydrateSavedPath = useCallback(async (
    desiredPath: string[],
    signal: AbortSignal,
  ) => {
    if (!wallet || desiredPath.length < 2) return;
    const start = Math.max(0, desiredPath.length - 5);
    const parents = desiredPath.slice(start, -1);
    const missing = parents.filter((item) => !cacheRef.current.has(item));
    const payloads = await Promise.all(
      missing.map((focus) => fetchNetwork(wallet, { focus, signal })),
    );
    payloads.forEach((payload) => cacheRef.current.set(keyWallet(payload.focusWallet), payload));
    if (payloads.length > 0) setCacheVersion((value) => value + 1);
  }, [wallet]);

  const loadRoot = useCallback(async (signal?: AbortSignal) => {
    if (!wallet) return;
    const serial = ++requestSerialRef.current;
    setLoadState('loading');
    setLoadError('');
    setBranchError(null);
    try {
      const root = await fetchNetwork(wallet, { signal });
      if (serial !== requestSerialRef.current) return;
      cacheRef.current.clear();
      cacheRef.current.set(keyWallet(root.focusWallet), root);
      setCacheVersion((value) => value + 1);

      const saved = readSavedState(wallet);
      let nextPath = [keyWallet(root.rootWallet)];
      if (saved) {
        const candidate = saved.activePath.map(keyWallet);
        if (
          candidate.length > 0 &&
          candidate[0] === keyWallet(root.rootWallet) &&
          candidate.every(validWallet)
        ) {
          try {
            await hydrateSavedPath(candidate, signal ?? new AbortController().signal);
            if (serial === requestSerialRef.current) nextPath = candidate;
          } catch {
            nextPath = [keyWallet(root.rootWallet)];
          }
        }
        setPageByParent(new Map(saved.pageByParent.map(([parent, page]) => [keyWallet(parent), page])));
        setCollapsedParents(new Set(saved.collapsedParents.map(keyWallet)));
        setView({
          x: saved.view.x,
          y: saved.view.y,
          scale: clamp(saved.view.scale, MIN_SCALE, MAX_SCALE),
        });
      } else {
        setPageByParent(new Map());
        setCollapsedParents(new Set());
        setView({ x: 0, y: 30, scale: 1 });
      }

      if (serial !== requestSerialRef.current) return;
      setActivePath(nextPath);
      setSelectedWallet(null);
      setExplorerParent(null);
      setLoadState('ready');
      setFreshParent(keyWallet(root.rootWallet));
      clearFreshSoon();
    } catch (error) {
      if (signal?.aborted || serial !== requestSerialRef.current) return;
      setLoadState('error');
      setLoadError(error instanceof Error ? error.message : t.loadError);
    }
  }, [wallet, hydrateSavedPath, clearFreshSoon, t.loadError]);

  useEffect(() => {
    requestSerialRef.current += 1;
    branchRequestRef.current?.abort();
    branchRequestRef.current = null;
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
    cacheRef.current.clear();
    setCacheVersion((value) => value + 1);
    setActivePath([]);
    setSelectedWallet(null);
    setPendingWallet(null);
    setBranchError(null);
    setExplorerParent(null);
    setCollapseAfterDepth(null);
    setSearchQuery('');
    setSearchResults([]);

    if (!wallet || !NETWORK_CANVAS_ENABLED) {
      setLoadState('idle');
      return;
    }

    const controller = new AbortController();
    void loadRoot(controller.signal);
    return () => controller.abort();
  }, [wallet, loadRoot]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({
      width: stage.clientWidth || 1000,
      height: stage.clientHeight || 620,
    });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [loadState]);

  useEffect(() => {
    if (!wallet || loadState !== 'ready') return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const state: SavedState = {
        activePath,
        pageByParent: Array.from(pageByParent.entries()),
        collapsedParents: Array.from(collapsedParents),
        view,
      };
      try {
        window.sessionStorage.setItem(sessionKey(wallet), JSON.stringify(state));
      } catch {
        // The server remains authoritative when storage is unavailable.
      }
    }, 240);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [wallet, loadState, activePath, pageByParent, collapsedParents, view]);

  useEffect(() => {
    if (!wallet || loadState !== 'ready') return;
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetchNetwork(wallet, { query, signal: controller.signal })
        .then((payload) => setSearchResults(payload.searchResults ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [wallet, loadState, searchQuery]);

  useEffect(() => () => {
    branchRequestRef.current?.abort();
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    if (freshTimerRef.current) window.clearTimeout(freshTimerRef.current);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const memberByWallet = useMemo(() => {
    const map = new Map<string, NetworkChild>();
    cacheRef.current.forEach((payload) => {
      payload.children.forEach((child) => map.set(keyWallet(child.wallet), child));
    });
    return map;
  }, [cacheVersion]);

  const rootData = rootWallet ? cacheRef.current.get(rootWallet) ?? null : null;

  const layout = useMemo(() => buildLayout({
    rootWallet,
    activePath,
    cache: cacheRef.current,
    memberByWallet,
    pageByParent,
    collapsedParents,
    explorerParent,
    isMobile,
    freshParent,
  }), [
    rootWallet,
    activePath,
    memberByWallet,
    pageByParent,
    collapsedParents,
    explorerParent,
    isMobile,
    freshParent,
    cacheVersion,
  ]);

  const activeSet = useMemo(() => new Set(activePath), [activePath]);

  const toneFor = useCallback((visual: PersonVisual): Tone => {
    if (!selectedWallet) return 'normal';
    if (visual.wallet === selectedWallet || activeSet.has(visual.wallet)) return 'focus';
    if (visual.parentWallet && activeSet.has(visual.parentWallet)) return 'near';
    return 'normal';
  }, [selectedWallet, activeSet]);

  const commitPath = useCallback((
    nextPath: string[],
    keepDepth: number,
    bloomParent: string | null,
  ) => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
    const hasOldDescendants = activePath.length - 1 > keepDepth;
    const finish = () => {
      setActivePath(nextPath);
      setCollapseAfterDepth(null);
      setPendingWallet(null);
      setBranchError(null);
      setExplorerParent((current) => current && nextPath.includes(current) ? current : null);
      if (bloomParent) {
        setFreshParent(bloomParent);
        clearFreshSoon();
      }
    };
    if (!hasOldDescendants) {
      finish();
      return;
    }
    setCollapseAfterDepth(keepDepth);
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      finish();
    }, COLLAPSE_MS);
  }, [activePath, clearFreshSoon]);

  const activateWallet = useCallback(async (
    targetWallet: string,
    parentDepth: number,
  ) => {
    if (!wallet || suppressClickRef.current) return;
    const serial = cancelBranchRequest();
    const target = keyWallet(targetWallet);
    setSelectedWallet(target);
    setBranchError(null);

    if (activePath[parentDepth + 1] === target) {
      if (collapsedParents.has(target)) {
        setCollapsedParents((current) => {
          const next = new Set(current);
          next.delete(target);
          return next;
        });
        setFreshParent(target);
        clearFreshSoon();
      }
      return;
    }

    const prefix = activePath.slice(0, parentDepth + 1);
    const nextPath = [...prefix, target];
    const parent = cacheRef.current.get(activePath[parentDepth]);
    const member = parent?.children.find((child) => keyWallet(child.wallet) === target) ?? null;

    setCollapsedParents((current) => {
      if (!current.has(target)) return current;
      const next = new Set(current);
      next.delete(target);
      return next;
    });

    if (!member || member.direct <= 0) {
      commitPath(nextPath, parentDepth + 1, null);
      return;
    }

    const cached = cacheRef.current.get(target);
    if (cached) {
      commitPath(nextPath, parentDepth + 1, target);
      return;
    }

    const controller = new AbortController();
    branchRequestRef.current = controller;
    setPendingWallet(target);
    try {
      const payload = await fetchNetwork(wallet, { focus: target, signal: controller.signal });
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      putCache(payload);
      commitPath(nextPath, parentDepth + 1, target);
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      setPendingWallet(null);
      setBranchError({
        wallet: target,
        parentDepth,
        message: error instanceof Error ? error.message : t.loadError,
      });
    } finally {
      if (branchRequestRef.current === controller) branchRequestRef.current = null;
    }
  }, [
    wallet,
    activePath,
    collapsedParents,
    cancelBranchRequest,
    commitPath,
    clearFreshSoon,
    putCache,
    t.loadError,
  ]);

  const collapseNode = useCallback((walletToCollapse: string, depth: number) => {
    if (suppressClickRef.current) return;
    cancelBranchRequest();
    const target = keyWallet(walletToCollapse);
    setSelectedWallet(target);
    if (collapsedParents.has(target)) {
      setCollapsedParents((current) => {
        const next = new Set(current);
        next.delete(target);
        return next;
      });
      setFreshParent(target);
      clearFreshSoon();
      return;
    }

    setCollapseAfterDepth(depth);
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      setActivePath((current) => current.slice(0, depth + 1));
      setCollapsedParents((current) => new Set(current).add(target));
      setExplorerParent((current) => current === target ? null : current);
      setCollapseAfterDepth(null);
    }, COLLAPSE_MS);
  }, [collapsedParents, cancelBranchRequest, clearFreshSoon]);

  const openExplorer = useCallback((parentWallet: string) => {
    if (suppressClickRef.current) return;
    cancelBranchRequest();
    setExplorerParent(parentWallet);
    setPageByParent((current) => new Map(current).set(parentWallet, current.get(parentWallet) ?? 0));
  }, [cancelBranchRequest]);

  const changePage = useCallback((pager: PagerVisual, direction: number) => {
    if (suppressClickRef.current) return;
    cancelBranchRequest();
    const nextPage = clamp(pager.page + direction, 0, pager.pageCount - 1);
    if (nextPage === pager.page) return;
    const parentDepth = activePath.indexOf(pager.parentWallet);
    if (parentDepth >= 0 && activePath[parentDepth + 1]) {
      const parent = cacheRef.current.get(pager.parentWallet);
      const activeChild = activePath[parentDepth + 1];
      const index = parent?.children.findIndex((child) => keyWallet(child.wallet) === activeChild) ?? -1;
      const activePage = index >= 0 ? Math.floor(index / layout.pageSize) : -1;
      if (activePage !== nextPage) {
        setActivePath((current) => current.slice(0, parentDepth + 1));
        setSelectedWallet(pager.parentWallet);
      }
    }
    setPageByParent((current) => new Map(current).set(pager.parentWallet, nextPage));
    setExplorerParent(pager.parentWallet);
  }, [activePath, cancelBranchRequest, layout.pageSize]);

  const closeExplorer = useCallback((pager: PagerVisual) => {
    cancelBranchRequest();
    const parentDepth = activePath.indexOf(pager.parentWallet);
    const parent = cacheRef.current.get(pager.parentWallet);
    const activeChild = parentDepth >= 0 ? activePath[parentDepth + 1] : null;
    if (activeChild && parent) {
      const index = parent.children.findIndex((child) => keyWallet(child.wallet) === activeChild);
      if (index >= layout.previewSize) {
        setActivePath((current) => current.slice(0, parentDepth + 1));
        setSelectedWallet(pager.parentWallet);
      }
    }
    setExplorerParent(null);
  }, [activePath, cancelBranchRequest, layout.previewSize]);

  const focusSearchResult = useCallback(async (targetWallet: string) => {
    if (!wallet) return;
    const serial = cancelBranchRequest();
    const target = keyWallet(targetWallet);
    const controller = new AbortController();
    branchRequestRef.current = controller;
    setPendingWallet(target);
    setBranchError(null);
    try {
      const targetData = await fetchNetwork(wallet, { focus: target, signal: controller.signal });
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      const breadcrumb = targetData.breadcrumb.map(keyWallet);
      const start = Math.max(0, breadcrumb.length - 5);
      const parents = breadcrumb.slice(start, -1);
      const missing = parents.filter((item) => !cacheRef.current.has(item));
      const payloads = await Promise.all(
        missing.map((focus) => fetchNetwork(wallet, { focus, signal: controller.signal })),
      );
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      payloads.forEach((payload) => cacheRef.current.set(keyWallet(payload.focusWallet), payload));
      cacheRef.current.set(target, targetData);
      setCacheVersion((value) => value + 1);

      const nextPages = new Map(pageByParent);
      const pageSize = isMobile ? 5 : 8;
      for (let depth = start; depth < breadcrumb.length - 1; depth += 1) {
        const parentWallet = breadcrumb[depth];
        const childWallet = breadcrumb[depth + 1];
        const parent = cacheRef.current.get(parentWallet);
        const index = parent?.children.findIndex((child) => keyWallet(child.wallet) === childWallet) ?? -1;
        if (index >= 0) nextPages.set(parentWallet, Math.floor(index / pageSize));
      }
      setPageByParent(nextPages);
      setCollapsedParents((current) => {
        const next = new Set(current);
        breadcrumb.forEach((item) => next.delete(item));
        return next;
      });

      let common = 0;
      while (common < activePath.length && common < breadcrumb.length && activePath[common] === breadcrumb[common]) common += 1;
      const keepDepth = Math.max(0, common - 1);
      setSelectedWallet(target);
      setSearchQuery('');
      setSearchResults([]);
      commitPath(breadcrumb, keepDepth, target);
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      setBranchError({
        wallet: target,
        parentDepth: Math.max(0, activePath.length - 1),
        message: error instanceof Error ? error.message : t.loadError,
      });
      setPendingWallet(null);
    } finally {
      if (branchRequestRef.current === controller) branchRequestRef.current = null;
    }
  }, [wallet, activePath, pageByParent, isMobile, cancelBranchRequest, commitPath, t.loadError]);

  useEffect(() => {
    if (loadState !== 'ready' || activePath.length === 0) return;
    const last = activePath[activePath.length - 1];
    const position = layout.positions.get(last);
    if (!position) return;
    const safeTop = 88;
    const safeBottom = stageSize.height - (isMobile ? 150 : 95);
    const safeLeft = 68;
    const safeRight = stageSize.width - (selectedWallet && !isMobile ? 270 : 68);
    const screenX = stageSize.width / 2 + view.x + (position.x - CENTER_X) * view.scale;
    const screenY = view.y + position.y * view.scale;
    let dx = 0;
    let dy = 0;
    if (screenX < safeLeft) dx = safeLeft - screenX;
    if (screenX > safeRight) dx = safeRight - screenX;
    if (screenY < safeTop) dy = safeTop - screenY;
    if (screenY > safeBottom) dy = safeBottom - screenY;
    if (dx || dy) {
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    }
  }, [activePath, layout.positions, stageSize, view.scale, selectedWallet, isMobile]);

  const selectedMember = selectedWallet ? memberByWallet.get(selectedWallet) ?? null : null;
  const selectedData = selectedWallet ? cacheRef.current.get(selectedWallet) ?? null : null;
  const selectedNetwork = selectedData?.summary.network ?? selectedMember?.network ?? 0;
  const selectedDirect = selectedData?.summary.direct ?? selectedMember?.direct ?? 0;
  const selectedQualified = selectedData?.summary.qualified ?? selectedMember?.qualified ?? 0;
  const selectedStatus = selectedMember?.status ?? 'IN_PROGRESS';

  const loadingVisual = pendingWallet
    ? layout.visuals.find((visual) => visual.kind === 'person' && visual.wallet === pendingWallet) as PersonVisual | undefined
    : undefined;
  const errorVisual = branchError
    ? layout.visuals.find((visual) => visual.kind === 'person' && visual.wallet === branchError.wallet) as PersonVisual | undefined
    : undefined;

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-pan="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    suppressClickRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (pointersRef.current.size === 1) {
      singlePointerRef.current = point;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { center: midpoint(a, b), distance: distance(a, b) };
      singlePointerRef.current = null;
      suppressClickRef.current = true;
    }
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = singlePointerRef.current;
      if (previous) {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        dragDistanceRef.current += Math.hypot(dx, dy);
        if (dragDistanceRef.current > 6) suppressClickRef.current = true;
        setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
      }
      singlePointerRef.current = current;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const nextDistance = distance(a, b);
      const previous = pinchRef.current;
      if (previous && previous.distance > 0) {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect) {
          const px = center.x - rect.left - rect.width / 2;
          const py = center.y - rect.top;
          setView((value) => {
            const nextScale = clamp(value.scale * (nextDistance / previous.distance), MIN_SCALE, MAX_SCALE);
            const worldX = (px - value.x) / value.scale;
            const worldY = (py - value.y) / value.scale;
            return {
              x: px - worldX * nextScale + (center.x - previous.center.x),
              y: py - worldY * nextScale + (center.y - previous.center.y),
              scale: nextScale,
            };
          });
        }
      }
      pinchRef.current = { center, distance: nextDistance };
      suppressClickRef.current = true;
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      singlePointerRef.current = Array.from(pointersRef.current.values())[0];
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      singlePointerRef.current = null;
      pinchRef.current = null;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = event.clientX - rect.left - rect.width / 2;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setView((value) => {
      const nextScale = clamp(value.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (px - value.x) / value.scale;
      const worldY = (py - value.y) / value.scale;
      return {
        x: px - worldX * nextScale,
        y: py - worldY * nextScale,
        scale: nextScale,
      };
    });
  };

  if (!NETWORK_CANVAS_ENABLED) return null;

  if (!wallet) {
    return (
      <section className="networkCard networkCanvasPage networkStateCard">
        <div className="stateGlyph"><NeutralAvatar root /></div>
        <h1>{t.connectTitle}</h1>
        <p>{t.connectDescription}</p>
        <button type="button" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <section className="networkCard networkCanvasPage networkStateCard" aria-busy="true">
        <div className="loadingDots" aria-hidden="true"><i /><i /><i /></div>
        <h1>{t.title}</h1>
        <p>{t.directNetwork}</p>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'error' || !rootData) {
    return (
      <section className="networkCard networkCanvasPage networkStateCard">
        <div className="stateGlyph error">!</div>
        <h1>{t.loadError}</h1>
        <p>{loadError}</p>
        <button type="button" onClick={() => void loadRoot()}>{t.retry}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (rootData.summary.network === 0) {
    return (
      <section className="networkCard networkCanvasPage networkStateCard">
        <div className="stateGlyph"><NetworkIdentity address={rootWallet} root tone="focus" showLabel={false} /></div>
        <h1>{t.emptyTitle}</h1>
        <p>{t.emptyDescription}</p>
        <button type="button" onClick={() => window.location.assign('/')}>{t.inviteFriend}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  return (
    <section className="networkCard networkCanvasPage">
      <header className="networkHeader" data-no-pan="true">
        <div className="headerTitle">
          <span>NETWORK</span>
          <h1>{t.title}</h1>
        </div>
        <div className="summary" aria-label={t.networkSize}>
          <strong>{rootData.summary.network.toLocaleString()}</strong>
          <span>{t.networkSize}</span>
          <i />
          <strong className="growth">
            {rootData.summary.thisRound === null
              ? '—'
              : `+${rootData.summary.thisRound.toLocaleString()}`}
          </strong>
          <span>{t.thisRound}</span>
        </div>
      </header>

      <div className="searchWrap" data-no-pan="true">
        <span aria-hidden="true">⌕</span>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        {searching ? <i className="searchSpinner" aria-hidden="true" /> : null}
        {searchQuery.trim().length >= 3 ? (
          <div className="searchResults">
            {searchResults.length > 0 ? searchResults.map((result) => (
              <button
                key={result.wallet}
                type="button"
                onClick={() => void focusSearchResult(result.wallet)}
              >
                <span>{shortWallet(result.wallet)}</span>
                <small>{result.depth}</small>
              </button>
            )) : !searching ? <p>{t.noSearchResults}</p> : null}
          </div>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="networkStage"
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={onPointerEndCapture}
        onPointerCancelCapture={onPointerEndCapture}
        onWheel={onWheel}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
          if (suppressClickRef.current || dragDistanceRef.current > 6) return;
          setSelectedWallet(null);
          setBranchError(null);
        }}
      >
        <div className="ambient" aria-hidden="true" />

        {layout.startDepth > 0 ? (
          <div className="pathContext" data-no-pan="true" data-network-interactive="true">
            <span>{c.you}</span><i>›</i><span>…</span><i>›</i><strong>{shortWallet(activePath[layout.startDepth])}</strong>
          </div>
        ) : null}

        <div
          className="world"
          style={{
            width: PLANE_W,
            height: PLANE_H,
            marginLeft: -PLANE_W / 2,
            transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
          }}
        >
          <svg className="edges" width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} aria-hidden="true">
            {layout.edges.map((edge) => {
              const collapsing = collapseAfterDepth !== null && edge.parentDepth >= collapseAfterDepth;
              return (
                <line
                  key={edge.key}
                  className={`${edge.active ? 'activeEdge' : ''} ${edge.fresh ? 'freshEdge' : ''} ${collapsing ? 'collapsing' : ''}`}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  pathLength={1}
                  style={{ '--stagger': `${edge.stagger}ms` } as CSSProperties}
                />
              );
            })}
          </svg>

          {layout.visuals.map((visual) => {
            const collapsing = collapseAfterDepth !== null && visual.depth > collapseAfterDepth;
            if (visual.kind === 'cluster') {
              return (
                <button
                  key={visual.key}
                  type="button"
                  className={`clusterNode ${freshParent === visual.parentWallet ? 'freshNode' : ''} ${collapsing ? 'collapsing' : ''}`}
                  style={{ left: visual.x, top: visual.y } as CSSProperties}
                  data-network-interactive="true"
                  onClick={() => openExplorer(visual.parentWallet)}
                >
                  <span className="clusterStack" aria-hidden="true"><i /><i /><i /></span>
                  <strong>+{visual.remaining}</strong>
                  <small>{t.direct}</small>
                </button>
              );
            }

            const isRootNode = visual.root;
            const isActiveNode = activeSet.has(visual.wallet);
            const nodeTone = toneFor(visual);
            const isSelected = selectedWallet === visual.wallet;
            const isPending = pendingWallet === visual.wallet;
            const focusData = cacheRef.current.get(visual.wallet);
            const canExpand = isRootNode || (visual.member?.direct ?? focusData?.summary.direct ?? 0) > 0;
            const isOpen = canExpand && isActiveNode && !collapsedParents.has(visual.wallet) && Boolean(cacheRef.current.get(visual.wallet));
            const branchCount = isRootNode
              ? rootData.summary.network
              : 1 + (focusData?.summary.network ?? visual.member?.network ?? 0);
            const parentDepth = Math.max(0, visual.depth - 1);

            return (
              <div
                key={visual.key}
                className={`personNode tone-${nodeTone} ${isSelected ? 'selected' : ''} ${isRootNode ? 'root' : ''} ${freshParent === visual.parentWallet ? 'freshNode' : ''} ${collapsing ? 'collapsing' : ''} ${isPending ? 'pending' : ''}`}
                style={{ left: visual.x, top: visual.y } as CSSProperties}
              >
                <button
                  type="button"
                  className="personTap"
                  data-network-interactive="true"
                  aria-label={isRootNode ? c.you : shortWallet(visual.wallet)}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    if (isActiveNode) {
                      setSelectedWallet(visual.wallet);
                      if (collapsedParents.has(visual.wallet) && canExpand) collapseNode(visual.wallet, visual.depth);
                      return;
                    }
                    void activateWallet(visual.wallet, parentDepth);
                  }}
                >
                  <NetworkIdentity address={visual.wallet} root={isRootNode} tone={nodeTone} />
                  <small className="nodeMetric">
                    {isRootNode ? `${rootData.summary.direct} ${t.direct}` : branchCount.toLocaleString()}
                  </small>
                </button>
                {!isRootNode && canExpand && isActiveNode ? (
                  <button
                    type="button"
                    className={`branchToggle ${isOpen ? 'open' : ''}`}
                    data-network-interactive="true"
                    aria-label={isOpen ? c.collapseBranch : c.expandBranch}
                    onClick={() => collapseNode(visual.wallet, visual.depth)}
                  ><span /></button>
                ) : null}
              </div>
            );
          })}

          {layout.pagers.map((pager) => (
            <div
              key={pager.parentWallet}
              className="siblingPager"
              data-no-pan="true"
              data-network-interactive="true"
              style={{ left: pager.x, top: pager.y } as CSSProperties}
            >
              <button type="button" disabled={pager.page === 0} onClick={() => changePage(pager, -1)}>‹</button>
              <span><b>{pager.start}–{pager.end}</b> / {pager.total}</span>
              <button type="button" disabled={pager.page >= pager.pageCount - 1} onClick={() => changePage(pager, 1)}>›</button>
              <button type="button" className="pagerClose" aria-label={c.close} onClick={() => closeExplorer(pager)}>×</button>
            </div>
          ))}

          {loadingVisual ? (
            <div className="branchLoader" style={{ left: loadingVisual.x, top: loadingVisual.y + 54 } as CSSProperties}><i /><i /><i /></div>
          ) : null}

          {errorVisual && branchError ? (
            <div
              className="branchError"
              data-no-pan="true"
              data-network-interactive="true"
              style={{ left: errorVisual.x, top: errorVisual.y + 62 } as CSSProperties}
            >
              <span>{t.loadError}</span>
              <button type="button" onClick={() => void activateWallet(branchError.wallet, branchError.parentDepth)}>{t.retry}</button>
            </div>
          ) : null}
        </div>

        {selectedWallet && selectedWallet !== rootWallet ? (
          <aside className="inspector" data-no-pan="true" data-network-interactive="true">
            <div className="inspectorHead">
              <NetworkIdentity address={selectedWallet} tone="focus" showLabel={false} />
              <div>
                <strong>{shortWallet(selectedWallet)}</strong>
                <small>{statusLabel(selectedStatus, locale)}</small>
              </div>
              <button type="button" onClick={() => setSelectedWallet(null)} aria-label={c.close}>×</button>
            </div>
            <code>{selectedWallet}</code>
            <div className="inspectorMetrics">
              <span><b>{(1 + selectedNetwork).toLocaleString()}</b>{c.branch}</span>
              <span><b>{selectedNetwork.toLocaleString()}</b>{c.networkBelow}</span>
              <span><b>{selectedDirect.toLocaleString()}</b>{t.direct}</span>
              <span><b>{selectedQualified.toLocaleString()}</b>{t.qualified}</span>
            </div>
          </aside>
        ) : null}

        <div className="stageControls" data-no-pan="true" data-network-interactive="true">
          <button type="button" aria-label={c.centerNetwork} onClick={() => setView({ x: 0, y: 30, scale: 1 })}>◎</button>
          <button type="button" aria-label={c.zoomIn} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + .1, MIN_SCALE, MAX_SCALE) }))}>+</button>
          <button type="button" aria-label={c.zoomOut} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - .1, MIN_SCALE, MAX_SCALE) }))}>−</button>
        </div>
      </div>

      <style jsx>{`
        .networkCanvasPage{width:min(calc(100vw - 28px),1180px);margin:0 auto;padding:0;min-height:0;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.networkHeader{min-height:52px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;gap:18px}.headerTitle{display:grid;gap:2px}.headerTitle>span{color:#8c7d5d;font-size:.54rem;font-weight:950;letter-spacing:.14em}.headerTitle h1{margin:0;color:#f5f1e8;font-size:.92rem;letter-spacing:-.02em}.summary{display:flex;align-items:baseline;gap:5px;color:#716d65;font-size:.54rem;white-space:nowrap}.summary strong{color:#d7d0c3;font-size:.7rem}.summary .growth{color:#e7b63f}.summary i{width:1px;height:10px;margin:0 3px;background:rgba(255,255,255,.08)}
        .searchWrap{position:relative;z-index:30;width:min(100% - 20px,420px);height:38px;margin:2px auto 5px;display:flex;align-items:center;gap:8px;padding:0 11px;box-sizing:border-box;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(16,16,14,.72);backdrop-filter:blur(12px)}.searchWrap>span{color:#786f60;font-size:.92rem}.searchWrap input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#d8d3ca;font:inherit;font-size:.65rem;direction:ltr}.searchWrap input::placeholder{color:#625d54}.searchSpinner{width:10px;height:10px;border:1px solid rgba(244,183,40,.2);border-top-color:#c99c34;border-radius:50%;animation:spin .7s linear infinite}.searchResults{position:absolute;left:0;right:0;top:43px;padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(14,14,12,.97);box-shadow:0 18px 45px rgba(0,0,0,.38)}.searchResults button{width:100%;min-height:36px;padding:0 8px;border:0;border-radius:9px;background:transparent;display:flex;align-items:center;justify-content:space-between;color:#bdb6aa;font:inherit;font-size:.61rem;cursor:pointer}.searchResults button:hover{background:rgba(244,183,40,.06)}.searchResults button small{color:#736a5d}.searchResults p{margin:8px;color:#716c64;font-size:.58rem}
        .networkStage{position:relative;height:clamp(540px,calc(100svh - 244px),760px);overflow:hidden;touch-action:none;user-select:none;cursor:grab}.networkStage:active{cursor:grabbing}.ambient{position:absolute;left:50%;top:0;width:min(860px,92vw);height:420px;transform:translateX(-50%);pointer-events:none;background:radial-gradient(ellipse,rgba(244,183,40,.045),transparent 68%)}.world{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.edges{position:absolute;inset:0;pointer-events:none;overflow:visible}.edges line{vector-effect:non-scaling-stroke;stroke:rgba(216,209,196,.115);stroke-width:1;stroke-linecap:round;transition:opacity 175ms ease,stroke 220ms ease}.edges line.activeEdge{stroke:rgba(226,183,72,.38)}.edges line.freshEdge{stroke:rgba(244,183,40,.62);stroke-dasharray:1;stroke-dashoffset:1;animation:drawEdge 500ms cubic-bezier(.22,1,.36,1) var(--stagger) forwards,settleEdge 700ms ease 420ms forwards}.edges line.collapsing{opacity:0}
        .personNode,.clusterNode{position:absolute;z-index:4;transform:translate(-50%,-50%);transition:opacity 175ms ease,filter 230ms ease,transform 175ms ease}.personNode{width:92px;min-height:78px;display:flex;flex-direction:column;align-items:center}.personNode.tone-focus{opacity:1;z-index:8}.personNode.tone-near{opacity:.58;z-index:5}.personNode.tone-normal{opacity:.9}.personNode.collapsing,.clusterNode.collapsing{opacity:0;transform:translate(-50%,-64%) scale(.72)}.personNode.pending{opacity:.78}.personTap{min-width:44px;min-height:56px;padding:4px;border:0;background:transparent;color:inherit;font:inherit;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer}.selected :global(.avatarSlot){box-shadow:0 0 0 4px rgba(244,183,40,.075),0 0 22px rgba(244,183,40,.13)}.root :global(.avatarSlot){box-shadow:0 0 0 4px rgba(244,183,40,.05),0 0 24px rgba(244,183,40,.12)}.nodeMetric{color:#6c655a;font-size:.48rem;font-weight:800;line-height:1}.root .nodeMetric{color:#9b824a}.branchToggle{width:28px;height:16px;margin-top:-4px;border:0;background:transparent;display:grid;place-items:start center;cursor:pointer}.branchToggle span{position:relative;width:1px;height:7px;background:rgba(164,151,126,.30)}.branchToggle span:after{content:'';position:absolute;left:50%;bottom:-3px;width:4px;height:4px;border-right:1px solid rgba(164,151,126,.40);border-bottom:1px solid rgba(164,151,126,.40);transform:translateX(-50%) rotate(45deg)}.branchToggle.open span{background:rgba(218,177,75,.42)}.branchToggle.open span:after{bottom:-5px;transform:translateX(-50%) rotate(225deg)}
        .clusterNode{width:82px;min-height:66px;padding:4px;border:0;background:transparent;color:inherit;font:inherit;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer}.clusterStack{width:54px;height:30px;display:flex;align-items:center;justify-content:center}.clusterStack i{width:27px;height:27px;margin-left:-9px;border:1px solid rgba(201,184,147,.16);border-radius:50%;background:#151410;box-shadow:0 5px 14px rgba(0,0,0,.26)}.clusterStack i:first-child{margin-left:0}.clusterNode strong{color:#b99b55;font-size:.64rem}.clusterNode small{color:#696155;font-size:.43rem}.freshNode{animation:bloomNode 690ms cubic-bezier(.16,1.04,.30,1) both}.freshNode :global(.avatarSlot){animation:freshHalo 920ms ease both}
        :global(.identity){display:flex;flex-direction:column;align-items:center;gap:4px;max-width:88px}:global(.avatarSlot){position:relative;display:block;border-radius:50%;transition:box-shadow 220ms ease}:global(.neutralAvatar){display:grid;place-items:center;border:1px solid rgba(205,189,154,.19);border-radius:50%;background:radial-gradient(circle at 38% 32%,rgba(215,190,132,.06),transparent 45%),#141411;color:rgba(179,167,142,.58);box-shadow:0 5px 14px rgba(0,0,0,.22)}.root :global(.neutralAvatar){border-color:rgba(244,183,40,.48);color:rgba(224,187,92,.78);background:radial-gradient(circle at 38% 32%,rgba(244,183,40,.12),transparent 45%),#15140f}:global(.avatarSlot img){position:absolute;inset:0;object-fit:cover;border:1px solid rgba(205,189,154,.19);border-radius:50%;transition:opacity 190ms ease,filter 220ms ease}:global(.identityLabel){display:block;max-width:88px;overflow:hidden;color:#bdb6aa;font-size:.6rem;font-weight:850;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}.root :global(.identityLabel){color:#dbb758}
        .siblingPager{position:absolute;z-index:14;transform:translate(-50%,-50%);height:29px;padding:0 5px;display:flex;align-items:center;gap:3px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(15,15,13,.93);box-shadow:0 10px 30px rgba(0,0,0,.28)}.siblingPager button{width:26px;height:23px;border:0;border-radius:8px;background:transparent;color:#998c73;font:inherit;cursor:pointer}.siblingPager button:disabled{opacity:.24}.siblingPager span{min-width:82px;color:#71695d;font-size:.46rem;text-align:center}.siblingPager span b{color:#c9a953}.siblingPager .pagerClose{width:22px;color:#5e5951}.branchLoader{position:absolute;z-index:16;transform:translate(-50%,-50%);display:flex;gap:5px;pointer-events:none}.branchLoader i{width:4px;height:4px;border-radius:50%;background:#b89242;opacity:.25;animation:loaderPulse .78s ease-in-out infinite}.branchLoader i:nth-child(2){animation-delay:.11s}.branchLoader i:nth-child(3){animation-delay:.22s}.branchError{position:absolute;z-index:18;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;padding:5px 6px;border:1px solid rgba(244,183,40,.13);border-radius:9px;background:rgba(17,16,13,.96);white-space:nowrap}.branchError span{color:#8b8170;font-size:.42rem}.branchError button{border:0;background:transparent;color:#d5aa43;font:inherit;font-size:.44rem;font-weight:900;cursor:pointer}
        .pathContext{position:absolute;z-index:20;left:13px;top:10px;min-height:28px;padding:0 9px;display:flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(14,14,12,.75);color:#6f695f;font-size:.47rem;backdrop-filter:blur(10px)}.pathContext i{font-style:normal;color:#48453f}.pathContext strong{color:#9f8a58;font-weight:850;direction:ltr}.inspector{position:absolute;z-index:24;right:14px;top:14px;width:224px;padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:17px;background:rgba(17,17,15,.93);box-shadow:0 18px 50px rgba(0,0,0,.28);backdrop-filter:blur(16px)}.inspectorHead{display:flex;align-items:center;gap:9px}.inspectorHead>div{min-width:0;flex:1;display:grid;gap:2px}.inspectorHead strong{color:#e0d8ca;font-size:.65rem;direction:ltr}.inspectorHead small{color:#8c7e61;font-size:.45rem;font-weight:850}.inspectorHead>button{width:25px;height:25px;border:0;background:transparent;color:#666158;font:inherit;cursor:pointer}.inspector code{display:block;margin-top:8px;padding:6px 7px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.025);color:#625e57;font-size:.42rem;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.inspectorMetrics{margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.inspectorMetrics span{padding:6px 4px;border-radius:9px;background:rgba(255,255,255,.025);color:#666058;font-size:.42rem;text-align:center;overflow-wrap:anywhere}.inspectorMetrics b{display:block;margin-bottom:1px;color:#cec3b2;font-size:.6rem}.stageControls{position:absolute;z-index:25;right:12px;bottom:12px;display:flex;gap:5px}.stageControls button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(15,15,13,.82);color:#878176;font:inherit;font-size:.72rem;cursor:pointer;backdrop-filter:blur(10px)}
        @keyframes spin{to{transform:rotate(360deg)}}@keyframes drawEdge{from{stroke-dashoffset:1;opacity:0}to{stroke-dashoffset:0;opacity:1}}@keyframes settleEdge{from{stroke:rgba(244,183,40,.62)}to{stroke:rgba(216,209,196,.115)}}@keyframes bloomNode{0%{opacity:0;transform:translate(-50%,-64%) scale(.58)}68%{opacity:1;transform:translate(-50%,-50%) scale(1.035)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes freshHalo{0%{box-shadow:0 0 0 0 rgba(244,183,40,.32)}65%{box-shadow:0 0 0 7px rgba(244,183,40,0)}100%{box-shadow:none}}@keyframes loaderPulse{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
        @media(max-width:700px){.networkCanvasPage{width:100%}.networkHeader{min-height:46px;padding:0 5px}.headerTitle h1{font-size:.84rem}.summary{font-size:.48rem;gap:4px}.summary strong{font-size:.62rem}.searchWrap{width:calc(100% - 8px);height:36px;margin-bottom:2px}.networkStage{height:calc(100svh - 218px);min-height:520px}.personNode{width:80px}.tone-near{opacity:.52!important}:global(.identityLabel){font-size:.56rem}.inspector{left:8px;right:8px;top:auto;bottom:52px;width:auto}.stageControls{right:8px;bottom:8px}.pathContext{left:8px;top:8px}}
        @media(prefers-reduced-motion:reduce){.freshNode,.freshNode :global(.avatarSlot),.freshEdge,.branchLoader i{animation:none!important}.personNode,.clusterNode,.edges line{transition:none!important}}
      `}</style>
    </section>
  );
}

const stateStyles = `
  .networkStateCard{width:min(100%,520px);min-height:420px;margin:0 auto;padding:38px 24px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,205,80,.12);border-radius:28px;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.10),transparent 35%),rgba(255,255,255,.025);text-align:center}
  .stateGlyph{width:52px;height:52px;display:grid;place-items:center;margin-bottom:15px;border-radius:17px;background:rgba(244,183,40,.06);color:#cda444}.stateGlyph.error{color:#c58f67}.networkStateCard h1{margin:0;color:#eee9df;font-size:1.2rem;letter-spacing:-.03em}.networkStateCard p{max-width:410px;margin:10px 0 0;color:#8d8981;font-size:.76rem;line-height:1.55}.networkStateCard>button{min-width:150px;min-height:43px;margin-top:18px;padding:0 15px;border:0;border-radius:13px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.7rem;font-weight:950;cursor:pointer}.networkStateCard>button:disabled{opacity:.45;cursor:not-allowed}.loadingDots{height:30px;margin-bottom:14px;display:flex;align-items:center;gap:6px}.loadingDots i{width:5px;height:5px;border-radius:50%;background:#b9923d;animation:loaderPulse .78s ease-in-out infinite}.loadingDots i:nth-child(2){animation-delay:.11s}.loadingDots i:nth-child(3){animation-delay:.22s}@keyframes loaderPulse{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
`;
