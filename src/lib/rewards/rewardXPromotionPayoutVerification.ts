import 'server-only';

import {
  PAYOUT_MANIFEST_VERSION_V3,
  type PayoutManifest,
} from '@/lib/rewards/payoutManifest';
import {
  verifyFinalizedRewardTransactionOnChain,
  type VerifiedRewardTransaction,
} from '@/lib/rewards/transactionVerification';
import type {
  XPromotionPayoutManifest,
} from '@/lib/rewards/rewardXPromotionPayoutManifest';

export function toRewardVerifierManifest(
  manifest: XPromotionPayoutManifest,
): PayoutManifest {
  return {
    version: PAYOUT_MANIFEST_VERSION_V3,
    network: manifest.network,
    roundId: manifest.intentId,
    appId: manifest.appId,
    x2EarnRewardsPoolAddress:
      manifest.x2EarnRewardsPoolAddress,
    payoutCount: 1,
    totalAmountWei: manifest.amountWei,
    clauses: [
      {
        payoutId: manifest.intentId,
        inviteCode: manifest.inviteCode,
        recipientWallet:
          manifest.recipientWallet,
        amountWei: manifest.amountWei,
        proof: manifest.proofText,
        publicProofId:
          manifest.publicProofId,
        proofTypes:
          [...manifest.clause.proofTypes],
        proofValues:
          [...manifest.clause.proofValues],
        impactCodes: [],
        impactValues: [],
        description:
          manifest.description,
        to:
          manifest.x2EarnRewardsPoolAddress,
        value: '0x0',
        data: manifest.clause.data,
      },
    ],
    manifestHash: manifest.manifestHash,
  };
}

export async function verifyFinalizedXPromotionTransactionOnChain({
  txId,
  manifest,
}: {
  txId: string;
  manifest: XPromotionPayoutManifest;
}): Promise<VerifiedRewardTransaction> {
  return verifyFinalizedRewardTransactionOnChain({
    txId,
    manifest:
      toRewardVerifierManifest(manifest),
    operatorWallet:
      manifest.operatorWallet,
    manifestCreatedAt:
      new Date(),
  });
}
