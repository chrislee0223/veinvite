'use client';

export type NetworkInviteSlotState = {
  slot: 1 | 2;
  state: 'AVAILABLE' | 'PENDING' | 'IN_PROGRESS';
  inviteeWallet: string | null;
  completedSteps: number;
  totalSteps: number;
};

type StoredInviteSlots = {
  wallet: string;
  savedAt: number;
  slots: NetworkInviteSlotState[];
};

const STORAGE_KEY = 'veinvite_network_invite_slots_v1';
const memory = new Map<string, StoredInviteSlots>();
const inFlight = new Map<string, Promise<NetworkInviteSlotState[]>>();

function walletKey(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function isValidWallet(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
}

function normalizeSlot(value: unknown): NetworkInviteSlotState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NetworkInviteSlotState>;
  const slot = candidate.slot === 1 || candidate.slot === 2
    ? candidate.slot
    : null;
  const state =
    candidate.state === 'AVAILABLE' ||
    candidate.state === 'PENDING' ||
    candidate.state === 'IN_PROGRESS'
      ? candidate.state
      : null;

  if (!slot || !state) return null;

  const inviteeWallet =
    candidate.inviteeWallet === null
      ? null
      : isValidWallet(candidate.inviteeWallet)
        ? candidate.inviteeWallet
        : null;

  const completedSteps = Math.max(
    0,
    Math.min(5, Math.trunc(Number(candidate.completedSteps ?? 0))),
  );
  const totalSteps = Math.max(
    1,
    Math.min(5, Math.trunc(Number(candidate.totalSteps ?? 5))),
  );

  return {
    slot,
    state,
    inviteeWallet,
    completedSteps,
    totalSteps,
  };
}

function normalizeSlots(value: unknown): NetworkInviteSlotState[] | null {
  if (!Array.isArray(value)) return null;
  const slots = value
    .map(normalizeSlot)
    .filter((slot): slot is NetworkInviteSlotState => Boolean(slot))
    .sort((left, right) => left.slot - right.slot);

  if (
    slots.length !== 2 ||
    slots[0]?.slot !== 1 ||
    slots[1]?.slot !== 2
  ) {
    return null;
  }

  return slots;
}

function readSession(wallet: string): StoredInviteSlots | null {
  if (typeof window === 'undefined') return null;
  const key = walletKey(wallet);

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, StoredInviteSlots>;
    const entry = parsed[key];
    const slots = normalizeSlots(entry?.slots);

    if (
      !entry ||
      walletKey(entry.wallet) !== key ||
      typeof entry.savedAt !== 'number' ||
      !slots
    ) {
      if (entry) {
        delete parsed[key];
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return null;
    }

    const normalized = {
      wallet: key,
      savedAt: entry.savedAt,
      slots,
    };
    memory.set(key, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function getCachedNetworkInviteSlots(
  wallet: string | null,
): NetworkInviteSlotState[] | null {
  if (!wallet) return null;
  const key = walletKey(wallet);
  const entry = memory.get(key) ?? readSession(wallet);
  return entry ? entry.slots.map((slot) => ({ ...slot })) : null;
}

export function rememberNetworkInviteSlots(
  wallet: string,
  slots: NetworkInviteSlotState[],
): void {
  const normalized = normalizeSlots(slots);
  if (!normalized) return;

  const key = walletKey(wallet);
  const entry: StoredInviteSlots = {
    wallet: key,
    savedAt: Date.now(),
    slots: normalized,
  };
  memory.set(key, entry);

  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, StoredInviteSlots>)
      : {};
    parsed[key] = entry;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Slot persistence only smooths first paint; live refresh remains authoritative.
  }
}

async function fetchInviteSlots(
  wallet: string,
): Promise<NetworkInviteSlotState[]> {
  const response = await fetch(
    `/api/network/slots?wallet=${encodeURIComponent(wallet)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );
  const payload = await response.json().catch(() => null) as
    | { slots?: unknown; error?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to warm Network invite slots.',
    );
  }

  const slots = normalizeSlots(payload?.slots);
  if (!slots) {
    throw new Error('Network invite slot warmup response was incomplete.');
  }

  rememberNetworkInviteSlots(wallet, slots);
  return slots;
}

export async function prefetchNetworkInviteSlots(
  wallet: string,
  { force = false }: { force?: boolean } = {},
): Promise<NetworkInviteSlotState[]> {
  const key = walletKey(wallet);
  if (!force) {
    const cached = getCachedNetworkInviteSlots(wallet);
    if (cached) return cached;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = fetchInviteSlots(wallet)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
