import 'server-only';

import {
  Address,
  Hex,
  Mnemonic,
} from '@vechain/sdk-core';

import {
  readAutomaticRewardDistributorReadiness as readBaseReadiness,
  runAutomaticRewardPayout as runBaseAutomaticRewardPayout,
  type AutomaticRewardPayoutResult,
} from './automaticRewardPayout';

const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const VALID_MNEMONIC_WORD_COUNTS = new Set([
  12,
  15,
  18,
  21,
  24,
]);

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
    privateKeyBytes = Mnemonic.toPrivateKey(words);

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

    const derivedAddress = Address
      .ofPrivateKey(privateKeyBytes)
      .toString()
      .toLowerCase();

    if (derivedAddress !== expectedAddress) {
      throw new Error(
        'Automatic reward distributor mnemonic does not derive the configured public address.',
      );
    }

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

export type { AutomaticRewardPayoutResult };

export function readAutomaticRewardDistributorReadiness() {
  prepareRewardDistributorSecret();
  return readBaseReadiness();
}

export async function runAutomaticRewardPayout():
Promise<AutomaticRewardPayoutResult> {
  prepareRewardDistributorSecret();
  return runBaseAutomaticRewardPayout();
}
