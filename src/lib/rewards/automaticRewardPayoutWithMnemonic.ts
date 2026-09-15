import 'server-only';

import {
  Address,
  HDKey,
  Hex,
  Mnemonic,
} from '@vechain/sdk-core';

import {
  readAutomaticRewardDistributorReadiness as readBaseReadiness,
  runAutomaticRewardPayout as runBaseAutomaticRewardPayout,
  type AutomaticRewardPayoutResult,
} from './automaticRewardPayout';
import { prepareClaimedRewardFastPath } from './immediateClaimPayout';
import { reserveEligibleReferralRewards } from './rewardReservation';
import { recoverSubmittedRewardPayout } from './submittedPayoutRecovery';

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const VALID_MNEMONIC_WORD_COUNTS = new Set([
  12,
  15,
  18,
  21,
  24,
]);
const MAX_VEWORLD_ACCOUNT_INDEX = 50;

function addressOfPrivateKey(privateKey: Uint8Array) {
  return Address
    .ofPrivateKey(privateKey)
    .toString()
    .toLowerCase();
}

function deriveMatchingPrivateKey(
  words: string[],
  expectedAddress: string,
): Uint8Array {
  const basePrivateKey = Mnemonic.toPrivateKey(words);

  if (addressOfPrivateKey(basePrivateKey) === expectedAddress) {
    return basePrivateKey;
  }

  basePrivateKey.fill(0);

  const hdKey = HDKey.fromMnemonic(words);

  try {
    for (let index = 0; index < MAX_VEWORLD_ACCOUNT_INDEX; index += 1) {
      const child = hdKey.deriveChild(index);
      const childPrivateKey = child.privateKey;

      if (!childPrivateKey) {
        continue;
      }

      const candidate = Uint8Array.from(childPrivateKey);

      if (addressOfPrivateKey(candidate) === expectedAddress) {
        return candidate;
      }

      candidate.fill(0);
    }
  } finally {
    hdKey.wipePrivateData();
  }

  throw new Error(
    'Automatic reward distributor mnemonic does not derive the configured public address in the supported VeWorld account range.',
  );
}

function prepareRewardDistributorSecret() {
  const rawSecret =
    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY?.trim();

  if (!rawSecret || PRIVATE_KEY_PATTERN.test(rawSecret)) {
    return;
  }

  const words = rawSecret
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  if (!VALID_MNEMONIC_WORD_COUNTS.has(words.length)) {
    return;
  }

  let privateKeyBytes: Uint8Array | null = null;

  try {
    const expectedAddress =
      process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS
        ?.trim()
        .toLowerCase();

    if (
      !expectedAddress ||
      !ADDRESS_PATTERN.test(expectedAddress)
    ) {
      throw new Error(
        'Automatic reward distributor address is missing or invalid.',
      );
    }

    privateKeyBytes = deriveMatchingPrivateKey(
      words,
      expectedAddress,
    );

    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY =
      Hex.of(privateKeyBytes).toString();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Automatic reward distributor mnemonic could not be derived.',
    );
  } finally {
    privateKeyBytes?.fill(0);
    words.fill('');
  }
}

async function recoverSubmittedBeforePayout() {
  try {
    return await recoverSubmittedRewardPayout();
  } catch (error) {
    console.error(
      'Submitted reward payout recovery failed before payout work:',
      error,
    );
    return null;
  }
}

function runClaimTransferWorker() {
  return runBaseAutomaticRewardPayout({
    allowGeneralRoundPreparation: false,
  });
}

export type { AutomaticRewardPayoutResult };

export function readAutomaticRewardDistributorReadiness() {
  prepareRewardDistributorSecret();
  return readBaseReadiness();
}

export async function runImmediateClaimRewardPayout():
Promise<AutomaticRewardPayoutResult> {
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
    return runClaimTransferWorker();
  }

  // Reconcile the oldest already-submitted transaction before preparing more
  // claimed work. Recovery may record durable broadcast confirmation for a
  // transaction that is on-chain but not fully finalized yet. That confirmation
  // only releases the single-active-round preparation gate; payouts and
  // invitations remain PENDING/ELIGIBLE until the normal full-finality verifier
  // atomically settles the immutable manifest as PAID.
  await recoverSubmittedBeforePayout();

  // Prepare only already-claimed, already-reserved rewards. If this preparation
  // throws, propagate the failure so the durable Queue retries the same approved
  // Claim later. Do not fall back to generic reward preparation, which would
  // repeat the pre-Claim Sybil / planning stage after the user pressed Claim.
  await prepareClaimedRewardFastPath({
    distributorAddress: readiness.distributorAddress,
  });

  return runClaimTransferWorker();
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
