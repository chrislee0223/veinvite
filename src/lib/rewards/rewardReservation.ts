import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { readVeInviteRewardPoolStatus, VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { readStagedAdmissionFundingStatus } from '@/lib/rewards/readStagedAdmissionFundingStatus';
import { shouldReadRewardAdmissionShadow, compareRewardAdmissionShadow } from '@/lib/rewards/rewardAdmissionShadowParity';
import { readRewardRuntimeSafety } from '@/lib/rewards/runtimeSafety';
import { withRewardReservationSweepLock } from '@/lib/rewards/reservationSweepLock';
import { readReadyVoteRoundBatchRepresentatives, tryReserveVoteRoundBatch } from '@/lib/rewards/voteRoundCloseReservation';
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

type LateRewardQuote = {
  protectionId: string;
  amountWei: string;
  sourceRewardCohortRoundId: string;
  sourceAllocationReceiptId: string;
  baselineEffectiveBudgetWei: string;
  baselineCommittedWei: string;
  promotionReserveWei: string;
  lateWeightedLiabilityWei: string;
  sourceRevision: string;
  policyVersion: string;
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
  // Price-consistency refusals are retried by the durable cron, not hot Queue loops.
  pricingConflictInviteCodes: string[];
};

export type RewardReservationLiveness = {
  missingCount: number;
  oldestRewardEligibleAt: string | null;
  inviteCodes: string[];
};

const MAX_RESERVATIONS_PER_SWEEP = 25;
const MAX_REPRICE_ATTEMPTS = 4;

function emptySweepResult(): RewardReservationSweepResult {
  return {
    attempted: 0,
    reserved: 0,
    awaitingFinality: 0,
    skipped: 0,
    pricingConflictInviteCodes: [],
  };
}

async function rewardReservationRuntimeOpen(network: string): Promise<boolean> {
  const runtime = await readRewardRuntimeSafety();

  if (runtime.emergencyRewardsPaused) {
    return false;
  }

  if (
    network === 'mainnet' &&
    !runtime.mainnetFundedRewardsEnabled
  ) {
    return false;
  }

  return true;
}

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

type AdmissionHold = {
  status: 'NONE' | 'HELD' | 'CONVERTED' | 'RELEASED';
  admissionEnabled: boolean;
  guaranteedWei: string | null;
  cohortRoundId: string | null;
  allocationReceiptId: string | null;
};

/**
 * The only live completion writer for a HELD invite is the atomic handoff.
 * A service-gateway error or unexpected state MUST stop this candidate;
 * falling through to the legacy writer would create two obligations.
 */
async function readAdmissionHoldForCompletion(
  network: string,
  inviteCode: string,
  expectedCohort: string,
  expectedReceipt: string,
): Promise<AdmissionHold> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_admission_hold_for_reservation_v1',
    { p_network: network, p_invite_code: inviteCode },
  );
  if (error) {
    throw new Error('Admission hold status could not be verified: ' + error.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Admission hold reader returned malformed data.');
  }
  const v = data as Record<string, unknown>;
  if (typeof v.admissionEnabled !== 'boolean' ||
      !['NONE','HELD','CONVERTED','RELEASED'].includes(String(v.status))) {
    throw new Error('Admission hold reader returned invalid policy or state.');
  }
  if (v.status === 'NONE') {
    return {
      status: 'NONE',
      admissionEnabled: v.admissionEnabled,
      guaranteedWei: null,
      cohortRoundId: null,
      allocationReceiptId: null,
    };
  }
  const exactWei = String(v.guaranteedWei ?? '');
  const cohortRoundId = String(v.cohortRoundId ?? '');
  const allocationReceiptId = String(v.allocationReceiptId ?? '');
  if (!/^[1-9]\d*$/.test(exactWei) ||
      cohortRoundId !== expectedCohort ||
      allocationReceiptId !== expectedReceipt) {
    throw new Error('Admission hold funding identity or exact Wei mismatch.');
  }
  return {
    status: v.status as AdmissionHold['status'],
    admissionEnabled: v.admissionEnabled,
    guaranteedWei: exactWei,
    cohortRoundId,
    allocationReceiptId,
  };
}

