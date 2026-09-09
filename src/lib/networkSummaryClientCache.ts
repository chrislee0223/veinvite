export type NetworkSummaryProbe = {
  summary: {
    network: number;
  };
};

type StoredNetworkSummary = {
  wallet: string;
  savedAt: number;
  data: NetworkSummaryProbe;
};

type NetworkSummaryError = Error & { code?: string };

const MEMORY_TTL_MS = 15_000;
const SESSION_TTL_MS = 10_000;
const STORAGE_KEY = 'veinvite_network_summary_seed_v1';

const memory = new Map<string, StoredNetworkSummary>();
const inFlight = new Map<string, Promise<NetworkSummaryProbe>>();

function walletKey(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function isValidSummary(value: unknown): value is NetworkSummaryProbe {
  if (!value || typeof value !== 'object') return false;
  const summary = (value as { summary?: unknown }).summary;
  if (!summary || typeof summary !== 'object') return false;
  const network = (summary as { network?: unknown }).network;
  return Number.isInteger(network) && Number(network) >= 0;
}

function readSession(wallet: string): StoredNetworkSummary | null {
  if (typeof window === 'undefined') return null;
  const key = walletKey(wallet);
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, StoredNetworkSummary>;
    const entry = parsed[key];
    if (
      !entry ||
      walletKey(entry.wallet) !== key ||
      typeof entry.savedAt !== 'number' ||
      Date.now() - entry.savedAt > SESSION_TTL_MS ||
      !isValidSummary(entry.data)
    ) {
      if (entry) {
        delete parsed[key];
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return null;
    }
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function getCachedNetworkSummary(wallet: string | null): NetworkSummaryProbe | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = memory.get(key);
  if (entry && Date.now() - entry.savedAt <= MEMORY_TTL_MS) {
    return entry.data;
  }
  if (entry) memory.delete(key);
  return readSession(wallet)?.data ?? null;
}

export function rememberNetworkSummary(wallet: string, data: NetworkSummaryProbe): void {
  if (!isValidSummary(data)) return;
  const key = walletKey(wallet);
  const entry: StoredNetworkSummary = {
    wallet: key,
    savedAt: Date.now(),
    data,
  };
  memory.set(key, entry);
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, StoredNetworkSummary>)
      : {};
    parsed[key] = entry;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Session persistence is an optional startup optimization only.
  }
}

export async function prefetchNetworkSummary(
  wallet: string,
  { force = false }: { force?: boolean } = {},
): Promise<NetworkSummaryProbe> {
  const key = walletKey(wallet);
  if (!force) {
    const cached = getCachedNetworkSummary(wallet);
    if (cached) return cached;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = fetch(`/api/network/summary?wallet=${encodeURIComponent(wallet)}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null) as
        | (NetworkSummaryProbe & { error?: string; code?: string })
        | null;
      if (!response.ok) {
        const error = new Error(payload?.error || 'Failed to load Network summary.') as NetworkSummaryError;
        error.code = payload?.code;
        throw error;
      }
      if (!isValidSummary(payload)) {
        throw new Error('Network summary response was incomplete.');
      }
      rememberNetworkSummary(wallet, payload);
      return payload;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
