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
import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'no-store';
const ALLOCATION_SYNC_WINDOW_SECONDS = 60;

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
      estimatedRewardWei: null,
      expectedRecipients: null,
      stressRecipients: null,
    },
    {
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    },
  );
}

function readRoundId(value: string | number): number {
  const roundId = Number(value);

  if (!Number.isSafeInteger(roundId) || roundId < 0) {
    throw new Error('Reward estimate returned an invalid round id.');
  }

  return roundId;
}

async function syncAllocationIfDue() {
  const limited = await enforceRateLimits([
    {
      scope: 'public-reward-estimate-allocation-sync',
      subject: 'global',
      limit: 1,
      windowSeconds: ALLOCATION_SYNC_WINDOW_SECONDS,
    },
  ]);

  // A public estimate request must remain available even when another request
  // already performed the shared sync or the limiter is temporarily degraded.
  if (limited) {
    return;
  }

  try {
    await syncVeInviteAllocationReceipts();
  } catch (error) {
    // Allocation sync is best-effort here. The scheduled reconciliation worker
    // remains the durable fallback, and stale data is safer than a fabricated
    // reward estimate.
    console.warn(
      'Public reward estimate allocation sync failed:',
      error,
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const { network } = getVeBetterNetworkConfig();

    // Keep the public estimate close to the chain without allowing every page
    // view to trigger an expensive allocation scan. The database-backed global
    // throttle permits at most one best-effort sync per minute across users.
    await syncAllocationIfDue();

    const { data: latestAllocation, error: allocationError } =
      await supabaseAdmin
        .from('vebetter_round_allocations')
        .select('id')
        .eq('network', network)
        .eq('app_id', VEINVITE_APP_ID)
        .order('claim_block_timestamp', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(1)
        .maybeSingle();

    if (allocationError) {
      throw new Error(
        `Latest VeInvite allocation could not be loaded: ${allocationError.message}`,
      );
    }

    if (!latestAllocation) {
      return pendingResponse('awaiting_first_allocation');
    }

    const pool = await readVeInviteRewardPoolStatus();
    const planning = await readPredictiveRewardPlanning({
      network: pool.network,
      appId: pool.appId,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    });

    const activeEpoch = planning.activeEpoch;
    const forecast = planning.forecast;
    const estimatedRewardWei =
      activeEpoch?.rewardPerInviteWei ??
      forecast?.rewardPerInviteWei ??
      '0';

    if (!/^\d+$/.test(estimatedRewardWei)) {
      throw new Error('Reward estimate returned an invalid amount.');
    }

    if (BigInt(estimatedRewardWei) <= 0n) {
      return pendingResponse('insufficient_reward_data');
    }

    const basisRoundId = activeEpoch
      ? readRoundId(activeEpoch.veBetterRoundId)
      : forecast && planning.latestAllocation
        ? readRoundId(planning.latestAllocation.veBetterRoundId)
        : null;
    const expectedRecipients =
      activeEpoch?.expectedCompletions ??
      forecast?.expectedCompletions ??
      null;
    const stressRecipients =
      activeEpoch?.stressCompletions ??
      forecast?.stressCompletions ??
      null;

    if (
      basisRoundId === null ||
      expectedRecipients === null ||
      stressRecipients === null
    ) {
      return pendingResponse('insufficient_reward_data');
    }

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: 'ready' as const,
        reason: null,
        basisRoundId,
        estimatedRewardWei,
        expectedRecipients,
        stressRecipients,
      },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    console.error('Public reward estimate request failed:', error);

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
