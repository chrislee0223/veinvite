const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const WALLET_CONNECT_INTENT_EVENT =
  'veinvite-wallet-connect-intent';
export const WALLET_CONNECT_INTENT_STORAGE_KEY =
  'veinvite_wallet_connect_intent_at';
export const DAPPKIT_ACCOUNT_STORAGE_KEY =
  'dappkit@vechain/v2/account';
export const DAPPKIT_SOURCE_STORAGE_KEY =
  'dappkit@vechain/v2/source';
const WALLET_RESUME_RELOAD_GUARD_STORAGE_KEY =
  'veinvite_wallet_resume_reload_v1';
const WALLET_RELEASE_TIMEOUT_MS = 3_000;
const WALLET_TRANSPORT_SETTLE_MS = 900;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function normalizeWallet(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? null;
  return normalized && WALLET_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function isWalletSessionMismatch(
  sessionWallet: string | null | undefined,
  connectedWallet: string | null | undefined,
): boolean {
  const session = normalizeWallet(sessionWallet);
  const connected = normalizeWallet(connectedWallet);
  return Boolean(
    session && connected && session !== connected,
  );
}

export function markWalletConnectIntent(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      WALLET_CONNECT_INTENT_STORAGE_KEY,
      String(Date.now()),
    );
  } catch {
    // Session storage can be unavailable in hardened/private browser modes.
  }

  window.dispatchEvent(
    new Event(WALLET_CONNECT_INTENT_EVENT),
  );
}

export function readWalletConnectIntentAt(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      WALLET_CONNECT_INTENT_STORAGE_KEY,
    );
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearWalletConnectIntent(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      WALLET_CONNECT_INTENT_STORAGE_KEY,
    );
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function clearPersistedVeWorldConnectionState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // An explicit VeInvite disconnect must also remove the provider evidence
  // that startup recovery uses to decide whether a VeWorld wallet is still
  // expected to return. Otherwise the server session can be gone while the
  // startup shield waits forever for a wallet that the user intentionally
  // disconnected.
  try {
    window.localStorage.removeItem(
      DAPPKIT_ACCOUNT_STORAGE_KEY,
    );
    window.localStorage.removeItem(
      DAPPKIT_SOURCE_STORAGE_KEY,
    );
  } catch {
    // Ignore storage cleanup failures; the provider disconnect still runs.
  }

  try {
    window.sessionStorage.removeItem(
      WALLET_CONNECT_INTENT_STORAGE_KEY,
    );
    window.sessionStorage.removeItem(
      WALLET_RESUME_RELOAD_GUARD_STORAGE_KEY,
    );
  } catch {
    // Ignore storage cleanup failures in hardened/private browser modes.
  }
}

export async function settleExplicitWalletDisconnect({
  previousWallet,
  readCurrentWallet,
}: {
  previousWallet: string | null | undefined;
  readCurrentWallet: () => string | null | undefined;
}): Promise<void> {
  // Clear once immediately, then again after provider settlement. DAppKit can
  // briefly repersist its account/source while VeChainKit is tearing down the
  // transport, so a single early removal is not authoritative.
  clearPersistedVeWorldConnectionState();

  const previous = normalizeWallet(previousWallet);
  if (previous) {
    const deadline = Date.now() + WALLET_RELEASE_TIMEOUT_MS;

    while (
      normalizeWallet(readCurrentWallet()) === previous &&
      Date.now() < deadline
    ) {
      await wait(50);
    }
  }

  await wait(WALLET_TRANSPORT_SETTLE_MS);
  clearPersistedVeWorldConnectionState();
}

export function readPersistedDappKitAccount(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const source = window.localStorage
      .getItem(DAPPKIT_SOURCE_STORAGE_KEY)
      ?.toLowerCase();
    if (source !== 'veworld') {
      return null;
    }

    const raw = window.localStorage.getItem(
      DAPPKIT_ACCOUNT_STORAGE_KEY,
    );
    if (!raw || !WALLET_PATTERN.test(raw)) {
      return null;
    }
    return raw.toLowerCase();
  } catch {
    return null;
  }
}
