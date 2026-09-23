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
import { useVechainDomain } from '@vechain/vechain-kit';

import {
  formatCompactVechainDomain,
  formatVechainDomainLabel,
  readCachedLeaderboardDomainSuggestions,
  type CachedLeaderboardDomainSuggestion,
} from '@/lib/leaderboardDomainCache';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY, NETWORK_TOTAL_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import { NETWORK_HUB_COPY } from '@/lib/i18n/networkHubCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { useWalletLauncher } from './WalletControl';

type PublicChild = {
  wallet: string;
  network: number;
  direct: number;
  depth: number;
};

type PublicNetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    depth: number;
  };
  children: PublicChild[];
  depthLimitReached: boolean;
};

type DiscoveryRoot = {
  wallet: string;
  updatedAt: string | null;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

type PublicVisual = {
  wallet: string;
  parentWallet: string | null;
  x: number;
  y: number;
  depth: number;
  root: boolean;
  member: PublicChild | null;
};

type PublicEdge = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
};

const PUBLIC_SESSION_PREFIX = 'veinvite-network-public-v3:';
const PUBLIC_SESSION_TTL_MS = 30 * 60_000;
const PLANE_W = 2600;
const PLANE_H = 1900;
const CENTER_X = PLANE_W / 2;
const ROOT_Y = 350;
const MIN_SCALE = 0.32;
const MAX_SCALE = 2.5;
const READABLE_FIT_MIN = 0.46;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`;
}

function PublicNodeLabel({ address }: { address: string }) {
  const { data: domainInfo } = useVechainDomain(address);
  const domain =
    typeof domainInfo?.domain === 'string' && domainInfo.domain.trim()
      ? domainInfo.domain.trim()
      : null;
  return <>{formatCompactVechainDomain(domain) ?? shortWallet(address)}</>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stablePublicHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function publicChildPoint(wallet: string, index: number, compact: boolean): Point {
  const jitter = ((stablePublicHash(wallet) % 101) - 50) / 800;
  const angle = -Math.PI / 2 + index * GOLDEN_ANGLE + jitter;
  const radius = compact ? 118 + Math.sqrt(index) * 82 : 208 + Math.sqrt(index) * 128;
  const yScale = compact ? 0.86 : 0.78;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: ROOT_Y + Math.sin(angle) * radius * yScale + (compact ? 18 : 26),
  };
}

function publicCenteredView(stage: { width: number; height: number }, scale = 1): View {
  return {
    x: stage.width / 2 - CENTER_X * scale,
    y: Math.max(88, stage.height * 0.5) - ROOT_Y * scale,
    scale,
  };
}

function publicFittedView(stage: { width: number; height: number }, points: Point[]): View {
  if (!points.length) return publicCenteredView(stage, 1);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const contentWidth = Math.max(220, maxX - minX + 190);
  const contentHeight = Math.max(220, maxY - minY + 190);
  const minimum = points.length < 16 ? READABLE_FIT_MIN : MIN_SCALE;
  const scale = clamp(
    Math.min(1, (stage.width - 34) / contentWidth, (stage.height - 50) / contentHeight),
    minimum,
    MAX_SCALE,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: stage.width / 2 - centerX * scale,
    y: stage.height / 2 - centerY * scale,
    scale,
  };
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.2 12.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NetworkGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.8 6.9 7.2 15" />
      <path d="m13.2 6.9 3.6 8.1" />
      <path d="M8.2 17h7.6" />
    </svg>
  );
}

async function jsonRequest<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as T;
}

async function fetchDiscovery(signal?: AbortSignal): Promise<DiscoveryRoot[]> {
  const payload = await jsonRequest<{ networks: DiscoveryRoot[] }>('/api/network/public/discover', signal);
  return Array.isArray(payload.networks) ? payload.networks : [];
}

async function fetchPublicNetwork(root: string, focus?: string, signal?: AbortSignal): Promise<PublicNetworkData> {
  const params = new URLSearchParams({ wallet: root });
  if (focus && keyWallet(focus) !== keyWallet(root)) params.set('focus', focus);
  return jsonRequest<PublicNetworkData>(`/api/network/public?${params.toString()}`, signal);
}

function clearSavedState(root: string) {
  try {
    window.sessionStorage.removeItem(`${PUBLIC_SESSION_PREFIX}${root}`);
  } catch {
    // Optional local restoration only.
  }
}

function readSavedState(root: string): { activePath: string[]; view: View } | null {
  try {
    const storageKey = `${PUBLIC_SESSION_PREFIX}${root}`;
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { activePath?: unknown; view?: Partial<View>; savedAt?: unknown };
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > PUBLIC_SESSION_TTL_MS) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    if (!Array.isArray(parsed.activePath) || !parsed.activePath.every((item) => typeof item === 'string')) return null;
    const view = parsed.view;
    return {
      activePath: parsed.activePath.map(keyWallet),
      view: view && typeof view.x === 'number' && typeof view.y === 'number' && typeof view.scale === 'number'
        ? { x: view.x, y: view.y, scale: clamp(view.scale, MIN_SCALE, MAX_SCALE) }
        : { x: 0, y: 28, scale: 1 },
    };
  } catch {
    return null;
  }
}

export function PublicNetworkExplorer({
  locale,
  hasWallet,
  onBack,
  initialRootWallet = null,
}: {
  locale: Locale;
  hasWallet: boolean;
  onBack: () => void;
  initialRootWallet?: string | null;
}) {
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const h = NETWORK_HUB_COPY[locale as SupportedLocale];
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const { openWallet, isWalletActionPending } = useWalletLauncher();
  const normalizedInitialRoot =
    initialRootWallet && validWallet(initialRootWallet)
      ? keyWallet(initialRootWallet)
      : null;
  const [roots, setRoots] = useState<DiscoveryRoot[]>([]);
  const [loading, setLoading] = useState(!normalizedInitialRoot);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [walletInput, setWalletInput] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(
    normalizedInitialRoot,
  );
  const normalizedInput = walletInput.trim().toLowerCase();
  const domainLookupInput =
    normalizedInput.length >= 3 &&
    !validWallet(normalizedInput) &&
    normalizedInput.includes('.')
      ? normalizedInput
      : undefined;
  const { data: lookupDomainInfo, isLoading: lookupDomainLoading } =
    useVechainDomain(domainLookupInput);
  const lookupAddress =
    typeof lookupDomainInfo?.address === 'string'
      ? lookupDomainInfo.address.toLowerCase()
      : '';
  const resolvedLookupWallet = validWallet(normalizedInput)
    ? normalizedInput
    : validWallet(lookupAddress)
      ? lookupAddress
      : null;

  const loadDiscovery = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErrorCode(null);
    try {
      const next = await fetchDiscovery(signal);
      if (!signal?.aborted) setRoots(next);
    } catch (error) {
      if (!signal?.aborted) setErrorCode((error as Error & { code?: string }).code ?? 'PUBLIC_NETWORK_DISCOVERY_FAILED');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (normalizedInitialRoot) {
      setSelectedRoot(normalizedInitialRoot);
    }
  }, [normalizedInitialRoot]);

  useEffect(() => {
    if (selectedRoot) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadDiscovery(controller.signal);
    return () => controller.abort();
  }, [loadDiscovery, selectedRoot]);

  if (selectedRoot) {
    return (
      <PublicNetworkCanvas
        locale={locale}
        rootWallet={selectedRoot}
        onBack={
          normalizedInitialRoot
            ? onBack
            : () => setSelectedRoot(null)
        }
        onBackToMine={hasWallet ? onBack : undefined}
      />
    );
  }

  const inputValid =
    Boolean(resolvedLookupWallet) && !lookupDomainLoading;
  const disabled = errorCode === 'PUBLIC_NETWORK_DISABLED';

  if (disabled) {
    return (
      <section className="publicState networkCard">
        <div className="stateGlyph"><NetworkGlyph size={34} /></div>
        <h1>{h.maintenanceTitle}</h1>
        <p>{h.maintenanceDescription}</p>
        <button
          type="button"
          className="stateBack"
          onClick={hasWallet ? onBack : openWallet}
          disabled={!hasWallet && isWalletActionPending}
        >{hasWallet ? e.backToMyNetwork : t.connectWallet}</button>
        <PublicStateStyles />
      </section>
    );
  }

  return (
    <section className="publicExplorePage networkCard">
      <header>
        <button type="button" className="backButton" onClick={onBack} aria-label={NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale].close}>‹</button>
        <div><span>{e.exploreNetwork}</span><h1>{e.exploreTitle}</h1></div>
      </header>
      <div className="walletLookup">
        <input type="text" value={walletInput} onChange={(event) => setWalletInput(event.target.value)} placeholder={`${e.walletPlaceholder} · .vet`} aria-label={e.walletPlaceholder} dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <button type="button" disabled={!inputValid} onClick={() => { if (resolvedLookupWallet) setSelectedRoot(resolvedLookupWallet); }}>{e.openNetwork}</button>
      </div>
      <div className="publicRoots" aria-busy={loading || undefined}>
        {loading ? <div className="publicLoading"><i /><i /><i /></div> : null}
        {!loading && roots.length > 0 ? roots.map((root) => (
          <button key={root.wallet} type="button" onClick={() => setSelectedRoot(root.wallet)}>
            <span className="miniNetworkIcon"><NetworkGlyph size={22} /></span>
            <strong><PublicNodeLabel address={root.wallet} /></strong><i aria-hidden="true">›</i>
          </button>
        )) : null}
        {!loading && roots.length === 0 && !errorCode ? <p>{e.noPublicNetworks}</p> : null}
        {errorCode && !disabled ? <><p>{e.maintenance}</p><button type="button" className="retry" onClick={() => void loadDiscovery()}>{t.retry}</button></> : null}
      </div>
      <style jsx>{`
        .publicExplorePage{width:min(100%,520px);box-sizing:border-box;margin:0 auto;padding:18px;border:0!important;background:transparent!important}.publicExplorePage>header{min-height:48px;display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:10px}.backButton{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.03);color:#bcb4a7;font:inherit;font-size:1.35rem;cursor:pointer}.publicExplorePage header span{color:#98772d;font-size:.54rem;font-weight:950;letter-spacing:.08em}.publicExplorePage h1{margin:3px 0 0;color:#f2eee5;font-size:1.05rem}.walletLookup{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.walletLookup input{min-width:0;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#12120f;color:#ddd8ce;font:inherit;font-size:.7rem;outline:none}.walletLookup input:focus{border-color:rgba(244,183,40,.38)}.walletLookup button{min-width:105px;border:0;border-radius:13px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}.walletLookup button:disabled{opacity:.38;cursor:not-allowed}.publicRoots{margin-top:14px;display:grid;gap:7px}.publicRoots>button:not(.retry){min-height:54px;padding:7px 11px;display:grid;grid-template-columns:36px minmax(0,1fr) 20px;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:#d8d3ca;font:inherit;text-align:left;cursor:pointer}.publicRoots strong{font-size:.71rem}.publicRoots>button i{color:#777168;font-style:normal;font-size:1.1rem}.miniNetworkIcon{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:rgba(244,183,40,.065);color:#b99134}.publicRoots p{margin:18px 4px;color:#777269;font-size:.68rem;line-height:1.5}.retry{width:max-content;min-height:38px;padding:0 15px;border:1px solid rgba(255,205,80,.16);border-radius:11px;background:rgba(244,183,40,.05);color:#d5bb6e;font:inherit;font-size:.65rem;font-weight:900;cursor:pointer}.publicLoading{height:58px;display:flex;align-items:center;justify-content:center;gap:6px}.publicLoading i{width:6px;height:6px;border-radius:50%;background:#967525;animation:publicDot 850ms ease-in-out infinite}.publicLoading i:nth-child(2){animation-delay:120ms}.publicLoading i:nth-child(3){animation-delay:240ms}@keyframes publicDot{0%,100%{opacity:.25}50%{opacity:1}}@media(max-width:560px){.publicExplorePage{padding:10px}.walletLookup{grid-template-columns:1fr}.walletLookup button{height:43px}}@media(prefers-reduced-motion:reduce){.publicLoading i{animation:none;opacity:.7}}
      `}</style>
    </section>
  );
}

function PublicStateStyles() {
  return <style jsx>{`.publicState{width:min(100%,520px);box-sizing:border-box;margin:0 auto;padding:34px 22px 30px;border:1px solid rgba(255,205,80,.14);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 34%),rgba(255,255,255,.025);text-align:center}.stateGlyph{width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.19);border-radius:50%;background:rgba(244,183,40,.06);color:#d7aa3b}.publicState h1{margin:0;color:#f1eee6;font-size:1.05rem}.publicState p{max-width:410px;margin:9px auto 0;color:#858078;font-size:.72rem;line-height:1.55}.stateBack{min-width:180px;min-height:44px;margin-top:18px;border:1px solid rgba(255,205,80,.17);border-radius:13px;background:rgba(244,183,40,.05);color:#d8c17d;font:inherit;font-size:.69rem;font-weight:900;cursor:pointer}.stateBack:disabled{opacity:.45;cursor:not-allowed}`}</style>;
}

