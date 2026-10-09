import { Interface } from 'ethers';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import {
  buildRewardXPromotionProof,
} from '@/lib/rewards/rewardXPromotionProof';

const ADDRESS_PATTERN =
  /^0x[0-9a-f]{40}$/;
const INTEGER_PATTERN =
  /^\d+$/;
const HEX_DATA_PATTERN =
  /^0x[0-9a-f]+$/;

const rewardsPoolInterface =
  new Interface([
    'function distributeRewardWithProof(bytes32 appId,uint256 amount,address receiver,string[] proofTypes,string[] proofValues,string[] impactCodes,uint256[] impactValues,string description)',
  ]);

export type RewardXPromotionPayoutClause = {
  intentId: string;
  recipientWallet: string;
  amountWei: string;
  publicProofId: string;
  proof: string;
  proofTypes: ['text', 'link'];
  proofValues: [string, string];
  impactCodes: [];
  impactValues: [];
  description: string;
  to: string;
  value: '0x0';
  data: string;
};

function positiveInteger(
  value: string | number,
  fieldName: string,
): string {
  const normalized =
    String(value);

  if (
    !INTEGER_PATTERN.test(
      normalized,
    ) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }

  return BigInt(
    normalized,
  ).toString();
}

function address(
  value: string,
  fieldName: string,
): string {
  const normalized =
    value.trim().toLowerCase();

  if (
    !ADDRESS_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `${fieldName} is not a valid VeChain address.`,
    );
  }

  return normalized;
}

export function buildRewardXPromotionPayoutClause({
  intentId,
  recipientWallet,
  amountWei,
  publicProofId,
  x2EarnRewardsPoolAddress,
}: {
  intentId: string | number;
  recipientWallet: string;
  amountWei: string | number;
  publicProofId: string;
  x2EarnRewardsPoolAddress: string;
}): RewardXPromotionPayoutClause {
  const normalizedIntentId =
    positiveInteger(
      intentId,
      'X promotion payout intent id',
    );
  const normalizedAmount =
    positiveInteger(
      amountWei,
      'X promotion payout amount',
    );
  const normalizedRecipient =
    address(
      recipientWallet,
      'X promotion payout recipient',
    );
  const poolAddress =
    address(
      x2EarnRewardsPoolAddress,
      'X2EarnRewardsPool address',
    );
  const proof =
    buildRewardXPromotionProof(
      publicProofId,
    );
  const proofTypes:
    ['text', 'link'] =
      ['text', 'link'];
  const proofValues:
    [string, string] = [
      proof.proof,
      proof.url,
    ];
  const impactCodes: [] = [];
  const impactValues: [] = [];

  const data =
    rewardsPoolInterface
      .encodeFunctionData(
        'distributeRewardWithProof',
        [
          VEINVITE_APP_ID,
          normalizedAmount,
          normalizedRecipient,
          proofTypes,
          proofValues,
          impactCodes,
          impactValues,
          proof.description,
        ],
      )
      .toLowerCase();

  if (
    !HEX_DATA_PATTERN.test(data)
  ) {
    throw new Error(
      'Encoded X promotion payout clause is invalid.',
    );
  }

  return {
    intentId:
      normalizedIntentId,
    recipientWallet:
      normalizedRecipient,
    amountWei:
      normalizedAmount,
    publicProofId:
      proof.publicProofId,
    proof:
      proof.proof,
    proofTypes,
    proofValues,
    impactCodes,
    impactValues,
    description:
      proof.description,
    to: poolAddress,
    value: '0x0',
    data,
  };
}

export function decodeRewardXPromotionPayoutClause(
  data: string,
) {
  const fn =
    rewardsPoolInterface
      .getFunction(
        'distributeRewardWithProof',
      );

  if (
    !fn ||
    data.slice(
      0,
      10,
    ).toLowerCase() !==
      fn.selector.toLowerCase()
  ) {
    throw new Error(
      'X promotion payout clause does not target distributeRewardWithProof.',
    );
  }

  const decoded =
    rewardsPoolInterface
      .decodeFunctionData(
        fn,
        data,
      );

  return {
    appId:
      String(
        decoded[0],
      ).toLowerCase(),
    amountWei:
      BigInt(
        decoded[1],
      ).toString(),
    recipientWallet:
      String(
        decoded[2],
      ).toLowerCase(),
    proofTypes:
      Array.from(
        decoded[3] as readonly string[],
        String,
      ),
    proofValues:
      Array.from(
        decoded[4] as readonly string[],
        String,
      ),
    impactCodes:
      Array.from(
        decoded[5] as readonly string[],
        String,
      ),
    impactValues:
      Array.from(
        decoded[6] as readonly bigint[],
        (value) =>
          BigInt(
            value,
          ).toString(),
      ),
    description:
      String(
        decoded[7],
      ),
  };
}

export function assertRewardXPromotionPayoutClause(
  clause:
    RewardXPromotionPayoutClause,
): void {
  const decoded =
    decodeRewardXPromotionPayoutClause(
      clause.data,
    );

  if (
    decoded.appId !==
      VEINVITE_APP_ID ||
    decoded.amountWei !==
      clause.amountWei ||
    decoded.recipientWallet !==
      clause.recipientWallet ||
    decoded.proofTypes.length !== 2 ||
    decoded.proofTypes[0] !==
      'text' ||
    decoded.proofTypes[1] !==
      'link' ||
    decoded.proofValues.length !==
      2 ||
    decoded.proofValues[0] !==
      clause.proof ||
    decoded.proofValues[1] !==
      clause.proofValues[1] ||
    decoded.impactCodes.length !==
      0 ||
    decoded.impactValues.length !==
      0 ||
    decoded.description !==
      clause.description
  ) {
    throw new Error(
      'Encoded X promotion payout clause does not match its immutable intent proof.',
    );
  }
}
