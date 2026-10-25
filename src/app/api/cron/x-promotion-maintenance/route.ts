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
  runRewardXPromotionExternalReadinessCheck,
} from '@/lib/rewards/rewardXPromotionExternalReadiness';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readRewardXPromotionPayoutRuntimeReadiness } from '@/lib/rewards/rewardXPromotionPayoutRuntime';
import {
  runRewardXPromotionLifecycleMaintenance,
} from '@/lib/rewards/rewardXPromotionLifecycle';
import {
  runRewardXPromotionPayout,
  type RewardXPromotionPayoutResult,
} from '@/lib/rewards/rewardXPromotionPayoutExecutor';

export const maxDuration = 300;

const EXTERNAL_READINESS_JOB_NAME = 'x-promotion-external-readiness';
// The provider probe must run before its evidence expires: the 15-minute
// maintenance cadence can slip by one tick at an exact 6-hour boundary.
// Probe after 5h30m, leaving 30 minutes of headroom, while retaining the
// hard 6-hour cap on cached evidence and the existing monthly X API budget.
const EXTERNAL_READINESS_PROBE_INTERVAL_SECONDS = 5 * 60 * 60 + 30 * 60;
const EXTERNAL_READINESS_CACHE_MAX_AGE_SECONDS = 6 * 60 * 60;
const LIFECYCLE_JOB_NAME =
  'x-promotion-lifecycle';
const PAYOUT_JOB_NAME =
  'x-promotion-payout';
const MIN_SUCCESS_INTERVAL_SECONDS =
  10 * 60;
const LIFECYCLE_LEASE_SECONDS =
  12 * 60;
const PAYOUT_LEASE_SECONDS =
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

// SQL split/offer guards require a provider-readiness record younger than
// 20 minutes. Preserve that safety contract with explicit, expiring CACHE
// records between real provider probes. Never extend beyond 6 hours from
// the last non-cached X read, or when payout runtime itself is not ready.
async function refreshCachedExternalReadiness(): Promise<boolean> {
  if (!readRewardXPromotionPayoutRuntimeReadiness().ready) return false;
  const { network } = getVeBetterNetworkConfig();
  const previous = await supabaseAdmin
    .from('reward_x_promotion_external_runtime_checks')
    .select('status,probe_post_id,checked_at,details')
    .eq('network', network)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) throw new Error('Could not load external readiness cache.');
  const check = previous.data;
  if (!check || !['READY', 'POST_NOT_FOUND'].includes(check.status)) return false;
  const details = check.details && typeof check.details === 'object' &&
    !Array.isArray(check.details)
    ? check.details as Record<string, unknown> : {};
  const actual = typeof details.providerCheckedAt === 'string'
    ? details.providerCheckedAt : check.checked_at;
  const ageMs = Date.now() - Date.parse(actual);
  if (!Number.isFinite(ageMs) || ageMs < 0 ||
      ageMs >= EXTERNAL_READINESS_CACHE_MAX_AGE_SECONDS * 1000) return false;
  const { error } = await supabaseAdmin
    .from('reward_x_promotion_external_runtime_checks')
    .insert({
      network,
      status: check.status,
      probe_post_id: check.probe_post_id,
      checked_at: new Date().toISOString(),
      details: {
        cached: true,
        providerCheckedAt: actual,
        // Scheduled cooldown is not evidence of an X HTTP 429 response.
        reason: 'SCHEDULED_PROBE_COOLDOWN_CACHE',
      },
    });
  if (error) throw new Error('Failed to refresh cached X readiness.');
  return true;
}

async function runExternalReadinessJob():
Promise<JobResult> {
  try {
    const claimed = await tryClaimCronJob(
      EXTERNAL_READINESS_JOB_NAME,
      EXTERNAL_READINESS_PROBE_INTERVAL_SECONDS,
      10 * 60,
    );
    if (!claimed) {
      const cacheRefreshed = await refreshCachedExternalReadiness();
      return {
        ok: true,
        skipped: true,
        reason: cacheRefreshed ? 'CACHED_PROVIDER_READINESS' : 'NOT_DUE_OR_ALREADY_RUNNING',
      };
    }
  } catch (error) {
    console.error('X promotion readiness lease unavailable', error);
    return { ok: false, skipped: false, error: 'External readiness lease failed.' };
  }

  try {
    await markCronJobStarted(EXTERNAL_READINESS_JOB_NAME);
    const result = await runRewardXPromotionExternalReadinessCheck();
    await markCronJobSucceeded(EXTERNAL_READINESS_JOB_NAME);
    return { ok: true, skipped: false, result };
  } catch (error) {
    console.error('X promotion external readiness check failed:', error);
    try { await markCronJobFailed(EXTERNAL_READINESS_JOB_NAME, error); }
    catch (heartbeatError) {
      console.error('X promotion readiness failure heartbeat failed', heartbeatError);
    }
    return {
      ok: false,
      skipped: false,
      error: 'X promotion external readiness check failed.',
    };
  }
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

    // Individual opportunity errors are isolated from the base reward path,
    // but must not be mistaken for a successful lifecycle heartbeat.
    const opportunitySync = result.opportunitySync;
    const syncFailureCount =
      opportunitySync &&
      typeof opportunitySync === 'object' &&
      !Array.isArray(opportunitySync)
        ? (opportunitySync as Record<string, unknown>).failedCount
        : null;
    if (
      typeof syncFailureCount !== 'number' ||
      !Number.isSafeInteger(syncFailureCount) ||
      syncFailureCount < 0
    ) {
      throw new Error('X promotion opportunity sync failure count is invalid.');
    }
    if (
      syncFailureCount > 0 ||
      result.pending.failed > 0 ||
      result.final.failed > 0
    ) {
      throw new Error(
        `X promotion lifecycle candidate failures: opportunitySync=${JSON.stringify(opportunitySync).slice(0,1300)}; pendingFailed=${result.pending.failed}; finalFailed=${result.final.failed}; discoveryStatus=${result.discovery.status}; discoveryFailed=${result.discovery.failed}`,
      );
    }

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

  // Verify the external X dependency first. A non-ready result is safe and
  // may pause only new X promotion offers; an execution failure is surfaced
  // separately without hiding lifecycle or payout diagnostics.
  const externalReadiness =
    await runExternalReadinessJob();

  // Keep lifecycle and payout monitoring independent. A failure in the
  // optional payout worker must not hide or overwrite lifecycle health.
  // Sequential execution avoids races with opportunity/security transitions.
  const lifecycle =
    await runLifecycleJob();
  const payout =
    await runPayoutJob();

  return NextResponse.json(
    {
      ok:
        externalReadiness.ok &&
        lifecycle.ok &&
        payout.ok,
      jobs: {
        externalReadiness,
        lifecycle,
        payout,
      },
    },
    {
      // External readiness and lifecycle are safety-critical. A payout-only
      // failure stays isolated to its own heartbeat and does not fail the route.
      status:
        externalReadiness.ok &&
        lifecycle.ok
          ? 200
          : 500,
      headers: {
        'Cache-Control':
          'no-store',
      },
    },
  );
}
