'use client';

import { useEffect, useState } from 'react';

import { QaNetworkProductionV46 } from './QaNetworkProductionV46';

type Mode = 'real' | 'sample';
type MemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type SampleNode = {
  wallet: string;
  parentWallet: string | null;
  children: string[];
  depth: number;
};

type SampleNetworkChild = {
  wallet: string;
  status: MemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number | null;
  depth: number;
};

type SamplePayload = {
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
  round: null;
  children: SampleNetworkChild[];
  searchResults: Array<{ wallet: string; parentWallet: string | null; depth: number }>;
  depthLimitReached: boolean;
};

const SAMPLE_ROOT = '0x4600000000000000000000000000000000000000';
const SAMPLE_TOTAL = 30;

function sampleAddress(index: number) {
  const value = (0x460000 + index).toString(16).padStart(40, '0');
  return `0x${value}`;
}

function buildSampleGraph() {
  const nodes = new Map<string, SampleNode>();
  nodes.set(SAMPLE_ROOT, { wallet: SAMPLE_ROOT, parentWallet: null, children: [], depth: 0 });

  const addresses = Array.from({ length: SAMPLE_TOTAL }, (_, index) => sampleAddress(index + 1));
  addresses.forEach((wallet, index) => {
    let parentWallet = SAMPLE_ROOT;
    let depth = 1;
    if (index >= 8 && index < 24) {
      parentWallet = addresses[(index - 8) % 8];
      depth = 2;
    } else if (index >= 24) {
      parentWallet = addresses[8 + ((index - 24) % 6)];
      depth = 3;
    }
    nodes.set(wallet, { wallet, parentWallet, children: [], depth });
  });

  addresses.forEach((wallet) => {
    const node = nodes.get(wallet);
    if (!node?.parentWallet) return;
    nodes.get(node.parentWallet)?.children.push(wallet);
  });

  return nodes;
}

const SAMPLE_GRAPH = buildSampleGraph();

function descendants(wallet: string, seen = new Set<string>()): number {
  if (seen.has(wallet)) return 0;
  seen.add(wallet);
  const node = SAMPLE_GRAPH.get(wallet);
  if (!node) return 0;
  return node.children.reduce((sum, child) => sum + 1 + descendants(child, seen), 0);
}

function breadcrumb(wallet: string) {
  const path: string[] = [];
  let current: string | null = wallet;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    path.unshift(current);
    current = SAMPLE_GRAPH.get(current)?.parentWallet ?? null;
  }
  return path[0] === SAMPLE_ROOT ? path : [SAMPLE_ROOT, ...path];
}

function statusFor(wallet: string): MemberStatus {
  const seed = Number.parseInt(wallet.slice(-2), 16) || 0;
  if (seed % 3 === 0) return 'REWARDED';
  if (seed % 3 === 1) return 'QUALIFIED';
  return 'IN_PROGRESS';
}

function qualifiedBelow(wallet: string): number {
  const node = SAMPLE_GRAPH.get(wallet);
  if (!node) return 0;
  let total = 0;
  const walk = (id: string) => {
    const current = SAMPLE_GRAPH.get(id);
    if (!current) return;
    current.children.forEach((child) => {
      if (statusFor(child) !== 'IN_PROGRESS') total += 1;
      walk(child);
    });
  };
  walk(wallet);
  return total;
}

function childPayload(wallet: string): SampleNetworkChild {
  const node = SAMPLE_GRAPH.get(wallet)!;
  return {
    wallet,
    status: statusFor(wallet),
    joinedAt: '2026-09-01T00:00:00.000Z',
    network: descendants(wallet),
    direct: node.children.length,
    qualified: qualifiedBelow(wallet),
    thisRound: node.depth <= 2 ? Math.min(3, descendants(wallet)) : 0,
    depth: node.depth,
  };
}

