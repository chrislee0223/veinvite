export const NETWORK_HEADER_METRICS_UPDATED_EVENT =
  'veinvite-network-header-metrics-updated';

export type NetworkHeaderMetrics = {
  network: number;
};

export type NetworkRootSnapshot = {
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
  children: Array<{
    wallet: string;
    status: 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
    joinedAt: string | null;
    network: number;
    direct: number;
    qualified: number;
    thisRound: number | null;
    depth: number;
  }>;
  searchResults: Array<{
    wallet: string;
    parentWallet: string | null;
    depth: number;
  }>;
  depthLimitReached: boolean;
};

type CacheEntry = {
  savedAt: number;
  data: NetworkRootSnapshot;
};

type StoredHeaderMetrics = {
  wallet: string;
  savedAt: number;
  data: NetworkHeaderMetrics;
};

const MEMORY_TTL_MS = 120_000;
const HEADER_STORAGE_KEY = 'veinvite_network_header_metrics_v2';
const memory = new Map<string, CacheEntry>();
const headerMemory = new Map<string, StoredHeaderMetrics>();
const inFlight = new Map<string, Promise<NetworkRootSnapshot>>();

function walletKey(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function isValidHeaderMetrics(value: unknown): value is NetworkHeaderMetrics {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<NetworkHeaderMetrics>;
  return Boolean(
    typeof data.network === 'number' &&
    Number.isInteger(data.network) &&
    data.network >= 0
  );
}

function readHeaderSession(wallet: string): StoredHeaderMetrics | null {
  if (typeof window === 'undefined') return null;
  const key = walletKey(wallet);
  try {
    const raw = window.sessionStorage.getItem(HEADER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, StoredHeaderMetrics>;
    const entry = parsed[key];
    if (
      !entry ||
      walletKey(entry.wallet) !== key ||
      typeof entry.savedAt !== 'number' ||
      !isValidHeaderMetrics(entry.data)
    ) {
      if (entry) {
        delete parsed[key];
        window.sessionStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(parsed));
      }
      return null;
    }
    headerMemory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function getCachedNetworkHeaderMetrics(wallet: string | null): NetworkHeaderMetrics | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = headerMemory.get(key);
  if (entry) {
    return entry.data;
  }
  return readHeaderSession(wallet)?.data ?? null;
}

function rememberHeaderMetrics(wallet: string, data: NetworkRootSnapshot): void {
  const key = walletKey(wallet);
  const entry: StoredHeaderMetrics = {
    wallet: key,
    savedAt: Date.now(),
    data: {
      network: data.summary.network,
    },
  };
  headerMemory.set(key, entry);

  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(HEADER_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, StoredHeaderMetrics>)
      : {};
    parsed[key] = entry;
    window.sessionStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Header persistence is only a first-paint optimization.
  }
  window.dispatchEvent(new CustomEvent(NETWORK_HEADER_METRICS_UPDATED_EVENT, {
    detail: { wallet: key },
  }));
}

function isValidRootSnapshot(value: unknown, wallet: string): value is NetworkRootSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<NetworkRootSnapshot>;
  return Boolean(
    data.rootWallet &&
    data.focusWallet &&
    walletKey(data.rootWallet) === walletKey(wallet) &&
    walletKey(data.focusWallet) === walletKey(wallet) &&
    data.summary &&
    Number.isFinite(data.summary.network) &&
    Array.isArray(data.children) &&
    Array.isArray(data.breadcrumb) &&
    Array.isArray(data.searchResults),
  );
}

export function getCachedNetworkRoot(wallet: string | null): NetworkRootSnapshot | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MEMORY_TTL_MS) {
    memory.delete(key);
    return null;
  }
  return entry.data;
}

export function rememberNetworkRoot(wallet: string, data: NetworkRootSnapshot): void {
  if (!isValidRootSnapshot(data, wallet)) return;
  memory.set(walletKey(wallet), {
    savedAt: Date.now(),
    data,
  });
  rememberHeaderMetrics(wallet, data);
}

async function fetchRootSnapshot(wallet: string, fast: boolean): Promise<NetworkRootSnapshot> {
  const suffix = fast ? '&fast=1' : '';
  const response = await fetch(
    `/api/network?wallet=${encodeURIComponent(wallet)}${suffix}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error ?? 'Failed to warm Network.')
        : 'Failed to warm Network.',
    );
  }
  if (!isValidRootSnapshot(payload, wallet)) {
    throw new Error('Network warmup response was incomplete.');
  }
  rememberNetworkRoot(wallet, payload);
  return payload;
}

export async function prefetchNetworkRoot(
  wallet: string,
  { force = false }: { force?: boolean } = {},
): Promise<NetworkRootSnapshot> {
  const key = walletKey(wallet);
  if (!force) {
    const cached = getCachedNetworkRoot(wallet);
    if (cached) return cached;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = fetchRootSnapshot(wallet, true)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
