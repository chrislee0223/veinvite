import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  refreshQueuedReferralSignalChecks,
} from '@/lib/sybil/vePassportSignals';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const PREPARE_INTENT =
  'PREPARE_REWARD_ROUND';

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function readRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} is malformed.`);
  }

  return value as Record<string, unknown>;
}

function readOptionalId(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value);

  if (
    !POSITIVE_INTEGER_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return BigInt(normalized).toString();
}

export async function POST(
  request: NextRequest,
) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== PREPARE_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${PREPARE_INTENT}.`,
      },
      { status: 400 },
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const pool =
      await readVeInviteRewardPoolStatus();

    if (
      !canOperateVeInviteRewards(
        session.walletAddress,
        pool,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (pool.distributionPaused) {
      return NextResponse.json(
        {
          error:
            'VeInvite reward distribution is paused on-chain.',
          pool,
          roundCreated: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const openRoundResult =
      await supabaseAdmin
        .from('reward_rounds')
        .select('id, status, reward_budget_epoch_id, vebetter_round_id')
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .in('status', ['CREATED', 'PAYING'])
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (openRoundResult.error) {
      throw new Error(
        `Open reward round could not be checked: ${openRoundResult.error.message}`,
      );
    }

    if (openRoundResult.data) {
      return NextResponse.json(
        {
          error:
            'Finish the current reward batch before preparing another one.',
          code: 'ACTIVE_REWARD_ROUND_EXISTS',
          activeRound: openRoundResult.data,
          pool,
          roundCreated: false,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // Keep official funding evidence current before calculating any reward.
    // This never transfers B3TR and only records immutable on-chain proof.
    const allocationSync =
      await syncVeInviteAllocationReceipts();
    const allocationReceipt =
      allocationSync.latestReceipt;

    if (!allocationReceipt) {
      return NextResponse.json(
        {
          error:
            'No official VeBetterDAO allocation claim has been observed for VeInvite yet.',
          code: 'NO_VEBETTER_ALLOCATION_RECEIPT',
          pool,
          roundCreated: false,
          writesPerformed:
            allocationSync.insertedCount > 0,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      allocationReceipt.network !== pool.network ||
      allocationReceipt.app_id !== pool.appId.toLowerCase()
    ) {
      throw new Error(
        'Latest VeBetter allocation receipt does not match the active reward pool.',
      );
    }

    if (
      BigInt(
        allocationReceipt.rewards_allocation_amount_wei,
      ) <= 0n
    ) {
      return NextResponse.json(
        {
          error:
            'The latest VeBetterDAO round did not fund the VeInvite user reward pool.',
          code: 'NO_FUNDED_ALLOCATION',
          veBetterRoundId:
            allocationReceipt.vebetter_round_id,
          allocationReceipt,
          pool,
          roundCreated: false,
          writesPerformed:
            allocationSync.insertedCount > 0,
          transfersPerformed: false,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // Revalidate every queued referral immediately before financial
    // reservation. The predictor never weakens the existing Sybil gate.
    const signalPreflight =
      await refreshQueuedReferralSignalChecks({
        network: pool.network,
      });

    const planning =
      await readPredictiveRewardPlanning({
        network: pool.network,
        appId: pool.appId,
        observedPoolBalanceWei:
          pool.effectiveRewardPoolWei,
      });

    if (
      !planning.latestAllocation ||
      planning.latestAllocation.id !==
        String(allocationReceipt.id)
    ) {
      throw new Error(
        'Predictive reward planning did not resolve the latest allocation receipt.',
      );
    }

    if (!planning.forecast) {
      throw new Error(
        'Predictive reward forecast could not be calculated.',
      );
    }

    const { data, error } =
      await supabaseAdmin.rpc(
        'prepare_predictive_reward_batch',
        {
          p_network: pool.network,
          p_app_id: pool.appId,
          p_pool_balance_wei:
            pool.effectiveRewardPoolWei,
          p_allocation_receipt_id:
            planning.latestAllocation.id,
          p_expected_completions:
            planning.forecast.expectedCompletions,
          p_stress_completions:
            planning.forecast.stressCompletions,
          p_reward_per_invite_wei:
            planning.forecast.rewardPerInviteWei,
          p_algorithm_version:
            planning.forecast.algorithmVersion,
          p_pipeline_snapshot:
            planning.forecast.pipeline,
        },
      );

    if (error) {
      throw new Error(
        `prepare_predictive_reward_batch failed: ${error.message}`,
      );
    }

    const prepareResult = readRecord(
      data,
      'prepare_predictive_reward_batch result',
    );
    const roundId = readOptionalId(
      prepareResult.roundId,
      'roundId',
    );
    const epochId = readOptionalId(
      prepareResult.epochId,
      'epochId',
    );
    const reason = String(
      prepareResult.reason ?? 'UNKNOWN',
    );

    if (!roundId) {
      return NextResponse.json(
        {
          roundCreated: false,
          reason,
          rewardBudgetEpochId: epochId,
          veBetterRoundId:
            allocationReceipt.vebetter_round_id,
          allocationReceipt,
          allocationSync: {
            insertedCount:
              allocationSync.insertedCount,
            observedClaims:
              allocationSync.observedClaims,
          },
          signalPreflight,
          planning,
          pool,
          verifiedOperator:
            session.walletAddress,
          writesPerformed:
            allocationSync.insertedCount > 0 ||
            signalPreflight.checkedCount > 0 ||
            epochId !== null,
          transfersPerformed: false,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const [roundResult, payoutResult] =
      await Promise.all([
        supabaseAdmin
          .from('reward_rounds')
          .select(
            'id, network, app_id, status, reward_budget_epoch_id, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at',
          )
          .eq('id', roundId)
          .single(),
        supabaseAdmin
          .from('reward_payouts')
          .select(
            'id, invite_code, recipient_wallet, amount_wei, status',
          )
          .eq('round_id', roundId)
          .order('id', {
            ascending: true,
          }),
      ]);

    if (roundResult.error) {
      throw new Error(
        `Prepared reward batch could not be reloaded: ${roundResult.error.message}`,
      );
    }

    if (payoutResult.error) {
      throw new Error(
        `Prepared reward payouts could not be reloaded: ${payoutResult.error.message}`,
      );
    }

    return NextResponse.json(
      {
        roundCreated: true,
        reason,
        rewardBudgetEpochId: epochId,
        veBetterRoundId:
          allocationReceipt.vebetter_round_id,
        allocationReceipt,
        allocationSync: {
          insertedCount:
            allocationSync.insertedCount,
          observedClaims:
            allocationSync.observedClaims,
        },
        signalPreflight,
        planning,
        pool,
        verifiedOperator:
          session.walletAddress,
        round: roundResult.data,
        payouts: payoutResult.data ?? [],
        writesPerformed: true,
        transfersPerformed: false,
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to prepare predictive VeInvite reward batch:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite predictive reward batch could not be prepared.',
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
