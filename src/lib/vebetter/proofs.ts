export function buildRewardProof(args: {
  referralCode: string;
  inviterAddress: string;
  inviteeAddress: string;
  completedAt: string;
}) {
  return {
    proofTypes: ['text', 'link'],
    proofValues: [
      `Verified VeBetterDAO onboarding completed for referral ${args.referralCode}`,
      `https://veinvite.app/proofs/${args.referralCode}`,
    ],
    impactCodes: [],
    impactValues: [],
    description: 'Verified ecosystem onboarding completed after all activation checks.',
    metadata: {
      referral_code: args.referralCode,
      inviter_wallet: args.inviterAddress,
      invitee_wallet_hash: 'STORE_A_ONE_WAY_HASH_NOT_THE_RAW_ADDRESS',
      completed_at: args.completedAt,
      activation_version: 'v1',
    },
  };
}
