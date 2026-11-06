import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  runImmediateClaimRewardPayout,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

// Queue delivery is the fast primary continuation. This lightweight cron is a
// separate last-resort recovery for an approved Claim whose initial HTTP
// kickoff AND Queue publication/delivery both failed. Do not re-run eligibility,
// reprice rewards, or create a new transfer path.
export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'no-store' } as const;
const CLAIM_STALL_AGE_MS = 45_000;
const READ_TIMEOUT_MS = 8_000;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization');
  if (!secret || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(`Bearer ${secret}`);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function hasStaleClaimWork(): Promise<boolean> {
  const { network } = getVeBetterNetworkConfig();
  const before = new Date(Date.now() - CLAIM_STALL_AGE_MS).toISOString();

  // An explicit Claim changes only AWAITING_CLAIM -> QUEUED. Never wake the
  // signer for a reward that was merely made eligible or reserved.
  const { data: queued, error: queuedError } = await supabaseAdmin
    .from('reward_queue_entries')
    .select('id')
    .eq('network', network)
    .eq('status', 'QUEUED')
    .not('claim_requested_at', 'is', null)
    .lte('claim_requested_at', before)
    .limit(1)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (queuedError) {
    throw new Error(`Claim fallback queue read failed: ${queuedError.message}`);
  }
  if ((queued ?? []).length > 0) return true;

  // A previously created round may have an immutable signed journal waiting
  // for on-chain finality. The SAME payout worker reconciles it idempotently.
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('reward_payouts')
    .select('id')
    .in('status', ['PENDING', 'SENDING', 'FAILED'])
    .lte('created_at', before)
    .limit(1)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (pendingError) {
    throw new Error(`Claim fallback payout read failed: ${pendingError.message}`);
  }
  return (pending ?? []).length > 0;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET_UNCONFIGURED' },
      { status: 503, headers: HEADERS },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: HEADERS },
    );
  }

  try {
    if (!(await hasStaleClaimWork())) {
      return NextResponse.json(
        { ok: true, action: 'NO_STALLED_CLAIM' },
        { headers: HEADERS },
      );
    }

    // Only the existing signer, lock, immutable transaction journal and
    // transfer safety checks may advance this approved Claim. The emergency
    // cron has no bypass, wallet key or manual eligibility override.
    const result = await runImmediateClaimRewardPayout();

    if (result.status === 'MANUAL_INTERVENTION_REQUIRED' ||
        result.status === 'DISABLED' ||
        result.status === 'NOT_CONFIGURED' ||
        result.status === 'NOT_REGISTERED') {
      console.error('Claim fallback blocked by payout safety gate:', {
        status: result.status,
        reason: result.reason ?? null,
      });
      return NextResponse.json(
        { error: 'CLAIM_PAYOUT_REQUIRES_OPERATOR', status: result.status },
        { status: 503, headers: HEADERS },
      );
    }

    return NextResponse.json({
      ok: true,
      action: 'EXISTING_PAYOUT_WORKER_RETRIED',
      status: result.status,
      // A submitted transfer is not PAID until full-chain finality.
      txSubmitted: result.status === 'SUBMITTED',
      queuedCount: result.queuedCount ?? null,
    }, { headers: HEADERS });
  } catch (error) {
    console.error('Claim fallback could not advance the existing payout:', error);
    return NextResponse.json(
      { error: 'CLAIM_PAYOUT_RECOVERY_RETRY_REQUIRED' },
      { status: 503, headers: HEADERS },
    );
  }
}
