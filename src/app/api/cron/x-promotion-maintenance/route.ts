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
import {
  runRewardXPromotionPayout,
  type RewardXPromotionPayoutResult,
} from '@/lib/rewards/rewardXPromotionPayoutExecutor';
import {
  runRewardXPromotionRecoveryMaintenance,
} from '@/lib/rewards/rewardXPromotionRecovery';

export const maxDuration = 300;

const LIFECYCLE_JOB_NAME =
  'x-promotion-lifecycle';
const PAYOUT_JOB_NAME =
  'x-promotion-payout';
const RECOVERY_JOB_NAME =
  'x-promotion-recovery';
const MIN_SUCCESS_INTERVAL_SECONDS =
  10 * 60;
const LIFECYCLE_LEASE_SECONDS =
  12 * 60;
const PAYOUT_LEASE_SECONDS =
  12 * 60;
const RECOVERY_LEASE_SECONDS =
  12 * 60;

type JobResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  result?: unknown;
  error?: string;
};

const PAYOUT_FAILURE_STATUSES =
  new Set<RewardXPromotionPayoutResult['status']>([
    'NOT_CONFIGURED',
    'NOT_REGISTERED',
    'MANUAL_INTERVENTION_REQUIRED',
  ]);

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

async function claimJob(
  jobName: string,
  leaseSeconds: number,
): Promise<boolean> {
  return tryClaimCronJob(
    jobName,
    MIN_SUCCESS_INTERVAL_SECONDS,
    leaseSeconds,
  );
}

async function runLifecycleJob():
Promise<JobResult> {
  let claimed: boolean;

  try {
    claimed = await claimJob(
      LIFECYCLE_JOB_NAME,
      LIFECYCLE_LEASE_SECONDS,
    );
  } catch (error) {
    console.error(
      'Failed to claim X promotion lifecycle cron:',
      error,
    );
    return {
      ok: false,
      skipped: false,
      error:
        'X promotion lifecycle lease could not be claimed.',
    };
  }

  if (!claimed) {
    return {
      ok: true,
      skipped: true,
      reason:
        'NOT_DUE_OR_ALREADY_RUNNING',
    };
  }

  try {
    await markCronJobStarted(
      LIFECYCLE_JOB_NAME,
    );

    const result =
      await runRewardXPromotionLifecycleMaintenance();

    await markCronJobSucceeded(
      LIFECYCLE_JOB_NAME,
    );

    return {
      ok: true,
      skipped: false,
      result,
    };
  } catch (error) {
    console.error(
      'X promotion lifecycle maintenance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        LIFECYCLE_JOB_NAME,
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

    return {
      ok: false,
      skipped: false,
      error:
        'X promotion lifecycle maintenance failed.',
    };
  }
}

async function runPayoutJob():
Promise<JobResult> {
  let claimed: boolean;

  try {
    claimed = await claimJob(
      PAYOUT_JOB_NAME,
      PAYOUT_LEASE_SECONDS,
    );
  } catch (error) {
    console.error(
      'Failed to claim X promotion payout cron:',
      error,
    );
    return {
      ok: false,
      skipped: false,
      error:
        'X promotion payout lease could not be claimed.',
    };
  }

  if (!claimed) {
    return {
      ok: true,
      skipped: true,
      reason:
        'NOT_DUE_OR_ALREADY_RUNNING',
    };
  }

  try {
    await markCronJobStarted(
      PAYOUT_JOB_NAME,
    );

    const result =
      await runRewardXPromotionPayout();

    if (
      PAYOUT_FAILURE_STATUSES.has(
        result.status,
      )
    ) {
      throw new Error(
        `X promotion payout requires operator attention: ${result.status}${result.reason ? ` - ${result.reason}` : ''}`,
      );
    }

    await markCronJobSucceeded(
      PAYOUT_JOB_NAME,
    );

    return {
      ok: true,
      skipped: false,
      result,
    };
  } catch (error) {
    console.error(
      'X promotion payout maintenance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        PAYOUT_JOB_NAME,
        error,
      );
    } catch (
      heartbeatError
    ) {
      console.error(
        'Failed to record X promotion payout cron failure:',
        heartbeatError,
      );
    }

    return {
      ok: false,
      skipped: false,
      error:
        'X promotion payout maintenance failed.',
    };
  }
}


async function runRecoveryJob():
Promise<JobResult> {
  let claimed: boolean;

  try {
    claimed = await claimJob(
      RECOVERY_JOB_NAME,
      RECOVERY_LEASE_SECONDS,
    );
  } catch (error) {
    console.error(
      'Failed to claim X promotion recovery cron:',
      error,
    );
    return {
      ok: false,
      skipped: false,
      error:
        'X promotion recovery lease could not be claimed.',
    };
  }

  if (!claimed) {
    return {
      ok: true,
      skipped: true,
      reason:
        'NOT_DUE_OR_ALREADY_RUNNING',
    };
  }

  try {
    await markCronJobStarted(
      RECOVERY_JOB_NAME,
    );

    const result =
      await runRewardXPromotionRecoveryMaintenance();

    await markCronJobSucceeded(
      RECOVERY_JOB_NAME,
    );

    return {
      ok: true,
      skipped: false,
      result,
    };
  } catch (error) {
    console.error(
      'X promotion recovery maintenance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        RECOVERY_JOB_NAME,
        error,
      );
    } catch (
      heartbeatError
    ) {
      console.error(
        'Failed to record X promotion recovery cron failure:',
        heartbeatError,
      );
    }

    return {
      ok: false,
      skipped: false,
      error:
        'X promotion recovery maintenance failed.',
    };
  }
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

  // Keep lifecycle and payout monitoring independent. A failure in the
  // optional payout worker must not hide or overwrite lifecycle health.
  // Sequential execution avoids races with opportunity/security transitions.
  const lifecycle =
    await runLifecycleJob();
  const payout =
    await runPayoutJob();
  const recovery =
    await runRecoveryJob();

  return NextResponse.json(
    {
      ok:
        lifecycle.ok &&
        payout.ok &&
        recovery.ok,
      jobs: {
        lifecycle,
        payout,
        recovery,
      },
    },
    {
      // Preserve the existing lifecycle failure signal. Payout/recovery-only
      // failures are isolated to their own heartbeats and do not fail the route.
      status: lifecycle.ok ? 200 : 500,
      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );
}
