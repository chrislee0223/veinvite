// A canonical transfer notice is UI-only, never a PAID receipt or payout authority.
// Deduplicate across browser restarts without acknowledging the eventual finalized receipt.
const PREFIX = 'veinvite:early-transfer-shown:v1:';
const TX_ID = /^0x[0-9a-f]{64}$/iu;
const WALLET = /^0x[0-9a-f]{40}$/iu;
const CODE = /^[A-HJ-NP-Z2-9]{7}$/u;
const TTL_MS = 72 * 60 * 60 * 1000;
const memory = new Map<string, number>();

function key(wallet: string, inviteCode: string, txId: string): string | null {
  const w = wallet.toLowerCase();
  const c = inviteCode.toUpperCase();
  const t = txId.toLowerCase();
  return WALLET.test(w) && CODE.test(c) && TX_ID.test(t)
    ? `${PREFIX}${w}:${c}:${t}`
    : null;
}

export function wasEarlyRewardTransferShown(
  wallet: string,
  inviteCode: string,
  txId: string,
): boolean {
  const identity = key(wallet, inviteCode, txId);
  if (!identity) return false;
  let expires = memory.get(identity) ?? 0;
  try {
    const stored = Number(window.localStorage.getItem(identity) ?? 0);
    if (Number.isFinite(stored)) expires = Math.max(expires, stored);
  } catch {
    // A denied WebView storage read is not a payout or confirmation failure.
  }
  return expires > Date.now();
}

export function markEarlyRewardTransferShown(
  wallet: string,
  inviteCode: string,
  txId: string,
): void {
  const identity = key(wallet, inviteCode, txId);
  if (!identity) return;
  const expires = Date.now() + TTL_MS;
  memory.set(identity, expires);
  try {
    window.localStorage.setItem(identity, String(expires));
  } catch {
    // In-memory deduplication remains active in storage-restricted WebViews.
  }
}

const ACK_PREFIX = 'veinvite:early-transfer-acknowledged:v1:';

function acknowledgedKey(wallet: string, inviteCode: string, txId: string): string | null {
  return key(wallet, inviteCode, txId)?.replace(PREFIX, ACK_PREFIX) ?? null;
}

// Acknowledging the early UI is intentionally separate from merely seeing
// it: only an explicit user acknowledgement may later mark the immutable
// finalized receipt seen without repeating the same popup.
export function markEarlyRewardTransferAcknowledged(
  wallet: string,
  inviteCode: string,
  txId: string,
): void {
  const identity = acknowledgedKey(wallet, inviteCode, txId);
  if (!identity) return;
  const expires = Date.now() + TTL_MS;
  memory.set(identity, expires);
  try {
    window.localStorage.setItem(identity, String(expires));
  } catch {
    // Private WebViews retain the acknowledgement for this tab only.
  }
}

export function wasEarlyRewardTransferAcknowledged(
  wallet: string,
  inviteCode: string,
  txId: string,
): boolean {
  const identity = acknowledgedKey(wallet, inviteCode, txId);
  if (!identity) return false;
  let expires = memory.get(identity) ?? 0;
  try {
    const stored = Number(window.localStorage.getItem(identity) ?? 0);
    if (Number.isFinite(stored)) expires = Math.max(expires, stored);
  } catch {
    // No persistence is required for reward financial correctness.
  }
  return expires > Date.now();
}
