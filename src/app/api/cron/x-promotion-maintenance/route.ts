import {
  timingSafeEqual,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
  tryClaimCronJob,
} from '@/lib/monitoring/cronHeartbeat';
import {
  runRewardXPromotionLifecycleMaintenance,
} from '@/lib/rewards/rewardXPromotionLifecycle';

export const maxDuration = 180;

const JOB_NAME =
  'x-promotion-lifecycle';
const MIN_SUCCESS_INTERVAL_SECONDS =
  10 * 60;
const LEASE_SECONDS =
  12 * 60;

function secureEquals(
  a: string,
  b: string,
) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(
    left,
    right,
  );
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

  let claimed = false;

  try {
    claimed =
      await tryClaimCronJob(
        JOB_NAME,
        MIN_SUCCESS_INTERVAL_SECONDS,
        LEASE_SECONDS,
      );
  } catch (error) {
    console.error(
      'Failed to claim X promotion lifecycle cron:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'X promotion lifecycle lease could not be claimed.',
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

  if (!claimed) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason:
          'NOT_DUE_OR_ALREADY_RUNNING',
      },
      {
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

    const result =
      await runRewardXPromotionLifecycleMaintenance();

    await markCronJobSucceeded(
      JOB_NAME,
    );

    return NextResponse.json(
      {
        ok: true,
        skipped: false,
        result,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'X promotion lifecycle maintenance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        JOB_NAME,
        error,
      );
    } catch (
      heartbeatError
    ) {
      console.error(
        'Failed to record X promotion lifecycle cron failure:',
        heartbeatError,
      );
    }

    return NextResponse.json(
      {
        error:
          'X promotion lifecycle maintenance failed.',
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
