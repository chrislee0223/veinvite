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
  loadLatestRecipientB3trSnapshot,
  loadRecipientB3trEvidence,
  observeRecipientB3trReceipt,
} from '@/lib/sybil/recipientB3trObservation';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RUN_INTENT = 'RUN_B3TR_RECIPIENT_FORENSICS';
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const PER_OPERATOR_LIMIT = 20;
const PER_RECEIPT_LIMIT = 2;

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

function publicRewardReceipt(
  evidence: Awaited<
    ReturnType<typeof loadRecipientB3trEvidence>
  >,
) {
  if (!evidence) return null;

  return {
    receipt_id: evidence.receipt_id,
    settlement_id: evidence.settlement_id,
    network: evidence.network,
    invite_code: evidence.invite_code,
    recipient_wallet: evidence.recipient_wallet,
    amount_wei: evidence.payout_amount_wei,
    tx_id: evidence.payout_tx_id,
    paid_at: evidence.paid_at,
  };
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

    const evidence = await loadRecipientB3trEvidence(receiptId);
    if (!evidence) {
      return NextResponse.json(
        { error: 'Finalized reward receipt was not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (evidence.network !== operator.pool!.network) {
      return NextResponse.json(
        {
          error:
            'Reward receipt network does not match the operator network.',
        },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const latestSnapshot =
      await loadLatestRecipientB3trSnapshot(receiptId);

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        rewardReceipt: publicRewardReceipt(evidence),
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

    const evidence = await loadRecipientB3trEvidence(receiptId);
    if (!evidence) {
      return NextResponse.json(
        { error: 'Finalized reward receipt was not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (evidence.network !== operator.pool!.network) {
      return NextResponse.json(
        {
          error:
            'Reward receipt network does not match the operator network.',
        },
        { status: 409, headers: noStoreHeaders() },
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
        subject: `${evidence.network}:${receiptId}`,
        limit: PER_RECEIPT_LIMIT,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    ]);
    if (rateLimitResponse) return rateLimitResponse;

    const result = await observeRecipientB3trReceipt({
      receiptId,
      expectedNetwork: operator.pool!.network,
    });

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        rewardReceipt: publicRewardReceipt(result.evidence),
        snapshot: result.snapshot,
        alreadyRecorded: result.alreadyRecorded,
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
