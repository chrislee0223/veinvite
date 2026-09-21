const DOMAIN_CACHE_TTL_MS = 15 * 60_000;
const DOMAIN_CACHE_KEY = 'veinvite_leaderboard_profile_domain_v1';

type StoredDomain = {
  domain: string | null;
  savedAt: number;
};

type StoredDomainMap = Record<string, StoredDomain>;

const domainMemory = new Map<string, StoredDomain>();

function walletKey(address: string): string {
  return address.trim().toLowerCase();
}

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export function readCachedLeaderboardDomain(
  address: string,
): string | null | undefined {
  const key = walletKey(address);
  const memory = domainMemory.get(key);
  if (memory) {
    if (Date.now() - memory.savedAt <= DOMAIN_CACHE_TTL_MS) {
      return memory.domain;
    }
    domainMemory.delete(key);
  }

  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.sessionStorage.getItem(DOMAIN_CACHE_KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as StoredDomainMap;
    const entry = stored[key];

    if (
      !entry ||
      typeof entry.savedAt !== 'number' ||
      Date.now() - entry.savedAt > DOMAIN_CACHE_TTL_MS ||
      !(
        entry.domain === null ||
        typeof entry.domain === 'string'
      )
    ) {
      if (entry) {
        delete stored[key];
        window.sessionStorage.setItem(
          DOMAIN_CACHE_KEY,
          JSON.stringify(stored),
        );
      }
      return undefined;
    }

    const normalized = normalizeDomain(entry.domain);
    const hydrated = {
      domain: normalized,
      savedAt: entry.savedAt,
    };
    domainMemory.set(key, hydrated);
    return hydrated.domain;
  } catch {
    return undefined;
  }
}

export function rememberLeaderboardDomain(
  address: string,
  domain: string | null,
): void {
  const key = walletKey(address);
  const entry: StoredDomain = {
    domain: normalizeDomain(domain),
    savedAt: Date.now(),
  };

  domainMemory.set(key, entry);
  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(DOMAIN_CACHE_KEY);
    const stored = raw
      ? (JSON.parse(raw) as StoredDomainMap)
      : {};
    stored[key] = entry;
    window.sessionStorage.setItem(
      DOMAIN_CACHE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // VET-domain display stays functional even if session storage is blocked.
  }
}
