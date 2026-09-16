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
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };

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

type RadialNode = {
  wallet: string;
  child: NetworkChild;
  x: number;
  y: number;
};

type PinchIntent = {
  center: Point;
  distance: number;
  startDistance: number;
  startZoom: number;
  maxRatio: number;
  minRatio: number;
  candidateWallet: string | null;
};

type SavedReleaseState = {
  focusWallet: string;
  view: View;
};

const MIN_ZOOM = 0.32;
const MAX_ZOOM = 2.5;
const BOUNDARY_EPSILON = 0.025;
const ENTER_SECOND_PINCH_RATIO = 1.12;
const PARENT_SECOND_PINCH_RATIO = 0.88;
const SEARCH_DELAY_MS = 280;
const SESSION_PREFIX = 'veinvite-network-release-v1:';
const INITIAL_VIEW: View = { x: 0, y: 0, scale: 1 };

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
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

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function sessionKey(wallet: string): string {
  return `${SESSION_PREFIX}${keyWallet(wallet)}`;
}

function readSavedState(wallet: string): SavedReleaseState | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedReleaseState>;
    if (!parsed.focusWallet || !validWallet(parsed.focusWallet)) return null;
    if (!parsed.view || typeof parsed.view.x !== 'number' || typeof parsed.view.y !== 'number' || typeof parsed.view.scale !== 'number') return null;
    return {
      focusWallet: keyWallet(parsed.focusWallet),
      view: {
        x: parsed.view.x,
        y: parsed.view.y,
        scale: clamp(parsed.view.scale, MIN_ZOOM, MAX_ZOOM),
      },
    };
  } catch {
    return null;
  }
}

async function fetchNetwork(
  rootWallet: string,
  options: { focus?: string; query?: string; signal?: AbortSignal } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (options.focus && keyWallet(options.focus) !== keyWallet(rootWallet)) params.set('focus', options.focus);
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
    const message = payload && 'error' in payload && payload.error ? payload.error : 'Failed to load network.';
    throw new Error(message);
  }
  if (!payload || !('rootWallet' in payload) || !payload.rootWallet || !payload.focusWallet || !payload.summary || !Array.isArray(payload.children)) {
    throw new Error('Network response was incomplete.');
  }
  return payload as NetworkData;
}

function statusLabel(status: MemberStatus, locale: Locale): string {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  if (status === 'REWARDED') return t.rewarded;
  if (status === 'QUALIFIED') return t.qualified;
  return t.inProgress;
}

