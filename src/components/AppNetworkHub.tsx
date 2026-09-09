'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import { NETWORK_HUB_COPY } from '@/lib/i18n/networkHubCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { AppNetwork } from './AppNetwork';
import { PublicNetworkExplorer } from './PublicNetworkExplorer';
import { useWalletLauncher } from './WalletControl';

type SummaryProbe = {
  summary: {
    network: number;
  };
};

type VisibilityState = {
  publicEnabled: boolean;
  discoverable: boolean;
};

type VisibilityLoadState = 'idle' | 'loading' | 'ready' | 'error';

type ApiError = Error & { code?: string };

function NetworkGlyph({ size = 34 }: { size?: number }) {
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
    const error = new Error(payload?.error || 'Request failed.') as ApiError;
    error.code = payload?.code;
    throw error;
  }
  return payload as T;
}

async function fetchSummary(wallet: string, signal?: AbortSignal): Promise<SummaryProbe> {
  return jsonRequest<SummaryProbe>(`/api/network/summary?wallet=${encodeURIComponent(wallet)}`, { signal });
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

function goHomeWithoutReload() {
  const button = document.querySelector<HTMLButtonElement>('[data-veinvite-tab="home"]');
  if (button) {
    button.click();
    return;
  }
  window.location.assign('/');
}

function StateGlyph() {
  return <div className="experienceGlyph"><NetworkGlyph size={35} /></div>;
}

function StateCard({
  title,
  description,
  children,
  busy = false,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="networkHubState networkCard" aria-busy={busy || undefined}>
      <StateGlyph />
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      <style jsx>{`
        .networkHubState{width:min(calc(100% - 24px),560px);box-sizing:border-box;margin:0 auto;padding:34px 22px 30px;border:1px solid rgba(255,205,80,.14);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 34%),rgba(255,255,255,.025);text-align:center}.networkHubState :global(.experienceGlyph){width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.19);border-radius:50%;background:rgba(244,183,40,.06);color:#d7aa3b}.networkHubState h1{margin:0;color:#f1eee6;font-size:1.05rem;letter-spacing:-.025em}.networkHubState p{max-width:410px;margin:9px auto 0;color:#858078;font-size:.72rem;line-height:1.55}@media(max-width:560px){.networkHubState{padding:28px 18px 25px}}
      `}</style>
    </section>
  );
}

function StateActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="stateActions">
      {children}
      <style jsx>{`
        .stateActions{width:min(100%,330px);margin:20px auto 0;display:grid;gap:8px}.stateActions :global(button){min-height:46px;border-radius:14px;font:inherit;font-size:.72rem;font-weight:900;cursor:pointer}.stateActions :global(.primary){border:0;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a}.stateActions :global(.secondary){border:1px solid rgba(255,205,80,.17);background:rgba(244,183,40,.05);color:#d8c17d}.stateActions :global(button:disabled){opacity:.45;cursor:not-allowed}
      `}</style>
    </div>
  );
}

function VisibilityPanel({
  locale,
  state,
  value,
  saving,
  onRetry,
  onChange,
}: {
  locale: Locale;
  state: VisibilityLoadState;
  value: VisibilityState | null;
  saving: boolean;
  onRetry: () => void;
  onChange: (next: VisibilityState) => void;
}) {
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const h = NETWORK_HUB_COPY[locale as SupportedLocale];

  if (state === 'loading' || state === 'idle') {
    return (
      <section className="visibilityPanel" aria-busy="true">
        <p className="statusText">{h.visibilityLoading}</p>
        <VisibilityStyles />
      </section>
    );
  }

  if (state === 'error' || !value) {
    return (
      <section className="visibilityPanel">
        <p className="statusText error">{h.visibilityUnknown}</p>
        <button type="button" className="retry" onClick={onRetry}>{NETWORK_EXPERIENCE_COPY[locale as SupportedLocale].retry}</button>
        <VisibilityStyles />
      </section>
    );
  }

  return (
    <section className="visibilityPanel" aria-busy={saving || undefined}>
      <div className="visibilityRow">
        <div><strong>{e.publicEnabled}</strong><p>{e.publicEnabledNote}</p></div>
        <button
          type="button"
          className={value.publicEnabled ? 'switch on' : 'switch'}
          role="switch"
          aria-checked={value.publicEnabled}
          disabled={saving}
          onClick={() => onChange({ publicEnabled: !value.publicEnabled, discoverable: false })}
        ><span /></button>
      </div>
      <div className="visibilityRow">
        <div><strong>{e.discoverable}</strong><p>{e.discoverableNote}</p></div>
        <button
          type="button"
          className={value.discoverable ? 'switch on' : 'switch'}
          role="switch"
          aria-checked={value.discoverable}
          disabled={saving || !value.publicEnabled}
          onClick={() => onChange({ ...value, discoverable: !value.discoverable })}
        ><span /></button>
      </div>
      <VisibilityStyles />
    </section>
  );
}

