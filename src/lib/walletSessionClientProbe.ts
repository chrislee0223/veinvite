'use client';

const SESSION_PROBE_CACHE_MS = 2_000;

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

type SuccessfulProbe = {
  walletAddress: string;
  checkedAt: number;
};

type InFlightProbe = {
  walletAddress: string;
  promise: Promise<boolean>;
};

let lastSuccessfulProbe: SuccessfulProbe | null = null;
let inFlightProbe: InFlightProbe | null = null;
let probeGeneration = 0;
let invalidationListenersInstalled = false;

const SESSION_CLEARED_EVENT =
  'veinvite-wallet-session-cleared';
const SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

export function clearWalletSessionClientProbeCache() {
  probeGeneration += 1;
  lastSuccessfulProbe = null;
  inFlightProbe = null;
}

function ensureProbeInvalidationListeners() {
  if (
    invalidationListenersInstalled ||
    typeof window === 'undefined'
  ) {
    return;
  }

  invalidationListenersInstalled = true;
  window.addEventListener(
    SESSION_CLEARED_EVENT,
    clearWalletSessionClientProbeCache,
  );
  window.addEventListener(
    SESSION_INVALID_EVENT,
    clearWalletSessionClientProbeCache,
  );
}

export async function hasCurrentWalletSession(
  expectedWallet: string,
): Promise<boolean> {
  ensureProbeInvalidationListeners();
  const normalizedWallet =
    expectedWallet.trim().toLowerCase();
  const recent = lastSuccessfulProbe;

  if (
    recent?.walletAddress === normalizedWallet &&
    Date.now() - recent.checkedAt < SESSION_PROBE_CACHE_MS
  ) {
    return true;
  }

  if (
    inFlightProbe?.walletAddress === normalizedWallet
  ) {
    return inFlightProbe.promise;
  }

  const generation = probeGeneration;
  const run = (async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
      });
      const body =
        (await response.json().catch(() => ({}))) as SessionResponse;

      if (generation !== probeGeneration) {
        return false;
      }

      const matches =
        response.ok &&
        body.authenticated === true &&
        body.walletAddress?.toLowerCase() === normalizedWallet;

      if (matches) {
        lastSuccessfulProbe = {
          walletAddress: normalizedWallet,
          checkedAt: Date.now(),
        };
      }

      return matches;
    } catch {
      return false;
    }
  })();

  inFlightProbe = {
    walletAddress: normalizedWallet,
    promise: run,
  };

  try {
    return await run;
  } finally {
    if (inFlightProbe?.promise === run) {
      inFlightProbe = null;
    }
  }
}
