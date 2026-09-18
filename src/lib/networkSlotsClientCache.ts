'use client';

export type NetworkInviteSlotSnapshot = {
  slot: 1 | 2;
  state: 'AVAILABLE' | 'PENDING' | 'IN_PROGRESS';
  inviteeWallet: string | null;
  completedSteps: number;
  totalSteps: number;
};

type CacheEntry = {
  savedAt: number;
  slots: NetworkInviteSlotSnapshot[];
};

const MEMORY_TTL_MS = 120_000;
const REQUEST_TIMEOUT_MS = 1_800;
const memory = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NetworkInviteSlotSnapshot[]>>();

function walletKey(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function validWallet(wallet: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function parseSlots(value: unknown): NetworkInviteSlotSnapshot[] {
  if (!Array.isArray(value)) {
    throw new Error('Network slot response was incomplete.');
  }

  const slots = value.flatMap((item): NetworkInviteSlotSnapshot[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<NetworkInviteSlotSnapshot>;
    const slot = candidate.slot === 1 || candidate.slot === 2
      ? candidate.slot
      : null;
    const state =
      candidate.state === 'AVAILABLE' ||
      candidate.state === 'PENDING' ||
      candidate.state === 'IN_PROGRESS'
        ? candidate.state
        : null;
    if (!slot || !state) return [];

    const inviteeWallet =
      typeof candidate.inviteeWallet === 'string' &&
      validWallet(candidate.inviteeWallet)
        ? candidate.inviteeWallet
        : null;

    return [{
      slot,
      state,
      inviteeWallet,
      completedSteps: Math.max(
        0,
        Math.min(5, Math.trunc(Number(candidate.completedSteps ?? 0))),
      ),
      totalSteps: 5,
    }];
  }).sort((left, right) => left.slot - right.slot);

  if (slots.length !== 2 || slots[0]?.slot !== 1 || slots[1]?.slot !== 2) {
    throw new Error('Network slot response did not contain both invite slots.');
  }

  return slots;
}

export function getNetworkSlotsCacheAgeMs(wallet: string | null): number | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = memory.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.savedAt;
  if (age > MEMORY_TTL_MS) {
    memory.delete(key);
    return null;
  }
  return Math.max(0, age);
}

export function getCachedNetworkSlots(
  wallet: string | null,
): NetworkInviteSlotSnapshot[] | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MEMORY_TTL_MS) {
    memory.delete(key);
    return null;
  }
  return entry.slots;
}

export function rememberNetworkSlots(
  wallet: string,
  slots: NetworkInviteSlotSnapshot[],
): void {
  const normalized = parseSlots(slots);
  memory.set(walletKey(wallet), {
    savedAt: Date.now(),
    slots: normalized,
  });
}

export async function prefetchNetworkSlots(
  wallet: string,
  {
    force = false,
    signal,
  }: {
    force?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<NetworkInviteSlotSnapshot[]> {
  const key = walletKey(wallet);

  if (!force) {
    const cached = getCachedNetworkSlots(wallet);
    if (cached) return cached;
  }

  if (!signal) {
    const existing = inFlight.get(key);
    if (existing) return existing;
  }

  const controller = signal ? null : new AbortController();
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;
  const requestSignal = signal ?? controller?.signal;

  const request = fetch(
    `/api/network/slots?wallet=${encodeURIComponent(wallet)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: requestSignal,
    },
  ).then(async (response) => {
    const payload = await response.json().catch(() => null) as
      | { slots?: unknown; error?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load Network invite slots.');
    }

    const slots = parseSlots(payload?.slots);
    rememberNetworkSlots(wallet, slots);
    return slots;
  }).finally(() => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  });

  if (signal) return request;

  const tracked = request.finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, tracked);
  return tracked;
}
