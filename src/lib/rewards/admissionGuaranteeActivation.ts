import 'server-only';

import { ThorClient } from '@vechain/sdk-network';
import { readVeInviteRewardPoolStatus, VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { readPredictiveRewardPlanning } from '@/lib/rewards/predictivePlanning';
import { evaluateAdmissionPreflight } from '@/lib/rewards/rewardAdmissionPreflight';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const EXACT_WEI = /^(0|[1-9]\d*)$/;

function configuredPositiveWei(value: string | undefined): string | null {
  if (!value || !EXACT_WEI.test(value) || BigInt(value) <= 0n) return null;
  return BigInt(value).toString();
}
function positiveId(value: unknown): string | null {
  const s = String(value ?? '');
  return /^[1-9]\d*$/.test(s) ? s : null;
}

// Prevent guarantees being silently assigned to historical unpaid invites.
export function getAdmissionRolloutStart(): string | null {
  const value = process.env.VEINVITE_ADMISSION_ROLLOUT_NOT_BEFORE;
  if (!value || !/^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$/.test(value)) {
    return null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= Date.now() ? value : null;
}

/**
 * Called only AFTER an immutable, accepted wallet/entry-proof transaction.
 * It does not change the claim outcome and never promises an uncommitted quote.
 *
 * Activation requires ALL THREE independent opt-ins:
 *  1. Server-only feature flag, 2. configured minimum+stress policy,
 *  3. SQL admission settings.enabled=true (currently prohibited by CHECK).
 *
 * The underlying SQL writer rechecks funding, locks, Sybil, finality,
 * duplicate queue/recovery, and exact accounting atomically.
 */
export async function maybeReserveFundedReferralMinimumAfterActivation(input: {
  inviteCode: string;
  network: string;
}): Promise<'DISABLED' | 'NOT_READY' | 'BLOCKED' | 'HELD'> {
  if (process.env.VEINVITE_ADMISSION_GUARANTEE_ENABLED !== 'true') {
    return 'DISABLED';
  }
  const minimum = configuredPositiveWei(
    process.env.VEINVITE_ADMISSION_GUARANTEE_MINIMUM_WEI,
  );
  const stress = configuredPositiveWei(
    process.env.VEINVITE_ADMISSION_STRESS_BUFFER_WEI,
  );
  if (!minimum || !stress) {
    // Never infer a financial promise from an unconfigured forecast.
    return 'NOT_READY';
  }
  const rollout = getAdmissionRolloutStart();
  if (!rollout) return 'NOT_READY';

  const networkConfig = getVeBetterNetworkConfig();
  if (input.network !== networkConfig.network
    || !/^[A-Z0-9-]{6,48}$/.test(input.inviteCode)) {
    return 'BLOCKED';
  }

  const { data: holdStatus, error: holdError } = await supabaseAdmin.rpc(
    'read_reward_admission_hold_for_reservation_v1',
    { p_network: input.network, p_invite_code: input.inviteCode },
  );
  if (holdError || !holdStatus || typeof holdStatus !== 'object'
      || Array.isArray(holdStatus)) {
    throw new Error('Admission status could not be verified.');
  }
  const hold = holdStatus as Record<string, unknown>;
  if (hold.admissionEnabled !== true) return 'DISABLED';
  if (hold.status !== 'NONE') return 'BLOCKED';

  const [invitation, queue, payout, recovery] = await Promise.all([
    supabaseAdmin.from('invitations')
      .select('status,sybil_status,reward_cohort_round_id,reward_funding_allocation_receipt_id,activated_at,activation_block,eligibility_check_id,ineligible_at,slot_released_at,reward_eligible_at')
      .eq('invite_code',input.inviteCode).eq('activation_network',input.network)
      .maybeSingle(),
    supabaseAdmin.from('reward_queue_entries')
      .select('invite_code',{ count:'exact',head:true }).eq('invite_code',input.inviteCode),
    supabaseAdmin.from('reward_payouts')
      .select('invite_code',{ count:'exact',head:true }).eq('invite_code',input.inviteCode),
    supabaseAdmin.from('reward_recovery_settlements')
      .select('invite_code',{ count:'exact',head:true }).eq('invite_code',input.inviteCode),
  ]);
  if (invitation.error || queue.error || payout.error || recovery.error) {
    throw new Error('Funded activation evidence could not be read.');
  }
  const inv = invitation.data;
  const cohort = positiveId(inv?.reward_cohort_round_id);
  const receipt = positiveId(inv?.reward_funding_allocation_receipt_id);
  if (!inv || !cohort || !receipt || !inv.activated_at ||
      !Number.isFinite(Date.parse(inv.activated_at)) ||
      Date.parse(inv.activated_at) < Date.parse(rollout) ||
      inv.eligibility_check_id == null || inv.ineligible_at ||
      inv.slot_released_at || inv.reward_eligible_at ||
      !['ACTIVATING','UNDER_REVIEW'].includes(inv.status) ||
      !['NOT_CHECKED','CLEAR'].includes(inv.sybil_status)) {
    return 'NOT_READY';
  }

  const pool = await readVeInviteRewardPoolStatus();
  if (pool.network !== input.network || pool.appId !== VEINVITE_APP_ID ||
      pool.distributionPaused || !pool.rewardsPoolEnabled ||
      (input.network === 'mainnet' && !pool.mainnetFundedRewardsEnabled)) {
    return 'BLOCKED';
  }
  const thor = ThorClient.at(networkConfig.nodeUrl);
  const finalized = await thor.blocks.getBlockCompressed('finalized');
  const finalizedBlock = Number(finalized?.number);
  if (!Number.isSafeInteger(finalizedBlock) || finalizedBlock < 1 ||
      !Number.isSafeInteger(Number(inv.activation_block)) ||
      finalizedBlock < Number(inv.activation_block)) {
    return 'NOT_READY';
  }

  const planning = await readPredictiveRewardPlanning({
    network: input.network,appId: VEINVITE_APP_ID,
    observedPoolBalanceWei: pool.effectiveRewardPoolWei,
    rewardCohortRoundId:cohort,allocationReceiptId:receipt,
    includePendingAcceptance:false,
  });
  if (!planning.latestAllocation || planning.latestAllocation.id !== receipt ||
      planning.rewardCohortRoundId !== cohort || !planning.forecast ||
      !EXACT_WEI.test(planning.forecast.rewardPerInviteWei) ||
      BigInt(planning.forecast.rewardPerInviteWei) < BigInt(minimum)) {
    return 'NOT_READY';
  }

  const preflight = evaluateAdmissionPreflight({
    invitationStatus: inv.status as 'ACTIVATING'|'UNDER_REVIEW',
    sybilStatus: inv.sybil_status as 'NOT_CHECKED'|'CLEAR',
    rewardCohortRoundId:cohort,
    allocationReceiptId:receipt,
    existingAdmissionHold:false,
    canonicalFixedRewardExists:
      Boolean(queue.count || payout.count || recovery.count),
    onchainAvailablePoolWei:pool.effectiveRewardPoolWei,
    physicalLiabilityIncludingHeldWei:planning.reservedExistingWei,
    cohortBudgetWei:planning.designatedBudgetWei,
    cohortCommittedIncludingHeldWei:planning.cohortReservedWei,
    stressReserveWei:stress,
    configuredMinimumWei:minimum,
    distributionPaused:pool.distributionPaused,
  });
  if (preflight.decision !== 'PRECHECK_ONLY') return 'BLOCKED';

  const {data, error} = await supabaseAdmin.rpc(
    'create_reward_admission_hold_v1',{
      p_invite_code:input.inviteCode,
      p_network:input.network,
      p_amount_wei:minimum,
      p_observed_pool_wei:pool.effectiveRewardPoolWei,
      p_expected_physical_wei:planning.reservedExistingWei,
      p_expected_cohort_wei:planning.cohortReservedWei,
      p_stress_reserve_wei:stress,
      p_finalized_block:finalizedBlock,
      p_observed_at:new Date().toISOString(),
    },
  );
  if (error) throw new Error('Atomic admission ledger write failed: '+error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Atomic admission ledger result was malformed.');
  }
  const result = data as Record<string,unknown>;
  if (result.admitted !== true) return 'BLOCKED';
  if (result.reason !== 'HELD' ||
      result.guaranteedWei !== minimum ||
      result.cohort !== cohort) {
    throw new Error('Atomic admission ledger result disagreed with quote.');
  }
  return 'HELD';
}
