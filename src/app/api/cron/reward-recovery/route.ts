import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  runAutomaticRewardPayout,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';

function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Cron secret is not configured.',
    };
  }

  const authorization =
    request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (
    !authorization ||
    !secureEquals(authorization, expected)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

/**
 * Lightweight reward-liveness fallback.
 *
 * Normal reward work is driven immediately by the Claim and reservation
 * queues. Queue messages are deployment-scoped, so this current-deployment
 * heartbeat recovers reward work if an older deployment keeps retrying an
 * older message.
 */
export async function GET(request: NextRequest) {
  const authorization = authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const payout =
      await runAutomaticRewardPayout();

    return NextResponse.json(
      {
        ok: true,
        trigger: 'REWARD_RECOVERY_CRON',
        payout,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Reward recovery cron failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        trigger: 'REWARD_RECOVERY_CRON',
        error:
          error instanceof Error
            ? error.message
            : 'Reward recovery failed.',
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
