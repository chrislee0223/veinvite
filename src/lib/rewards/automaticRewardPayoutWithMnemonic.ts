import 'server-only';

import {
  getVeBetterNetwork,
} from '@/lib/vebetter/network';
import {
  readAutomaticRewardDistributorReadiness as readBaseReadiness,
  runAutomaticRewardPayout as runBaseAutomaticRewardPayout,
  type AutomaticRewardPayoutResult,
} from './automaticRewardPayout';
import { prepareClaimedRewardFastPath } from './immediateClaimPayout';
import { reserveEligibleReferralRewards } from './rewardReservation';
import {
  recoverSubmittedRewardPayout,
  type SubmittedPayoutRecoveryResult,
} from './submittedPayoutRecovery';

import {
  prepareRewardDistributorSecret,
} from './rewardDistributorSecret';

type SubmittedPayoutRecoveryAttempt = {
  result: SubmittedPayoutRecoveryResult | null;
  failed: boolean;
};

async function recoverSubmittedBeforePayout():
Promise<SubmittedPayoutRecoveryAttempt> {
  try {
    return {
      result: await recoverSubmittedRewardPayout(),
      failed: false,
    };
  } catch (error) {
    console.error(
      'Submitted reward payout recovery failed before payout work:',
      error,
    );
    return {
      result: null,
      failed: true,
    };
  }
}

function runClaimTransferWorker() {
  return runBaseAutomaticRewardPayout({
    allowGeneralRoundPreparation: false,
  });
}

export type ImmediateClaimRewardPayoutResult =
  AutomaticRewardPayoutResult & {
    submittedRecovery: SubmittedPayoutRecoveryResult | null;
    submittedRecoveryFailed: boolean;
  };

export type { AutomaticRewardPayoutResult };

export function readAutomaticRewardDistributorReadiness() {
  prepareRewardDistributorSecret();
  return readBaseReadiness();
}

export async function runImmediateClaimRewardPayout():
Promise<ImmediateClaimRewardPayoutResult> {
  prepareRewardDistributorSecret();
  const readiness = readBaseReadiness();

  // Claim is a transfer-only boundary. Eligibility, mission, Sybil / identity,
  // chain-finality and fixed-reservation checks were completed before the user
  // was shown AWAITING_CLAIM. Even a degraded distributor state must never make
  // this path fall into the generic reservation / signal-planning sweep.
  if (
    !readiness.enabled ||
    !readiness.configured ||
    !readiness.distributorAddress
  ) {
    const payoutResult = await runClaimTransferWorker();
    return {
      ...payoutResult,
      submittedRecovery: null,
      submittedRecoveryFailed: false,
    };
  }

  // Reconcile the oldest already-submitted transaction before preparing more
  // claimed work. Recovery may record durable broadcast confirmation for a
  // transaction that is on-chain but not fully finalized yet. That confirmation
  // only releases the single-active-round preparation gate; payouts and
  // invitations remain PENDING/ELIGIBLE until the normal full-finality verifier
  // atomically settles the immutable manifest as PAID.
  //
  // Keep this recovery observation attached to the Claim result. A newer Claim
  // can safely continue after broadcast confirmation, but the durable Queue must
  // not forget that an older submitted transaction still needs finality just
  // because the transfer-only worker below returns IDLE or PAID.
  const submittedRecovery = await recoverSubmittedBeforePayout();

  // A deterministic recovery safety stop is different from ordinary finality
  // waiting. Do not prepare or sign newer work when the existing immutable
  // journal requires operator intervention; preserve that stop as the dominant
  // result instead of allowing a later IDLE/PAID result to hide it.
  if (
    submittedRecovery.result?.status ===
    'MANUAL_INTERVENTION_REQUIRED'
  ) {
    return {
      status: 'MANUAL_INTERVENTION_REQUIRED',
      network: getVeBetterNetwork(),
      distributorAddress: readiness.distributorAddress,
      roundId: submittedRecovery.result.roundId,
      manifestId: submittedRecovery.result.manifestId,
      txId: submittedRecovery.result.txId,
      reason: submittedRecovery.result.reason,
      transfersPerformed: false,
      submittedRecovery: submittedRecovery.result,
      submittedRecoveryFailed: false,
    };
  }

  // Prepare only already-claimed, already-reserved rewards. If this preparation
  // throws, propagate the failure so the durable Queue retries the same approved
  // Claim later. Do not fall back to generic reward preparation, which would
  // repeat the pre-Claim Sybil / planning stage after the user pressed Claim.
  await prepareClaimedRewardFastPath({
    distributorAddress: readiness.distributorAddress,
  });

  const payoutResult = await runClaimTransferWorker();

  return {
    ...payoutResult,
    submittedRecovery: submittedRecovery.result,
    submittedRecoveryFailed: submittedRecovery.failed,
  };
}

export async function runAutomaticRewardPayout():
Promise<AutomaticRewardPayoutResult> {
  prepareRewardDistributorSecret();

  // Cron and other background invocations must keep old submitted transactions
  // moving toward full finality even after they no longer block preparation of a
  // newer claimed batch.
  await recoverSubmittedBeforePayout();

  // Reservation and transfer are intentionally separate. This sweep fixes the
  // amount for newly verified referrals even when the inviter is offline. Only
  // entries later moved to QUEUED by an explicit claim can reach the base payout
  // worker, so completing a mission never causes an automatic token transfer.
  await reserveEligibleReferralRewards();

  return runBaseAutomaticRewardPayout();
}
