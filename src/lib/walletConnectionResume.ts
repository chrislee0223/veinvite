const WALLET_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const WALLET_CONNECT_INTENT_EVENT =
  'veinvite-wallet-connect-intent';
export const WALLET_CONNECT_INTENT_STORAGE_KEY =
  'veinvite_wallet_connect_intent_at';
export const DAPPKIT_ACCOUNT_STORAGE_KEY =
  'dappkit@vechain/v2/account';
export const DAPPKIT_SOURCE_STORAGE_KEY =
  'dappkit@vechain/v2/source';

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
