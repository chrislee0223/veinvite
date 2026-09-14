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
 * Lightweight recovery path for automatic B3TR payouts.
 *
 * A normal claim request already tries to continue a payout immediately, but
 * VeChain finality can outlive that serverless request. This endpoint retries
 * only the idempotent automatic payout worker, allowing a journaled transaction
 * to be rebroadcast or finalized without running the much heavier daily
 * reconciliation pipeline.
 */
export async function GET(
  request: NextRequest,
) {
  const authorization =
    authorizeCron(request);

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
    const automaticRewardPayout =
      await runAutomaticRewardPayout();

    return NextResponse.json(
      {
        automaticRewardPayout,
        trigger: 'VERCEL_REWARD_PAYOUT_CRON',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled reward payout recovery failed:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Scheduled reward payout recovery failed.',
        trigger: 'VERCEL_REWARD_PAYOUT_CRON',
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
