import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
} from '@/lib/rateLimitServer';
import {
  runAutomaticRewardPayout,
  type AutomaticRewardPayoutResult,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const CLAIM_RATE_LIMIT_WINDOW_SECONDS = 60;
const CLAIM_PER_WALLET_LIMIT = 10;
const CLAIM_PER_INVITE_LIMIT = 4;
const CLAIM_PAYOUT_RETRY_DELAYS_MS = [
  0,
  300,
  900,
  1_800,
] as const;

type RewardClaimRow = {
  invite_code: string;
  status: string;
  claim_requested_at: string;
  claim_requested_by_wallet: string;
};

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function claimErrorResponse(
  message: string,
) {
  if (
    message.includes(
      'REWARD_CLAIM_WALLET_MISMATCH',
    )
  ) {
    return NextResponse.json(
      {
        error:
          'This reward belongs to a different inviter wallet.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (
    message.includes(
      'REWARD_CLAIM_NOT_AVAILABLE',
    ) ||
    message.includes(
      'REWARD_CLAIM_CANCELLED',
    )
  ) {
    return NextResponse.json(
      {
        error:
          'This reward is not available to claim.',
      },
      {
        status: 409,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  return null;
}

function shouldRetryImmediatePayout(
  result: AutomaticRewardPayoutResult,
): boolean {
  if (result.status === 'LOCKED') {
    return true;
  }

  return (
    result.status === 'IDLE' &&
    (result.queuedCount ?? 0) > 0
  );
}

async function sleep(milliseconds: number) {
  if (milliseconds <= 0) return;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runClaimPayoutKickoff():
Promise<AutomaticRewardPayoutResult> {
  let lastResult: AutomaticRewardPayoutResult | null = null;

  for (const delayMs of CLAIM_PAYOUT_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    lastResult = await runAutomaticRewardPayout();

    if (!shouldRetryImmediatePayout(lastResult)) {
      return lastResult;
    }
  }

  if (!lastResult) {
    throw new Error(
      'Immediate reward payout did not run.',
    );
  }

  return lastResult;
}

export async function POST(
  request: NextRequest,
) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  let body: {
    inviteCode?: string;
  };

  try {
    body = (await request.json()) as {
      inviteCode?: string;
    };
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const inviteCode =
    body.inviteCode
      ?.trim()
      .toUpperCase() ?? '';

  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    return NextResponse.json(
      {
        error:
          'A valid 7-character inviteCode is required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const session =
      await requireWalletSession({ request });

    const rateLimitResponse =
      await enforceRateLimits([
        {
          scope: 'reward_claim_wallet',
          subject:
            session.walletAddress.toLowerCase(),
          limit: CLAIM_PER_WALLET_LIMIT,
          windowSeconds:
            CLAIM_RATE_LIMIT_WINDOW_SECONDS,
        },
        {
          scope: 'reward_claim_invite',
          subject: inviteCode,
          limit: CLAIM_PER_INVITE_LIMIT,
          windowSeconds:
            CLAIM_RATE_LIMIT_WINDOW_SECONDS,
        },
      ]);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      'request_reward_claim',
      {
        p_invite_code: inviteCode,
        p_recipient_wallet:
          session.walletAddress,
      },
    );

    if (error) {
      const response = claimErrorResponse(
        error.message,
      );

      if (response) {
        return response;
      }

      throw new Error(
        `Reward claim request failed: ${error.message}`,
      );
    }

    const claim = (
      Array.isArray(data) ? data[0] : null
    ) as RewardClaimRow | null;

    if (
      !claim ||
      claim.invite_code !== inviteCode ||
      claim.claim_requested_by_wallet
        .toLowerCase() !==
        session.walletAddress.toLowerCase()
    ) {
      throw new Error(
        'Reward claim request returned an invalid result.',
      );
    }

    // Claiming changes only transfer state. The fixed reward amount was already
    // reserved when the friend passed final verification. Start payout immediately.
    // If another payout iteration briefly owns the runtime lock, or an iteration
    // returns IDLE while durable claimed work is still queued, retry within this
    // request so a Claim is not left waiting solely because of transient contention.
    let payoutKickoff: AutomaticRewardPayoutResult | null = null;

    try {
      payoutKickoff = await runClaimPayoutKickoff();

      if (shouldRetryImmediatePayout(payoutKickoff)) {
        console.error(
          'Immediate reward payout remained queued after Claim retries:',
          {
            status: payoutKickoff.status,
            queuedCount: payoutKickoff.queuedCount ?? null,
            reason: payoutKickoff.reason ?? null,
          },
        );
      }
    } catch (rewardError) {
      console.error(
        'Immediate reward payout iteration failed after claim:',
        rewardError,
      );
    }

    return NextResponse.json(
      {
        claim: {
          inviteCode:
            claim.invite_code,
          status: claim.status,
          requestedAt:
            claim.claim_requested_at,
        },
        payoutKickoff: payoutKickoff
          ? {
              status: payoutKickoff.status,
              queuedCount:
                payoutKickoff.queuedCount ?? null,
              txId: payoutKickoff.txId,
            }
          : null,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      WalletAuthenticationError
    ) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to request VeInvite reward claim:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward could not be requested.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}