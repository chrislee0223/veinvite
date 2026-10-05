import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const STORAGE_PREFIX = 'veinvite:reward-paid-toast:v1:';
const MAX_PENDING_PAID_TOASTS = 20;

export type RewardPaidToastPayload = {
  receiptId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  amountB3tr: string;
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
    payload.amountB3tr.length > 0
  );
}

function readQueue(wallet: string): RewardPaidToastPayload[] {
  const raw = window.sessionStorage.getItem(keyForWallet(wallet));
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  const candidates = Array.isArray(parsed) ? parsed : [parsed];

  return candidates
    .filter(validPayload)
    .filter(
      (payload) =>
        payload.recipientWallet.toLowerCase() === wallet.toLowerCase(),
    )
    .slice(0, MAX_PENDING_PAID_TOASTS);
}

function writeQueue(
  wallet: string,
  queue: RewardPaidToastPayload[],
): void {
  const key = keyForWallet(wallet);
  if (queue.length === 0) {
    window.sessionStorage.removeItem(key);
    return;
  }
  window.sessionStorage.setItem(
    key,
    JSON.stringify(queue.slice(0, MAX_PENDING_PAID_TOASTS)),
  );
}

export function storeRewardPaidToast(receipt: RewardReceipt): void {
  try {
    const payload: RewardPaidToastPayload = {
      receiptId: receipt.id,
      inviteCode: receipt.inviteCode,
      recipientWallet: receipt.recipientWallet.toLowerCase(),
      amountWei: receipt.amountWei,
      amountB3tr: receipt.amountB3tr,
    };
    const queue = readQueue(payload.recipientWallet);
    if (queue.some((item) => item.receiptId === payload.receiptId)) {
      return;
    }
    queue.push(payload);
    writeQueue(payload.recipientWallet, queue);
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
    writeQueue(
      wallet,
      readQueue(wallet).filter(
        (payload) => payload.receiptId !== receiptId,
      ),
    );
  } catch {
    // The durable bell history remains authoritative if storage is unavailable.
  }
}
