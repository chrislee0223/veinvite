import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import {
  runImmediateClaimRewardPayout,
  type AutomaticRewardPayoutResult,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { reserveEligibleReferralRewards } from '@/lib/rewards/rewardReservation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RETRY_LIMIT_PER_HOUR = 36;
const MAX_CLAIM_PAYOUT_RECOVERY_ITERATIONS = 2;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return noStoreJson(
    { error: error.message },
    { status: error.status },
  );
}

async function hasWaitingOwnReservation(wallet: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('invite_code')
    .eq('inviter_wallet', wallet)
    .eq('status', 'COMPLETED')
    .eq('reward_status', 'ELIGIBLE')
    .is('slot_released_at', null)
    .limit(1);

  if (error) {
    throw new Error(
      `Final reward reservation state could not be checked: ${error.message}`,
    );
  }

  return (data ?? []).length > 0;
}

async function hasQueuedOwnClaim(wallet: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('reward_queue_entries')
    .select('id')
    .eq('recipient_wallet', wallet)
    .eq('status', 'QUEUED')
    .not('claim_requested_at', 'is', null)
    .is('assigned_round_id', null)
    .limit(1);

  if (error) {
    throw new Error(
      `Queued reward claim state could not be checked: ${error.message}`,
    );
  }

  return (data ?? []).length > 0;
}

async function hasPendingOwnPayout(wallet: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('reward_payouts')
    .select('id')
    .eq('recipient_wallet', wallet)
    .eq('status', 'PENDING')
    .limit(1);

  if (error) {
    throw new Error(
      `Pending reward payout state could not be checked: ${error.message}`,
    );
  }

  return (data ?? []).length > 0;
}

function shouldAdvanceQueuedClaims(
  result: AutomaticRewardPayoutResult,
): boolean {
  return (
    result.status === 'PAID' &&
    (result.queuedCount ?? 0) > 0
  );
}

async function runClaimPayoutRecoveryCycle():
Promise<AutomaticRewardPayoutResult> {
  let result = await runImmediateClaimRewardPayout();

  for (
    let iteration = 1;
    iteration < MAX_CLAIM_PAYOUT_RECOVERY_ITERATIONS &&
    shouldAdvanceQueuedClaims(result);
    iteration += 1
  ) {
    // Finalizing an older active round can expose an already-claimed QUEUED
    // cohort. Advance it immediately into the normal immutable payout worker
    // instead of waiting for another Claim, browser session, or daily cron.
    result = await runImmediateClaimRewardPayout();
  }

  return result;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return noStoreJson(
      { error: 'Invalid request origin.' },
      { status: 403 },
    );
  }

  let wallet: string;
  try {
    const session = await requireWalletSession({ request });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate reward reservation retry session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const [
      waitingBefore,
      queuedClaimBefore,
      pendingPayoutBefore,
    ] = await Promise.all([
      hasWaitingOwnReservation(wallet),
      hasQueuedOwnClaim(wallet),
      hasPendingOwnPayout(wallet),
    ]);

    if (
      !waitingBefore &&
      !queuedClaimBefore &&
      !pendingPayoutBefore
    ) {
      return noStoreJson({
        status: 'IDLE',
        ready: false,
      });
    }

    const rateLimitResponse = await enforceRateLimits([
      {
        scope: 'reward_reservation_retry_wallet',
        subject: wallet,
        limit: RETRY_LIMIT_PER_HOUR,
        windowSeconds: 60 * 60,
      },
    ]);
    if (rateLimitResponse) return rateLimitResponse;

    let payoutRecovery: AutomaticRewardPayoutResult | null = null;

    if (queuedClaimBefore || pendingPayoutBefore) {
      payoutRecovery = await runClaimPayoutRecoveryCycle();
    }

    const sweep = waitingBefore
      ? await reserveEligibleReferralRewards()
      : null;
    const [
      waitingAfter,
      queuedClaimAfter,
      pendingPayoutAfter,
    ] = await Promise.all([
      hasWaitingOwnReservation(wallet),
      hasQueuedOwnClaim(wallet),
      hasPendingOwnPayout(wallet),
    ]);
    const ready =
      !waitingAfter &&
      !queuedClaimAfter &&
      !pendingPayoutAfter;

    return noStoreJson({
      status: ready ? 'READY' : 'WAITING_FINALITY',
      ready,
      sweep,
      payoutRecoveryStatus:
        payoutRecovery?.status ?? null,
      payoutRecoveryQueuedCount:
        payoutRecovery?.queuedCount ?? null,
    });
  } catch (error) {
    console.error(
      'Reward reservation or claimed payout recovery failed:',
      error,
    );
    return noStoreJson(
      { error: 'Reward verification is still pending.' },
      {
        status: 503,
        headers: { 'Retry-After': '30' },
      },
    );
  }
}
