import 'server-only';

import { Address, Hex } from '@vechain/sdk-core';

import {
  prepareRewardDistributorSecret,
} from './rewardDistributorSecret';

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;

export type RewardXPromotionDistributorIdentity = {
  automaticRewardsEnabled: boolean;
  workerEnabled: boolean;
  address: string | null;
  privateKeyHex: string | null;
};

export type RewardXPromotionPayoutRuntimeReadiness = {
  ready: boolean;
  reason:
    | 'READY'
    | 'AUTOMATIC_REWARDS_DISABLED'
    | 'PAYOUT_WORKER_DISABLED'
    | 'DISTRIBUTOR_ADDRESS_MISSING_OR_INVALID'
    | 'PAYOUT_CREDENTIALS_INCOMPLETE'
    | 'PAYOUT_CREDENTIALS_INVALID';
};

function isTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeAddress(value: unknown): string | null {
  const normalized =
    String(value ?? '').trim().toLowerCase();

  return ADDRESS_PATTERN.test(normalized)
    ? normalized
    : null;
}

/**
 * Authoritative environment identity for NEW X promotion signing.
 *
 * Keep this shared by the payout executor and the external-offer readiness
 * probe so they cannot disagree about whether the Vercel signing runtime is
 * actually usable. No caller should persist privateKeyHex.
 */
export function readRewardXPromotionDistributorIdentity():
RewardXPromotionDistributorIdentity {
  const automaticRewardsEnabled =
    isTrue(
      process.env.VEINVITE_AUTOMATIC_REWARDS_ENABLED,
    );
  const workerEnabled =
    isTrue(
      process.env.VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED,
    );
  const address =
    normalizeAddress(
      process.env.VEINVITE_REWARD_DISTRIBUTOR_ADDRESS,
    );
  const rawSecret =
    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY
      ?.trim() ?? null;

  if (
    !automaticRewardsEnabled ||
    !workerEnabled ||
    !address ||
    !rawSecret
  ) {
    return {
      automaticRewardsEnabled,
      workerEnabled,
      address,
      privateKeyHex: null,
    };
  }

  prepareRewardDistributorSecret();

  const rawKey =
    process.env.VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY
      ?.trim() ?? null;

  if (
    !rawKey ||
    !PRIVATE_KEY_PATTERN.test(rawKey)
  ) {
    throw new Error(
      'X promotion payout private key has an invalid format.',
    );
  }

  const privateKeyHex =
    rawKey.startsWith('0x')
      ? rawKey.toLowerCase()
      : `0x${rawKey.toLowerCase()}`;

  const bytes = Hex.of(privateKeyHex).bytes;

  try {
    if (
      Address.ofPrivateKey(bytes)
        .toString()
        .toLowerCase() !== address
    ) {
      throw new Error(
        'X promotion payout private key does not match the configured reward distributor.',
      );
    }
  } finally {
    bytes.fill(0);
  }

  return {
    automaticRewardsEnabled,
    workerEnabled,
    address,
    privateKeyHex,
  };
}

/**
 * Safe readiness projection for offer activation.
 *
 * This deliberately exposes only a coarse reason. It never returns the
 * distributor address or private key material.
 */
export function readRewardXPromotionPayoutRuntimeReadiness():
RewardXPromotionPayoutRuntimeReadiness {
  let identity:
    RewardXPromotionDistributorIdentity;

  try {
    identity =
      readRewardXPromotionDistributorIdentity();
  } catch {
    return {
      ready: false,
      reason: 'PAYOUT_CREDENTIALS_INVALID',
    };
  }

  if (!identity.automaticRewardsEnabled) {
    return {
      ready: false,
      reason: 'AUTOMATIC_REWARDS_DISABLED',
    };
  }

  if (!identity.workerEnabled) {
    return {
      ready: false,
      reason: 'PAYOUT_WORKER_DISABLED',
    };
  }

  if (!identity.address) {
    return {
      ready: false,
      reason:
        'DISTRIBUTOR_ADDRESS_MISSING_OR_INVALID',
    };
  }

  if (!identity.privateKeyHex) {
    return {
      ready: false,
      reason: 'PAYOUT_CREDENTIALS_INCOMPLETE',
    };
  }

  return {
    ready: true,
    reason: 'READY',
  };
}
