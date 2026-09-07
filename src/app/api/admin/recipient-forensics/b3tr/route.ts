import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
} from '@/lib/rateLimitServer';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  evaluateRecipientB3trFlow,
  readRecipientB3trFlowSnapshot,
} from '@/lib/sybil/recipientB3trForensics';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RUN_INTENT = 'RUN_B3TR_RECIPIENT_FORENSICS';
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const PER_OPERATOR_LIMIT = 20;
const PER_RECEIPT_LIMIT = 2;

type RecipientAuditRow = {
  receipt_id: number | string;
  settlement_id: number | string;
  network: string;
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string | number;
  tx_id: string;
  paid_at: string;
};

type SettlementRow = {
  id: number | string;
  network: string;
  tx_id: string;
  block_number: number | string;
};

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function requestHasSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

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

async function loadVerifiedOperator(request: NextRequest) {
  const session =
    await requireWalletSession({ request });
  const pool =
    await readVeInviteRewardPoolStatus();

  if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
    return {
      response: NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: noStoreHeaders(),
        },
      ),
      session: null,
      pool: null,
    };
  }

  return { response: null, session, pool };
}

async function loadRecipientAudit(receiptId: number) {
  const { data, error } = await supabaseAdmin
    .from('reward_recipient_audit_ledger')
    .select(
      'receipt_id, settlement_id, network, invite_code, recipient_wallet, amount_wei, tx_id, paid_at',
    )
    .eq('receipt_id', receiptId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward-recipient audit row could not be loaded: ${error.message}`,
    );
  }

  return (data as RecipientAuditRow | null) ?? null;
}

async function loadSettlement(settlementId: number) {
  const { data, error } = await supabaseAdmin
    .from('reward_payout_transaction_settlements')
    .select('id, network, tx_id, block_number')
    .eq('id', settlementId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward settlement could not be loaded: ${error.message}`,
    );
  }

  return (data as SettlementRow | null) ?? null;
}

async function loadLatestSnapshot(receiptId: number) {
  const { data, error } = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('checked_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Latest B3TR recipient forensic snapshot could not be loaded: ${error.message}`,
    );
  }

  return data ?? null;
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
      `Existing B3TR recipient forensic snapshot could not be checked: ${error.message}`,
    );
  }

  return data ?? null;
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

export async function GET(request: NextRequest) {
  const receiptId = parsePositiveInteger(
    request.nextUrl.searchParams.get('receiptId'),
  );

  if (!receiptId) {
    return NextResponse.json(
      { error: 'A positive receiptId is required.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);
    if (operator.response) return operator.response;

    const audit = await loadRecipientAudit(receiptId);
    if (!audit) {
      return NextResponse.json(
        { error: 'Finalized reward receipt was not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (audit.network !== operator.pool!.network) {
      return NextResponse.json(
        { error: 'Reward receipt network does not match the operator network.' },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const latestSnapshot = await loadLatestSnapshot(receiptId);

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        rewardReceipt: audit,
        latestSnapshot,
        observationOnly: true,
        sybilStatusChanged: false,
        rewardStatusChanged: false,
        transfersPerformed: false,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: noStoreHeaders() },
      );
    }

    console.error(
      'Failed to load B3TR recipient forensics:',
      error,
    );
    return NextResponse.json(
      { error: 'B3TR recipient forensics could not be loaded.' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== RUN_INTENT ||
    !('receiptId' in body)
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${RUN_INTENT}; a positive receiptId is required.`,
      },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const receiptId = parsePositiveInteger(body.receiptId);
  if (!receiptId) {
    return NextResponse.json(
      { error: 'A positive receiptId is required.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);
    if (operator.response) return operator.response;

    const audit = await loadRecipientAudit(receiptId);
    if (!audit) {
      return NextResponse.json(
        { error: 'Finalized reward receipt was not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (audit.network !== operator.pool!.network) {
      return NextResponse.json(
        { error: 'Reward receipt network does not match the operator network.' },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const settlementId = parsePositiveInteger(audit.settlement_id);
    if (!settlementId) {
      throw new Error('Reward-recipient audit row has an invalid settlement ID.');
    }

    const settlement = await loadSettlement(settlementId);
    if (!settlement) {
      throw new Error('Finalized reward settlement was not found.');
    }

    const payoutBlockNumber = parseNonNegativeInteger(
      settlement.block_number,
    );
    if (payoutBlockNumber === null) {
      throw new Error('Finalized reward settlement has an invalid block number.');
    }

    if (
      settlement.network !== audit.network ||
      settlement.tx_id.toLowerCase() !== audit.tx_id.toLowerCase()
    ) {
      throw new Error(
        'Reward receipt and settlement chain evidence do not match.',
      );
    }

    const rateLimitResponse = await enforceRateLimits([
      {
        scope: 'admin_b3tr_forensics_operator',
        subject: operator.session!.walletAddress.toLowerCase(),
        limit: PER_OPERATOR_LIMIT,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      },
      {
        scope: 'admin_b3tr_forensics_receipt',
        subject: `${audit.network}:${receiptId}`,
        limit: PER_RECEIPT_LIMIT,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    ]);
    if (rateLimitResponse) return rateLimitResponse;

    const snapshot = await readRecipientB3trFlowSnapshot({
      recipientWallet: audit.recipient_wallet,
      payoutBlockNumber,
      payoutAmountWei: String(audit.amount_wei),
    });

    if (snapshot.network !== operator.pool!.network) {
      throw new Error('B3TR forensic scan network mismatch.');
    }

    const existing = await loadSnapshotAtBlock({
      receiptId,
      scanToBlock: snapshot.scanToBlock,
    });
    if (existing) {
      return NextResponse.json(
        {
          network: operator.pool!.network,
          verifiedOperator: operator.session!.walletAddress,
          rewardReceipt: audit,
          snapshot: existing,
          alreadyRecorded: true,
          observationOnly: true,
          sybilStatusChanged: false,
          rewardStatusChanged: false,
          transfersPerformed: false,
        },
        { headers: noStoreHeaders() },
      );
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

    const { data: inserted, error: insertError } =
      await supabaseAdmin
        .from('reward_recipient_b3tr_flow_snapshots')
        .insert({
          receipt_id: receiptId,
          settlement_id: settlementId,
          network: snapshot.network,
          recipient_wallet: snapshot.recipientWallet,
          payout_tx_id: audit.tx_id.toLowerCase(),
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

    if (insertError) {
      throw new Error(
        `B3TR recipient forensic snapshot could not be stored: ${insertError.message}`,
      );
    }

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        rewardReceipt: audit,
        snapshot: inserted,
        alreadyRecorded: false,
        observationOnly: true,
        sybilStatusChanged: false,
        rewardStatusChanged: false,
        transfersPerformed: false,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: noStoreHeaders() },
      );
    }

    console.error(
      'Failed to run B3TR recipient forensics:',
      error,
    );
    return NextResponse.json(
      { error: 'B3TR recipient forensics could not be completed.' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
