import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  readVeInviteRewardPoolStatus,
  VEINVITE_APP_ID,
} from '@/lib/rewards/onchainPool';
import {
  REWARD_FORECAST_MODEL_VERSION,
} from '@/lib/rewards/rewardForecastPolicy';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  readLatestRewardForecastSnapshot,
  refreshRewardForecastSnapshot,
  type RewardForecastSnapshot,
} from '@/lib/rewards/rewardForecastSnapshot';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';
const FORCE_CACHE_CONTROL = 'private, no-store, max-age=0';
const FORECAST_REFRESH_WINDOW_SECONDS = 60 * 60;

type EstimateReason =
  | 'awaiting_first_allocation'
  | 'insufficient_reward_data';

type FundingCheckResult =
  | 'changed'
  | 'unchanged'
  | 'unavailable';

function pendingResponse(
  reason: EstimateReason,
  cacheControl = CACHE_CONTROL,
) {
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      status: 'pending' as const,
      reason,
      basisRoundId: null,
      projectedFundingRoundId: null,
      earliestCompletionRoundId: null,
      estimatedRewardWei: null,
      estimatedRewardLowWei: null,
      estimatedRewardHighWei: null,
      expectedRecipients: null,
      recipientLow: null,
      recipientHigh: null,
      allocationSampleCount: 0,
      recipientHistoryRoundCount: 0,
      modelVersion: null,
      stale: false,
    },
    {
      headers: {
        'Cache-Control': cacheControl,
      },
    },
  );
}

function readyResponse(
  snapshot: RewardForecastSnapshot,
  stale: boolean,
  cacheControl = CACHE_CONTROL,
) {
  return NextResponse.json(
    {
      generatedAt: snapshot.generatedAt,
      status: 'ready' as const,
      reason: null,
      basisRoundId: snapshot.basisAllocationRoundId,
      projectedFundingRoundId: snapshot.projectedFundingRoundId,
      earliestCompletionRoundId: snapshot.earliestCompletionRoundId,
      estimatedRewardWei: snapshot.estimatedRewardWei,
      estimatedRewardLowWei: snapshot.estimatedRewardLowWei,
      estimatedRewardHighWei: snapshot.estimatedRewardHighWei,
      expectedRecipients: snapshot.expectedRecipients,
      recipientLow: snapshot.recipientLow,
      recipientHigh: snapshot.recipientHigh,
      allocationSampleCount: snapshot.allocationSampleCount,
      recipientHistoryRoundCount: snapshot.recipientHistoryRoundCount,
      modelVersion: snapshot.modelVersion,
      stale,
    },
    {
      headers: {
        'Cache-Control': cacheControl,
      },
    },
  );
}

function isFresh(snapshot: RewardForecastSnapshot): boolean {
  if (snapshot.modelVersion !== REWARD_FORECAST_MODEL_VERSION) {
    return false;
  }

  const generatedAt = Date.parse(snapshot.generatedAt);
  if (Number.isNaN(generatedAt)) return false;
  return Date.now() - generatedAt < FORECAST_REFRESH_WINDOW_SECONDS * 1_000;
}

async function bestEffortAllocationSync() {
  try {
    await syncVeInviteAllocationReceipts();
  } catch (error) {
    console.warn('Reward forecast allocation sync failed:', error);
  }
}

function snapshotString(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value);
  return /^-?\d+$/.test(normalized)
    ? BigInt(normalized).toString()
    : null;
}