function nonNegativeWeiString(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

async function readLateRewardQuote(
  network: string,
  inviteCode: string,
): Promise<LateRewardQuote | null> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_boost_reserve_late_quote',
    {
      p_network: network,
      p_invite_code: inviteCode,
    },
  );

  if (error) {
    throw new Error(
      `Late reward protection quote could not be loaded: ${error.message}`,
    );
  }

  if (data === null || data === undefined) {
    return null;
  }

  if (
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'Late reward protection quote is malformed.',
    );
  }

  const row = data as Record<string, unknown>;
  const sourceRevision = String(
    row.sourceRevision ?? '',
  ).trim();
  const policyVersion = String(
    row.policyVersion ?? '',
  ).trim();

  if (!sourceRevision || !policyVersion) {
    throw new Error(
      'Late reward protection metadata is malformed.',
    );
  }

  return {
    protectionId: positiveId(
      String(row.protectionId ?? ''),
      'late reward protection id',
    ),
    amountWei: nonNegativeWeiString(
      row.amountWei,
      'late reward amount',
    ),
    sourceRewardCohortRoundId: positiveId(
      String(row.sourceRewardCohortRoundId ?? ''),
      'late reward cohort round id',
    ),
    sourceAllocationReceiptId: positiveId(
      String(row.sourceAllocationReceiptId ?? ''),
      'late reward allocation receipt id',
    ),
    baselineEffectiveBudgetWei: nonNegativeWeiString(
      row.baselineEffectiveBudgetWei,
      'late reward baseline budget',
    ),
    baselineCommittedWei: nonNegativeWeiString(
      row.baselineCommittedWei,
      'late reward baseline commitment',
    ),
    promotionReserveWei: nonNegativeWeiString(
      row.promotionReserveWei,
      'late reward promotion reserve',
    ),
    lateWeightedLiabilityWei: nonNegativeWeiString(
      row.lateWeightedLiabilityWei,
      'late reward weighted liability',
    ),
    sourceRevision,
    policyVersion,
  };
}

function skipCandidate(
  candidate: ReservationCandidate,
  reason: string,
  details: Record<string, unknown> = {},
): 'skipped' | 'pricing_conflict' {
  console.warn(
    'Reward reservation candidate skipped:',
    {
      inviteCode: candidate.invite_code,
      reason,
      ...details,
    },
  );
  return reason === 'REPRICE_EXHAUSTED'
    ? 'pricing_conflict'
    : 'skipped';
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

  const legacy = Array.isArray(data) ? (data as ReservationCandidate[]) : [];
  // New completion rounds must make progress independently of old entries
  // saturating the legacy global limit. Uniqueness prevents double attempts.
  const futureRounds = await readReadyVoteRoundBatchRepresentatives(network);
  const seen = new Set<string>();
  return [...futureRounds, ...legacy].filter((candidate) => {
    if (seen.has(candidate.invite_code)) return false;
    seen.add(candidate.invite_code);
    return true;
  });
}