function PublicNetworkCanvas({
  locale,
  rootWallet,
  onBack,
  onBackToMine,
}: {
  locale: Locale;
  rootWallet: string;
  onBack: () => void;
  onBackToMine?: () => void;
}) {
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const h = NETWORK_HUB_COPY[locale as SupportedLocale];
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale as SupportedLocale];
  const root = keyWallet(rootWallet);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, PublicNetworkData>>(new Map());
  const requestSerialRef = useRef(0);
  const branchRequestRef = useRef<AbortController | null>(null);
  const bloomTimerRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const singlePointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[]>([root]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [bloomWallet, setBloomWallet] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 28, scale: 1 });
  const [cameraTransition, setCameraTransition] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 900, height: 620 });
  const [branchError, setBranchError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState<
    'idle' | 'loading' | 'found' | 'not-found' | 'error'
  >('idle');
  const [searchMatch, setSearchMatch] = useState<{
    wallet: string;
    path: string[];
  } | null>(null);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const domainSearchInput =
    normalizedSearch.length >= 3 &&
    !validWallet(normalizedSearch) &&
    normalizedSearch.includes('.')
      ? normalizedSearch
      : undefined;
  const { data: searchDomainInfo, isLoading: searchDomainLoading } =
    useVechainDomain(domainSearchInput);
  const searchDomainAddress =
    typeof searchDomainInfo?.address === 'string'
      ? searchDomainInfo.address.toLowerCase()
      : '';
  const resolvedSearchWallet = validWallet(normalizedSearch)
    ? normalizedSearch
    : validWallet(searchDomainAddress)
      ? searchDomainAddress
      : null;
  const cachedDomainSuggestions = useMemo(
    () => searchOpen ? readCachedLeaderboardDomainSuggestions(normalizedSearch) : [],
    [searchOpen, normalizedSearch],
  );

  const putCache = useCallback((data: PublicNetworkData) => {
    cacheRef.current.set(keyWallet(data.focusWallet), data);
    setCacheVersion((value) => value + 1);
  }, []);

  const cancelNavigation = useCallback(() => {
    requestSerialRef.current += 1;
    branchRequestRef.current?.abort();
    branchRequestRef.current = null;
    setPending(null);
    setBranchError(false);
    return requestSerialRef.current;
  }, []);

  const bloom = useCallback((wallet: string) => {
    if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
    setBloomWallet(wallet);
    bloomTimerRef.current = window.setTimeout(() => {
      setBloomWallet((current) => current === wallet ? null : current);
      bloomTimerRef.current = null;
    }, 700);
  }, []);

  const loadRoot = useCallback(async (signal?: AbortSignal) => {
    const serial = cancelNavigation();
    setState('loading');
    setErrorCode(null);
    try {
      const data = await fetchPublicNetwork(root, undefined, signal);
      if (signal?.aborted || serial !== requestSerialRef.current) return;
      cacheRef.current.clear();
      cacheRef.current.set(root, data);
      setCacheVersion((value) => value + 1);
      let nextPath = [root];
      const saved = readSavedState(root);
      if (saved && saved.activePath[0] === root && saved.activePath.every(validWallet)) {
        try {
          const start = Math.max(0, saved.activePath.length - 5);
          for (const focus of saved.activePath.slice(start, -1)) {
            if (focus === root || cacheRef.current.has(focus)) continue;
            const payload = await fetchPublicNetwork(root, focus, signal);
            if (signal?.aborted || serial !== requestSerialRef.current) return;
            cacheRef.current.set(focus, payload);
          }
          nextPath = saved.activePath;
          setCacheVersion((value) => value + 1);
          setView(saved.view);
        } catch {
          clearSavedState(root);
          nextPath = [root];
          
        }
      } else {
        
      }
      if (signal?.aborted || serial !== requestSerialRef.current) return;
      setActivePath(nextPath);
      setSelected(null);
      setState('ready');
      bloom(root);
    } catch (error) {
      if (signal?.aborted || serial !== requestSerialRef.current) return;
      const code = (error as Error & { code?: string }).code ?? 'PUBLIC_NETWORK_LOAD_FAILED';
      if (code === 'FOCUS_NOT_FOUND') clearSavedState(root);
      setState('error');
      setErrorCode(code);
    }
  }, [root, cancelNavigation, bloom]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRoot(controller.signal);
    return () => {
      controller.abort();
      branchRequestRef.current?.abort();
      requestSerialRef.current += 1;
      if (bloomTimerRef.current) window.clearTimeout(bloomTimerRef.current);
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    };
  }, [loadRoot]);

  useEffect(() => {
    if (!searchOpen || state !== 'ready' || normalizedSearch.length < 3) {
      setSearchState('idle');
      setSearchMatch(null);
      return;
    }
    if (domainSearchInput && searchDomainLoading) {
      setSearchState('loading');
      setSearchMatch(null);
      return;
    }
    if (!resolvedSearchWallet) {
      setSearchState('not-found');
      setSearchMatch(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState('loading');
      setSearchMatch(null);
      try {
        const payload = await fetchPublicNetwork(
          root,
          resolvedSearchWallet,
          controller.signal,
        );
        if (controller.signal.aborted) return;

        for (const focus of payload.breadcrumb.slice(1, -1)) {
          const key = keyWallet(focus);
          if (cacheRef.current.has(key)) continue;
          const parentPayload = await fetchPublicNetwork(
            root,
            key,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          cacheRef.current.set(key, parentPayload);
        }

        putCache(payload);
        setSearchMatch({
          wallet: keyWallet(payload.focusWallet),
          path: payload.breadcrumb.map(keyWallet),
        });
        setSearchState('found');
      } catch (error) {
        if (controller.signal.aborted) return;
        const code = (error as Error & { code?: string }).code;
        setSearchState(
          code === 'FOCUS_NOT_FOUND' ? 'not-found'
            : 'error',
        );
        setSearchMatch(null);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    searchOpen,
    state,
    normalizedSearch,
    domainSearchInput,
    searchDomainLoading,
    resolvedSearchWallet,
    root,
    putCache,
  ]);

  const focusCachedDomainSuggestion = useCallback(async (
    suggestion: CachedLeaderboardDomainSuggestion,
  ) => {
    const controller = new AbortController();
    setSearchState('loading');
    setSearchMatch(null);
    try {
      const payload = await fetchPublicNetwork(
        root,
        suggestion.wallet,
        controller.signal,
      );
      for (const focus of payload.breadcrumb.slice(1, -1)) {
        const key = keyWallet(focus);
        if (cacheRef.current.has(key)) continue;
        const parentPayload = await fetchPublicNetwork(
          root,
          key,
          controller.signal,
        );
        cacheRef.current.set(key, parentPayload);
      }
      putCache(payload);
      cancelNavigation();
      setActivePath(payload.breadcrumb.map(keyWallet));
      setSelected(keyWallet(payload.focusWallet));
      
      setSearchQuery('');
      setSearchState('idle');
      bloom(payload.focusWallet);
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      setSearchState(
        code === 'FOCUS_NOT_FOUND' ? 'not-found'
          : 'error',
      );
    }
  }, [root, putCache, cancelNavigation, bloom]);

  useEffect(() => {
    if (state !== 'ready') return;
    try {
      window.sessionStorage.setItem(`${PUBLIC_SESSION_PREFIX}${root}`, JSON.stringify({ activePath, view, savedAt: Date.now() }));
    } catch {
      // Optional local restoration only.
    }
  }, [root, state, activePath, view]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => setStageSize({ width: stage.clientWidth || 900, height: stage.clientHeight || 620 });
    sync();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => { observer?.disconnect(); window.removeEventListener('resize', sync); };
  }, [state]);

  const isMobile = stageSize.width < 640;
  const rootData = cacheRef.current.get(root) ?? null;

  const memberByWallet = useMemo(() => {
    const map = new Map<string, PublicChild>();
    cacheRef.current.forEach((data) => data.children.forEach((child) => map.set(keyWallet(child.wallet), child)));
    return map;
  }, [cacheVersion]);

  const focusWallet = activePath[activePath.length - 1] ?? root;
  const focusData = cacheRef.current.get(focusWallet) ?? rootData;

  const layout = useMemo(() => {
    const visuals: PublicVisual[] = [];
    const edges: PublicEdge[] = [];
    const positions = new Map<string, { x: number; y: number; depth: number }>();
    if (!focusData) {
      return { visuals, edges, positions, startDepth: Math.max(0, activePath.length - 1) };
    }

    const focusKey = keyWallet(focusData.focusWallet);
    positions.set(focusKey, { x: CENTER_X, y: ROOT_Y, depth: focusData.focusDepth });
    visuals.push({
      wallet: focusKey,
      parentWallet: focusData.breadcrumb.length > 1
        ? keyWallet(focusData.breadcrumb[focusData.breadcrumb.length - 2])
        : null,
      x: CENTER_X,
      y: ROOT_Y,
      depth: focusData.focusDepth,
      root: true,
      member: null,
    });

    focusData.children.forEach((child, index) => {
      const wallet = keyWallet(child.wallet);
      const point = publicChildPoint(wallet, index, isMobile);
      positions.set(wallet, { x: point.x, y: point.y, depth: child.depth });
      visuals.push({
        wallet,
        parentWallet: focusKey,
        x: point.x,
        y: point.y,
        depth: child.depth,
        root: false,
        member: child,
      });
      edges.push({
        key: focusKey + '->' + wallet,
        x1: CENTER_X,
        y1: ROOT_Y,
        x2: point.x,
        y2: point.y,
        active: false,
      });
    });

    return {
      visuals,
      edges,
      positions,
      startDepth: Math.max(0, activePath.length - 1),
    };
  }, [activePath.length, focusData, isMobile]);

  const fitPublicNetwork = useCallback((animate = true) => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const points = layout.visuals.map((visual) => ({ x: visual.x, y: visual.y }));
    if (animate) setCameraTransition(true);
    setView(publicFittedView(stageSize, points));
    if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
    cameraTimerRef.current = window.setTimeout(() => {
      setCameraTransition(false);
      cameraTimerRef.current = null;
    }, animate ? 760 : 0);
  }, [stageSize, layout.visuals]);

  useEffect(() => {
    if (state !== 'ready' || !focusData || stageSize.width <= 0 || stageSize.height <= 0) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    
    if (reducedMotion) {
      fitPublicNetwork(false);
      return;
    }
    const timer = window.setTimeout(() => fitPublicNetwork(true), 140);
    return () => window.clearTimeout(timer);
  }, [state, focusData?.focusWallet, stageSize.width, stageSize.height, fitPublicNetwork]);

  const activate = useCallback(async (targetWallet: string, _parentDepth: number) => {
    const serial = cancelNavigation();
    const target = keyWallet(targetWallet);
    setSelected(target);
    const member = memberByWallet.get(target);
    const cached = cacheRef.current.get(target) ?? null;

    if (cached) {
      if (serial !== requestSerialRef.current) return;
      setActivePath(cached.breadcrumb.map(keyWallet));
      bloom(target);
      return;
    }

    if (!member || member.direct <= 0) {
      if (serial !== requestSerialRef.current) return;
      setActivePath([...activePath, target]);
      return;
    }

    const controller = new AbortController();
    branchRequestRef.current = controller;
    setPending(target);
    try {
      const data = await fetchPublicNetwork(root, target, controller.signal);
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      putCache(data);
      setActivePath(data.breadcrumb.map(keyWallet));
      bloom(target);
    } catch (error) {
      if (controller.signal.aborted || serial !== requestSerialRef.current) return;
      const code = (error as Error & { code?: string }).code;
      if (code === 'FOCUS_NOT_FOUND') {
        clearSavedState(root);
        setActivePath([root]);
        setSelected(null);
        } else {
        setBranchError(true);
      }
    } finally {
      if (branchRequestRef.current === controller) branchRequestRef.current = null;
      if (serial === requestSerialRef.current) setPending(null);
    }
  }, [activePath, memberByWallet, cancelNavigation, root, putCache, bloom]);

  const selectedMember = selected ? memberByWallet.get(selected) ?? null : null;
  const selectedData = selected ? cacheRef.current.get(selected) ?? null : null;
  const selectedNetwork = selectedData?.summary.network ?? selectedMember?.network ?? 0;
  const selectedDirect = selectedData?.summary.direct ?? selectedMember?.direct ?? 0;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-pan="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (pointersRef.current.size === 1) { singlePointerRef.current = point; pinchRef.current = null; }
    else if (pointersRef.current.size === 2) { const [a, b] = Array.from(pointersRef.current.values()); pinchRef.current = { center: midpoint(a, b), distance: pointDistance(a, b) }; singlePointerRef.current = null; }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = singlePointerRef.current;
      if (previous) { const dx = current.x - previous.x; const dy = current.y - previous.y; dragDistanceRef.current += Math.hypot(dx, dy); setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy })); }
      singlePointerRef.current = current;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const distance = pointDistance(a, b);
      const previous = pinchRef.current;
      const rect = stageRef.current?.getBoundingClientRect();
      if (previous && previous.distance > 0 && rect) {
        const px = center.x - rect.left;
        const py = center.y - rect.top;
        setView((value) => {
          const nextScale = clamp(value.scale * (distance / previous.distance), MIN_SCALE, MAX_SCALE);
          const worldX = (px - value.x) / value.scale;
          const worldY = (py - value.y) / value.scale;
          return { x: px - worldX * nextScale + (center.x - previous.center.x), y: py - worldY * nextScale + (center.y - previous.center.y), scale: nextScale };
        });
      }
      pinchRef.current = { center, distance };
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) { singlePointerRef.current = Array.from(pointersRef.current.values())[0]; pinchRef.current = null; }
    else if (pointersRef.current.size === 0) { singlePointerRef.current = null; pinchRef.current = null; }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setView((value) => {
      const nextScale = clamp(value.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (px - value.x) / value.scale;
      const worldY = (py - value.y) / value.scale;
      return { x: px - worldX * nextScale, y: py - worldY * nextScale, scale: nextScale };
    });
  };

  if (state === 'loading') {
    return (
      <section className="publicLoadingCanvas networkCard" aria-busy="true">
        <div className="publicLoadingUtility" data-no-pan="true">
          <span className="loadingNetworkBadge" title={rootWallet}>
            <span aria-hidden="true">↗</span>
            <PublicNodeLabel address={root} />
          </span>
        </div>
        <div className="publicLoadingStage">
          <div className="inlineNetworkLoading" role="status" aria-label={e.visibleNetwork}>
            <i /><i /><i />
          </div>
        </div>
        <style jsx>{`
          .publicLoadingCanvas{width:min(100%,520px);height:100%;min-height:0;margin:0 auto;padding:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.06)!important;border-radius:18px;background:#090907!important;overflow:hidden}
          .publicLoadingUtility{min-height:40px;padding:4px 6px;box-sizing:border-box;display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(11,11,9,.98)}
          .loadingNetworkBadge{min-width:0;max-width:124px;height:20px;padding:0 6px;box-sizing:border-box;display:flex;align-items:center;gap:3px;border:1px solid rgba(244,183,40,.13);border-radius:7px;background:rgba(244,183,40,.035);color:#9c8242;font-size:.44rem;font-weight:850;overflow:hidden;white-space:nowrap}
          .loadingNetworkBadge :global(*){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .publicLoadingStage{position:relative;flex:1 1 auto;min-height:0;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 50%,rgba(244,183,40,.036),transparent 36%),#080807}
          .inlineNetworkLoading{display:flex;align-items:center;justify-content:center;gap:5px;opacity:.66}
          .inlineNetworkLoading i{width:5px;height:5px;border-radius:50%;background:#a67e20;animation:publicLoadingDot 850ms ease-in-out infinite}
          .inlineNetworkLoading i:nth-child(2){animation-delay:120ms}
          .inlineNetworkLoading i:nth-child(3){animation-delay:240ms}
          @keyframes publicLoadingDot{0%,100%{opacity:.25}50%{opacity:1}}
          @media(prefers-reduced-motion:reduce){.inlineNetworkLoading i{animation:none;opacity:.65}}
        `}</style>
      </section>
    );
  }

  if (state === 'error' || !rootData) {
    const maintenance = errorCode === 'PUBLIC_NETWORK_DISABLED';
    return <section className="publicState networkCard"><div className="stateGlyph"><NetworkGlyph size={34} /></div><h1>{maintenance ? h.maintenanceTitle : e.exploreTitle}</h1><p>{maintenance ? h.maintenanceDescription : e.maintenance}</p><div className="stateActions"><button type="button" onClick={onBack}>{e.exploreNetwork}</button>{maintenance ? null : <button type="button" onClick={() => void loadRoot()}>{t.retry}</button>}</div><PublicStateStyles /><style jsx>{`.stateActions{width:min(100%,320px);margin:18px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:8px}.stateActions button{min-height:43px;border:1px solid rgba(255,205,80,.15);border-radius:12px;background:rgba(244,183,40,.05);color:#d5bd73;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}.stateActions button:only-child{grid-column:1/-1}`}</style></section>;
  }

  return (
    <section className="publicCanvasPage networkCard">
      <div className="networkUtilityRow" data-no-pan="true">
        <div className="networkIdentity">
          <div className="summaryTotal" aria-label={`${t.networkSize}: ${rootData.summary.network.toLocaleString()}`}>
            <span>{NETWORK_TOTAL_COPY[locale as SupportedLocale]}</span>
            <strong>{rootData.summary.network.toLocaleString()}</strong>
          </div>
          <span className="otherNetworkBadge" title={rootWallet} aria-label={e.visibleNetwork}>
            <span aria-hidden="true">↗</span>
            <PublicNodeLabel address={root} />
          </span>
          <button
            type="button"
            className={`searchToggle${searchOpen ? ' active' : ''}`}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
                setSearchQuery('');
                setSearchState('idle');
                setSearchMatch(null);
              } else {
                setSearchOpen(true);
              }
            }}
            aria-label={searchOpen ? c.close : e.walletPlaceholder}
            title={searchOpen ? c.close : e.walletPlaceholder}
            aria-expanded={searchOpen}
          >
            <SearchGlyph />
          </button>
        </div>
        <div className="publicControls topControls" data-network-interactive="true">
          <button type="button" aria-label={e.backToMyNetwork} title={e.backToMyNetwork} onClick={onBackToMine ?? onBack}>◎</button>
          <button type="button" aria-label={c.centerNetwork} title={c.centerNetwork} onClick={() => fitPublicNetwork(true)}>⛶</button>
          <button type="button" aria-label={c.zoomOut} title={c.zoomOut} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - .1, MIN_SCALE, MAX_SCALE) }))}>−</button>
          <button type="button" aria-label={c.zoomIn} title={c.zoomIn} onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + .1, MIN_SCALE, MAX_SCALE) }))}>+</button>
        </div>
      </div>
      {searchOpen ? (
        <div className="publicSearchBar" data-no-pan="true" data-network-interactive="true">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={`${e.walletPlaceholder} · .vet`}
            aria-label={e.walletPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
          />
          {normalizedSearch.length >= 3 ? (
            <div className="publicSearchResult">
              {searchState === 'loading' ? (
                <span>…</span>
              ) : searchState === 'found' && searchMatch ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelNavigation();
                    setActivePath(searchMatch.path);
                    setSelected(searchMatch.wallet);
                                  
                    setSearchOpen(false);
                    setSearchQuery('');
                    setSearchState('idle');
                    bloom(searchMatch.wallet);
                  }}
                >
                  <PublicNodeLabel address={searchMatch.wallet} />
                  <i aria-hidden="true">›</i>
                </button>
              ) : searchState === 'error' ? (
                <span>{e.maintenance}</span>
              ) : cachedDomainSuggestions.length ? (
                cachedDomainSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    className="domainSuggestion"
                    key={suggestion.wallet}
                    onClick={() => void focusCachedDomainSuggestion(suggestion)}
                  >
                    <span className="domainSuggestionIdentity">
                      <strong dir="auto">{formatVechainDomainLabel(suggestion.domain)}</strong>
                      <small dir="ltr">{shortWallet(suggestion.wallet)}</small>
                    </span>
                    <i aria-hidden="true">›</i>
                  </button>
                ))
              ) : (
                <span>{t.noMatching}</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={stageRef} className="publicStage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onWheel={onWheel} onClick={(event) => { if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return; if (dragDistanceRef.current > 6) return; setSelected(null); }}>
        <div className="publicAmbient" aria-hidden="true" />
        {layout.startDepth > 0 ? <div className="publicPath" data-no-pan="true" data-network-interactive="true"><span dir="ltr">{shortWallet(root)}</span><i>›</i><span>…</span><i>›</i><strong dir="ltr">{shortWallet(activePath[layout.startDepth])}</strong></div> : null}
        <div className={`publicWorld${cameraTransition ? ' cameraTransition' : ''}`} style={{ width: PLANE_W, height: PLANE_H, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`, transformOrigin: '0 0' }}>
          <svg className="publicEdges" width={PLANE_W} height={PLANE_H} viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} aria-hidden="true">{layout.edges.map((edge) => <path key={edge.key} className={edge.active || (selected ? edge.key.endsWith('->' + selected) : false) ? 'active' : ''} d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${(edge.y1 + edge.y2) / 2}, ${edge.x2} ${(edge.y1 + edge.y2) / 2}, ${edge.x2} ${edge.y2}`} />)}</svg>
          {layout.visuals.map((visual) => {
            const member = visual.member;
            const data = cacheRef.current.get(visual.wallet);
            const branchCount = visual.root ? (focusData?.summary.network ?? rootData.summary.network) : 1 + (data?.summary.network ?? member?.network ?? 0);
            const isActive = activePath.includes(visual.wallet);
            const isSelected = selected === visual.wallet;
            return <button key={visual.wallet} type="button" className={`publicNode ${visual.root ? 'root' : ''} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${bloomWallet === visual.wallet ? 'bloom' : ''}`} style={{ left: visual.x, top: visual.y } as CSSProperties} data-network-interactive="true" onClick={(event) => { event.stopPropagation(); if (dragDistanceRef.current > 6) return; setSelected(visual.wallet); }}><span className="publicAvatar"><NetworkGlyph size={visual.root ? 20 : 16} /></span><strong><PublicNodeLabel address={visual.wallet} /></strong><small>{visual.root ? rootData.summary.network.toLocaleString() : branchCount.toLocaleString()}</small></button>;
          })}
          {pending ? <div className="pendingBranch" style={{ left: layout.positions.get(pending)?.x ?? CENTER_X, top: (layout.positions.get(pending)?.y ?? ROOT_Y) + 48 } as CSSProperties}><i /><i /><i /></div> : null}
        </div>
        {branchError ? <div className="branchError" data-no-pan="true"><span>{e.maintenance}</span><button type="button" onClick={() => setBranchError(false)} aria-label={c.close}>×</button></div> : null}
        {activePath.length > 1 ? <button type="button" className="parentReturn" data-no-pan="true" data-network-interactive="true" onClick={() => void activate(activePath[activePath.length - 2], Math.max(0, activePath.length - 2))} disabled={Boolean(pending)}>‹ {t.invitedBy}</button> : null}
        {selected ? <aside className={`publicInspector${activePath.length > 1 ? ' hasParentReturn' : ''}`} data-no-pan="true" data-network-interactive="true"><div><span className="inspectorAvatar"><NetworkGlyph size={18} /></span><strong><PublicNodeLabel address={selected} /></strong><button type="button" onClick={() => setSelected(null)} aria-label={c.close}>×</button></div><section><span><b>{selectedNetwork.toLocaleString()}</b>{t.networkSize}</span><span><b>{selectedDirect.toLocaleString()}</b>{t.direct}</span></section>{selected !== focusWallet && selectedMember && selectedMember.direct > 0 ? <button type="button" className="profileAction" onClick={() => void activate(selectedMember.wallet, Math.max(0, activePath.length - 1))} disabled={Boolean(pending)}>{c.expandBranch}</button> : null}</aside> : null}
      </div>
      <style jsx>{`
        .publicCanvasPage{width:min(100%,520px);height:100%;min-height:0;margin:0 auto;padding:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.06)!important;border-radius:18px;background:#090907!important;overflow:hidden}
        .networkUtilityRow{position:relative;z-index:70;flex:0 0 auto;min-height:40px;padding:4px 6px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:4px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(11,11,9,.98)}
        .networkIdentity{min-width:0;flex:1 1 auto;display:flex;align-items:center;gap:6px;overflow:hidden}.summaryTotal{min-width:0;flex:0 0 auto;display:flex;align-items:baseline;gap:5px;white-space:nowrap}.summaryTotal span{color:#77736c;font-size:.48rem;font-weight:800}.summaryTotal strong{color:#f1ede4;font-size:.68rem;font-variant-numeric:tabular-nums}
        .otherNetworkBadge{min-width:0;max-width:112px;height:20px;padding:0 6px;box-sizing:border-box;display:flex;align-items:center;gap:3px;border:1px solid rgba(244,183,40,.13);border-radius:7px;background:rgba(244,183,40,.035);color:#9c8242;font-size:.44rem;font-weight:850;overflow:hidden;white-space:nowrap}.otherNetworkBadge>span:first-child{flex:0 0 auto}.otherNetworkBadge :global(*){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .searchToggle{flex:0 0 auto;width:28px;height:29px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.94);color:#a9a397;font:inherit;cursor:pointer}.searchToggle:hover,.searchToggle.active{border-color:rgba(244,183,40,.31);color:#e1bd5b;background:rgba(244,183,40,.055)}
        .publicControls.topControls{position:static;z-index:auto;right:auto;bottom:auto;display:flex;align-items:center;gap:3px;flex:0 0 auto}.publicControls.topControls button{width:28px;height:29px;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.92);color:#bbb5aa;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}.publicControls.topControls button:hover{border-color:rgba(244,183,40,.28);color:#e4c36d}.publicSearchBar{position:relative;z-index:42;margin:0 8px 5px}.publicSearchBar>input{width:100%;height:34px;box-sizing:border-box;padding:0 10px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:#11110f;color:#d8d3ca;font:inherit;font-size:16px;outline:none}.publicSearchBar>input:focus{border-color:rgba(244,183,40,.34)}.publicSearchResult{position:absolute;z-index:50;top:38px;left:0;width:100%;box-sizing:border-box;padding:5px;border:1px solid rgba(255,205,80,.14);border-radius:11px;background:rgba(14,14,12,.985);box-shadow:0 16px 36px rgba(0,0,0,.42)}.publicSearchResult>span{display:block;padding:8px;color:#77736c;font-size:.56rem;text-align:center}.publicSearchResult>button{width:100%;min-height:38px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:8px;background:transparent;color:#ddd7cc;font:inherit;font-size:.62rem;font-weight:850;cursor:pointer}.domainSuggestionIdentity{min-width:0;display:grid;gap:1px;text-align:left}.domainSuggestionIdentity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.domainSuggestionIdentity small{color:#77736c;font-size:.5rem;font-weight:700}.publicSearchResult>button:hover{background:rgba(244,183,40,.06)}.publicSearchResult i{font-style:normal;color:#9c8242}.publicStage{position:relative;flex:1 1 auto;min-height:0;height:auto;overflow:hidden;touch-action:none;user-select:none;cursor:grab}.publicStage:active{cursor:grabbing}.publicAmbient{position:absolute;left:50%;top:0;width:min(820px,92vw);height:410px;transform:translateX(-50%);background:radial-gradient(ellipse,rgba(244,183,40,.045),transparent 68%);pointer-events:none}.publicWorld{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.publicWorld.cameraTransition{transition:transform 760ms cubic-bezier(.18,.82,.2,1)}.publicEdges{position:absolute;inset:0;pointer-events:none;overflow:visible}.publicEdges path{fill:none;vector-effect:non-scaling-stroke;stroke:rgba(176,145,73,.31);stroke-width:1.05;stroke-linecap:round}.publicEdges path.active{stroke:rgba(232,183,62,.48);stroke-width:1.2}.publicNode{position:absolute;transform:translate(-50%,-50%);font:inherit;cursor:pointer}.publicNode{z-index:5;width:52px;height:52px;padding:0;border:0;border-radius:50%;background:transparent;color:#c4beb3;display:block}.publicNode.root{width:74px;height:74px;z-index:8}.publicNode strong{position:absolute;left:50%;top:calc(100% + 6px);width:92px;transform:translateX(-50%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#89837a;font-size:.46rem;font-weight:800}.publicNode small{position:absolute;left:50%;top:calc(100% + 20px);transform:translateX(-50%);color:#d8b958;font-size:.48rem;font-weight:900;white-space:nowrap}.publicNode.root strong{top:calc(100% + 7px);width:110px;color:#8b857c;font-size:.48rem}.publicNode.root small{top:calc(100% + 22px);color:#edc65c;font-size:.52rem}.publicNode.active strong,.publicNode.selected strong{color:#c5b99d}.publicNode.selected .publicAvatar{box-shadow:0 0 0 4px rgba(244,183,40,.07),0 0 20px rgba(244,183,40,.12)}.publicNode.root .publicAvatar{width:74px;height:74px;border-color:rgba(255,207,71,.82);color:#d0a23b;background:radial-gradient(circle at 50% 45%,rgb(24,21,13) 0%,rgb(13,13,11) 62%,rgb(13,13,11) 100%);position:relative}.publicNode.root .publicAvatar::after{content:'';position:absolute;inset:-7px;border:1px solid rgba(244,183,40,.4);border-radius:50%;box-shadow:0 0 18px rgba(244,183,40,.055);animation:publicRootBreath 2.8s ease-in-out infinite;pointer-events:none}.publicAvatar{position:absolute;inset:0;width:52px;height:52px;display:grid;place-items:center;border:1px solid rgba(210,174,65,.38);border-radius:50%;box-sizing:border-box;background:#0d0d0b;color:#887c64;box-shadow:0 0 22px rgba(244,183,40,.025)}.publicNode.bloom{animation:publicBloom 620ms cubic-bezier(.16,1.04,.3,1) both}.publicPath{position:absolute;z-index:25;left:12px;top:7px;display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(14,14,12,.72);color:#756e63;font-size:.5rem}.publicPath strong{color:#aa9e88}.parentReturn{position:absolute;z-index:55;left:8px;bottom:8px;min-height:34px;padding:0 11px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:rgba(18,18,15,.92);color:#a89c7b;font:inherit;font-size:.55rem;font-weight:850;cursor:pointer}.parentReturn:disabled{opacity:.4}.publicInspector{position:absolute;z-index:75;inset-inline:8px;top:auto;bottom:8px;width:auto;box-sizing:border-box;padding:9px;border:1px solid rgba(255,205,80,.15);border-radius:14px;background:rgba(15,15,13,.975);box-shadow:0 16px 38px rgba(0,0,0,.42)}.publicInspector.hasParentReturn{bottom:52px}.publicInspector>div{display:grid;grid-template-columns:34px minmax(0,1fr) 28px;align-items:center;gap:8px}.inspectorAvatar{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:rgba(244,183,40,.06);color:#a98638}.publicInspector strong{font-size:.66rem;overflow:hidden;text-overflow:ellipsis}.publicInspector>div button{width:28px;height:28px;border:0;background:transparent;color:#80796f;font:inherit;font-size:1rem;cursor:pointer}.publicInspector section{margin-top:7px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.publicInspector section span{padding:5px 6px;border:1px solid rgba(255,255,255,.045);border-radius:8px;background:rgba(255,255,255,.018);color:#68645e;font-size:.43rem}.publicInspector section b{display:block;margin-bottom:2px;color:#d6d0c5;font-size:.59rem}.profileAction{width:100%;min-height:32px;margin-top:5px;padding:4px 10px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.54rem;font-weight:950;cursor:pointer}.profileAction:disabled{opacity:.45;cursor:default}.pendingBranch{position:absolute;z-index:20;transform:translate(-50%,-50%);display:flex;gap:4px}.pendingBranch i{width:4px;height:4px;border-radius:50%;background:#a67e20;animation:publicDot 800ms ease-in-out infinite}.pendingBranch i:nth-child(2){animation-delay:110ms}.pendingBranch i:nth-child(3){animation-delay:220ms}.branchError{position:absolute;z-index:45;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 9px 7px 11px;border:1px solid rgba(255,160,120,.14);border-radius:10px;background:rgba(20,14,12,.9);color:#b98e7b;font-size:.52rem}.branchError button{width:24px;height:24px;border:0;background:transparent;color:#9b7768;cursor:pointer}.publicCanvasPage button:focus-visible,.publicExplorePage button:focus-visible{outline:2px solid rgba(255,205,80,.72);outline-offset:2px}@keyframes publicRootBreath{0%,100%{opacity:.45;transform:scale(.96)}50%{opacity:.92;transform:scale(1.06)}}@keyframes publicBloom{0%{opacity:0;transform:translate(-50%,-42%) scale(.72)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes publicDot{0%,100%{opacity:.25}50%{opacity:1}}@media(max-width:700px){.branchError{bottom:61px}}@media(prefers-reduced-motion:reduce){.publicNode.bloom,.publicNode.root .publicAvatar::after,.pendingBranch i{animation:none}.publicWorld{will-change:auto}.publicWorld.cameraTransition{transition:none}}
      `}</style>
    </section>
  );
}