function VisibilityStyles() {
  return (
    <style jsx>{`
      .visibilityPanel{width:min(calc(100% - 24px),560px);box-sizing:border-box;margin:0 auto 10px;padding:14px 15px;border:1px solid rgba(255,205,80,.14);border-radius:16px;background:rgba(20,19,15,.9)}.visibilityRow{min-height:54px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px}.visibilityRow+.visibilityRow{margin-top:8px;padding-top:9px;border-top:1px solid rgba(255,255,255,.06)}strong{display:block;color:#e9e4da;font-size:.72rem}p{margin:4px 0 0;color:#7f7a72;font-size:.61rem;line-height:1.42}.switch{width:45px;height:26px;padding:3px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:#1a1916;cursor:pointer}.switch span{display:block;width:18px;height:18px;border-radius:50%;background:#6f6a62;transition:transform 180ms ease,background 180ms ease}.switch.on{border-color:rgba(244,183,40,.35);background:rgba(244,183,40,.13)}.switch.on span{transform:translateX(17px);background:#f4bd35}.switch:disabled{opacity:.45;cursor:not-allowed}.statusText{margin:0;text-align:center}.statusText.error{color:#c9a08f}.retry{display:block;min-height:36px;margin:10px auto 0;padding:0 14px;border:1px solid rgba(255,205,80,.14);border-radius:10px;background:rgba(244,183,40,.04);color:#c9ad62;font:inherit;font-size:.62rem;font-weight:900;cursor:pointer}
    `}</style>
  );
}

