import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import { reserveEligibleReferralRewards } from '@/lib/rewards/rewardReservation';
import { recoverSubmittedRewardPayout } from '@/lib/rewards/submittedPayoutRecovery';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RETRY_LIMIT_PER_HOUR = 36;

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
    const [waitingBefore, pendingPayoutBefore] =
      await Promise.all([
        hasWaitingOwnReservation(wallet),
        hasPendingOwnPayout(wallet),
      ]);

    if (!waitingBefore && !pendingPayoutBefore) {
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

    let payoutRecovery = null;

    if (pendingPayoutBefore) {
      payoutRecovery =
        await recoverSubmittedRewardPayout();
    }

    const sweep = waitingBefore
      ? await reserveEligibleReferralRewards()
      : null;
    const [waitingAfter, pendingPayoutAfter] =
      await Promise.all([
        hasWaitingOwnReservation(wallet),
        hasPendingOwnPayout(wallet),
      ]);
    const ready = !waitingAfter && !pendingPayoutAfter;

    return noStoreJson({
      status: ready ? 'READY' : 'WAITING_FINALITY',
      ready,
      sweep,
      payoutRecoveryStatus:
        payoutRecovery?.status ?? null,
    });
  } catch (error) {
    console.error(
      'Reward reservation or submitted payout finality retry failed:',
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