async function readLatestForecastFundingInput(input: {
  network: string;
  appId: string;
}): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('reward_forecast_snapshots')
    .select('input_snapshot')
    .eq('network', input.network)
    .eq('app_id', input.appId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward forecast funding input could not be loaded: ${error.message}`,
    );
  }

  const raw =
    data &&
    typeof data === 'object' &&
    !Array.isArray(data)
      ? (data as { input_snapshot?: unknown })
          .input_snapshot
      : null;

  return raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : null;
}

async function checkLiveFunding(
  snapshot: RewardForecastSnapshot,
  network: string,
): Promise<FundingCheckResult> {
  try {
    const pool = await readVeInviteRewardPoolStatus();
    if (pool.network !== network || pool.appId !== VEINVITE_APP_ID) {
      throw new Error('Reward forecast live pool identity does not match the current app.');
    }

    if (pool.effectiveRewardPoolWei !== snapshot.observedPoolBalanceWei) {
      return 'changed';
    }

    const planning = await readPredictiveRewardPlanning({
      network,
      appId: VEINVITE_APP_ID,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    });

    if (
      !planning.forecast ||
      !planning.latestAllocation ||
      !planning.rewardCohortRoundId
    ) {
      return 'unavailable';
    }

    const fundingInput =
      await readLatestForecastFundingInput({
        network,
        appId: VEINVITE_APP_ID,
      });

    if (!fundingInput) {
      return 'changed';
    }

    const snapshotRound =
      snapshotString(
        fundingInput.rewardCohortRoundId,
      );
    const snapshotOfficial =
      snapshotString(
        fundingInput.officialAllocationWei,
      );
    const snapshotAdjustment =
      snapshotString(
        fundingInput.fundingAdjustmentWei,
      );
    const snapshotReserveNetFlow =
      snapshotString(
        fundingInput.reserveNetFlowWei,
      );
    const snapshotDesignated =
      snapshotString(
        fundingInput.designatedBudgetWei,
      );
    const snapshotCommitted =
      snapshotString(
        fundingInput.cohortReservedWei,
      );

    const changed =
      snapshotRound !==
        planning.rewardCohortRoundId ||
      snapshotOfficial !==
        planning.latestAllocation.rewardsAllocationWei ||
      snapshotAdjustment !==
        planning.fundingAdjustmentWei ||
      snapshotReserveNetFlow !==
        planning.reserveNetFlowWei ||
      snapshotDesignated !==
        planning.designatedBudgetWei ||
      snapshotCommitted !==
        planning.cohortReservedWei;

    return changed ? 'changed' : 'unchanged';
  } catch (error) {
    // A transient node read must never blank a previously valid public
    // estimate. Explicit refresh callers receive the last value as stale and
    // can retry later while the normal snapshot path remains cheap.
    console.warn('Reward forecast live funding check failed:', error);
    return 'unavailable';
  }
}

export async function GET(request: NextRequest) {
  const { network } = getVeBetterNetworkConfig();
  const refreshRequested = request.nextUrl.searchParams.has('refresh');
  const responseCacheControl = refreshRequested
    ? FORCE_CACHE_CONTROL
    : CACHE_CONTROL;
  let previousSnapshot: RewardForecastSnapshot | null = null;

  try {
    previousSnapshot = await readLatestRewardForecastSnapshot({
      network,
      appId: VEINVITE_APP_ID,
    });

    // Normal Home reads should never wait on VeChain RPC when a compatible,
    // fresh server snapshot already exists. Live pool verification is reserved
    // for the client's explicit background refresh path.
    if (
      previousSnapshot &&
      isFresh(previousSnapshot) &&
      !refreshRequested
    ) {
      return readyResponse(
        previousSnapshot,
        false,
        responseCacheControl,
      );
    }

    const fundingCheck =
      refreshRequested && previousSnapshot
        ? await checkLiveFunding(previousSnapshot, network)
        : 'unchanged';
    const fundingChanged = fundingCheck === 'changed';

    if (
      refreshRequested &&
      previousSnapshot &&
      isFresh(previousSnapshot) &&
      fundingCheck === 'unavailable'
    ) {
      return readyResponse(
        previousSnapshot,
        true,
        responseCacheControl,
      );
    }

    if (
      previousSnapshot &&
      isFresh(previousSnapshot) &&
      !fundingChanged
    ) {
      return readyResponse(
        previousSnapshot,
        false,
        responseCacheControl,
      );
    }

    const limited = await enforceRateLimits([
      {
        scope: 'public-reward-forecast-refresh',
        subject: `${network}:${VEINVITE_APP_ID}`,
        limit: 1,
        windowSeconds: FORECAST_REFRESH_WINDOW_SECONDS,
      },
    ]);

    // A confirmed physical pool change or logical cohort-funding change is a
    // funding event, so it may bypass the normal hourly forecasting throttle.
    // Reserve ledger movement does not change the on-chain pool balance, hence
    // the explicit refresh path also compares the live cohort pricing basis.
    if (
      fundingChanged ||
      !limited ||
      !previousSnapshot ||
      previousSnapshot.modelVersion !== REWARD_FORECAST_MODEL_VERSION
    ) {
      await bestEffortAllocationSync();

      try {
        const refreshed = await refreshRewardForecastSnapshot({
          network,
          appId: VEINVITE_APP_ID,
        });

        if (refreshed) {
          return readyResponse(
            refreshed,
            false,
            responseCacheControl,
          );
        }
      } catch (refreshError) {
        if (!previousSnapshot) throw refreshError;
        console.warn('Reward forecast refresh failed; serving the last snapshot:', refreshError);
      }
    }

    if (previousSnapshot) {
      return readyResponse(
        previousSnapshot,
        true,
        responseCacheControl,
      );
    }

    return pendingResponse(
      'awaiting_first_allocation',
      responseCacheControl,
    );
  } catch (error) {
    console.error('Public reward forecast request failed:', error);

    if (previousSnapshot) {
      return readyResponse(
        previousSnapshot,
        true,
        responseCacheControl,
      );
    }

    return NextResponse.json(
      {
        error: 'The reward estimate is temporarily unavailable.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
