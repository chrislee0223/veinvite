import 'server-only';

import {
  calculateRewardBoostReserveShadow,
  type RewardBoostReserveCohortInput,
  type RewardBoostReserveShadowResult,
} from '@/lib/rewards/rewardBoostReservePolicy';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  readVeInviteRewardPoolStatus,
  VEINVITE_APP_ID,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';

const INTEGER_PATTERN = /^\d+$/;

type AllocationRow = {
  id: number | string;
  vebetter_round_id: number | string;
  rewards_allocation_amount_wei: number | string;
};

type FundingAdjustmentRow = {
  reward_cohort_round_id: number | string;
  allocation_receipt_id: number | string;
  adjustment_type: string;
  amount_wei: number | string;
};

type InvitationRow = {
  reward_cohort_round_id: number | string | null;
  reward_funding_allocation_receipt_id: number | string | null;
  apps_completed: number | null;
  vot3_converted: boolean | null;
  vote_completed: boolean | null;
  sybil_status: string | null;
};

function integerString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return BigInt(normalized).toString();
}

function positiveInteger(value: unknown, fieldName: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error(`${fieldName} must be a positive safe integer.`);
  }
  return normalized;
}

function nonNegativeCount(value: unknown, fieldName: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }
  return normalized;
}

export type RewardBoostReserveShadowSnapshot = {
  generatedAt: string;
  network: string;
  appId: string;
  writesPerformed: false;
  transfersPerformed: false;
  result: RewardBoostReserveShadowResult;
};

export async function readRewardBoostReserveShadow():
Promise<RewardBoostReserveShadowSnapshot> {
  const pool = await readVeInviteRewardPoolStatus();
  const planning = await readPredictiveRewardPlanning({
    network: pool.network,
    appId: pool.appId,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
  });

  if (
    pool.appId !== VEINVITE_APP_ID ||
    !planning.latestAllocation ||
    !planning.rewardCohortRoundId ||
    !planning.forecast
  ) {
    throw new Error('Reward boost reserve shadow planning is unavailable.');
  }

  const currentCohortRoundId = positiveInteger(
    planning.rewardCohortRoundId,
    'current reward cohort round id',
  );
  const reusableThroughCohortRoundId =
    currentCohortRoundId - 2;

  if (reusableThroughCohortRoundId < 1) {
    return {
      generatedAt: new Date().toISOString(),
      network: pool.network,
      appId: pool.appId,
      writesPerformed: false,
      transfersPerformed: false,
      result: calculateRewardBoostReserveShadow({
        currentCohortRoundId,
        currentRewardWei: planning.forecast.rewardPerInviteWei,
        observedPoolBalanceWei: pool.effectiveRewardPoolWei,
        reservedExistingWei: planning.reservedExistingWei,
        cohorts: [],
      }),
    };
  }

  const maxFundingRoundId =
    reusableThroughCohortRoundId - 1;

  const [allocationResult, adjustmentResult, invitationResult] =
    await Promise.all([
      supabaseAdmin
        .from('vebetter_round_allocations')
        .select(
          'id, vebetter_round_id, rewards_allocation_amount_wei',
        )
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .lte('vebetter_round_id', maxFundingRoundId)
        .order('vebetter_round_id', { ascending: true }),
      supabaseAdmin
        .from('reward_cohort_funding_adjustments')
        .select(
          'reward_cohort_round_id, allocation_receipt_id, adjustment_type, amount_wei',
        )
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .eq('adjustment_type', 'PROMOTION')
        .lte(
          'reward_cohort_round_id',
          reusableThroughCohortRoundId,
        ),
      supabaseAdmin
        .from('invitations')
        .select(
          'reward_cohort_round_id, reward_funding_allocation_receipt_id, apps_completed, vot3_converted, vote_completed, sybil_status',
        )
        .eq('activation_network', pool.network)
        .in('status', ['ACTIVATING', 'UNDER_REVIEW'])
        .lte(
          'reward_cohort_round_id',
          reusableThroughCohortRoundId,
        ),
    ]);

  if (allocationResult.error) {
    throw new Error(
      `Reward boost reserve allocations could not be loaded: ${allocationResult.error.message}`,
    );
  }
  if (adjustmentResult.error) {
    throw new Error(
      `Reward boost reserve funding adjustments could not be loaded: ${adjustmentResult.error.message}`,
    );
  }
  if (invitationResult.error) {
    throw new Error(
      `Reward boost reserve late participants could not be loaded: ${invitationResult.error.message}`,
    );
  }

  const allocations =
    (allocationResult.data ?? []) as AllocationRow[];
  const adjustments =
    (adjustmentResult.data ?? []) as FundingAdjustmentRow[];
  const invitations =
    (invitationResult.data ?? []) as InvitationRow[];

  const promotionByReceipt = new Map<string, bigint>();
  for (const row of adjustments) {
    const receiptId = integerString(
      row.allocation_receipt_id,
      'funding adjustment allocation receipt id',
    );
    const amount = BigInt(
      integerString(row.amount_wei, 'funding adjustment amount'),
    );
    promotionByReceipt.set(
      receiptId,
      (promotionByReceipt.get(receiptId) ?? 0n) + amount,
    );
  }

  const lateByReceipt = new Map<
    string,
    RewardBoostReserveCohortInput['lateParticipants']
  >();

  for (const row of invitations) {
    if (
      row.reward_funding_allocation_receipt_id === null ||
      row.reward_cohort_round_id === null ||
      row.sybil_status === 'BLOCKED'
    ) {
      continue;
    }

    const receiptId = integerString(
      row.reward_funding_allocation_receipt_id,
      'late participant allocation receipt id',
    );
    const participants = lateByReceipt.get(receiptId) ?? [];
    participants.push({
      appsCompleted: nonNegativeCount(
        row.apps_completed,
        'late participant apps completed',
      ),
      vot3Converted: row.vot3_converted === true,
      voteCompleted: row.vote_completed === true,
    });
    lateByReceipt.set(receiptId, participants);
  }

  const cohorts = await Promise.all(
    allocations.map(async (allocation): Promise<RewardBoostReserveCohortInput> => {
      const allocationReceiptId = integerString(
        allocation.id,
        'allocation receipt id',
      );
      const rewardCohortRoundId =
        positiveInteger(
          allocation.vebetter_round_id,
          'VeBetter funding round id',
        ) + 1;

      const { data, error } = await supabaseAdmin.rpc(
        'read_reward_cohort_committed_wei',
        {
          p_network: pool.network,
          p_app_id: pool.appId,
          p_reward_cohort_round_id: rewardCohortRoundId,
          p_allocation_receipt_id: allocationReceiptId,
        },
      );

      if (error) {
        throw new Error(
          `Reward boost reserve cohort commitment could not be loaded for cohort ${rewardCohortRoundId}: ${error.message}`,
        );
      }

      return {
        rewardCohortRoundId,
        allocationReceiptId,
        officialAllocationWei: integerString(
          allocation.rewards_allocation_amount_wei,
          'official allocation amount',
        ),
        promotionFundingWei:
          (promotionByReceipt.get(allocationReceiptId) ?? 0n).toString(),
        committedWei: integerString(
          data,
          'reward cohort committed amount',
        ),
        lateParticipants:
          lateByReceipt.get(allocationReceiptId) ?? [],
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    network: pool.network,
    appId: pool.appId,
    writesPerformed: false,
    transfersPerformed: false,
    result: calculateRewardBoostReserveShadow({
      currentCohortRoundId,
      currentRewardWei: planning.forecast.rewardPerInviteWei,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      reservedExistingWei: planning.reservedExistingWei,
      cohorts,
    }),
  };
}
