const DOMAIN_CACHE_TTL_MS = 15 * 60_000;
const DOMAIN_CACHE_KEY = 'veinvite_leaderboard_profile_domain_v1';
const VEWORLD_DOMAIN_SUFFIX = '.veworld.vet';
const COMPACT_DOMAIN_VISIBLE_CHARS = 8;
const DOMAIN_SUGGESTION_MIN_CHARS = 3;
const DOMAIN_SUGGESTION_DEFAULT_LIMIT = 8;
const VECHAIN_WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

type StoredDomain = {
  domain: string | null;
  savedAt: number;
};

type StoredDomainMap = Record<string, StoredDomain>;

export type CachedLeaderboardDomainSuggestion = {
  wallet: string;
  domain: string;
};

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

export function formatVechainDomainLabel(
  domain: string | null | undefined,
): string | null {
  if (typeof domain !== 'string') return null;
  const normalized = domain.trim();
  if (!normalized) return null;

  return normalized.toLowerCase().endsWith(VEWORLD_DOMAIN_SUFFIX)
    ? normalized.slice(0, -VEWORLD_DOMAIN_SUFFIX.length) || normalized
    : normalized;
}

export function readCachedLeaderboardDomainSuggestions(
  query: string,
  limit = DOMAIN_SUGGESTION_DEFAULT_LIMIT,
): CachedLeaderboardDomainSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (
    normalizedQuery.length < DOMAIN_SUGGESTION_MIN_CHARS ||
    typeof window === 'undefined'
  ) {
    return [];
  }

  const now = Date.now();
  const combined = new Map<string, StoredDomain>(domainMemory);
  let stored: StoredDomainMap = {};

  try {
    const raw = window.sessionStorage.getItem(DOMAIN_CACHE_KEY);
    stored = raw ? (JSON.parse(raw) as StoredDomainMap) : {};
    for (const [wallet, entry] of Object.entries(stored)) {
      if (
        entry &&
        typeof entry.savedAt === 'number' &&
        now - entry.savedAt <= DOMAIN_CACHE_TTL_MS &&
        (entry.domain === null || typeof entry.domain === 'string')
      ) {
        combined.set(walletKey(wallet), entry);
      }
    }
  } catch {
    // Memory-only suggestions remain available.
  }

  return [...combined.entries()]
    .flatMap(([wallet, entry]) => {
      if (
        !VECHAIN_WALLET_PATTERN.test(wallet) ||
        now - entry.savedAt > DOMAIN_CACHE_TTL_MS
      ) {
        return [];
      }
      const domain = normalizeDomain(entry.domain);
      const label = formatVechainDomainLabel(domain);
      if (!domain || !label) return [];
      const full = domain.toLowerCase();
      const visible = label.toLowerCase();
      if (
        !visible.startsWith(normalizedQuery) &&
        !full.startsWith(normalizedQuery)
      ) {
        return [];
      }
      return [{ wallet, domain }];
    })
    .sort((left, right) => {
      const leftLabel = formatVechainDomainLabel(left.domain)?.toLowerCase() ?? left.domain.toLowerCase();
      const rightLabel = formatVechainDomainLabel(right.domain)?.toLowerCase() ?? right.domain.toLowerCase();
      const leftExact = leftLabel === normalizedQuery ? 0 : 1;
      const rightExact = rightLabel === normalizedQuery ? 0 : 1;
      return leftExact - rightExact || leftLabel.length - rightLabel.length || leftLabel.localeCompare(rightLabel);
    })
    .slice(0, Math.max(1, Math.min(12, limit)));
}

export function formatCompactVechainDomain(
  domain: string | null | undefined,
): string | null {
  if (typeof domain !== 'string') return null;
  const normalized = domain.trim();
  if (!normalized) return null;

  const compactBase = normalized.toLowerCase().endsWith(VEWORLD_DOMAIN_SUFFIX)
    ? normalized.slice(0, -VEWORLD_DOMAIN_SUFFIX.length)
    : normalized;
  const visible = compactBase || normalized;

  return visible.length > COMPACT_DOMAIN_VISIBLE_CHARS
    ? `${visible.slice(0, COMPACT_DOMAIN_VISIBLE_CHARS)}…`
    : visible;
}
