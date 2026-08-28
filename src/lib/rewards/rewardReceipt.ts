import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';

export type RewardReceiptRow = {
  id: string | number;
  receipt_version: string;
  payout_id: string | number;
  round_id: string | number;
  settlement_id: string | number;
  network: string;
  vebetter_round_id: string | number;
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string | number;
  tx_id: string;
  paid_at: string;
  seen_at: string | null;
  created_at: string;
};

export type RewardReceipt = {
  id: string;
  receiptVersion: string;
  payoutId: string;
  rewardRoundId: string;
  settlementId: string;
  network: string;
  veBetterRoundId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  amountB3tr: string;
  txId: string;
  paidAt: string;
  seen: boolean;
  seenAt: string | null;
  createdAt: string;
};

export const rewardReceiptColumns = `
  id,
  receipt_version,
  payout_id,
  round_id,
  settlement_id,
  network,
  vebetter_round_id,
  invite_code,
  recipient_wallet,
  amount_wei,
  tx_id,
  paid_at,
  seen_at,
  created_at
` as const;

export function toRewardReceipt(
  row: RewardReceiptRow,
): RewardReceipt {
  const amountWei = String(row.amount_wei);

  if (!/^\d+$/.test(amountWei) || BigInt(amountWei) < 1n) {
    throw new Error(
      'Stored reward receipt has an invalid B3TR amount.',
    );
  }

  return {
    id: String(row.id),
    receiptVersion: row.receipt_version,
    payoutId: String(row.payout_id),
    rewardRoundId: String(row.round_id),
    settlementId: String(row.settlement_id),
    network: row.network,
    veBetterRoundId: String(row.vebetter_round_id),
    inviteCode: row.invite_code,
    recipientWallet: row.recipient_wallet,
    amountWei,
    amountB3tr: formatWeiAsB3tr(amountWei, 18),
    txId: row.tx_id,
    paidAt: row.paid_at,
    seen: row.seen_at !== null,
    seenAt: row.seen_at,
    createdAt: row.created_at,
  };
}
