import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/monitoring/cronHeartbeat';
import {
  runRewardXPromotionMaintenance,
} from '@/lib/rewards/rewardXPromotionMaintenance';

export const maxDuration = 120;

const JOB_NAME =
  'x-promotion-maintenance';

function secureEquals(
  leftValue: string,
  rightValue: string,
) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorizeCron(
  request: NextRequest,
) {
  const secret =
    process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error:
        'Cron secret is not configured.',
    };
  }

  const authorization =
    request.headers.get(
      'authorization',
    );
  const expected =
    `Bearer ${secret}`;

  if (
    !authorization ||
    !secureEquals(
      authorization,
      expected,
    )
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return {
    ok: true as const,
  };
}

export async function GET(
  request: NextRequest,
) {
  const authorization =
    authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  try {
    await markCronJobStarted(
      JOB_NAME,
    );
  } catch (error) {
    console.warn(
      'X promotion maintenance heartbeat start failed:',
      error,
    );
  }

  try {
    const result =
      await runRewardXPromotionMaintenance();

    try {
      await markCronJobSucceeded(
        JOB_NAME,
      );
    } catch (heartbeatError) {
      console.warn(
        'X promotion maintenance success heartbeat failed:',
        heartbeatError,
      );
    }

    return NextResponse.json(
      result,
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'X promotion maintenance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        JOB_NAME,
        error,
      );
    } catch (heartbeatError) {
      console.error(
        'X promotion maintenance failure heartbeat failed:',
        heartbeatError,
      );
    }

    return NextResponse.json(
      {
        error:
          'X_PROMOTION_MAINTENANCE_FAILED',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
