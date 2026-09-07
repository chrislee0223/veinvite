import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  evaluateRecipientB3trFlow,
  readRecipientB3trFlowSnapshot,
} from '@/lib/sybil/recipientB3trForensics';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

type RecipientB3trEvidenceRow = {
  receipt_id: number | string;
  settlement_id: number | string;
  network: string;
  invite_code: string;
  recipient_wallet: string;
  payout_amount_wei: string;
  payout_tx_id: string;
  paid_at: string;
  settlement_network: string;
  settlement_tx_id: string;
  payout_block_number: number | string;
  chain_evidence_matches: boolean;
};

type StoredRecipientB3trSnapshot = {
  id?: number | string;
  receipt_id?: number | string;
  scan_to_block?: number | string;
  [key: string]: unknown;
};

export type RecipientB3trObservationResult = {
  evidence: RecipientB3trEvidenceRow;
  snapshot: StoredRecipientB3trSnapshot | null;
  alreadyRecorded: boolean;
  horizonReached: boolean;
  inserted: boolean;
  observationOnly: true;
};

function parsePositiveInteger(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function parseNonNegativeInteger(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

function assertPositiveWeiString(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    BigInt(value) <= 0n
  ) {
    throw new Error(
      'Reward-recipient evidence has an invalid exact payout amount.',
    );
  }

  return value;
}

export async function loadRecipientB3trEvidence(
  receiptId: number,
): Promise<RecipientB3trEvidenceRow | null> {
  const normalizedReceiptId = parsePositiveInteger(receiptId);
  if (!normalizedReceiptId) {
    throw new Error('A positive receipt ID is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('operator_reward_recipient_b3tr_evidence')
    .select(
      'receipt_id, settlement_id, network, invite_code, recipient_wallet, payout_amount_wei, payout_tx_id, paid_at, settlement_network, settlement_tx_id, payout_block_number, chain_evidence_matches',
    )
    .eq('receipt_id', normalizedReceiptId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward-recipient B3TR evidence could not be loaded: ${error.message}`,
    );
  }

  return (data as RecipientB3trEvidenceRow | null) ?? null;
}

export async function loadLatestRecipientB3trSnapshot(
  receiptId: number,
): Promise<StoredRecipientB3trSnapshot | null> {
  const normalizedReceiptId = parsePositiveInteger(receiptId);
  if (!normalizedReceiptId) {
    throw new Error('A positive receipt ID is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .select('*')
    .eq('receipt_id', normalizedReceiptId)
    .order('scan_to_block', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Latest B3TR recipient observation could not be loaded: ${error.message}`,
    );
  }

  return (data as StoredRecipientB3trSnapshot | null) ?? null;
}

async function loadSnapshotAtBlock({
  receiptId,
  scanToBlock,
}: {
  receiptId: number;
  scanToBlock: number;
}) {
  const { data, error } = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .select('*')
    .eq('receipt_id', receiptId)
    .eq('scan_to_block', scanToBlock)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Existing B3TR recipient observation could not be checked: ${error.message}`,
    );
  }

  return (data as StoredRecipientB3trSnapshot | null) ?? null;
}

async function countDistinctRecipientsByDestination({
  network,
  destination,
  recipientWallet,
}: {
  network: string;
  destination: string | null;
  recipientWallet: string;
}) {
  if (!destination) return 0;

  const { data, error } = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .select('recipient_wallet')
    .eq('network', network)
    .eq('dominant_destination', destination);

  if (error) {
    throw new Error(
      `B3TR destination convergence could not be loaded: ${error.message}`,
    );
  }

  const wallets = new Set(
    (data ?? []).map((row) =>
      String(row.recipient_wallet).toLowerCase(),
    ),
  );
  wallets.add(recipientWallet.toLowerCase());
  return wallets.size;
}

export async function observeRecipientB3trReceipt({
  receiptId,
  expectedNetwork,
  minimumScanToBlock = null,
}: {
  receiptId: number;
  expectedNetwork?: VeBetterNetwork | string | null;
  minimumScanToBlock?: number | null;
}): Promise<RecipientB3trObservationResult> {
  const normalizedReceiptId = parsePositiveInteger(receiptId);
  if (!normalizedReceiptId) {
    throw new Error('A positive receipt ID is required.');
  }

  const evidence = await loadRecipientB3trEvidence(
    normalizedReceiptId,
  );
  if (!evidence) {
    throw new Error('Finalized reward receipt was not found.');
  }

  if (!evidence.chain_evidence_matches) {
    throw new Error(
      'Reward receipt and settlement chain evidence do not match.',
    );
  }

  if (
    expectedNetwork &&
    evidence.network !== expectedNetwork
  ) {
    throw new Error(
      'Reward receipt network does not match the active observation network.',
    );
  }

  const settlementId = parsePositiveInteger(
    evidence.settlement_id,
  );
  if (!settlementId) {
    throw new Error(
      'Reward-recipient evidence has an invalid settlement ID.',
    );
  }

  const payoutBlockNumber = parseNonNegativeInteger(
    evidence.payout_block_number,
  );
  if (payoutBlockNumber === null) {
    throw new Error(
      'Finalized reward settlement has an invalid block number.',
    );
  }

  const payoutAmountWei = assertPositiveWeiString(
    evidence.payout_amount_wei,
  );

  if (
    minimumScanToBlock !== null &&
    (
      !Number.isSafeInteger(minimumScanToBlock) ||
      minimumScanToBlock < payoutBlockNumber
    )
  ) {
    throw new Error(
      'B3TR recipient observation minimum scan block is invalid.',
    );
  }

  if (minimumScanToBlock !== null) {
    const latest = await loadLatestRecipientB3trSnapshot(
      normalizedReceiptId,
    );
    const latestScanToBlock = parseNonNegativeInteger(
      latest?.scan_to_block ?? null,
    );

    if (
      latest &&
      latestScanToBlock !== null &&
      latestScanToBlock >= minimumScanToBlock
    ) {
      return {
        evidence,
        snapshot: latest,
        alreadyRecorded: true,
        horizonReached: true,
        inserted: false,
        observationOnly: true,
      };
    }
  }

  const snapshot = await readRecipientB3trFlowSnapshot({
    recipientWallet: evidence.recipient_wallet,
    payoutBlockNumber,
    payoutAmountWei,
  });

  if (snapshot.network !== evidence.network) {
    throw new Error('B3TR recipient observation network mismatch.');
  }

  if (
    minimumScanToBlock !== null &&
    snapshot.scanToBlock < minimumScanToBlock
  ) {
    return {
      evidence,
      snapshot: null,
      alreadyRecorded: false,
      horizonReached: false,
      inserted: false,
      observationOnly: true,
    };
  }

  const existing = await loadSnapshotAtBlock({
    receiptId: normalizedReceiptId,
    scanToBlock: snapshot.scanToBlock,
  });
  if (existing) {
    return {
      evidence,
      snapshot: existing,
      alreadyRecorded: true,
      horizonReached: true,
      inserted: false,
      observationOnly: true,
    };
  }

  const sharedDestinationRecipientCount =
    await countDistinctRecipientsByDestination({
      network: snapshot.network,
      destination: snapshot.dominantDestination,
      recipientWallet: snapshot.recipientWallet,
    });

  const evaluation = evaluateRecipientB3trFlow({
    snapshot,
    sharedDestinationRecipientCount,
  });

  const insertResult = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .insert({
      receipt_id: normalizedReceiptId,
      settlement_id: settlementId,
      network: snapshot.network,
      recipient_wallet: snapshot.recipientWallet,
      payout_tx_id: evidence.payout_tx_id.toLowerCase(),
      payout_block_number: snapshot.payoutBlockNumber,
      payout_amount_wei: snapshot.payoutAmountWei,
      scan_to_block: snapshot.scanToBlock,
      first_outbound_block:
        snapshot.firstOutbound?.blockNumber ?? null,
      first_outbound_tx_id:
        snapshot.firstOutbound?.txId ?? null,
      first_outbound_destination:
        snapshot.firstOutbound?.recipient ?? null,
      first_outbound_amount_wei:
        snapshot.firstOutbound?.amountWei ?? null,
      first_outbound_blocks_after_payout:
        snapshot.firstOutboundBlocksAfterPayout,
      dominant_destination:
        snapshot.dominantDestination,
      dominant_destination_amount_wei:
        snapshot.dominantDestinationAmountWei,
      outbound_transfer_count:
        snapshot.outboundTransferCount,
      distinct_destination_count:
        snapshot.distinctDestinationCount,
      total_outbound_amount_wei:
        snapshot.totalOutboundAmountWei,
      shared_destination_recipient_count:
        evaluation.sharedDestinationRecipientCount,
      known_protocol_destination:
        snapshot.knownProtocolDestination,
      indicators: evaluation.indicators,
      observation_only: true,
      checked_at: snapshot.checkedAt,
    })
    .select('*')
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      const raced = await loadSnapshotAtBlock({
        receiptId: normalizedReceiptId,
        scanToBlock: snapshot.scanToBlock,
      });
      if (raced) {
        return {
          evidence,
          snapshot: raced,
          alreadyRecorded: true,
          horizonReached: true,
          inserted: false,
          observationOnly: true,
        };
      }
    }

    throw new Error(
      `B3TR recipient observation could not be stored: ${insertResult.error.message}`,
    );
  }

  return {
    evidence,
    snapshot:
      insertResult.data as StoredRecipientB3trSnapshot,
    alreadyRecorded: false,
    horizonReached: true,
    inserted: true,
    observationOnly: true,
  };
}
