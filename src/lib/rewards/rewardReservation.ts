import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { readVeInviteRewardPoolStatus, VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

type ReservationCandidate = {
  invite_code: string;
  completion_block: string | number;
  completion_tx_index: number;
  completion_clause_index: number;
  reward_cohort_round_id: string | number;
  reward_funding_allocation_receipt_id: string | number;
};

type ReservationRpcResult = {
  reserved?: boolean;
  reason?: string;
  inviteCode?: string;
  amountWei?: string;
  reservedAt?: string;
};

export type RewardReservationSweepResult = {
  attempted: number;
  reserved: number;
  awaitingFinality: number;
  skipped: number;
};

const MAX_RESERVATIONS_PER_SWEEP = 25;
const MAX_REPRICE_ATTEMPTS = 4;

function safeBlock(value: string | number, fieldName: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return parsed;
}

function positiveId(value: string | number, fieldName: string): string {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function readRpcResult(value: unknown): ReservationRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Reward reservation returned malformed data.');
  }
  return value as ReservationRpcResult;
}

async function readFinalizedBlockNumber(): Promise<number> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const finalized = await thor.blocks.getBlockCompressed('finalized');

  if (!finalized) {
    throw new Error('VeChain finalized block is unavailable.');
  }

  const number = Number(finalized.number);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('VeChain finalized block number is invalid.');
  }
  return number;
}

async function loadCandidates(network: string): Promise<ReservationCandidate[]> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_reservation_candidates_v2',
    {
      p_network: network,
      p_limit: MAX_RESERVATIONS_PER_SWEEP,
    },
  );

  if (error) {
    throw new Error(`Reward reservation candidates could not be loaded: ${error.message}`);
  }

  return Array.isArray(data) ? (data as ReservationCandidate[]) : [];
}

async function reserveCandidate({
  candidate,
  network,
  finalizedBlock,
}: {
  candidate: ReservationCandidate;
  network: string;
  finalizedBlock: number;
}): Promise<'reserved' | 'awaiting_finality' | 'skipped'> {
  const completionBlock = safeBlock(
    candidate.completion_block,
    'reservation completion block',
  );
  const rewardCohortRoundId = positiveId(
    candidate.reward_cohort_round_id,
    'reward cohort round id',
  );
  const allocationReceiptId = positiveId(
    candidate.reward_funding_allocation_receipt_id,
    'reward funding allocation receipt id',
  );

  if (completionBlock > finalizedBlock) {
    return 'awaiting_finality';
  }

  for (let attempt = 0; attempt < MAX_REPRICE_ATTEMPTS; attempt += 1) {
    // Financial authority is cohort-scoped. The public estimate is not trusted
    // here; the live pool and the exact funding receipt bound at onboarding are
    // re-read immediately before the immutable completion-time reservation.
    const pool = await readVeInviteRewardPoolStatus();
    if (pool.network !== network || pool.appId !== VEINVITE_APP_ID) {
      throw new Error('Reward reservation pool identity mismatch.');
    }

    if (pool.distributionPaused) {
      return 'skipped';
    }

    const planning = await readPredictiveRewardPlanning({
      network,
      appId: VEINVITE_APP_ID,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      rewardCohortRoundId,
      allocationReceiptId,
    });

    if (!planning.latestAllocation || !planning.forecast || !planning.rewardCohortRoundId) {
      return 'skipped';
    }

    if (
      planning.latestAllocation.id !== allocationReceiptId ||
      planning.rewardCohortRoundId !== rewardCohortRoundId
    ) {
      throw new Error('Reward reservation cohort planning mismatch.');
    }

    const amountWei = planning.forecast.rewardPerInviteWei;
    if (BigInt(amountWei) <= 0n) {
      return 'skipped';
    }

    const basis = {
      quoteKind: 'completion_fixed_reservation_v2_cohort',
      rewardCohortRoundId,
      fundingAllocationReceiptId: allocationReceiptId,
      fundingAllocationRoundId: planning.latestAllocation.veBetterRoundId,
      officialAllocationWei: planning.latestAllocation.rewardsAllocationWei,
      fundingAdjustmentWei: planning.fundingAdjustmentWei,
      designatedBudgetWei: planning.designatedBudgetWei,
      cohortReservedWei: planning.cohortReservedWei,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      reservedExistingWei: planning.reservedExistingWei,
      availablePoolWei: planning.forecast.availablePoolWei,
      pricingBasisWei: planning.forecast.pricingBasisWei,
      expectedCompletions: planning.forecast.expectedCompletions,
      stressCompletions: planning.forecast.stressCompletions,
      pipeline: planning.forecast.pipeline,
      completionPosition: {
        block: completionBlock,
        txIndex: candidate.completion_tx_index,
        clauseIndex: candidate.completion_clause_index,
      },
    };

    const { data, error } = await supabaseAdmin.rpc(
      'commit_reward_reservation',
      {
        p_invite_code: candidate.invite_code,
        p_network: network,
        p_observed_pool_balance_wei: pool.effectiveRewardPoolWei,
        p_expected_reserved_before_wei: planning.reservedExistingWei,
        p_amount_wei: amountWei,
        p_algorithm_version: planning.forecast.algorithmVersion,
        p_quote_snapshot_id: null,
        p_finalized_block: finalizedBlock,
        p_basis: basis,
      },
    );

    if (error) {
      throw new Error(`Reward reservation failed: ${error.message}`);
    }

    const result = readRpcResult(data);
    if (result.reserved === true) {
      return 'reserved';
    }
    if (result.reason === 'RECALCULATE') {
      continue;
    }
    if (result.reason === 'AWAITING_FINALITY') {
      return 'awaiting_finality';
    }
    return 'skipped';
  }

  return 'skipped';
}

export async function reserveEligibleReferralRewards(): Promise<RewardReservationSweepResult> {
  const { network } = getVeBetterNetworkConfig();
  const finalizedBlock = await readFinalizedBlockNumber();
  const candidates = await loadCandidates(network);

  const result: RewardReservationSweepResult = {
    attempted: candidates.length,
    reserved: 0,
    awaitingFinality: 0,
    skipped: 0,
  };

  // Actual chain completion order remains the fairness ordering. Sequential
  // processing makes every quote see earlier reservations from the same sweep.
  for (const candidate of candidates) {
    const outcome = await reserveCandidate({ candidate, network, finalizedBlock });
    if (outcome === 'reserved') result.reserved += 1;
    else if (outcome === 'awaiting_finality') result.awaitingFinality += 1;
    else result.skipped += 1;
  }

  return result;
}
