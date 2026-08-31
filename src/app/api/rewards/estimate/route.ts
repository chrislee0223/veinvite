import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  VEINVITE_APP_ID,
} from '@/lib/rewards/onchainPool';
import {
  readLatestRewardForecastSnapshot,
  refreshRewardForecastSnapshot,
  type RewardForecastSnapshot,
} from '@/lib/rewards/rewardForecastSnapshot';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';
const FORECAST_REFRESH_WINDOW_SECONDS = 60 * 60;

type EstimateReason =
  | 'awaiting_first_allocation'
  | 'insufficient_reward_data';

function pendingResponse(reason: EstimateReason) {
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
        'Cache-Control': CACHE_CONTROL,
      },
    },
  );
}

function readyResponse(snapshot: RewardForecastSnapshot, stale: boolean) {
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
        'Cache-Control': CACHE_CONTROL,
      },
    },
  );
}

function isFresh(snapshot: RewardForecastSnapshot): boolean {
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

export async function GET(_request: NextRequest) {
  const { network } = getVeBetterNetworkConfig();
  let previousSnapshot: RewardForecastSnapshot | null = null;

  try {
    previousSnapshot = await readLatestRewardForecastSnapshot({
      network,
      appId: VEINVITE_APP_ID,
    });

    if (previousSnapshot && isFresh(previousSnapshot)) {
      return readyResponse(previousSnapshot, false);
    }

    const limited = await enforceRateLimits([
      {
        scope: 'public-reward-forecast-refresh',
        subject: `${network}:${VEINVITE_APP_ID}`,
        limit: 1,
        windowSeconds: FORECAST_REFRESH_WINDOW_SECONDS,
      },
    ]);

    // Only one server request per hour performs chain/database forecasting work.
    // Everyone else reads the latest stored snapshot. If no snapshot exists yet,
    // allow bootstrap creation even if the limiter is temporarily degraded.
    if (!limited || !previousSnapshot) {
      await bestEffortAllocationSync();

      try {
        const refreshed = await refreshRewardForecastSnapshot({
          network,
          appId: VEINVITE_APP_ID,
        });

        if (refreshed) {
          return readyResponse(refreshed, false);
        }
      } catch (refreshError) {
        if (!previousSnapshot) throw refreshError;
        console.warn('Reward forecast refresh failed; serving the last snapshot:', refreshError);
      }
    }

    if (previousSnapshot) {
      return readyResponse(previousSnapshot, true);
    }

    return pendingResponse('awaiting_first_allocation');
  } catch (error) {
    console.error('Public reward forecast request failed:', error);

    if (previousSnapshot) {
      return readyResponse(previousSnapshot, true);
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