export function AppNetworkHub({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const e = NETWORK_EXPLORE_COPY[locale as SupportedLocale];
  const h = NETWORK_HUB_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const [mode, setMode] = useState<'own' | 'explore'>('own');
  const [probeState, setProbeState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'maintenance'>('idle');
  const [probe, setProbe] = useState<SummaryProbe | null>(null);
  const [visibilityState, setVisibilityState] = useState<VisibilityLoadState>('idle');
  const [visibility, setVisibility] = useState<VisibilityState | null>(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const loadProbe = useCallback(async (signal?: AbortSignal) => {
    if (!wallet) return;
    setProbeState('loading');
    setProbe(null);
    try {
      const data = await fetchSummary(wallet, signal);
      if (signal?.aborted) return;
      setProbe(data);
      setProbeState('ready');
    } catch (error) {
      if (signal?.aborted) return;
      setProbe(null);
      setProbeState((error as ApiError).code === 'NETWORK_DISABLED' ? 'maintenance' : 'error');
    }
  }, [wallet]);

  const loadVisibility = useCallback(async (signal?: AbortSignal) => {
    if (!wallet) return;
    setVisibilityState('loading');
    try {
      const data = await fetchVisibility(signal);
      if (signal?.aborted) return;
      setVisibility(data);
      setVisibilityState('ready');
    } catch {
      if (signal?.aborted) return;
      setVisibility(null);
      setVisibilityState('error');
    }
  }, [wallet]);

  useEffect(() => {
    setMode('own');
    setProbe(null);
    setVisibility(null);
    setVisibilityState('idle');
    setVisibilityOpen(false);
    if (!wallet) {
      setProbeState('idle');
      return;
    }
    const controller = new AbortController();
    void loadProbe(controller.signal);
    return () => controller.abort();
  }, [wallet, loadProbe]);

  useEffect(() => {
    if (!wallet || !visibilityOpen) return;
    if (visibilityState !== 'idle') return;
    const controller = new AbortController();
    void loadVisibility(controller.signal);
    return () => controller.abort();
  }, [wallet, visibilityOpen, visibilityState, loadVisibility]);

  const updateVisibility = useCallback(async (next: VisibilityState) => {
    if (!wallet || visibilitySaving || visibilityState !== 'ready' || !visibility) return;
    if (!visibility.publicEnabled && next.publicEnabled) {
      if (!window.confirm(h.publicConfirm)) return;
    }

    setVisibilitySaving(true);
    try {
      const saved = await saveVisibility(next);
      setVisibility(saved);
      setVisibilityState('ready');
    } catch {
      // A response can be lost after a successful DB write. Re-read the server
      // instead of guessing or rolling the UI back to a possibly stale value.
      try {
        const confirmed = await fetchVisibility();
        setVisibility(confirmed);
        setVisibilityState('ready');
      } catch {
        setVisibility(null);
        setVisibilityState('error');
      }
    } finally {
      setVisibilitySaving(false);
    }
  }, [wallet, visibilitySaving, visibilityState, visibility, h.publicConfirm]);

  const openVisibility = () => {
    setVisibilityOpen((current) => !current);
  };

  if (mode === 'explore') {
    return <PublicNetworkExplorer locale={locale} hasWallet={Boolean(wallet)} onBack={() => setMode('own')} />;
  }

  if (!wallet) {
    return (
      <StateCard title={t.connectTitle} description={t.connectDescription}>
        <StateActions>
          <button type="button" className="primary" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </StateActions>
      </StateCard>
    );
  }

  if (probeState === 'loading' || probeState === 'idle') {
    return <StateCard title={t.title} description={t.directNetwork} busy />;
  }

  if (probeState === 'maintenance') {
    return (
      <StateCard title={h.maintenanceTitle} description={h.maintenanceDescription}>
        <StateActions>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </StateActions>
      </StateCard>
    );
  }

  if (probeState === 'error' || !probe) {
    return (
      <StateCard title={t.loadError} description={t.loadError}>
        <StateActions>
          <button type="button" className="primary" onClick={() => void loadProbe()}>{t.retry}</button>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </StateActions>
      </StateCard>
    );
  }

  if (probe.summary.network === 0) {
    return (
      <StateCard title={t.emptyTitle} description={t.emptyDescription}>
        <StateActions>
          <button type="button" className="primary" onClick={goHomeWithoutReload}>{t.inviteFriend}</button>
          <button type="button" className="secondary" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        </StateActions>
      </StateCard>
    );
  }

  return (
    <section className="networkHubShell">
      <div className="networkHubToolbar" data-no-pan="true">
        <button type="button" className="active">{e.myNetwork}</button>
        <button type="button" onClick={() => setMode('explore')}>{e.exploreNetwork}</button>
        <button type="button" onClick={openVisibility}>{e.publicSettings}</button>
      </div>
      {visibilityOpen ? (
        <VisibilityPanel
          locale={locale}
          state={visibilityState}
          value={visibility}
          saving={visibilitySaving}
          onRetry={() => { setVisibilityState('idle'); setVisibility(null); }}
          onChange={(next) => void updateVisibility(next)}
        />
      ) : null}
      <AppNetwork locale={locale} />
      <style jsx>{`
        .networkHubShell{width:100%}.networkHubToolbar{width:min(calc(100% - 24px),560px);margin:0 auto 8px;padding:4px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;border:1px solid rgba(255,205,80,.11);border-radius:14px;background:rgba(17,17,15,.78)}.networkHubToolbar button{min-height:35px;padding:0 8px;border:0;border-radius:10px;background:transparent;color:#777168;font:inherit;font-size:.6rem;font-weight:900;cursor:pointer}.networkHubToolbar button.active{background:rgba(244,183,40,.09);color:#eac75e}.networkHubToolbar button:hover{color:#d6cfc2}
      `}</style>
    </section>
  );
}