function radialPoint(index: number, total: number, compact: boolean): Point {
  if (total <= 0) return { x: 0, y: 0 };
  const radius = compact
    ? Math.min(188, 118 + total * 9)
    : Math.min(228, 148 + total * 8);
  const angle = total === 1
    ? -Math.PI / 2
    : -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

const ReleaseIdentity = memo(function ReleaseIdentity({
  address,
  selected = false,
}: {
  address: string;
  selected?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { data: domainInfo } = useVechainDomain(shouldLoad ? address : undefined);
  const domain = domainInfo?.domain ?? '';
  const { data: avatarUrl } = useGetAvatar(domain);
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
    }, { rootMargin: '100px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [avatarUrl]);

  return (
    <span ref={hostRef} className={`releaseIdentity ${selected ? 'selected' : ''}`}>
      <span className="releaseAvatar">
        <span className="releaseAvatarFallback" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.1" r="2.7" fill="currentColor" />
            <path d="M5 15.6c1.15-2.25 2.82-3.35 5-3.35s3.85 1.1 5 3.35" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
          </svg>
        </span>
        {avatarUrl && !broken ? (
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        ) : null}
      </span>
      <span className="releaseIdentityLabel" dir={domain ? 'auto' : 'ltr'} title={domain || address}>{label}</span>
    </span>
  );
});

export function AppNetworkReleaseCanvas({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const rootWallet = wallet ? keyWallet(wallet) : '';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const requestSerialRef = useRef(0);
  const focusControllerRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const panPointRef = useRef<Point | null>(null);
  const pinchRef = useRef<PinchIntent | null>(null);
  const viewRef = useRef<View>(INITIAL_VIEW);
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<NetworkData | null>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [focusLoading, setFocusLoading] = useState<string | null>(null);
  const [showAllDirect, setShowAllDirect] = useState(false);
  const [stageWidth, setStageWidth] = useState(520);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const setViewSafe = useCallback((next: View | ((current: View) => View)) => {
    setView((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      const safe = { ...resolved, scale: clamp(resolved.scale, MIN_ZOOM, MAX_ZOOM) };
      viewRef.current = safe;
      return safe;
    });
  }, []);

  const loadFocus = useCallback(async (
    focusWallet: string,
    options: { initial?: boolean; restoreView?: View | null } = {},
  ) => {
    if (!rootWallet) return;
    const serial = ++requestSerialRef.current;
    focusControllerRef.current?.abort();
    const controller = new AbortController();
    focusControllerRef.current = controller;

    if (options.initial) {
      setLoadState('loading');
      setLoadError('');
    } else {
      setFocusLoading(keyWallet(focusWallet));
    }

    try {
      const payload = await fetchNetwork(rootWallet, {
        focus: focusWallet,
        signal: controller.signal,
      });
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      setData(payload);
      setSelectedWallet(null);
      setShowAllDirect(false);
      setSearchQuery('');
      setSearchResults([]);
      setLoadState('ready');
      if (options.restoreView) {
        setViewSafe(options.restoreView);
      } else {
        setViewSafe(INITIAL_VIEW);
      }
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      if (options.initial) {
        setLoadState('error');
        setLoadError(error instanceof Error ? error.message : t.loadError);
      }
    } finally {
      if (focusControllerRef.current === controller) focusControllerRef.current = null;
      if (serial === requestSerialRef.current) setFocusLoading(null);
    }
  }, [rootWallet, setViewSafe, t.loadError]);

  useEffect(() => {
    requestSerialRef.current += 1;
    focusControllerRef.current?.abort();
    focusControllerRef.current = null;
    setData(null);
    setSelectedWallet(null);
    setSearchQuery('');
    setSearchResults([]);
    setFocusLoading(null);
    setViewSafe(INITIAL_VIEW);

    if (!rootWallet) {
      setLoadState('idle');
      return;
    }

    const saved = readSavedState(rootWallet);
    const target = saved?.focusWallet ?? rootWallet;
    void loadFocus(target, { initial: true, restoreView: saved?.view ?? null });

    return () => {
      focusControllerRef.current?.abort();
    };
  }, [rootWallet, loadFocus, setViewSafe]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageWidth(stage.clientWidth || 520);
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
    if (!rootWallet || !data || loadState !== 'ready') return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        const saved: SavedReleaseState = {
          focusWallet: keyWallet(data.focusWallet),
          view,
        };
        window.sessionStorage.setItem(sessionKey(rootWallet), JSON.stringify(saved));
      } catch {
        // Network data is authoritative; viewport persistence is optional.
      }
    }, 180);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [rootWallet, data, loadState, view]);

  useEffect(() => {
    if (!rootWallet || loadState !== 'ready') return;
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetchNetwork(rootWallet, { query, signal: controller.signal })
        .then((payload) => {
          if (!controller.signal.aborted) setSearchResults(payload.searchResults ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [rootWallet, loadState, searchQuery]);

  useEffect(() => () => {
    focusControllerRef.current?.abort();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const compact = stageWidth < 480;
  const focusWallet = data ? keyWallet(data.focusWallet) : '';
  const isRoot = Boolean(data && focusWallet === rootWallet);

  const childByWallet = useMemo(() => {
    const map = new Map<string, NetworkChild>();
    data?.children.forEach((child) => map.set(keyWallet(child.wallet), child));
    return map;
  }, [data]);

  const selectedChild = selectedWallet ? childByWallet.get(selectedWallet) ?? null : null;

  const visibleLimit = useMemo(() => {
    if (!data) return 0;
    if (view.scale <= 0.58) return compact ? 3 : 4;
    if (showAllDirect) return data.children.length;
    return compact ? 6 : 8;
  }, [data, view.scale, compact, showAllDirect]);

  const displayedChildren = useMemo(
    () => data?.children.slice(0, visibleLimit) ?? [],
    [data, visibleLimit],
  );
  const remaining = Math.max(0, (data?.children.length ?? 0) - displayedChildren.length);
  const radialTotal = displayedChildren.length + (remaining > 0 ? 1 : 0);

  const radialNodes = useMemo<RadialNode[]>(() => displayedChildren.map((child, index) => ({
    wallet: keyWallet(child.wallet),
    child,
    ...radialPoint(index, radialTotal, compact),
  })), [displayedChildren, radialTotal, compact]);

  const clusterPoint = remaining > 0
    ? radialPoint(radialTotal - 1, radialTotal, compact)
    : null;

  const openFocus = useCallback((walletAddress: string) => {
    const target = keyWallet(walletAddress);
    if (!data || target === keyWallet(data.focusWallet)) return;
    void loadFocus(target);
  }, [data, loadFocus]);

  const goParent = useCallback(() => {
    if (!data || data.breadcrumb.length <= 1) return;
    const parent = data.breadcrumb[data.breadcrumb.length - 2];
    if (parent) void loadFocus(parent);
  }, [data, loadFocus]);

  const goRoot = useCallback(() => {
    if (!rootWallet) return;
    if (data && keyWallet(data.focusWallet) === rootWallet) {
      setViewSafe(INITIAL_VIEW);
      return;
    }
    void loadFocus(rootWallet);
  }, [rootWallet, data, loadFocus, setViewSafe]);

  const finishPinch = useCallback((intent: PinchIntent | null) => {
    if (!intent || !data) return;

    const startedAtMax = intent.startZoom >= MAX_ZOOM - BOUNDARY_EPSILON;
    const startedAtMin = intent.startZoom <= MIN_ZOOM + BOUNDARY_EPSILON;

    if (
      startedAtMax &&
      intent.maxRatio >= ENTER_SECOND_PINCH_RATIO &&
      intent.candidateWallet
    ) {
      const target = childByWallet.get(keyWallet(intent.candidateWallet));
      if (target && target.direct > 0) {
        void loadFocus(target.wallet);
        return;
      }
    }

    if (
      startedAtMin &&
      intent.minRatio <= PARENT_SECOND_PINCH_RATIO &&
      data.breadcrumb.length > 1
    ) {
      const parent = data.breadcrumb[data.breadcrumb.length - 2];
      if (parent) void loadFocus(parent);
    }
  }, [data, childByWallet, loadFocus]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    const interactive = Boolean((event.target as HTMLElement).closest('[data-release-interactive="true"]'));

    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    if (pointersRef.current.size === 1) {
      panPointRef.current = interactive ? null : point;
      pinchRef.current = null;
      suppressClickRef.current = false;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const initialDistance = distance(a, b);
      const candidate = document
        .elementFromPoint(center.x, center.y)
        ?.closest<HTMLElement>('[data-release-wallet]')
        ?.dataset.releaseWallet ?? null;
      pinchRef.current = {
        center,
        distance: initialDistance,
        startDistance: initialDistance,
        startZoom: viewRef.current.scale,
        maxRatio: 1,
        minRatio: 1,
        candidateWallet: candidate,
      };
      panPointRef.current = null;
      suppressClickRef.current = true;
    }
  };

  const onPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = panPointRef.current;
      if (!previous) return;
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
      if (dragDistanceRef.current > 6) suppressClickRef.current = true;
      setViewSafe((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
      panPointRef.current = current;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const nextDistance = distance(a, b);
      const previous = pinchRef.current;
      if (!previous || previous.distance <= 0 || previous.startDistance <= 0) return;

      const ratioFromStart = nextDistance / previous.startDistance;
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        const px = center.x - rect.left - rect.width / 2;
        const py = center.y - rect.top - rect.height / 2;
        setViewSafe((value) => {
          const nextScale = clamp(value.scale * (nextDistance / previous.distance), MIN_ZOOM, MAX_ZOOM);
          const worldX = (px - value.x) / value.scale;
          const worldY = (py - value.y) / value.scale;
          return {
            x: px - worldX * nextScale + (center.x - previous.center.x),
            y: py - worldY * nextScale + (center.y - previous.center.y),
            scale: nextScale,
          };
        });
      }

      pinchRef.current = {
        ...previous,
        center,
        distance: nextDistance,
        maxRatio: Math.max(previous.maxRatio, ratioFromStart),
        minRatio: Math.min(previous.minRatio, ratioFromStart),
      };
      suppressClickRef.current = true;
    }
  };

  const onPointerEndCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const intent = pinchRef.current;
    pointersRef.current.delete(event.pointerId);

    if (intent && pointersRef.current.size < 2) {
      pinchRef.current = null;
      finishPinch(intent);
    }

    if (pointersRef.current.size === 1) {
      panPointRef.current = Array.from(pointersRef.current.values())[0];
    } else if (pointersRef.current.size === 0) {
      panPointRef.current = null;
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
    const py = event.clientY - rect.top - rect.height / 2;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setViewSafe((value) => {
      const nextScale = clamp(value.scale * factor, MIN_ZOOM, MAX_ZOOM);
      const worldX = (px - value.x) / value.scale;
      const worldY = (py - value.y) / value.scale;
      return {
        x: px - worldX * nextScale,
        y: py - worldY * nextScale,
        scale: nextScale,
      };
    });
  };

  if (!wallet) {
    return (
      <section className="releaseState">
        <div className="releaseStateIcon">◎</div>
        <h1>{t.connectTitle}</h1>
        <p>{t.connectDescription}</p>
        <button type="button" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <section className="releaseState" aria-busy="true">
        <div className="releaseDots" aria-hidden="true"><i /><i /><i /></div>
        <h1>{t.title}</h1>
        <p>{t.directNetwork}</p>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  if (loadState === 'error' || !data) {
    return (
      <section className="releaseState">
        <div className="releaseStateIcon">!</div>
        <h1>{t.loadError}</h1>
        <p>{loadError}</p>
        <button type="button" onClick={() => void loadFocus(rootWallet, { initial: true })}>{t.retry}</button>
        <style jsx>{stateStyles}</style>
      </section>
    );
  }

  const rootEmpty = isRoot && data.summary.network === 0;

  return (
    <section className="releaseNetworkPage">
      <header className="releaseHeader" data-release-interactive="true">
        <div>
          <span>NETWORK</span>
          <h1>{t.title}</h1>
        </div>
        <div className="releaseSummary">
          <strong>{data.summary.network.toLocaleString()}</strong><span>{t.networkSize}</span>
          <i />
          <strong>{data.summary.thisRound === null ? '—' : `+${data.summary.thisRound.toLocaleString()}`}</strong><span>{t.thisRound}</span>
        </div>
      </header>

      <div className="releaseSearch" data-release-interactive="true">
        <span aria-hidden="true">⌕</span>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        {searching ? <i className="releaseSearchSpinner" aria-hidden="true" /> : null}
        {searchQuery.trim().length >= 3 ? (
          <div className="releaseSearchResults">
            {searchResults.length > 0 ? searchResults.map((result) => (
              <button key={result.wallet} type="button" onClick={() => openFocus(result.wallet)}>
                <span>{shortWallet(result.wallet)}</span><small>{result.depth}</small>
              </button>
            )) : !searching ? <p>{t.noSearchResults}</p> : null}
          </div>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="releaseStage"
        onPointerDownCapture={onPointerDownCapture}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerUpCapture={onPointerEndCapture}
        onPointerCancelCapture={onPointerEndCapture}
        onWheel={onWheel}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-release-interactive="true"]')) return;
          if (suppressClickRef.current || dragDistanceRef.current > 6) return;
          setSelectedWallet(null);
        }}
      >
        <div className="releaseAmbient" aria-hidden="true" />

        <div className="releaseBreadcrumb" data-release-interactive="true">
          {data.breadcrumb.map((walletAddress, index) => {
            const value = keyWallet(walletAddress);
            const last = index === data.breadcrumb.length - 1;
            const hideMiddle = data.breadcrumb.length > 4 && index > 0 && index < data.breadcrumb.length - 2;
            if (hideMiddle && index === 1) return <span key="ellipsis" className="crumbEllipsis">…</span>;
            if (hideMiddle) return null;
            return (
              <span key={value} className="crumbItem">
                {index > 0 && !(data.breadcrumb.length > 4 && index === data.breadcrumb.length - 2) ? <i>›</i> : null}
                <button type="button" disabled={last} onClick={() => openFocus(value)}>
                  {index === 0 ? c.you : shortWallet(value)}
                </button>
              </span>
            );
          })}
        </div>

        <div
          className={`releaseScene ${focusLoading ? 'loadingFocus' : ''}`}
          style={{ transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}
        >
          <svg className="releaseEdges" viewBox="-900 -900 1800 1800" aria-hidden="true">
            {radialNodes.map((node, index) => (
              <line key={node.wallet} x1="0" y1="0" x2={node.x} y2={node.y} style={{ '--edge-delay': `${index * 42}ms` } as CSSProperties} />
            ))}
            {clusterPoint ? <line x1="0" y1="0" x2={clusterPoint.x} y2={clusterPoint.y} className="clusterEdge" /> : null}
          </svg>

          <button
            type="button"
            className={`releaseCenter ${isRoot ? 'root' : ''}`}
            data-release-interactive="true"
            data-release-wallet={focusWallet}
            onClick={() => setSelectedWallet(null)}
          >
            {isRoot ? (
              <span className="releaseYou">{c.you}</span>
            ) : (
              <ReleaseIdentity address={focusWallet} selected />
            )}
            <small>{data.summary.direct.toLocaleString()} {t.direct} · {data.summary.network.toLocaleString()} {t.networkSize}</small>
          </button>

          {radialNodes.map((node) => {
            const selected = selectedWallet === node.wallet;
            const busy = focusLoading === node.wallet;
            return (
              <button
                key={node.wallet}
                type="button"
                className={`releasePerson ${selected ? 'selected' : ''} ${busy ? 'busy' : ''}`}
                style={{ '--node-x': `${node.x}px`, '--node-y': `${node.y}px` } as CSSProperties}
                data-release-interactive="true"
                data-release-wallet={node.wallet}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  setSelectedWallet(node.wallet);
                }}
              >
                <ReleaseIdentity address={node.wallet} selected={selected} />
                <small>{(1 + node.child.network).toLocaleString()}</small>
              </button>
            );
          })}

          {clusterPoint ? (
            <button
              type="button"
              className="releaseCluster"
              style={{ '--node-x': `${clusterPoint.x}px`, '--node-y': `${clusterPoint.y}px` } as CSSProperties}
              data-release-interactive="true"
              onClick={() => {
                setShowAllDirect(true);
                setViewSafe((current) => ({ ...current, scale: Math.max(current.scale, 0.82) }));
              }}
            >
              <span aria-hidden="true"><i /><i /><i /></span>
              <strong>+{remaining}</strong>
            </button>
          ) : null}
        </div>

        {selectedChild ? (
          <aside className="releaseInspector" data-release-interactive="true">
            <div className="releaseInspectorHead">
              <ReleaseIdentity address={selectedWallet ?? selectedChild.wallet} selected />
              <div>
                <strong>{shortWallet(selectedChild.wallet)}</strong>
                <small>{statusLabel(selectedChild.status, locale)}</small>
              </div>
              <button type="button" onClick={() => setSelectedWallet(null)} aria-label={c.close}>×</button>
            </div>
            <code>{selectedChild.wallet}</code>
            <div className="releaseMetrics">
              <span><b>{(1 + selectedChild.network).toLocaleString()}</b>{c.branch}</span>
              <span><b>{selectedChild.network.toLocaleString()}</b>{c.networkBelow}</span>
              <span><b>{selectedChild.direct.toLocaleString()}</b>{t.direct}</span>
              <span><b>{selectedChild.qualified.toLocaleString()}</b>{t.qualified}</span>
            </div>
            {selectedChild.direct > 0 ? (
              <button type="button" className="openNetwork" onClick={() => openFocus(selectedChild.wallet)}>{e.openNetwork} →</button>
            ) : null}
          </aside>
        ) : null}

        {rootEmpty ? (
          <div className="releaseEmpty" data-release-interactive="true">
            <strong>{t.emptyTitle}</strong>
            <p>{t.emptyDescription}</p>
            <button type="button" onClick={() => window.location.assign('/')}>{t.inviteFriend}</button>
          </div>
        ) : null}

        <div className="releaseStageControls" data-release-interactive="true">
          {!isRoot ? <button type="button" className="parentControl" onClick={goParent} aria-label={t.invitedBy}>←</button> : null}
          <button type="button" onClick={goRoot} aria-label={c.centerNetwork}>◎</button>
          <button type="button" onClick={() => setViewSafe((current) => ({ ...current, scale: current.scale + 0.12 }))} aria-label={c.zoomIn}>+</button>
          <button type="button" onClick={() => setViewSafe((current) => ({ ...current, scale: current.scale - 0.12 }))} aria-label={c.zoomOut}>−</button>
          <span>{Math.round(view.scale * 100)}%</span>
        </div>
      </div>

      <style jsx>{`
        .releaseNetworkPage{width:min(100%,520px);margin:0 auto;min-width:0}.releaseHeader{min-height:48px;padding:0 6px;display:flex;align-items:center;justify-content:space-between;gap:12px}.releaseHeader>div:first-child{min-width:0;display:grid;gap:2px}.releaseHeader>div:first-child span{color:#8c7d5d;font-size:.52rem;font-weight:950;letter-spacing:.14em}.releaseHeader h1{margin:0;color:#f5f1e8;font-size:.86rem;letter-spacing:-.02em}.releaseSummary{display:flex;align-items:baseline;gap:4px;color:#716d65;font-size:.46rem;white-space:nowrap}.releaseSummary strong{color:#d7d0c3;font-size:.62rem}.releaseSummary i{width:1px;height:9px;margin:0 2px;background:rgba(255,255,255,.08)}
        .releaseSearch{position:relative;z-index:40;width:calc(100% - 8px);height:36px;margin:2px auto 4px;display:flex;align-items:center;gap:8px;padding:0 11px;box-sizing:border-box;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(16,16,14,.76);backdrop-filter:blur(12px)}.releaseSearch>span{color:#786f60;font-size:.9rem}.releaseSearch input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#d8d3ca;font:inherit;font-size:.63rem;direction:ltr}.releaseSearch input::placeholder{color:#625d54}.releaseSearchSpinner{width:10px;height:10px;border:1px solid rgba(244,183,40,.2);border-top-color:#c99c34;border-radius:50%;animation:releaseSpin .7s linear infinite}.releaseSearchResults{position:absolute;left:0;right:0;top:41px;padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(14,14,12,.98);box-shadow:0 18px 45px rgba(0,0,0,.38)}.releaseSearchResults button{width:100%;min-height:36px;padding:0 8px;border:0;border-radius:9px;background:transparent;display:flex;align-items:center;justify-content:space-between;color:#bdb6aa;font:inherit;font-size:.61rem;cursor:pointer}.releaseSearchResults button:hover{background:rgba(244,183,40,.06)}.releaseSearchResults small{color:#736a5d}.releaseSearchResults p{margin:8px;color:#716c64;font-size:.58rem}
        .releaseStage{position:relative;height:clamp(500px,calc(100svh - 218px),680px);min-height:500px;overflow:hidden;touch-action:none;overscroll-behavior:contain;user-select:none;cursor:grab;border:1px solid rgba(255,205,80,.11);border-radius:20px;background:radial-gradient(circle at 50% 48%,rgba(244,183,40,.035),transparent 34%),rgba(9,9,8,.24)}.releaseStage:active{cursor:grabbing}.releaseAmbient{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 48%,rgba(244,183,40,.045),transparent 38%)}
        .releaseBreadcrumb{position:absolute;z-index:25;left:9px;top:9px;max-width:calc(100% - 18px);min-height:28px;padding:0 8px;display:flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:rgba(14,14,12,.75);backdrop-filter:blur(10px);overflow:hidden}.crumbItem{display:flex;align-items:center;gap:4px;min-width:0}.crumbItem i{font-style:normal;color:#48453f}.crumbItem button{max-width:96px;overflow:hidden;border:0;background:transparent;color:#8f825f;font:inherit;font-size:.47rem;font-weight:850;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.crumbItem button:disabled{color:#c4a34f;cursor:default}.crumbEllipsis{color:#59554e;font-size:.52rem}
        .releaseScene{position:absolute;z-index:5;left:50%;top:50%;width:0;height:0;transform-origin:0 0;will-change:transform;transition:opacity 160ms ease}.releaseScene.loadingFocus{opacity:.72}.releaseEdges{position:absolute;left:-900px;top:-900px;width:1800px;height:1800px;overflow:visible;pointer-events:none}.releaseEdges line{vector-effect:non-scaling-stroke;stroke:rgba(216,209,196,.16);stroke-width:1;stroke-linecap:round;opacity:0;animation:releaseEdgeIn 420ms ease var(--edge-delay,0ms) forwards}.releaseEdges .clusterEdge{stroke:rgba(199,172,108,.12);stroke-dasharray:3 4;animation:none;opacity:1}
        .releaseCenter,.releasePerson,.releaseCluster{position:absolute;border:0;background:transparent;color:inherit;font:inherit;transform:translate(-50%,-50%);cursor:pointer}.releaseCenter{left:0;top:0;width:110px;min-height:108px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;z-index:10}.releaseCenter.root{pointer-events:auto}.releaseYou{width:74px;height:74px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.45);border-radius:50%;background:radial-gradient(circle at 38% 32%,rgba(244,183,40,.11),transparent 46%),#15140f;color:#efc64c;font-size:.58rem;font-weight:900;box-shadow:0 0 0 4px rgba(244,183,40,.045),0 0 26px rgba(244,183,40,.13);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.releaseCenter>small{max-width:130px;color:#807050;font-size:.43rem;font-weight:800;line-height:1.25;white-space:nowrap}.releasePerson{left:var(--node-x);top:var(--node-y);width:94px;min-height:82px;display:flex;flex-direction:column;align-items:center;gap:3px;z-index:8;transition:opacity 180ms ease,filter 180ms ease}.releasePerson:not(.selected){opacity:.86}.releasePerson.selected{z-index:12}.releasePerson.busy{opacity:.5}.releasePerson>small{color:#756d60;font-size:.44rem;font-weight:850}.releaseCluster{left:var(--node-x);top:var(--node-y);width:74px;min-height:64px;display:flex;flex-direction:column;align-items:center;gap:2px}.releaseCluster>span{height:28px;display:flex;align-items:center}.releaseCluster i{width:25px;height:25px;margin-left:-9px;border:1px solid rgba(201,184,147,.18);border-radius:50%;background:#151410}.releaseCluster i:first-child{margin-left:0}.releaseCluster strong{color:#b99b55;font-size:.62rem}
        :global(.releaseIdentity){display:flex;flex-direction:column;align-items:center;gap:4px;max-width:90px}:global(.releaseAvatar){position:relative;width:32px;height:32px;display:block;border-radius:50%;box-shadow:0 5px 14px rgba(0,0,0,.22)}:global(.releaseAvatarFallback){width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(205,189,154,.2);border-radius:50%;background:#141411;color:rgba(179,167,142,.62)}:global(.releaseAvatar img){position:absolute;inset:0;width:32px;height:32px;object-fit:cover;border:1px solid rgba(205,189,154,.2);border-radius:50%;transition:opacity 180ms ease}:global(.releaseIdentity.selected .releaseAvatar){box-shadow:0 0 0 4px rgba(244,183,40,.08),0 0 20px rgba(244,183,40,.14)}:global(.releaseIdentityLabel){display:block;max-width:90px;overflow:hidden;color:#bdb6aa;font-size:.55rem;font-weight:850;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}
        .releaseInspector{position:absolute;z-index:30;right:10px;top:46px;width:218px;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(17,17,15,.95);box-shadow:0 18px 50px rgba(0,0,0,.32);backdrop-filter:blur(16px)}.releaseInspectorHead{display:flex;align-items:center;gap:8px}.releaseInspectorHead>div{min-width:0;flex:1;display:grid;gap:2px}.releaseInspectorHead strong{color:#e0d8ca;font-size:.63rem;direction:ltr}.releaseInspectorHead small{color:#8c7e61;font-size:.44rem;font-weight:850}.releaseInspectorHead>button{width:24px;height:24px;border:0;background:transparent;color:#666158;font:inherit;cursor:pointer}.releaseInspector code{display:block;margin-top:8px;padding:6px 7px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.025);color:#625e57;font-size:.41rem;text-overflow:ellipsis;white-space:nowrap;direction:ltr}.releaseMetrics{margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.releaseMetrics span{padding:6px 4px;border-radius:9px;background:rgba(255,255,255,.025);color:#666058;font-size:.41rem;text-align:center}.releaseMetrics b{display:block;margin-bottom:1px;color:#cec3b2;font-size:.58rem}.openNetwork{width:100%;min-height:34px;margin-top:8px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(244,183,40,.06);color:#d2b456;font:inherit;font-size:.55rem;font-weight:900;cursor:pointer}
        .releaseEmpty{position:absolute;z-index:22;left:50%;bottom:74px;width:min(calc(100% - 32px),330px);transform:translateX(-50%);padding:13px 14px;border:1px solid rgba(255,205,80,.1);border-radius:14px;background:rgba(15,15,13,.86);text-align:center;backdrop-filter:blur(12px)}.releaseEmpty strong{color:#d9d2c5;font-size:.67rem}.releaseEmpty p{margin:5px 0 0;color:#756f66;font-size:.53rem;line-height:1.45}.releaseEmpty button{min-height:34px;margin-top:9px;padding:0 13px;border:0;border-radius:10px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.54rem;font-weight:900;cursor:pointer}
        .releaseStageControls{position:absolute;z-index:28;right:9px;bottom:9px;display:flex;align-items:center;gap:4px}.releaseStageControls button{width:32px;height:32px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(15,15,13,.84);color:#8b857a;font:inherit;font-size:.7rem;cursor:pointer;backdrop-filter:blur(10px)}.releaseStageControls .parentControl{color:#b49a5a}.releaseStageControls span{min-width:38px;padding:0 5px;color:#68635b;font-size:.45rem;text-align:center}
        @keyframes releaseSpin{to{transform:rotate(360deg)}}@keyframes releaseEdgeIn{from{opacity:0}to{opacity:1}}
        @media(max-width:560px){.releaseHeader{min-height:44px}.releaseSummary{font-size:.43rem}.releaseSummary strong{font-size:.58rem}.releaseStage{height:calc(100svh - 206px);min-height:480px;border-radius:17px}.releaseInspector{left:8px;right:8px;top:auto;bottom:50px;width:auto}.releaseBreadcrumb{left:7px;top:7px;max-width:calc(100% - 14px)}.releaseStageControls{right:7px;bottom:7px}}
        @media(prefers-reduced-motion:reduce){.releaseScene,.releaseEdges line,:global(.releaseAvatar img){transition:none!important;animation:none!important}}
      `}</style>
    </section>
  );
}

const stateStyles = `
  .releaseState{width:min(100%,520px);min-height:420px;margin:0 auto;padding:38px 24px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,205,80,.12);border-radius:24px;background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.09),transparent 35%),rgba(255,255,255,.025);text-align:center}.releaseStateIcon{width:52px;height:52px;display:grid;place-items:center;margin-bottom:14px;border-radius:17px;background:rgba(244,183,40,.06);color:#cda444}.releaseState h1{margin:0;color:#eee9df;font-size:1.08rem;letter-spacing:-.03em}.releaseState p{max-width:410px;margin:9px 0 0;color:#8d8981;font-size:.72rem;line-height:1.55}.releaseState>button{min-width:150px;min-height:42px;margin-top:17px;padding:0 15px;border:0;border-radius:13px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.68rem;font-weight:950;cursor:pointer}.releaseState>button:disabled{opacity:.45;cursor:not-allowed}.releaseDots{height:30px;margin-bottom:14px;display:flex;align-items:center;gap:6px}.releaseDots i{width:5px;height:5px;border-radius:50%;background:#b9923d;animation:releaseDot .78s ease-in-out infinite}.releaseDots i:nth-child(2){animation-delay:.11s}.releaseDots i:nth-child(3){animation-delay:.22s}@keyframes releaseDot{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
`;
