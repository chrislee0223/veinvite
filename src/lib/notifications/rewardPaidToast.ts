import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const STORAGE_PREFIX = 'veinvite:reward-paid-toast:v1:';
const MAX_PENDING_PAID_TOASTS = 20;

// A wallet WebView may deny sessionStorage. Keep a bounded in-memory queue
// while the authoritative unseen receipt remains on the server.
const memoryQueues = new Map<string, RewardPaidToastPayload[]>();

export const REWARD_PAID_TOAST_UPDATED_EVENT =
  'veinvite-reward-paid-toast-updated';

function notifyQueueUpdated(): void {
  window.dispatchEvent(new Event(REWARD_PAID_TOAST_UPDATED_EVENT));
}

export type RewardPaidToastPayload = {
  receiptId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  amountB3tr: string;
  txId?: string; // Backwards compatible with previously persisted toast queues.
};

function keyForWallet(wallet: string): string {
  return `${STORAGE_PREFIX}${wallet.toLowerCase()}`;
}

function validWallet(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function validPayload(value: unknown): value is RewardPaidToastPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.receiptId === 'string' &&
    payload.receiptId.length > 0 &&
    typeof payload.inviteCode === 'string' &&
    payload.inviteCode.length > 0 &&
    validWallet(payload.recipientWallet) &&
    typeof payload.amountWei === 'string' &&
    /^\d+$/u.test(payload.amountWei) &&
    typeof payload.amountB3tr === 'string' &&
    payload.amountB3tr.length > 0 &&
    (payload.txId === undefined || (typeof payload.txId === 'string' && /^0x[0-9a-f]{64}$/iu.test(payload.txId)))
  );
}

function sanitizedQueue(wallet: string, values: unknown): RewardPaidToastPayload[] {
  const candidates = Array.isArray(values) ? values : [values];
  return candidates
    .filter(validPayload)
    .filter(
      (payload) =>
        payload.recipientWallet.toLowerCase() === wallet.toLowerCase(),
    )
    .slice(0, MAX_PENDING_PAID_TOASTS);
}

function readQueue(wallet: string): RewardPaidToastPayload[] {
  const walletKey = wallet.toLowerCase();
  try {
    const raw = window.sessionStorage.getItem(keyForWallet(walletKey));
    if (raw) {
      const queue = sanitizedQueue(walletKey, JSON.parse(raw) as unknown);
      memoryQueues.set(walletKey, queue);
      return queue;
    }
  } catch {
    // Storage disabled or malformed: use the still-available in-memory queue.
  }
  return memoryQueues.get(walletKey) ?? [];
}

function writeQueue(
  wallet: string,
  queue: RewardPaidToastPayload[],
): void {
  const walletKey = wallet.toLowerCase();
  const safeQueue = sanitizedQueue(walletKey, queue);
  if (safeQueue.length) {
    memoryQueues.set(walletKey, safeQueue);
  } else {
    memoryQueues.delete(walletKey);
  }

  try {
    if (!safeQueue.length) {
      window.sessionStorage.removeItem(keyForWallet(walletKey));
    } else {
      window.sessionStorage.setItem(
        keyForWallet(walletKey),
        JSON.stringify(safeQueue),
      );
    }
  } catch {
    // Never drop a paid popup just because a private WebView rejects storage.
  }
}

export function storeRewardPaidToast(receipt: RewardReceipt): void {
  try {
    const payload: RewardPaidToastPayload = {
      receiptId: receipt.id,
      inviteCode: receipt.inviteCode,
      recipientWallet: receipt.recipientWallet.toLowerCase(),
      amountWei: receipt.amountWei,
      amountB3tr: receipt.amountB3tr,
      txId: receipt.txId,
    };
    const queue = readQueue(payload.recipientWallet);
    if (queue.some((item) => item.receiptId === payload.receiptId)) {
      return;
    }
    queue.push(payload);
    writeQueue(payload.recipientWallet, queue);
    notifyQueueUpdated();
  } catch {
    // The payout remains authoritative even if transient UI state cannot persist.
  }
}

export function readRewardPaidToast(
  wallet: string,
): RewardPaidToastPayload | null {
  if (!validWallet(wallet)) return null;

  try {
    return readQueue(wallet)[0] ?? null;
  } catch {
    return null;
  }
}

export function clearRewardPaidToast(
  wallet: string,
  receiptId: string,
): void {
  if (!validWallet(wallet) || !receiptId) return;

  try {
    const current = readQueue(wallet);
    const remaining = current.filter(
      (payload) => payload.receiptId !== receiptId,
    );
    if (remaining.length === current.length) return;
    writeQueue(wallet, remaining);
    notifyQueueUpdated();
  } catch {
    // The durable bell history remains authoritative if storage is unavailable.
  }
}
