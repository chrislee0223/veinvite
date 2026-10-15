import 'server-only';

import {
  Address,
  HDKey,
  Hex,
  Mnemonic,
} from '@vechain/sdk-core';

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const VALID_MNEMONIC_WORD_COUNTS = new Set([
  12,
  15,
  18,
  21,
  24,
]);
const MAX_VEWORLD_ACCOUNT_INDEX = 50;

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

function addressOfPrivateKey(
  privateKey: Uint8Array,
): string {
  return Address.ofPrivateKey(privateKey)
    .toString()
    .toLowerCase();
}

function deriveMatchingPrivateKey(
  words: string[],
  expectedAddress: string,
): Uint8Array {
  const basePrivateKey =
    Mnemonic.toPrivateKey(words);

  if (
    addressOfPrivateKey(basePrivateKey) ===
      expectedAddress
  ) {
    return basePrivateKey;
  }

  basePrivateKey.fill(0);

  const hdKey = HDKey.fromMnemonic(words);

  try {
    for (
      let index = 0;
      index < MAX_VEWORLD_ACCOUNT_INDEX;
      index += 1
    ) {
      const child =
        hdKey.deriveChild(index);
      const childPrivateKey =
        child.privateKey;

      if (!childPrivateKey) {
        continue;
      }

      const candidate =
        Uint8Array.from(
          childPrivateKey,
        );

      if (
        addressOfPrivateKey(candidate) ===
          expectedAddress
      ) {
        return candidate;
      }

      candidate.fill(0);
    }
  } finally {
    hdKey.wipePrivateData();
  }

  throw new Error(
    'X promotion payout mnemonic does not derive the configured reward distributor in the supported VeWorld account range.',
  );
}

function normalizeDistributorSecret(
  rawSecret: string,
  expectedAddress: string,
): string {
  if (PRIVATE_KEY_PATTERN.test(rawSecret)) {
    const privateKeyHex =
      rawSecret.startsWith('0x')
        ? rawSecret.toLowerCase()
        : `0x${rawSecret.toLowerCase()}`;
    const bytes =
      Hex.of(privateKeyHex).bytes;

    try {
      if (
        addressOfPrivateKey(bytes) !==
          expectedAddress
      ) {
        throw new Error(
          'X promotion payout private key does not match the configured reward distributor.',
        );
      }

      return privateKeyHex;
    } finally {
      bytes.fill(0);
    }
  }

  const words = rawSecret
    .split(/\s+/u)
    .map((word) =>
      word.trim().toLowerCase(),
    )
    .filter(Boolean);

  try {
    if (
      !VALID_MNEMONIC_WORD_COUNTS.has(
        words.length,
      )
    ) {
      throw new Error(
        'X promotion payout signing secret has an invalid format.',
      );
    }

    const privateKeyBytes =
      deriveMatchingPrivateKey(
        words,
        expectedAddress,
      );

    try {
      return Hex
        .of(privateKeyBytes)
        .toString()
        .toLowerCase();
    } finally {
      privateKeyBytes.fill(0);
    }
  } finally {
    words.fill('');
  }
}

/**
 * Authoritative environment identity for NEW X promotion signing.
 *
 * The core referral payout runtime accepts the existing distributor secret as
 * either a raw 32-byte private key or a VeWorld mnemonic. Keep X promotion
 * signing compatible with that same operator credential without mutating the
 * process environment. No caller should persist privateKeyHex.
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

  const privateKeyHex =
    normalizeDistributorSecret(
      rawSecret,
      address,
    );

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
