'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_HUB_COPY } from '@/lib/i18n/networkHubCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import {
  getCachedNetworkSummary,
  rememberNetworkSummary,
  type NetworkSummaryProbe,
} from '@/lib/networkSummaryClientCache';
import { AppNetwork } from './AppNetwork';
import { PublicNetworkExplorer } from './PublicNetworkExplorer';
import { useWalletLauncher } from './WalletControl';

type ApiError = Error & { code?: string };

const PUBLIC_NETWORK_TARGET_STORAGE_KEY = 'veinvite-network-public-target-v1';
const VECHAIN_WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function sameWallet(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
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

async function fetchSummary(wallet: string, signal?: AbortSignal): Promise<NetworkSummaryProbe> {
  return jsonRequest<NetworkSummaryProbe>(`/api/network/summary?wallet=${encodeURIComponent(wallet)}`, { signal });
}

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
      <div className="experienceGlyph"><NetworkGlyph /></div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
      <style jsx>{`
        .networkHubState{width:min(100%,520px);box-sizing:border-box;margin:0 auto;padding:27px 18px 25px;border:1px solid rgba(255,205,80,.14);border-radius:22px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.08),transparent 34%),rgba(255,255,255,.025);text-align:center}
        .experienceGlyph{width:62px;height:62px;margin:0 auto 16px;display:grid;place-items:center;border:1px solid rgba(244,183,40,.19);border-radius:50%;background:rgba(244,183,40,.06);color:#d7aa3b}
        h1{margin:0;color:#f1eee6;font-size:1.05rem;letter-spacing:-.025em}
        p{max-width:410px;margin:9px auto 0;color:#858078;font-size:.72rem;line-height:1.55}
        .stateActions{width:min(100%,330px);margin:20px auto 0;display:grid;gap:8px}
        .stateActions :global(button){min-height:46px;border-radius:14px;font:inherit;font-size:.72rem;font-weight:900;cursor:pointer}
        .stateActions :global(.primary){border:0;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a}
        .stateActions :global(.secondary){border:1px solid rgba(255,205,80,.17);background:rgba(244,183,40,.05);color:#d8c17d}
      `}</style>
    </section>
  );
}

export function AppNetworkHub({ locale }: { locale: Locale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale as SupportedLocale];
  const h = NETWORK_HUB_COPY[locale as SupportedLocale];
  const { wallet, openWallet, isWalletActionPending } = useWalletLauncher();
  const activeWalletRef = useRef<string | null>(wallet);
  activeWalletRef.current = wallet;
  const initialProbe = wallet ? getCachedNetworkSummary(wallet) : null;
  const [probeState, setProbeState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'maintenance'>(
    initialProbe ? 'ready' : 'idle',
  );
  const [publicRootWallet, setPublicRootWallet] = useState<string | null>(null);

  useEffect(() => {
    setPublicRootWallet(null);
  }, [wallet]);

  const loadProbe = useCallback(async (signal?: AbortSignal) => {
    if (!wallet) return;
    const requestWallet = wallet;
    const cachedBefore = getCachedNetworkSummary(requestWallet);
    if (!cachedBefore) {
      setProbeState('loading');
    }
    try {
      const data = await fetchSummary(requestWallet, signal);
      if (signal?.aborted || !sameWallet(activeWalletRef.current, requestWallet)) return;
      rememberNetworkSummary(requestWallet, data);
      setProbeState('ready');
    } catch (error) {
      if (signal?.aborted || !sameWallet(activeWalletRef.current, requestWallet)) return;
      if ((error as ApiError).code === 'NETWORK_DISABLED') {
        setProbeState('maintenance');
        return;
      }
      if (cachedBefore) {
        setProbeState('ready');
        return;
      }
      setProbeState('error');
    }
  }, [wallet]);

  useEffect(() => {
    const openPublicRoot = (candidate: unknown) => {
      const normalized =
        typeof candidate === 'string'
          ? candidate.trim().toLowerCase()
          : '';
      if (!VECHAIN_WALLET_PATTERN.test(normalized)) return;
      if (sameWallet(normalized, wallet)) {
        setPublicRootWallet(null);
        return;
      }
      setPublicRootWallet(normalized);
    };

    try {
      const stored = window.sessionStorage.getItem(
        PUBLIC_NETWORK_TARGET_STORAGE_KEY,
      );
      if (stored) {
        window.sessionStorage.removeItem(
          PUBLIC_NETWORK_TARGET_STORAGE_KEY,
        );
        openPublicRoot(stored);
      }
    } catch {
      // Session storage is an optional hand-off only.
    }

    const handleOpenPublicNetwork = (event: Event) => {
      const detail = (event as CustomEvent<{ wallet?: unknown }>).detail;
      openPublicRoot(detail?.wallet);
    };
    window.addEventListener(
      'veinvite-open-public-network',
      handleOpenPublicNetwork,
    );
    return () =>
      window.removeEventListener(
        'veinvite-open-public-network',
        handleOpenPublicNetwork,
      );
  }, [wallet]);

  useEffect(() => {
    if (!wallet) {
      setProbeState('idle');
      return;
    }
    const cached = getCachedNetworkSummary(wallet);
    if (cached) {
      setProbeState('ready');
    } else {
      setProbeState('loading');
    }
    const controller = new AbortController();
    void loadProbe(controller.signal);
    return () => controller.abort();
  }, [wallet, loadProbe]);

  if (!wallet) {
    return (
      <StateCard title={t.connectTitle} description={t.connectDescription}>
        <div className="stateActions">
          <button type="button" className="primary" onClick={openWallet} disabled={isWalletActionPending}>{t.connectWallet}</button>
        </div>
      </StateCard>
    );
  }

  if (probeState === 'maintenance') {
    return <StateCard title={h.maintenanceTitle} description={h.maintenanceDescription} />;
  }

  // Summary probing is advisory. Even a zero-member wallet enters the
  // real Network canvas so its actual AVAILABLE/PENDING/IN_PROGRESS slots
  // remain visible. Only an explicit runtime maintenance state blocks it.

  return (
    <section className="networkHubShell">
      {publicRootWallet ? (
        <PublicNetworkExplorer
          locale={locale}
          hasWallet
          initialRootWallet={publicRootWallet}
          onBack={() => setPublicRootWallet(null)}
        />
      ) : (
        <AppNetwork locale={locale} />
      )}
      <style jsx>{`
        .networkHubShell{width:min(100%,520px);height:100%;min-height:0;margin:0 auto;padding:0;box-sizing:border-box;display:flex}
      `}</style>
    </section>
  );
}
