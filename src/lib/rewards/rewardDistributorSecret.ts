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
    for (
      let index = 0;
      index < MAX_VEWORLD_ACCOUNT_INDEX;
      index += 1
    ) {
      const child = hdKey.deriveChild(index);
      const childPrivateKey = child.privateKey;

      if (!childPrivateKey) {
        continue;
      }

      const candidate =
        Uint8Array.from(childPrivateKey);

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
    'Automatic reward distributor mnemonic does not derive the configured public address in the supported VeWorld account range.',
  );
}

/**
 * Normalize the existing distributor secret for all payout paths.
 *
 * Production historically allows VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY
 * to contain either a raw private key or a VeWorld mnemonic. The core
 * referral payout path already supported both forms; X promotion must use
 * the exact same interpretation so readiness cannot disagree with the
 * working core payout runtime.
 *
 * This function never logs or returns mnemonic words. When a mnemonic is
 * used, it replaces the process-local env value with the derived private
 * key for the lifetime of the current runtime only.
 */
export function prepareRewardDistributorSecret() {
  const rawSecret =
    process.env
      .VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY
      ?.trim();

  if (
    !rawSecret ||
    PRIVATE_KEY_PATTERN.test(rawSecret)
  ) {
    return;
  }

  const words = rawSecret
    .split(/\s+/u)
    .map((word) =>
      word.trim().toLowerCase(),
    )
    .filter(Boolean);

  if (
    !VALID_MNEMONIC_WORD_COUNTS.has(
      words.length,
    )
  ) {
    words.fill('');
    return;
  }

  let privateKeyBytes:
    Uint8Array | null = null;

  try {
    const expectedAddress =
      process.env
        .VEINVITE_REWARD_DISTRIBUTOR_ADDRESS
        ?.trim()
        .toLowerCase();

    if (
      !expectedAddress ||
      !ADDRESS_PATTERN.test(
        expectedAddress,
      )
    ) {
      throw new Error(
        'Automatic reward distributor address is missing or invalid.',
      );
    }

    privateKeyBytes =
      deriveMatchingPrivateKey(
        words,
        expectedAddress,
      );

    process.env
      .VEINVITE_REWARD_DISTRIBUTOR_PRIVATE_KEY =
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
