const PROFILE_AVATAR_CACHE_TTL_MS = 15 * 60_000;
const PROFILE_AVATAR_CACHE_KEY = 'veinvite_profile_avatar_v2';

type StoredProfileAvatar = {
  url: string;
  savedAt: number;
};

type StoredProfileAvatarMap = Record<string, StoredProfileAvatar>;

const profileAvatarMemory = new Map<string, StoredProfileAvatar>();

function walletKey(address: string): string {
  return address.trim().toLowerCase();
}

function validEntry(
  entry: StoredProfileAvatar | undefined,
  now = Date.now(),
): entry is StoredProfileAvatar {
  return Boolean(
    entry &&
    typeof entry.url === 'string' &&
    entry.url.trim() &&
    typeof entry.savedAt === 'number' &&
    Number.isFinite(entry.savedAt) &&
    now - entry.savedAt <= PROFILE_AVATAR_CACHE_TTL_MS,
  );
}

export function readCachedProfileAvatar(address: string): string | null {
  const key = walletKey(address);
  const now = Date.now();
  const memory = profileAvatarMemory.get(key);

  if (validEntry(memory, now)) {
    return memory.url;
  }
  if (memory) {
    profileAvatarMemory.delete(key);
  }

  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PROFILE_AVATAR_CACHE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as StoredProfileAvatarMap;
    const entry = stored[key];
    if (!validEntry(entry, now)) {
      if (entry) {
        delete stored[key];
        window.sessionStorage.setItem(
          PROFILE_AVATAR_CACHE_KEY,
          JSON.stringify(stored),
        );
      }
      return null;
    }

    const hydrated = {
      url: entry.url.trim(),
      savedAt: entry.savedAt,
    };
    profileAvatarMemory.set(key, hydrated);
    return hydrated.url;
  } catch {
    return null;
  }
}

export function rememberProfileAvatar(
  address: string,
  url: string,
): void {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  const key = walletKey(address);
  const entry: StoredProfileAvatar = {
    url: normalizedUrl,
    savedAt: Date.now(),
  };
  profileAvatarMemory.set(key, entry);

  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(PROFILE_AVATAR_CACHE_KEY);
    const stored = raw
      ? (JSON.parse(raw) as StoredProfileAvatarMap)
      : {};
    stored[key] = entry;
    window.sessionStorage.setItem(
      PROFILE_AVATAR_CACHE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // Profile resolution remains functional if session storage is unavailable.
  }
}

export function clearCachedProfileAvatar(address: string): void {
  const key = walletKey(address);
  profileAvatarMemory.delete(key);

  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(PROFILE_AVATAR_CACHE_KEY);
    if (!raw) return;

    const stored = JSON.parse(raw) as StoredProfileAvatarMap;
    if (!(key in stored)) return;

    delete stored[key];
    window.sessionStorage.setItem(
      PROFILE_AVATAR_CACHE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // Cache cleanup is best-effort only.
  }
}
