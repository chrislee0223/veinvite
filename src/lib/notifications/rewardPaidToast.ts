import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const STORAGE_PREFIX = 'veinvite:reward-paid-toast:v1:';

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

export function storeRewardPaidToast(receipt: RewardReceipt): void {
  try {
    const payload: RewardPaidToastPayload = {
      receiptId: receipt.id,
      inviteCode: receipt.inviteCode,
      recipientWallet: receipt.recipientWallet.toLowerCase(),
      amountWei: receipt.amountWei,
      amountB3tr: receipt.amountB3tr,
    };
    window.sessionStorage.setItem(
      keyForWallet(payload.recipientWallet),
      JSON.stringify(payload),
    );
  } catch {
    // The payout remains authoritative even if transient UI state cannot persist.
  }
}

export function readRewardPaidToast(
  wallet: string,
): RewardPaidToastPayload | null {
  if (!validWallet(wallet)) return null;

  try {
    const raw = window.sessionStorage.getItem(keyForWallet(wallet));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!validPayload(parsed)) return null;
    if (parsed.recipientWallet.toLowerCase() !== wallet.toLowerCase()) {
      return null;
    }
    return parsed;
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
    const key = keyForWallet(wallet);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return;

    const parsed = JSON.parse(raw) as unknown;
    if (
      !validPayload(parsed) ||
      parsed.recipientWallet.toLowerCase() !== wallet.toLowerCase() ||
      parsed.receiptId !== receiptId
    ) {
      return;
    }

    window.sessionStorage.removeItem(key);
  } catch {
    // The durable bell history remains authoritative if storage is unavailable.
  }
}
