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

const MEMORY_TTL_MS = 120_000;
const memory = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NetworkRootSnapshot>>();

function walletKey(wallet: string): string {
  return wallet.trim().toLowerCase();
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

export function getNetworkRootCacheAgeMs(wallet: string | null): number | null {
  if (!wallet) return null;
  const entry = memory.get(walletKey(wallet));
  if (!entry) return null;
  const age = Date.now() - entry.savedAt;
  if (age > MEMORY_TTL_MS) {
    memory.delete(walletKey(wallet));
    return null;
  }
  return Math.max(0, age);
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

  // Warm the complete root snapshot, including the live round context.
  // A topology-only fast snapshot makes the Network render in two visible
  // phases (graph first, This Round later), so startup warmup should cache the
  // exact data the first interactive frame needs.
  const request = fetch(
    `/api/network?wallet=${encodeURIComponent(wallet)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  )
    .then(async (response) => {
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
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