export async function readStaleEligibleRewardReservationLiveness(
  staleMinutes = 15,
): Promise<RewardReservationLiveness> {
  if (
    !Number.isSafeInteger(staleMinutes) ||
    staleMinutes < 5 ||
    staleMinutes > 1440
  ) {
    throw new Error(
      'Reward reservation liveness threshold must be 5-1440 minutes.',
    );
  }

  const runtime =
    await readRewardRuntimeSafety();

  if (runtime.emergencyRewardsPaused) {
    return {
      missingCount: 0,
      oldestRewardEligibleAt: null,
      inviteCodes: [],
    };
  }

  const { network } =
    getVeBetterNetworkConfig();
  const { data, error } =
    await supabaseAdmin.rpc(
      'read_stale_reward_reservation_liveness',
      {
        p_network: network,
        p_stale_minutes: staleMinutes,
      },
    );

  if (error) {
    throw new Error(
      `Reward reservation liveness could not be read: ${error.message}`,
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !== 'object'
  ) {
    throw new Error(
      'Reward reservation liveness returned malformed data.',
    );
  }

  const record =
    row as Record<string, unknown>;
  const missingCount =
    Number(record.missing_count);

  if (
    !Number.isSafeInteger(missingCount) ||
    missingCount < 0
  ) {
    throw new Error(
      'Reward reservation liveness returned an invalid count.',
    );
  }

  const oldest =
    record.oldest_reward_eligible_at;
  const inviteCodes =
    Array.isArray(record.invite_codes)
      ? record.invite_codes.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

  return {
    missingCount,
    oldestRewardEligibleAt:
      typeof oldest === 'string' &&
      !Number.isNaN(Date.parse(oldest))
        ? oldest
        : null,
    inviteCodes,
  };
}

async function reserveCandidate({
  candidate,
  network,
  finalizedBlock,
}: {
  candidate: ReservationCandidate;
  network: string;
  finalizedBlock: number;
}): Promise<'reserved' | 'awaiting_finality' | 'skipped' | 'pricing_conflict'> {
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

  const repriceResponses: ReservationRpcResult[] = [];
  let lastExpectedCohortCommittedWei: string | null = null;
  let lastExpectedOutstandingWei: string | null = null;
  for (let attempt = 0; attempt < MAX_REPRICE_ATTEMPTS; attempt += 1) {
    // Emergency pause and the mainnet funded-reward gate apply to creation of
    // new immutable reward liabilities as well as token settlement. Re-read
    // the runtime gate for every pricing attempt so a pause activated during a
    // sweep stops the next reservation instead of waiting for the sweep to end.
    if (!(await rewardReservationRuntimeOpen(network))) {
      return skipCandidate(
        candidate,
        'RUNTIME_CLOSED',
      );
    }

    // Financial authority is cohort-scoped. The public estimate is not trusted
    // here; the live pool and the exact funding receipt bound at onboarding are
    // re-read immediately before the immutable completion-time reservation.
    const pool = await readVeInviteRewardPoolStatus();
    if (pool.network !== network || pool.appId !== VEINVITE_APP_ID) {
      throw new Error('Reward reservation pool identity mismatch.');
    }

    if (pool.distributionPaused) {
      return skipCandidate(
        candidate,
        'POOL_DISTRIBUTION_PAUSED',
      );
    }

    const roundClose = await tryReserveVoteRoundBatch({
      inviteCode: candidate.invite_code,
      network,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      finalizedBlock,
    });
    if (roundClose.kind === 'RESERVED') return 'reserved';
    if (roundClose.kind === 'WAITING') {
      return skipCandidate(candidate, 'VOTE_ROUND_CLOSE_WAITING', {
        reason: roundClose.reason,
      });
    }

    // Shared physical-pool reservations are priced and committed atomically
    // inside PostgreSQL under the existing network financial lock.
    // The staging setting is OFF by default; legacy pricing is untouched
    // until the reviewed cutover is explicitly activated.
    const { data: sharedMode, error: sharedModeError } = await supabaseAdmin.rpc(
      'read_reward_shared_pool_mode_v1',
      { p_network: network },
    );
    if (sharedModeError || !sharedMode || typeof sharedMode !== 'object' ||
        Array.isArray(sharedMode) ||
        typeof (sharedMode as Record<string, unknown>).enabled !== 'boolean') {
      throw new Error('Shared reward mode cannot be verified: ' +
        (sharedModeError?.message ?? 'malformed mode'));
    }
    if ((sharedMode as { enabled: boolean }).enabled) {
      const { data: sharedRaw, error: sharedError } = await supabaseAdmin.rpc(
        'commit_reward_shared_pool_v1',
        {
          p_invite_code: candidate.invite_code,
          p_network: network,
          p_observed_pool_balance_wei: pool.effectiveRewardPoolWei,
          p_observed_at: new Date().toISOString(),
          p_finalized_block: finalizedBlock,
        },
      );
      if (sharedError) {
        throw new Error('Atomic shared-pool reservation failed: ' +
          sharedError.message);
      }
      const shared = readRpcResult(sharedRaw);
      const mode = String((sharedRaw as Record<string, unknown>).mode ?? '');
      if (mode === 'SHARED_RESERVED' && shared.reserved === true) {
        return 'reserved';
      }
      if (shared.reason === 'RECALCULATE') {
        repriceResponses.push(shared);
        continue;
      }
      if (shared.reason === 'AWAITING_FINALITY') return 'awaiting_finality';
      if (mode === 'DEFER' || mode === 'BLOCKED' ||
          mode === 'SHARED_REJECTED') {
        return skipCandidate(candidate, 'SHARED_POOL_DEFERRED', {
          reason: shared.reason ?? mode,
        });
      }
      throw new Error('Unrecognized shared-pool settlement mode: ' + mode);
    }

    const planning = await readPredictiveRewardPlanning({
      network,
      appId: VEINVITE_APP_ID,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      rewardCohortRoundId,
      allocationReceiptId,
      // A pending invite has no verified entry round yet. Once a specific
      // completed referral is being priced, unbound pending invites from a
      // newer round must never dilute this already-bound cohort.
      includePendingAcceptance: false,
    });

    if (!planning.latestAllocation || !planning.forecast || !planning.rewardCohortRoundId) {
      return skipCandidate(
        candidate,
        'PLANNING_UNAVAILABLE',
      );
    }

    if (
      planning.latestAllocation.id !== allocationReceiptId ||
      planning.rewardCohortRoundId !== rewardCohortRoundId
    ) {
      throw new Error('Reward reservation cohort planning mismatch.');
    }

    // Read-only bridge rehearsal in the isolated Preview database, opt-in only.
    // This never authorizes, replaces, delays on failure, or changes the legacy
    // reservation, Claim, Sybil or X payout paths.
    if (
      attempt === 0 &&
      shouldReadRewardAdmissionShadow(network, process.env)
    ) {
      try {
        const shadow = await readStagedAdmissionFundingStatus({
          network,
          appId: VEINVITE_APP_ID,
          cohortRoundId: rewardCohortRoundId,
          receiptId: allocationReceiptId,
        });
        const parity = compareRewardAdmissionShadow(shadow, {
          reservedExistingWei: planning.reservedExistingWei,
          cohortReservedWei: planning.cohortReservedWei,
        });
        if (parity.status !== 'MATCH') {
          console.warn('Preview reward admission shadow disagreed with canonical planning:', {
            rewardCohortRoundId,
            allocationReceiptId,
            status: parity.status,
            fields: parity.mismatches,
          });
        }
      } catch (shadowError) {
        // A diagnostic must never veto a legitimate existing Claim reservation.
        console.warn('Preview reward admission shadow unavailable:', {
          rewardCohortRoundId,
          allocationReceiptId,
          reason: shadowError instanceof Error ? shadowError.message : 'UNKNOWN',
        });
      }
    }

    lastExpectedCohortCommittedWei = planning.cohortReservedWei;
    lastExpectedOutstandingWei = planning.reservedExistingWei;

    const admission = await readAdmissionHoldForCompletion(
      network, candidate.invite_code, rewardCohortRoundId, allocationReceiptId,
    );
    if (admission.status === 'CONVERTED' ||
        admission.status === 'RELEASED') {
      return skipCandidate(candidate, 'ADMISSION_ALREADY_FINAL');
    }
    if (admission.status === 'HELD' && !admission.admissionEnabled) {
      // Do not fall back to legacy when a monetary guarantee exists.
      return skipCandidate(candidate, 'ADMISSION_HANDOFF_DISABLED');
    }

    const lateQuote = await readLateRewardQuote(
      network,
      candidate.invite_code,
    );

    if (
      lateQuote &&
      (
        lateQuote.sourceRewardCohortRoundId !==
          rewardCohortRoundId ||
        lateQuote.sourceAllocationReceiptId !==
          allocationReceiptId
      )
    ) {
      throw new Error(
        'Late reward protection cohort mismatch.',
      );
    }

    const quotedAmountWei =
      lateQuote?.amountWei ??
      planning.forecast.rewardPerInviteWei;
    // Gross completion promise can never fall below an existing HELD floor.
    // The atomic SQL writer rechecks both cohort and physical collateral.
    const amountWei = admission.status === 'HELD' &&
      BigInt(admission.guaranteedWei!) > BigInt(quotedAmountWei)
      ? admission.guaranteedWei!
      : quotedAmountWei;
    if (BigInt(amountWei) <= 0n) {
      return skipCandidate(
        candidate,
        'NON_POSITIVE_REWARD',
      );
    }

    const basis = {
      quoteKind: lateQuote
        ? 'late_completion_protected_v1'
        : 'completion_fixed_reservation_v2_cohort',
      rewardCohortRoundId,
      fundingAllocationReceiptId: allocationReceiptId,
      fundingAllocationRoundId: planning.latestAllocation.veBetterRoundId,
      officialAllocationWei: planning.latestAllocation.rewardsAllocationWei,
      fundingAdjustmentWei: planning.fundingAdjustmentWei,
      reserveNetFlowWei: planning.reserveNetFlowWei,
      designatedBudgetWei: planning.designatedBudgetWei,
      cohortReservedWei: planning.cohortReservedWei,
      observedPoolBalanceWei: pool.effectiveRewardPoolWei,
      reservedExistingWei: planning.reservedExistingWei,
      availablePoolWei: planning.forecast.availablePoolWei,
      pricingBasisWei: planning.forecast.pricingBasisWei,
      expectedCompletions: planning.forecast.expectedCompletions,
      stressCompletions: planning.forecast.stressCompletions,
      historyRecipientFloor: planning.forecast.historyRecipientFloor,
      pipeline: planning.forecast.pipeline,
      lateCompletionProtection: lateQuote
        ? {
            protectionId: lateQuote.protectionId,
            protectedAmountWei: lateQuote.amountWei,
            baselineEffectiveBudgetWei:
              lateQuote.baselineEffectiveBudgetWei,
            baselineCommittedWei:
              lateQuote.baselineCommittedWei,
            promotionReserveWei:
              lateQuote.promotionReserveWei,
            lateWeightedLiabilityWei:
              lateQuote.lateWeightedLiabilityWei,
            sourceRevision:
              lateQuote.sourceRevision,
            policyVersion:
              lateQuote.policyVersion,
          }
        : null,
      admissionHandoff:
        admission.status === 'HELD'
          ? { guaranteedMinimumWei: admission.guaranteedWei,
              policy: 'atomic-held-to-fixed-v1' }
          : null,
      completionPosition: {
        block: completionBlock,
        txIndex: candidate.completion_tx_index,
        clauseIndex: candidate.completion_clause_index,
      },
    };

    // NEW COHORTS ONLY: at official cohort closure, the database computes
    // the *actual* equitable award under the same canonical pool lock as
    // Claim and X. While old invites/unfinished participants remain, it
    // defers instead of spending funds intended for unresolved recipients.
    // SQL defaults disabled; old claims and protected late quotes preserve
    // their existing payout route unchanged.
    if (
      process.env.VEINVITE_ELASTIC_COHORT_ENABLED === 'true' &&
      admission.status === 'NONE' && lateQuote === null
    ) {
      const { data: elasticRaw, error: elasticError } = await supabaseAdmin.rpc(
        'commit_reward_elastic_closed_cohort_v1',
        {
          p_invite_code: candidate.invite_code,
          p_network: network,
          p_observed_pool_balance_wei: pool.effectiveRewardPoolWei,
          p_observed_at: new Date().toISOString(),
          p_finalized_block: finalizedBlock,
          p_legacy_amount_wei: amountWei,
          p_basis: basis,
        },
      );
      if (elasticError) {
        throw new Error('Atomic elastic cohort reservation failed: ' +
          elasticError.message);
      }
      if (!elasticRaw || typeof elasticRaw !== 'object' ||
          Array.isArray(elasticRaw)) {
        throw new Error('Atomic elastic cohort result is malformed.');
      }
      const elastic = elasticRaw as Record<string,unknown>;
      if (elastic.mode === 'DEFER') {
        return skipCandidate(candidate, 'ELASTIC_COHORT_NOT_FINAL', {
          reason: String(elastic.reason ?? 'UNKNOWN'),
        });
      }
      if (elastic.mode === 'BLOCKED') {
        return skipCandidate(candidate, 'ELASTIC_FINANCIAL_GUARD', {
          reason: String(elastic.reason ?? 'UNKNOWN'),
        });
      }
      if (elastic.mode === 'ELASTIC') {
        const result = readRpcResult(elastic);
        if (result.reserved === true) return 'reserved';
        if (result.reason === 'RECALCULATE') {
          repriceResponses.push(result);
          continue;
        }
        if (result.reason === 'AWAITING_FINALITY') return 'awaiting_finality';
        return skipCandidate(candidate, 'ELASTIC_CANONICAL_REJECTED', {
          reason: result.reason ?? 'UNKNOWN',
        });
      }
      if (elastic.mode !== 'LEGACY') {
        throw new Error('Unknown elastic settlement authority response.');
      }
    }

    const { data, error } = await supabaseAdmin.rpc(
      admission.status === 'HELD'
        ? 'commit_reward_admission_held_to_fixed_v1'
        : 'commit_reward_reservation_with_late_reserve',
      {
        p_invite_code: candidate.invite_code,
        p_network: network,
        p_observed_pool_balance_wei: pool.effectiveRewardPoolWei,
        p_expected_reserved_before_wei: planning.reservedExistingWei,
        p_amount_wei: amountWei,
        p_algorithm_version: lateQuote
          ? 'reward-boost-late-protection-v1'
          : planning.forecast.algorithmVersion,
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
      // Preserve the DB refusal details so REPRICE_EXHAUSTED is actionable.
      repriceResponses.push(result);
      continue;
    }
    if (result.reason === 'AWAITING_FINALITY') {
      return 'awaiting_finality';
    }
    if (result.reason === 'RESERVE_UNDERFUNDED') {
      return skipCandidate(
        candidate,
        'RESERVE_UNDERFUNDED',
        {
          // This referral remains eligible and will be retried by the normal
          // recovery sweep after the reserve bank receives more funding.
          rpcReason: result.reason,
        },
      );
    }
    return skipCandidate(
      candidate,
      'RPC_NOT_RESERVED',
      {
        rpcReason:
          result.reason ?? 'UNKNOWN',
      },
    );
  }

  return skipCandidate(
    candidate,
    'REPRICE_EXHAUSTED',
    {
      priceAttempts: repriceResponses.length,
      expectedCohortCommittedWei: lastExpectedCohortCommittedWei,
      expectedOutstandingWei: lastExpectedOutstandingWei,
      lastRpcResponse: repriceResponses.at(-1) ?? null,
    },
  );
}

/**
 * Reconcile terminal Sybil/cancelled HELD guarantees before planning the next
 * completion. No payout or inviter cancellation occurs in this worker.
 * The DB function serializes with admission and Claim under financial locks.
 */
async function releaseTerminalAdmissionHolds(network: string): Promise<void> {
  if (process.env.VEINVITE_ADMISSION_GUARANTEE_ENABLED !== 'true') return;
  const { data, error } = await supabaseAdmin.rpc(
    'release_terminal_reward_admission_held_v1',
    { p_network: network, p_limit: 25 },
  );
  if (error) {
    throw new Error('Terminal HELD release could not be verified: ' + error.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Terminal HELD release returned malformed data.');
  }
  const result = data as Record<string, unknown>;
  if (result.reason === 'ADMISSION_RELEASE_DISABLED') return;
  const released = Number(result.released);
  const releasedWei = String(result.releasedWei ?? '');
  const skippedFixed = Number(result.skippedFixed);
  if (result.reason !== 'TERMINAL_HELD_SWEEP_COMPLETE' ||
      !Number.isSafeInteger(released) || released < 0 || released > 25 ||
      !Number.isSafeInteger(skippedFixed) || skippedFixed < 0 ||
      !/^\d+$/.test(releasedWei)) {
    throw new Error('Terminal HELD release violated exact accounting contract.');
  }
  if (released > 0 || skippedFixed > 0) {
    console.info('Terminal admission guarantees reconciled:', {
      released, releasedWei, skippedFixed,
    });
  }
}

export async function reserveEligibleReferralRewards(): Promise<RewardReservationSweepResult> {
  const { network } = getVeBetterNetworkConfig();

  // Fast fail-closed check before touching chain state or loading candidates.
  // reserveCandidate() repeats this check immediately before each quote so a
  // pause that flips during a sweep also takes effect without delay.
  if (!(await rewardReservationRuntimeOpen(network))) {
    return emptySweepResult();
  }

  return withRewardReservationSweepLock(
    network,
    async () => {
  await releaseTerminalAdmissionHolds(network);
  const finalizedBlock = await readFinalizedBlockNumber();
  const candidates = await loadCandidates(network);

  const result: RewardReservationSweepResult = {
    attempted: candidates.length,
    reserved: 0,
    awaitingFinality: 0,
    skipped: 0,
    pricingConflictInviteCodes: [],
  };

  // Actual chain completion order remains the fairness ordering. Sequential
  // processing makes every quote see earlier reservations from the same sweep.
  for (const candidate of candidates) {
    const outcome = await reserveCandidate({ candidate, network, finalizedBlock });
    if (outcome === 'reserved') result.reserved += 1;
    else if (outcome === 'awaiting_finality') result.awaitingFinality += 1;
    else {
      result.skipped += 1;
      if (outcome === 'pricing_conflict') {
        result.pricingConflictInviteCodes.push(candidate.invite_code);
      }
    }
  }

  return result;
    },
    emptySweepResult,
  );
}
