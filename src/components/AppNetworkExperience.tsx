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

import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { AppNetwork } from './AppNetwork';
import { useWalletLauncher } from './WalletControl';

type PrivateProbe = {
  summary: {
    network: number;
  };
};

type VisibilityState = {
  publicEnabled: boolean;
  discoverable: boolean;
};

type PublicChild = {
  wallet: string;
  network: number;
  direct: number;
  thisRound: number | null;
  depth: number;
  hasPrivateBranches: boolean;
};

type PublicNetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    thisRound: number | null;
    depth: number;
  };
  children: PublicChild[];
  hasPrivateBranches: boolean;
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

type PublicCluster = {
  parentWallet: string;
  x: number;
  y: number;
  remaining: number;
  depth: number;
};

type PublicEdge = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
};

const PUBLIC_SESSION_PREFIX = 'veinvite-network-public-v1:';
const PUBLIC_PLANE_W = 2600;
const PUBLIC_PLANE_H = 2200;
const PUBLIC_CENTER_X = PUBLIC_PLANE_W / 2;
const PUBLIC_ROOT_Y = 118;
const PUBLIC_LEVEL_GAP = 116;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.45;

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 5)}...${wallet.slice(-3).toUpperCase()}`;
}

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function keyWallet(wallet: string): string {
  return wallet.toLowerCase();
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

function networkGlyph(size = 34) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="17" r="2.2" />
      <path d="M10.8 6.9 7.2 15" />
      <path d="m13.2 6.9 3.6 8.1" />
      <path d="M8.2 17h7.6" />
    </svg>
  );
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed.') as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as T;
}

async function fetchPrivateProbe(wallet: string, signal?: AbortSignal): Promise<PrivateProbe> {
  return jsonRequest<PrivateProbe>(`/api/network?wallet=${encodeURIComponent(wallet)}`, { signal });
}

async function fetchVisibility(signal?: AbortSignal): Promise<VisibilityState> {
  return jsonRequest<VisibilityState>('/api/network/public/visibility', { signal });
}

async function saveVisibility(next: VisibilityState): Promise<VisibilityState> {
  return jsonRequest<VisibilityState>('/api/network/public/visibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
}

async function fetchDiscovery(signal?: AbortSignal): Promise<DiscoveryRoot[]> {
  const payload = await jsonRequest<{ networks: DiscoveryRoot[] }>(
    '/api/network/public/discover',
    { signal },
  );
  return Array.isArray(payload.networks) ? payload.networks : [];
}

async function fetchPublicNetwork(
  rootWallet: string,
  focusWallet?: string,
  signal?: AbortSignal,
): Promise<PublicNetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });
  if (focusWallet && keyWallet(focusWallet) !== keyWallet(rootWallet)) {
    params.set('focus', focusWallet);
  }
  return jsonRequest<PublicNetworkData>(`/api/network/public?${params.toString()}`, { signal });
}

function goHomeWithoutReload() {
  const button = document.querySelector<HTMLButtonElement>('[data-veinvite-tab="home"]');
  if (button) {
    button.click();
    return;
  }
  window.location.assign('/');
}

function StateGlyph() {
  return <div className="experienceGlyph">{networkGlyph(35)}</div>;
}

function VisibilityPanel({
  locale,
  value,
  saving,
  error,
  onChange,
}: {
  locale: Locale;
  value: VisibilityState;
  saving: boolean;
  error: string;
  onChange: (next: VisibilityState) => void;
}) {
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  return (
    <section className="visibilityPanel" aria-busy={saving || undefined}>
      <div className="visibilityRow">
        <div>
          <strong>{e.publicEnabled}</strong>
          <p>{e.publicEnabledNote}</p>
        </div>
        <button
          type="button"
          className={value.publicEnabled ? 'switch on' : 'switch'}
          role="switch"
          aria-checked={value.publicEnabled}
          disabled={saving}
          onClick={() => onChange({
            publicEnabled: !value.publicEnabled,
            discoverable: value.publicEnabled ? false : value.discoverable,
          })}
        ><span /></button>
      </div>
      <div className="visibilityRow">
        <div>
          <strong>{e.discoverable}</strong>
          <p>{e.discoverableNote}</p>
        </div>
        <button
          type="button"
          className={value.discoverable ? 'switch on' : 'switch'}
          role="switch"
          aria-checked={value.discoverable}
          disabled={saving || !value.publicEnabled}
          onClick={() => onChange({ ...value, discoverable: !value.discoverable })}
        ><span /></button>
      </div>
      {error ? <p className="visibilityError" role="status">{error}</p> : null}
      <style jsx>{`
        .visibilityPanel{width:min(calc(100% - 24px),560px);box-sizing:border-box;margin:0 auto 10px;padding:14px 15px;border:1px solid rgba(255,205,80,.14);border-radius:16px;background:rgba(20,19,15,.9)}
        .visibilityRow{min-height:54px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px}.visibilityRow+.visibilityRow{margin-top:8px;padding-top:9px;border-top:1px solid rgba(255,255,255,.06)}
        strong{display:block;color:#e9e4da;font-size:.72rem}p{margin:4px 0 0;color:#7f7a72;font-size:.61rem;line-height:1.42}.switch{width:45px;height:26px;padding:3px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:#1a1916;cursor:pointer}.switch span{display:block;width:18px;height:18px;border-radius:50%;background:#6f6a62;transition:transform 180ms ease,background 180ms ease}.switch.on{border-color:rgba(244,183,40,.35);background:rgba(244,183,40,.13)}.switch.on span{transform:translateX(17px);background:#f4bd35}.switch:disabled{opacity:.45;cursor:not-allowed}.visibilityError{color:#f1a08a}
      `}</style>
    </section>
  );
}

export function AppNetworkExperience({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const [mode, setMode] = useState<'own' | 'explore'>('own');
  const [probeState, setProbeState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [probe, setProbe] = useState<PrivateProbe | null>(null);
  const [probeError, setProbeError] = useState('');
  const [visibility, setVisibility] = useState<VisibilityState>({ publicEnabled: false, discoverable: false });
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState('');

  const loadProbe = useCallback(async (signal?: AbortSignal) => {
    if (!wallet) return;
    setProbeState('loading');
    setProbeError('');
    try {
      const data = await fetchPrivateProbe(wallet, signal);
      if (signal?.aborted) return;
      setProbe(data);
      setProbeState('ready');
    } catch (error) {
      if (signal?.aborted) return;
      setProbe(null);
      setProbeState('error');
      const code = (error as Error & { code?: string }).code;
      setProbeError(code === 'NETWORK_DISABLED' ? e.maintenance : (error instanceof Error ? error.message : t.loadError));
    }
  }, [wallet, e.maintenance, t.loadError]);

  useEffect(() => {
    setProbe(null);
    setVisibility({ publicEnabled: false, discoverable: false });
    setVisibilityOpen(false);
    setVisibilityError('');
    if (!wallet) {
      setProbeState('idle');
      return;
    }
    const controller = new AbortController();
    void loadProbe(controller.signal);
    void fetchVisibility(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setVisibility(data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [wallet, loadProbe]);

  const updateVisibility = async (next: VisibilityState) => {
    if (!wallet || visibilitySaving) return;
    const previous = visibility;
    setVisibility(next);
    setVisibilitySaving(true);
    setVisibilityError('');
    try {
      const saved = await saveVisibility(next);
      setVisibility(saved);
    } catch {
      setVisibility(previous);
      setVisibilityError(e.visibilityError);
    } finally {
      setVisibilitySaving(false);
    }
  };

  if (mode === 'explore') {
    return (
      <PublicNetworkExplorer
        locale={locale}
        hasWallet={Boolean(wallet)}
        onBack={() => setMode('own')}
      />
    );
  }

  if (!wallet) {
    return (
      <section className="networkExperienceState networkCard">
        <StateGlyph />
        <h1>{t.connectTitle}</h1>
        <p>{t.connectDescription}</p>
        <div className="experienceActions">
          <button type="button" className="primary" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </div>
        <ExperienceStateStyles />
      </section>
    );
  }

  if (probeState === 'loading' || probeState === 'idle') {
    return (
      <section className="networkExperienceState networkCard" aria-busy="true">
        <div className="experienceDots" aria-hidden="true"><i /><i /><i /></div>
        <h1>{t.title}</h1>
        <p>{t.directNetwork}</p>
        <ExperienceStateStyles />
      </section>
    );
  }

  if (probeState === 'error' || !probe) {
    return (
      <section className="networkExperienceState networkCard">
        <StateGlyph />
        <h1>{t.loadError}</h1>
        <p>{probeError || t.loadError}</p>
        <div className="experienceActions">
          <button type="button" className="primary" onClick={() => void loadProbe()}>{t.retry}</button>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </div>
        <ExperienceStateStyles />
      </section>
    );
  }

  if (probe.summary.network === 0) {
    return (
      <>
        <section className="networkExperienceState networkCard">
          <StateGlyph />
          <h1>{t.emptyTitle}</h1>
          <p>{t.emptyDescription}</p>
          <div className="experienceActions">
            <button type="button" className="primary" onClick={goHomeWithoutReload}>{t.inviteFriend}</button>
            <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
            <button type="button" className="tertiary" onClick={() => setVisibilityOpen((value) => !value)}>{e.publicSettings}</button>
          </div>
          <ExperienceStateStyles />
        </section>
        {visibilityOpen ? (
          <VisibilityPanel
            locale={locale}
            value={visibility}
            saving={visibilitySaving}
            error={visibilityError}
            onChange={(next) => void updateVisibility(next)}
          />
        ) : null}
      </>
    );
  }

  return (
    <section className="networkExperienceShell">
      <div className="experienceToolbar" data-no-pan="true">
        <button type="button" className="active">{e.myNetwork}</button>
        <button type="button" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        <button type="button" onClick={() => setVisibilityOpen((value) => !value)}>{e.publicSettings}</button>
      </div>
      {visibilityOpen ? (
        <VisibilityPanel
          locale={locale}
          value={visibility}
          saving={visibilitySaving}
          error={visibilityError}
          onChange={(next) => void updateVisibility(next)}
        />
      ) : null}
      <AppNetwork locale={locale} />
      <style jsx>{`
        .networkExperienceShell{width:100%}.experienceToolbar{width:min(calc(100% - 24px),560px);margin:0 auto 8px;padding:4px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;border:1px solid rgba(255,205,80,.11);border-radius:14px;background:rgba(17,17,15,.78)}.experienceToolbar button{min-height:35px;padding:0 8px;border:0;border-radius:10px;background:transparent;color:#777168;font:inherit;font-size:.6rem;font-weight:900;cursor:pointer}.experienceToolbar button.active{background:rgba(244,183,40,.09);color:#eac75e}.experienceToolbar button:hover{color:#d6cfc2}
      `}</style>
    </section>
  );
}

function ExperienceStateStyles() {
  return (
    <style jsx>{`
      .networkExperienceState{width:min(calc(100% - 24px),560px);box-sizing:border-box;margin:0 auto;padding:34px 22px 30px;border:1px solid rgba(255,205,80,.14);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 34%),rgba(255,255,255,.025);text-align:center}.networkExperienceState :global(.experienceGlyph){width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.19);border-radius:50%;background:rgba(244,183,40,.06);color:#d7aa3b}.networkExperienceState h1{margin:0;color:#f1eee6;font-size:1.05rem;letter-spacing:-.025em}.networkExperienceState p{max-width:410px;margin:9px auto 0;color:#858078;font-size:.72rem;line-height:1.55}.experienceActions{width:min(100%,330px);margin:20px auto 0;display:grid;gap:8px}.experienceActions button{min-height:46px;border-radius:14px;font:inherit;font-size:.72rem;font-weight:900;cursor:pointer}.experienceActions .primary{border:0;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a}.experienceActions .secondary{border:1px solid rgba(255,205,80,.17);background:rgba(244,183,40,.05);color:#d8c17d}.experienceActions .tertiary{border:0;background:transparent;color:#7d776e}.experienceDots{height:34px;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;gap:6px}.experienceDots i{width:6px;height:6px;border-radius:50%;background:#a07d27;animation:experienceDot 900ms ease-in-out infinite}.experienceDots i:nth-child(2){animation-delay:120ms}.experienceDots i:nth-child(3){animation-delay:240ms}@keyframes experienceDot{0%,100%{opacity:.25;transform:translateY(1px)}50%{opacity:1;transform:translateY(-2px)}}@media(max-width:560px){.networkExperienceState{padding:28px 18px 25px}}
    `}</style>
  );
}

function PublicNetworkExplorer({
  locale,
  hasWallet,
  onBack,
}: {
  locale: Locale;
  hasWallet: boolean;
  onBack: () => void;
}) {
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const [roots, setRoots] = useState<DiscoveryRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);

  const loadDiscovery = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await fetchDiscovery(signal);
      if (!signal?.aborted) setRoots(next);
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : e.maintenance);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [e.maintenance]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDiscovery(controller.signal);
    return () => controller.abort();
  }, [loadDiscovery]);

  if (selectedRoot) {
    return (
      <PublicNetworkCanvas
        locale={locale}
        rootWallet={selectedRoot}
        onBack={() => setSelectedRoot(null)}
        onBackToMine={hasWallet ? onBack : undefined}
      />
    );
  }

  const normalizedInput = walletInput.trim().toLowerCase();
  const inputValid = validWallet(normalizedInput);

  return (
    <section className="publicExplorePage networkCard">
      <header>
        <button type="button" className="backButton" onClick={onBack}>‹</button>
        <div><span>EXPLORE</span><h1>{e.exploreTitle}</h1></div>
      </header>
      <p className="exploreDescription">{e.exploreDescription}</p>

      <div className="walletLookup">
        <input
          type="text"
          value={walletInput}
          onChange={(event) => setWalletInput(event.target.value)}
          placeholder={e.walletPlaceholder}
          aria-label={e.walletPlaceholder}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" disabled={!inputValid} onClick={() => setSelectedRoot(normalizedInput)}>{e.openNetwork}</button>
      </div>

      <div className="publicRoots" aria-busy={loading || undefined}>
        {loading ? <div className="publicLoading"><i /><i /><i /></div> : null}
        {!loading && roots.length > 0 ? roots.map((root) => (
          <button key={root.wallet} type="button" onClick={() => setSelectedRoot(root.wallet)}>
            <span className="miniNetworkIcon">{networkGlyph(23)}</span>
            <strong dir="ltr">{shortWallet(root.wallet)}</strong>
            <i aria-hidden="true">›</i>
          </button>
        )) : null}
        {!loading && roots.length === 0 && !loadError ? <p>{e.noPublicNetworks}</p> : null}
        {loadError ? <><p>{loadError}</p><button type="button" className="retry" onClick={() => void loadDiscovery()}>{NETWORK_EXPERIENCE_COPY[locale as SupportedLocale].retry}</button></> : null}
      </div>

      <style jsx>{`
        .publicExplorePage{width:min(calc(100% - 24px),700px);box-sizing:border-box;margin:0 auto;padding:18px;border:0!important;background:transparent!important}.publicExplorePage>header{min-height:48px;display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:10px}.backButton{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.03);color:#bcb4a7;font:inherit;font-size:1.35rem;cursor:pointer}.publicExplorePage header span{color:#98772d;font-size:.54rem;font-weight:950;letter-spacing:.14em}.publicExplorePage h1{margin:3px 0 0;color:#f2eee5;font-size:1.05rem}.exploreDescription{max-width:590px;margin:9px 0 18px;color:#817c73;font-size:.7rem;line-height:1.55}.walletLookup{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.walletLookup input{min-width:0;height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:#12120f;color:#ddd8ce;font:inherit;font-size:.7rem;outline:none}.walletLookup input:focus{border-color:rgba(244,183,40,.38)}.walletLookup button{min-width:105px;border:0;border-radius:13px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}.walletLookup button:disabled{opacity:.38;cursor:not-allowed}.publicRoots{margin-top:14px;display:grid;gap:7px}.publicRoots>button:not(.retry){min-height:54px;padding:7px 11px;display:grid;grid-template-columns:36px minmax(0,1fr) 20px;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:#d8d3ca;font:inherit;text-align:left;cursor:pointer}.publicRoots strong{font-size:.71rem}.publicRoots>button i{color:#777168;font-style:normal;font-size:1.1rem}.miniNetworkIcon{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:rgba(244,183,40,.065);color:#b99134}.publicRoots p{margin:18px 4px;color:#777269;font-size:.68rem;line-height:1.5}.retry{width:max-content;min-height:38px;padding:0 15px;border:1px solid rgba(255,205,80,.16);border-radius:11px;background:rgba(244,183,40,.05);color:#d5bb6e;font:inherit;font-size:.65rem;font-weight:900;cursor:pointer}.publicLoading{height:58px;display:flex;align-items:center;justify-content:center;gap:6px}.publicLoading i{width:6px;height:6px;border-radius:50%;background:#967525;animation:publicDot 850ms ease-in-out infinite}.publicLoading i:nth-child(2){animation-delay:120ms}.publicLoading i:nth-child(3){animation-delay:240ms}@keyframes publicDot{0%,100%{opacity:.25}50%{opacity:1}}@media(max-width:560px){.publicExplorePage{padding:10px}.walletLookup{grid-template-columns:1fr}.walletLookup button{height:43px}}
      `}</style>
    </section>
  );
}

function readPublicSavedState(rootWallet: string): { activePath: string[]; view: View } | null {
  try {
    const raw = window.sessionStorage.getItem(`${PUBLIC_SESSION_PREFIX}${rootWallet}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { activePath?: unknown; view?: Partial<View> };
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
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const root = keyWallet(rootWallet);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, PublicNetworkData>>(new Map());
  const requestRef = useRef<AbortController | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const singlePointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ center: Point; distance: number } | null>(null);
  const dragDistanceRef = useRef(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [activePath, setActivePath] = useState<string[]>([root]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [bloomWallet, setBloomWallet] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 28, scale: 1 });
  const [stageSize, setStageSize] = useState({ width: 900, height: 620 });
  const [explorerParent, setExplorerParent] = useState<string | null>(null);
  const [explorerPage, setExplorerPage] = useState(0);

  const putCache = useCallback((data: PublicNetworkData) => {
    cacheRef.current.set(keyWallet(data.focusWallet), data);
    setCacheVersion((value) => value + 1);
  }, []);

  const loadRoot = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setError('');
    try {
      const data = await fetchPublicNetwork(root, undefined, signal);
      if (signal?.aborted) return;
      cacheRef.current.clear();
      cacheRef.current.set(root, data);
      setCacheVersion((value) => value + 1);
      let nextPath = [root];
      const saved = readPublicSavedState(root);
      if (saved && saved.activePath[0] === root && saved.activePath.every(validWallet)) {
        const candidate = saved.activePath.slice(-5);
        try {
          for (const focus of candidate.slice(0, -1)) {
            if (focus === root || cacheRef.current.has(focus)) continue;
            const payload = await fetchPublicNetwork(root, focus, signal);
            cacheRef.current.set(focus, payload);
          }
          nextPath = saved.activePath;
          setCacheVersion((value) => value + 1);
          setView(saved.view);
        } catch {
          nextPath = [root];
        }
      } else {
        setView({ x: 0, y: 28, scale: 1 });
      }
      setActivePath(nextPath);
      setSelected(null);
      setState('ready');
      setBloomWallet(root);
      window.setTimeout(() => setBloomWallet(null), 760);
    } catch (loadError) {
      if (signal?.aborted) return;
      setState('error');
      const code = (loadError as Error & { code?: string }).code;
      setError(code === 'NETWORK_PRIVATE' ? e.networkPrivate : code === 'PUBLIC_NETWORK_DISABLED' ? e.maintenance : (loadError instanceof Error ? loadError.message : e.maintenance));
    }
  }, [root, e.networkPrivate, e.maintenance]);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    void loadRoot(controller.signal);
    return () => controller.abort();
  }, [loadRoot]);

  useEffect(() => {
    if (state !== 'ready') return;
    try {
      window.sessionStorage.setItem(
        `${PUBLIC_SESSION_PREFIX}${root}`,
        JSON.stringify({ activePath, view }),
      );
    } catch {
      // Session restore is optional; the server remains authoritative.
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
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [state]);

  const isMobile = stageSize.width < 640;
  const rootData = cacheRef.current.get(root) ?? null;

  const memberByWallet = useMemo(() => {
    const map = new Map<string, PublicChild>();
    cacheRef.current.forEach((data) => data.children.forEach((child) => map.set(keyWallet(child.wallet), child)));
    return map;
  }, [cacheVersion]);

  const layout = useMemo(() => {
    const visuals: PublicVisual[] = [];
    const clusters: PublicCluster[] = [];
    const edges: PublicEdge[] = [];
    const positions = new Map<string, { x: number; y: number; depth: number }>();
    const startDepth = Math.max(0, activePath.length - (isMobile ? 4 : 5));
    const startWallet = activePath[startDepth] ?? root;
    const startY = startDepth > 0 ? PUBLIC_ROOT_Y + 24 : PUBLIC_ROOT_Y;
    positions.set(startWallet, { x: PUBLIC_CENTER_X, y: startY, depth: startDepth });
    visuals.push({
      wallet: startWallet,
      parentWallet: startDepth > 0 ? activePath[startDepth - 1] ?? null : null,
      x: PUBLIC_CENTER_X,
      y: startY,
      depth: startDepth,
      root: startDepth === 0,
      member: startDepth === 0 ? null : memberByWallet.get(startWallet) ?? null,
    });

    const maxVisible = isMobile ? 5 : 7;
    for (let depth = startDepth; depth < activePath.length; depth += 1) {
      const parentWallet = activePath[depth];
      const parentPosition = positions.get(parentWallet);
      const data = cacheRef.current.get(parentWallet);
      if (!parentPosition || !data || data.children.length === 0) break;
      const activeChild = activePath[depth + 1] ?? null;
      let shown = data.children.slice(0, maxVisible);
      if (activeChild && !shown.some((child) => keyWallet(child.wallet) === activeChild)) {
        const activeMember = data.children.find((child) => keyWallet(child.wallet) === activeChild);
        if (activeMember) shown = [...shown.slice(0, Math.max(0, maxVisible - 1)), activeMember];
      }
      const overflow = Math.max(0, data.children.length - shown.length);
      const slots = shown.length + (overflow > 0 ? 1 : 0);
      const center = (slots - 1) / 2;
      const step = parentWallet === root ? (isMobile ? 68 : 118) : (isMobile ? 62 : 84);

      shown.forEach((child, index) => {
        const offset = index - center;
        const childWallet = keyWallet(child.wallet);
        const x = parentPosition.x + offset * step;
        const y = parentPosition.y + PUBLIC_LEVEL_GAP + Math.min(9, Math.abs(offset) * 3);
        positions.set(childWallet, { x, y, depth: depth + 1 });
        if (!visuals.some((visual) => visual.wallet === childWallet)) {
          visuals.push({ wallet: childWallet, parentWallet, x, y, depth: depth + 1, root: false, member: child });
        }
        edges.push({
          key: `${parentWallet}->${childWallet}`,
          x1: parentPosition.x,
          y1: parentPosition.y + 19,
          x2: x,
          y2: y - 19,
          active: activeChild === childWallet,
        });
      });

      if (overflow > 0) {
        const index = slots - 1;
        const offset = index - center;
        const x = parentPosition.x + offset * step;
        const y = parentPosition.y + PUBLIC_LEVEL_GAP + Math.min(9, Math.abs(offset) * 3);
        clusters.push({ parentWallet, x, y, remaining: overflow, depth: depth + 1 });
        edges.push({ key: `${parentWallet}->cluster`, x1: parentPosition.x, y1: parentPosition.y + 19, x2: x, y2: y - 19, active: false });
      }
    }

    return { visuals, clusters, edges, positions, startDepth };
  }, [activePath, isMobile, memberByWallet, cacheVersion, root]);

  const activate = useCallback(async (targetWallet: string, parentWallet: string, parentDepth: number) => {
    const target = keyWallet(targetWallet);
    setSelected(target);
    const prefix = activePath.slice(0, parentDepth + 1);
    const nextPath = [...prefix, target];
    const member = memberByWallet.get(target);
    if (!member || member.direct <= 0) {
      setActivePath(nextPath);
      setExplorerParent(null);
      return;
    }

    if (!cacheRef.current.has(target)) {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setPending(target);
      try {
        const data = await fetchPublicNetwork(root, target, controller.signal);
        if (controller.signal.aborted) return;
        putCache(data);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : e.maintenance);
        return;
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        setPending(null);
      }
    }

    setActivePath(nextPath);
    setExplorerParent(null);
    setBloomWallet(target);
    window.setTimeout(() => setBloomWallet((current) => current === target ? null : current), 760);
  }, [activePath, memberByWallet, putCache, root, e.maintenance]);

  const selectedMember = selected ? memberByWallet.get(selected) ?? null : null;
  const selectedData = selected ? cacheRef.current.get(selected) ?? null : null;
  const selectedNetwork = selectedData?.summary.network ?? selectedMember?.network ?? 0;
  const selectedDirect = selectedData?.summary.direct ?? selectedMember?.direct ?? 0;
  const selectedPrivate = selectedData?.hasPrivateBranches ?? selectedMember?.hasPrivateBranches ?? false;

  const explorerData = explorerParent ? cacheRef.current.get(explorerParent) ?? null : null;
  const explorerPageSize = isMobile ? 5 : 7;
  const explorerPageCount = explorerData ? Math.max(1, Math.ceil(explorerData.children.length / explorerPageSize)) : 1;
  const explorerChildren = explorerData
    ? explorerData.children.slice(explorerPage * explorerPageSize, explorerPage * explorerPageSize + explorerPageSize)
    : [];

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-pan="true"]')) return;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    dragDistanceRef.current = 0;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    if (pointersRef.current.size === 1) {
      singlePointerRef.current = point;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { center: midpoint(a, b), distance: pointDistance(a, b) };
      singlePointerRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      const current = Array.from(pointersRef.current.values())[0];
      const previous = singlePointerRef.current;
      if (previous) {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        dragDistanceRef.current += Math.hypot(dx, dy);
        setView((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
      }
      singlePointerRef.current = current;
      return;
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const center = midpoint(a, b);
      const distance = pointDistance(a, b);
      const previous = pinchRef.current;
      if (previous && previous.distance > 0) {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect) {
          const px = center.x - rect.left - rect.width / 2;
          const py = center.y - rect.top;
          setView((value) => {
            const nextScale = clamp(value.scale * (distance / previous.distance), MIN_SCALE, MAX_SCALE);
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
      pinchRef.current = { center, distance };
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      singlePointerRef.current = Array.from(pointersRef.current.values())[0];
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      singlePointerRef.current = null;
      pinchRef.current = null;
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
      return { x: px - worldX * nextScale, y: py - worldY * nextScale, scale: nextScale };
    });
  };

  if (state === 'loading') {
    return (
      <section className="publicCanvasState networkCard" aria-busy="true">
        <StateGlyph /><h1>{e.viewing}</h1><p dir="ltr">{shortWallet(root)}</p>
        <ExperienceStateStyles />
      </section>
    );
  }

  if (state === 'error' || !rootData) {
    return (
      <section className="publicCanvasState networkCard">
        <StateGlyph /><h1>{e.exploreTitle}</h1><p>{error || e.maintenance}</p>
        <div className="publicErrorActions"><button type="button" onClick={onBack}>‹ {e.exploreNetwork}</button><button type="button" onClick={() => void loadRoot()}>{t.retry}</button></div>
        <ExperienceStateStyles />
        <style jsx>{`.publicErrorActions{width:min(100%,320px);margin:18px auto 0;display:grid;grid-template-columns:1fr 1fr;gap:8px}.publicErrorActions button{min-height:43px;border:1px solid rgba(255,205,80,.15);border-radius:12px;background:rgba(244,183,40,.05);color:#d5bd73;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}`}</style>
      </section>
    );
  }

  return (
    <section className="publicCanvasPage networkCard">
      <header className="publicCanvasHeader" data-no-pan="true">
        <div className="publicHeaderLeft">
          <button type="button" className="backButton" onClick={onBack}>‹</button>
          <div><span>{e.viewing}</span><h1 dir="ltr">{shortWallet(root)}</h1></div>
        </div>
        <div className="publicSummary">
          <strong>{rootData.summary.network.toLocaleString()}</strong><span>{e.visibleNetwork}</span><i />
          <strong className="growth">{rootData.summary.thisRound === null ? '—' : `+${rootData.summary.thisRound.toLocaleString()}`}</strong><span>{t.thisRound}</span>
        </div>
      </header>

      {onBackToMine ? (
        <button type="button" className="backMine" data-no-pan="true" onClick={onBackToMine}>{e.backToMyNetwork}</button>
      ) : null}

      <div
        ref={stageRef}
        className="publicStage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-network-interactive="true"]')) return;
          if (dragDistanceRef.current > 6) return;
          setSelected(null);
        }}
      >
        <div className="publicAmbient" aria-hidden="true" />
        {layout.startDepth > 0 ? (
          <div className="publicPath" data-no-pan="true" data-network-interactive="true"><span dir="ltr">{shortWallet(root)}</span><i>›</i><span>…</span><i>›</i><strong dir="ltr">{shortWallet(activePath[layout.startDepth])}</strong></div>
        ) : null}

        <div className="publicWorld" style={{ width: PUBLIC_PLANE_W, height: PUBLIC_PLANE_H, marginLeft: -PUBLIC_PLANE_W / 2, transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
          <svg className="publicEdges" width={PUBLIC_PLANE_W} height={PUBLIC_PLANE_H} viewBox={`0 0 ${PUBLIC_PLANE_W} ${PUBLIC_PLANE_H}`} aria-hidden="true">
            {layout.edges.map((edge) => <line key={edge.key} className={edge.active ? 'active' : ''} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />)}
          </svg>

          {layout.visuals.map((visual) => {
            const member = visual.member;
            const data = cacheRef.current.get(visual.wallet);
            const canExpand = visual.root || (member?.direct ?? data?.summary.direct ?? 0) > 0;
            const branchCount = visual.root ? rootData.summary.network : 1 + (data?.summary.network ?? member?.network ?? 0);
            const isActive = activePath.includes(visual.wallet);
            const isSelected = selected === visual.wallet;
            const privateHidden = data?.hasPrivateBranches ?? member?.hasPrivateBranches ?? false;
            return (
              <button
                key={visual.wallet}
                type="button"
                className={`publicNode ${visual.root ? 'root' : ''} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${bloomWallet === visual.wallet ? 'bloom' : ''}`}
                style={{ left: visual.x, top: visual.y } as CSSProperties}
                data-network-interactive="true"
                onClick={(event) => {
                  event.stopPropagation();
                  if (dragDistanceRef.current > 6) return;
                  setSelected(visual.wallet);
                  if (!visual.root && !isActive) {
                    void activate(visual.wallet, visual.parentWallet ?? root, Math.max(0, visual.depth - 1));
                  }
                }}
              >
                <span className="publicAvatar">{networkGlyph(visual.root ? 20 : 16)}</span>
                <strong dir="ltr">{shortWallet(visual.wallet)}</strong>
                <small>{visual.root ? `${rootData.summary.direct} ${t.direct}` : branchCount.toLocaleString()}</small>
                {privateHidden ? <i className="privateDot" title={e.privateBranchesHidden} aria-label={e.privateBranchesHidden}>•</i> : null}
                {canExpand && !visual.root && isActive ? <span className="branchMark" aria-hidden="true">⌄</span> : null}
              </button>
            );
          })}

          {layout.clusters.map((cluster) => (
            <button
              key={`cluster:${cluster.parentWallet}`}
              type="button"
              className="publicCluster"
              style={{ left: cluster.x, top: cluster.y } as CSSProperties}
              data-network-interactive="true"
              onClick={(event) => {
                event.stopPropagation();
                setExplorerParent(cluster.parentWallet);
                setExplorerPage(0);
              }}
            ><span><i /><i /><i /></span><strong>+{cluster.remaining}</strong><small>{t.direct}</small></button>
          ))}

          {pending ? (
            <div className="pendingBranch" style={{ left: layout.positions.get(pending)?.x ?? PUBLIC_CENTER_X, top: (layout.positions.get(pending)?.y ?? PUBLIC_ROOT_Y) + 48 } as CSSProperties}><i /><i /><i /></div>
          ) : null}
        </div>

        {rootData.hasPrivateBranches ? <div className="privateNotice" data-no-pan="true">🔒 {e.privateBranchesHidden}</div> : null}

        {selected && selected !== root ? (
          <aside className="publicInspector" data-no-pan="true" data-network-interactive="true">
            <div><span className="inspectorAvatar">{networkGlyph(18)}</span><strong dir="ltr">{shortWallet(selected)}</strong><button type="button" onClick={() => setSelected(null)}>×</button></div>
            <section><span><b>{(1 + selectedNetwork).toLocaleString()}</b>{t.networkSize}</span><span><b>{selectedNetwork.toLocaleString()}</b>{e.visibleNetwork}</span><span><b>{selectedDirect.toLocaleString()}</b>{t.direct}</span></section>
            {selectedPrivate ? <p>🔒 {e.privateBranchesHidden}</p> : null}
          </aside>
        ) : null}

        {explorerParent && explorerData ? (
          <div className="publicSiblingExplorer" data-no-pan="true" data-network-interactive="true">
            <div className="explorerHead"><strong dir="ltr">{shortWallet(explorerParent)}</strong><span>{explorerPage + 1}/{explorerPageCount}</span><button type="button" onClick={() => setExplorerParent(null)}>×</button></div>
            <div className="explorerList">{explorerChildren.map((child) => (
              <button key={child.wallet} type="button" dir="ltr" onClick={() => {
                const depth = activePath.indexOf(explorerParent);
                void activate(child.wallet, explorerParent, Math.max(0, depth));
              }}>{shortWallet(child.wallet)}<span>›</span></button>
            ))}</div>
            <div className="explorerPager"><button type="button" disabled={explorerPage <= 0} onClick={() => setExplorerPage((page) => Math.max(0, page - 1))}>‹</button><button type="button" disabled={explorerPage >= explorerPageCount - 1} onClick={() => setExplorerPage((page) => Math.min(explorerPageCount - 1, page + 1))}>›</button></div>
          </div>
        ) : null}

        <div className="publicControls" data-no-pan="true" data-network-interactive="true"><button type="button" onClick={() => setView({ x: 0, y: 28, scale: 1 })}>◎</button><button type="button" onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale + .1, MIN_SCALE, MAX_SCALE) }))}>+</button><button type="button" onClick={() => setView((value) => ({ ...value, scale: clamp(value.scale - .1, MIN_SCALE, MAX_SCALE) }))}>−</button></div>
      </div>

      <style jsx>{`
        .publicCanvasPage{width:min(calc(100vw - 28px),1180px);margin:0 auto;padding:0;border:0!important;background:transparent!important}.publicCanvasHeader{min-height:54px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;gap:14px}.publicHeaderLeft{min-width:0;display:flex;align-items:center;gap:9px}.backButton{flex:0 0 auto;width:36px;height:36px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.03);color:#aaa398;font:inherit;font-size:1.25rem;cursor:pointer}.publicHeaderLeft div{min-width:0}.publicHeaderLeft span{color:#90702a;font-size:.52rem;font-weight:950;letter-spacing:.12em}.publicHeaderLeft h1{max-width:220px;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ede9e0;font-size:.84rem}.publicSummary{display:flex;align-items:baseline;gap:5px;color:#746f67;font-size:.52rem;white-space:nowrap}.publicSummary strong{color:#d2ccc1;font-size:.69rem}.publicSummary .growth{color:#dbaa36}.publicSummary i{width:1px;height:10px;margin:0 2px;background:rgba(255,255,255,.08)}.backMine{display:block;width:max-content;min-height:30px;margin:0 10px 4px;padding:0 10px;border:1px solid rgba(244,183,40,.13);border-radius:9px;background:rgba(244,183,40,.04);color:#9c8242;font:inherit;font-size:.56rem;font-weight:900;cursor:pointer}.publicStage{position:relative;height:clamp(540px,calc(100svh - 225px),760px);overflow:hidden;touch-action:none;user-select:none;cursor:grab}.publicStage:active{cursor:grabbing}.publicAmbient{position:absolute;left:50%;top:0;width:min(820px,92vw);height:410px;transform:translateX(-50%);background:radial-gradient(ellipse,rgba(244,183,40,.045),transparent 68%);pointer-events:none}.publicWorld{position:absolute;left:50%;top:0;transform-origin:50% 0;will-change:transform}.publicEdges{position:absolute;inset:0;pointer-events:none;overflow:visible}.publicEdges line{vector-effect:non-scaling-stroke;stroke:rgba(214,207,194,.12);stroke-width:1;stroke-linecap:round;transition:stroke 180ms ease}.publicEdges line.active{stroke:rgba(226,183,72,.37)}.publicNode,.publicCluster{position:absolute;transform:translate(-50%,-50%);font:inherit;cursor:pointer}.publicNode{z-index:5;width:96px;min-height:77px;padding:4px;border:0;background:transparent;color:#c4beb3;display:flex;flex-direction:column;align-items:center;gap:4px}.publicNode strong{max-width:88px;overflow:hidden;text-overflow:ellipsis;color:#8f887d;font-size:.5rem;font-weight:800}.publicNode small{color:#665f55;font-size:.46rem}.publicNode.active strong,.publicNode.selected strong{color:#c5b99d}.publicNode.selected .publicAvatar{box-shadow:0 0 0 4px rgba(244,183,40,.07),0 0 20px rgba(244,183,40,.12)}.publicNode.root .publicAvatar{width:39px;height:39px;border-color:rgba(244,183,40,.38);color:#d0a23b;background:#17140d}.publicNode.root strong{color:#bda35d}.publicAvatar{width:31px;height:31px;display:grid;place-items:center;border:1px solid rgba(203,188,155,.18);border-radius:50%;background:#151411;color:#887c64;box-shadow:0 5px 14px rgba(0,0,0,.22)}.privateDot{position:absolute;top:2px;right:21px;color:#9c7b31;font-size:.68rem;font-style:normal}.branchMark{height:8px;color:#8c7542;font-size:.65rem;line-height:1}.publicNode.bloom{animation:publicBloom 620ms cubic-bezier(.16,1.04,.3,1) both}.publicCluster{z-index:4;width:80px;min-height:62px;padding:4px;border:0;background:transparent;color:#a68743;display:flex;flex-direction:column;align-items:center;gap:1px}.publicCluster>span{height:27px;display:flex;align-items:center}.publicCluster>span i{width:25px;height:25px;margin-left:-8px;border:1px solid rgba(201,184,147,.15);border-radius:50%;background:#151410}.publicCluster>span i:first-child{margin-left:0}.publicCluster strong{font-size:.61rem}.publicCluster small{color:#665f55;font-size:.43rem}.publicPath{position:absolute;z-index:25;left:12px;top:7px;display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(14,14,12,.72);color:#756e63;font-size:.5rem}.publicPath strong{color:#aa9e88}.privateNotice{position:absolute;z-index:24;left:50%;bottom:16px;transform:translateX(-50%);padding:7px 10px;border:1px solid rgba(244,183,40,.1);border-radius:10px;background:rgba(14,14,12,.82);color:#786d56;font-size:.52rem;white-space:nowrap}.publicInspector{position:absolute;z-index:35;right:12px;top:66px;width:220px;padding:13px;border:1px solid rgba(255,205,80,.14);border-radius:16px;background:rgba(16,15,13,.94);box-shadow:0 18px 44px rgba(0,0,0,.34)}.publicInspector>div{display:grid;grid-template-columns:34px minmax(0,1fr) 28px;align-items:center;gap:8px}.inspectorAvatar{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:rgba(244,183,40,.06);color:#a98638}.publicInspector strong{font-size:.66rem;overflow:hidden;text-overflow:ellipsis}.publicInspector>div button{width:28px;height:28px;border:0;background:transparent;color:#80796f;font:inherit;font-size:1rem;cursor:pointer}.publicInspector section{margin-top:11px;display:grid;grid-template-columns:1fr 1fr;gap:7px}.publicInspector section span{padding:8px;border-radius:10px;background:rgba(255,255,255,.025);color:#746d63;font-size:.48rem}.publicInspector section b{display:block;margin-bottom:2px;color:#d4cbb9;font-size:.7rem}.publicInspector p{margin:9px 2px 0;color:#897953;font-size:.51rem}.publicSiblingExplorer{position:absolute;z-index:40;left:50%;bottom:18px;width:min(calc(100% - 30px),430px);transform:translateX(-50%);padding:11px;border:1px solid rgba(255,205,80,.15);border-radius:16px;background:rgba(15,15,13,.96);box-shadow:0 22px 55px rgba(0,0,0,.42)}.explorerHead{display:grid;grid-template-columns:minmax(0,1fr) auto 28px;align-items:center;gap:8px;color:#80786b;font-size:.55rem}.explorerHead strong{overflow:hidden;text-overflow:ellipsis;color:#b4a78f}.explorerHead button{width:28px;height:28px;border:0;background:transparent;color:#817a70;font:inherit;cursor:pointer}.explorerList{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px}.explorerList button{min-height:37px;padding:0 9px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.02);color:#aaa296;font:inherit;font-size:.55rem;cursor:pointer}.explorerPager{margin-top:8px;display:flex;justify-content:center;gap:7px}.explorerPager button{width:34px;height:30px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.025);color:#9c9386;font:inherit;cursor:pointer}.explorerPager button:disabled{opacity:.3}.publicControls{position:absolute;z-index:30;right:12px;bottom:14px;display:flex;gap:5px}.publicControls button{width:36px;height:36px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(15,15,13,.78);color:#8f877a;font:inherit;font-size:.85rem;cursor:pointer}.pendingBranch{position:absolute;z-index:20;transform:translate(-50%,-50%);display:flex;gap:4px}.pendingBranch i{width:4px;height:4px;border-radius:50%;background:#a67e20;animation:publicDot 800ms ease-in-out infinite}.pendingBranch i:nth-child(2){animation-delay:110ms}.pendingBranch i:nth-child(3){animation-delay:220ms}@keyframes publicBloom{0%{opacity:0;transform:translate(-50%,-42%) scale(.72)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes publicDot{0%,100%{opacity:.25}50%{opacity:1}}@media(max-width:700px){.publicSummary span{display:none}.publicInspector{left:12px;right:12px;top:auto;bottom:65px;width:auto}.publicSiblingExplorer{bottom:62px}.explorerList{grid-template-columns:1fr}.publicControls{bottom:13px}.privateNotice{bottom:61px}}
      `}</style>
    </section>
  );
}