function samplePayload(params: URLSearchParams): SamplePayload {
  const requestedFocus = params.get('focus')?.toLowerCase() ?? SAMPLE_ROOT;
  const focusWallet = SAMPLE_GRAPH.has(requestedFocus) ? requestedFocus : SAMPLE_ROOT;
  const focus = SAMPLE_GRAPH.get(focusWallet)!;
  const query = params.get('q')?.trim().toLowerCase() ?? '';
  const searchResults = query.length >= 3
    ? Array.from(SAMPLE_GRAPH.values())
        .filter((node) => node.wallet !== SAMPLE_ROOT && node.wallet.toLowerCase().includes(query))
        .slice(0, 8)
        .map((node) => ({ wallet: node.wallet, parentWallet: node.parentWallet, depth: node.depth }))
    : [];

  return {
    rootWallet: SAMPLE_ROOT,
    focusWallet,
    focusDepth: focus.depth,
    invitedBy: focus.parentWallet,
    breadcrumb: breadcrumb(focusWallet),
    summary: {
      network: descendants(focusWallet),
      direct: focus.children.length,
      qualified: qualifiedBelow(focusWallet),
      thisRound: focusWallet === SAMPLE_ROOT ? 7 : Math.min(3, descendants(focusWallet)),
      depth: focus.depth,
    },
    round: null,
    children: focus.children.map(childPayload),
    searchResults,
    depthLimitReached: false,
  };
}

function LoadingSample() {
  return (
    <div className="samplePreparing">
      <b>Preparing sample network…</b>
      <span>The V46 UI stays the same; only the Network API response is replaced with QA sample data.</span>
      <style jsx>{`
        .samplePreparing{min-height:100dvh;display:grid;place-content:center;gap:7px;padding:20px;background:#0f0f0d;color:#ddd5c7;text-align:center}.samplePreparing b{font-size:.8rem}.samplePreparing span{max-width:430px;color:#7f786e;font-size:.63rem;line-height:1.5}
      `}</style>
    </div>
  );
}

export function QaNetworkProductionV46ModeSwitcher() {
  const [mode, setMode] = useState<Mode>('real');
  const [sourceReady, setSourceReady] = useState(true);

  useEffect(() => {
    if (mode === 'real') {
      setSourceReady(true);
      return;
    }

    setSourceReady(false);
    const previousFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(rawUrl, window.location.origin);

      if (url.origin === window.location.origin && url.pathname === '/api/network') {
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return new Response(JSON.stringify(samplePayload(url.searchParams)), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-VeInvite-QA-Data': 'sample-v46',
          },
        });
      }

      return previousFetch(input, init);
    };
    setSourceReady(true);

    return () => {
      window.fetch = previousFetch;
    };
  }, [mode]);

  return (
    <div className="v46ModeShell">
      <div className="v46ModeBar">
        <div>
          <b>V46 Data</b>
          <span>{mode === 'real' ? 'Actual connected-wallet network' : '30-person QA network · same V46 UI code'}</span>
        </div>
        <div className="v46ModeToggle" role="group" aria-label="V46 data source">
          <button type="button" className={mode === 'real' ? 'active' : ''} onClick={() => setMode('real')}>Real</button>
          <button type="button" className={mode === 'sample' ? 'active' : ''} onClick={() => setMode('sample')}>Sample · 30</button>
        </div>
      </div>

      {sourceReady ? <QaNetworkProductionV46 key={mode} /> : <LoadingSample />}

      <style jsx>{`
        .v46ModeShell{min-height:100dvh;background:#0f0f0d}.v46ModeBar{position:relative;z-index:200;width:min(1180px,calc(100% - 24px));min-height:50px;margin:0 auto;padding:9px 4px 0;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#ddd5c7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.v46ModeBar>div:first-child{display:grid;gap:2px}.v46ModeBar b{font-size:.66rem}.v46ModeBar span{color:#756f66;font-size:.55rem}.v46ModeToggle{display:flex;padding:3px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#151512}.v46ModeToggle button{min-height:32px;padding:0 11px;border:0;border-radius:9px;background:transparent;color:#888176;font:inherit;font-size:.59rem;font-weight:900;white-space:nowrap}.v46ModeToggle button.active{background:rgba(244,183,40,.1);color:#e1bd55;box-shadow:inset 0 0 0 1px rgba(244,183,40,.2)}
        @media(max-width:640px){.v46ModeBar{width:calc(100% - 12px);min-height:48px;padding-top:6px}.v46ModeBar span{display:none}.v46ModeToggle button{min-height:30px;padding:0 9px}}
      `}</style>
    </div>
  );
}
