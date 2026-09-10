'use client';

import { useEffect, useMemo, useState } from 'react';

import { QaNetworkEmptyStateV20 } from '@/qa/QaNetworkEmptyStateV20';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';

type Mode = 'preview' | 'live';
type MockChild = {
  wallet: string;
  status: 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type MockPayload = {
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
  children: MockChild[];
  depthLimitReached: boolean;
};

const PREVIEW_ROOT = '0x1111111111111111111111111111111111111111';
const ROUND = {
  id: 115,
  startAt: '2026-09-07T00:00:00.000Z',
  endAt: '2026-09-14T00:00:00.000Z',
};

function demoWallet(id: number) {
  return `0x${id.toString(16).padStart(40, '0')}`;
}

const adjacency = new Map<string, string[]>([
  [PREVIEW_ROOT, [demoWallet(2), demoWallet(3), demoWallet(4), demoWallet(5), demoWallet(6), demoWallet(7)]],
  [demoWallet(2), [demoWallet(8), demoWallet(9), demoWallet(10), demoWallet(11), demoWallet(12)]],
  [demoWallet(3), [demoWallet(13), demoWallet(14), demoWallet(15)]],
  [demoWallet(4), [demoWallet(16), demoWallet(17)]],
  [demoWallet(5), [demoWallet(18)]],
  [demoWallet(8), [demoWallet(19), demoWallet(20), demoWallet(21)]],
  [demoWallet(9), [demoWallet(22), demoWallet(23)]],
  [demoWallet(13), [demoWallet(24), demoWallet(25), demoWallet(26), demoWallet(27)]],
  [demoWallet(19), [demoWallet(28), demoWallet(29)]],
  [demoWallet(24), [demoWallet(30)]],
  [demoWallet(28), [demoWallet(31)]],
]);

const parentByWallet = (() => {
  const map = new Map<string, string>();
  adjacency.forEach((children, parent) => children.forEach((child) => map.set(child, parent)));
  return map;
})();

function pathFromRoot(wallet: string) {
  if (wallet === PREVIEW_ROOT) return [PREVIEW_ROOT];
  const path = [wallet];
  let cursor = wallet;
  for (let guard = 0; guard < 64; guard += 1) {
    const parent = parentByWallet.get(cursor);
    if (!parent) break;
    path.unshift(parent);
    if (parent === PREVIEW_ROOT) break;
    cursor = parent;
  }
  return path[0] === PREVIEW_ROOT ? path : [PREVIEW_ROOT, wallet];
}

function depthOf(wallet: string) {
  return Math.max(0, pathFromRoot(wallet).length - 1);
}

function descendantCount(wallet: string): number {
  const children = adjacency.get(wallet) ?? [];
  return children.reduce((sum, child) => sum + 1 + descendantCount(child), 0);
}

function qualifiedCount(wallet: string): number {
  const children = adjacency.get(wallet) ?? [];
  return children.reduce((sum, child) => {
    const qualified = Number(Number.parseInt(child.slice(-2), 16) % 3 !== 0);
    return sum + qualified + qualifiedCount(child);
  }, 0);
}

function childFor(wallet: string): MockChild {
  const id = Number.parseInt(wallet.slice(-4), 16);
  const direct = adjacency.get(wallet)?.length ?? 0;
  const network = descendantCount(wallet);
  const status: MockChild['status'] = id % 4 === 0 ? 'IN_PROGRESS' : id % 3 === 0 ? 'QUALIFIED' : 'REWARDED';
  return {
    wallet,
    status,
    joinedAt: new Date(Date.UTC(2026, 7, 15 + Math.min(id, 25), 9, id % 55)).toISOString(),
    network,
    direct,
    qualified: qualifiedCount(wallet),
    thisRound: id % 5 === 0 ? 0 : Math.min(network, 3),
    depth: depthOf(wallet),
  };
}

function networkPayload(focus: string): MockPayload {
  const normalizedFocus = adjacency.has(focus) || parentByWallet.has(focus) || focus === PREVIEW_ROOT
    ? focus
    : PREVIEW_ROOT;
  const children = (adjacency.get(normalizedFocus) ?? []).map(childFor);
  const direct = children.length;
  return {
    rootWallet: PREVIEW_ROOT,
    focusWallet: normalizedFocus,
    focusDepth: depthOf(normalizedFocus),
    invitedBy: normalizedFocus === PREVIEW_ROOT ? null : parentByWallet.get(normalizedFocus) ?? null,
    breadcrumb: pathFromRoot(normalizedFocus),
    summary: {
      network: descendantCount(normalizedFocus),
      direct,
      qualified: qualifiedCount(normalizedFocus),
      thisRound: Math.min(descendantCount(normalizedFocus), 5),
      depth: depthOf(normalizedFocus),
    },
    round: ROUND,
    children,
    depthLimitReached: normalizedFocus === demoWallet(28),
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function PreviewHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch;
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const raw = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(raw, window.location.origin);

      if (url.pathname === '/api/auth/session') {
        return jsonResponse({
          authenticated: true,
          walletAddress: PREVIEW_ROOT,
          expiresAt: '2099-01-01T00:00:00.000Z',
        });
      }

      if (url.pathname === '/api/network') {
        const root = (url.searchParams.get('wallet') ?? '').toLowerCase();
        if (root !== PREVIEW_ROOT) {
          return jsonResponse({ error: 'Preview wallet mismatch.' }, 403);
        }
        const focus = (url.searchParams.get('focus') ?? PREVIEW_ROOT).toLowerCase();
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        return jsonResponse(networkPayload(focus));
      }

      if (url.pathname === '/api/referral-links' && (init?.method ?? 'GET').toUpperCase() === 'GET') {
        await new Promise((resolve) => window.setTimeout(resolve, 90));
        return jsonResponse({
          referralLink: {
            key: 'qa-preview-v21',
            createdAt: '2026-09-10T00:00:00.000Z',
            slotsAvailable: 1,
          },
          slotAvailability: {
            limit: 2,
            slotsAvailable: 1,
            availableSlotIds: [2],
            occupiedSlotIds: [1],
            slots: [
              { slot: 1, state: 'COMPLETED', inviteeWallet: demoWallet(2) },
              { slot: 2, state: 'AVAILABLE', inviteeWallet: null },
            ],
          },
        });
      }

      return originalFetch(input, init);
    };

    window.fetch = mockFetch as typeof window.fetch;
    setReady(true);
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  if (!ready) {
    return <div className="previewBoot">Preparing preview…</div>;
  }

  return (
    <QaWalletLauncherOverrideProvider value={{ wallet: PREVIEW_ROOT }}>
      <QaNetworkEmptyStateV20 />
    </QaWalletLauncherOverrideProvider>
  );
}

export function QaNetworkEmptyStateV21() {
  const [mode, setMode] = useState<Mode>('preview');
  const label = useMemo(() => mode === 'preview' ? 'PREVIEW DATA' : 'LIVE API', [mode]);

  return (
    <div className="v21Page">
      <div className="modeBar">
        <div>
          <strong>NETWORK QA V21</strong>
          <span>{label} · same v20 renderer</span>
        </div>
        <div className="modeSwitch" role="group" aria-label="Network QA data mode">
          <button type="button" className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Preview</button>
          <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}>Live API</button>
        </div>
      </div>

      {mode === 'preview' ? <PreviewHarness key="preview" /> : <QaNetworkEmptyStateV20 key="live" />}

      <style jsx>{`
        .v21Page{min-height:100svh;background:#080807;color:#f3efe6}
        .modeBar{position:sticky;top:0;z-index:10000;width:min(calc(100vw - 20px),590px);box-sizing:border-box;margin:0 auto;padding:9px 10px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(8,8,7,.94);backdrop-filter:blur(12px);border:1px solid rgba(244,183,40,.14);border-radius:0 0 13px 13px}
        .modeBar>div:first-child{display:grid;gap:2px}.modeBar strong{font-size:.56rem;letter-spacing:.09em;color:#d7ac42}.modeBar span{font-size:.48rem;color:#766f64}
        .modeSwitch{display:flex;padding:2px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0c0c0a}.modeSwitch button{height:28px;padding:0 9px;border-radius:7px;color:#777066;font-size:.49rem;font-weight:800}.modeSwitch button.active{background:rgba(244,183,40,.11);color:#d8b45c;box-shadow:inset 0 0 0 1px rgba(244,183,40,.15)}
        .previewBoot{width:min(calc(100vw - 20px),590px);margin:70px auto 0;padding:30px;text-align:center;color:#8a8275;font-size:.7rem}
        @media(max-width:420px){.modeBar{gap:6px}.modeBar span{display:none}.modeSwitch button{padding:0 7px}}
      `}</style>
    </div>
  );
}
