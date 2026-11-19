/**
 * Fail-closed compatibility gate for existing, pre-launch VeInvite members.
 *
 * Reading invitations.status=COMPLETED or reward_status=PAID alone is UNSAFE:
 * historically paid referrals may later be invalidated for Sybil activity.
 * A new active-network event MUST also prove that the wallet was onboarded
 * before the event's round, no active invalidation, no wallet restrictions,
 * and the latest independently verified Sybil revision is CLEAR.
 *
 * Pure data classifier, no DB writes, no current payout authority.
 */
export type LegacyReferralEvidence = {
  inviteCode: string;
  network: string | null;
  inviteeWallet: string | null;
  status: string | null;
  rewardStatus: string | null;
  sybilStatus: string | null;
  identityLinkStatus: string | null;
  appsCompleted: number | null;
  voteCompleted: boolean | null;
  vot3Converted: boolean | null;
  vot3ConversionTxId: string | null;
  activationBlock: number | null;
  appsCompletedBlock: number | null;
  voteCompletedBlock: number | null;
  voteRoundId: number | null;
};
export type LegacySybilAssessment = {
  inviteCode: string;
  network: string;
  state: string;
  revision: number;
};
export type LegacyMembershipInput = {
  wallet: string;
  network: 'mainnet'|'testnet'|'testnet-staging';
  earningRoundId: number;
  invitation: LegacyReferralEvidence | null;
  currentAssessment: LegacySybilAssessment | null;
  hasActiveInvalidation: boolean;
  hasActiveInviteeWalletRestriction: boolean;
};

export type LegacyMembershipDecision =
 | { eligible: true; firstOnboardedRoundId: number }
 | { eligible: false; reason:
     'INVALID_INPUT'|'NO_COMPLETED_ONBOARDING'|'INCOMPLETE_LEGACY_PROOF'|
     'CURRENT_SYBIL_NOT_CLEAR'|'HISTORICALLY_INVALIDATED'|
     'CURRENT_WALLET_RESTRICTED'|'ONBOARDING_NOT_OLDER_THAN_ROUND' };

const WALLET=/^0x[0-9a-f]{40}$/;
const TX=/^0x[0-9a-f]{64}$/;
const CODE=/^[A-HJ-NP-Z2-9]{7}$/;
const safe=(n:number|null)=>typeof n==='number' && Number.isSafeInteger(n)&&n>=1;

export function qualifyLegacyActiveMembership(
  input:LegacyMembershipInput,
):LegacyMembershipDecision {
  if(!input || typeof input.wallet!=='string' ||
    !WALLET.test(input.wallet.toLowerCase()) ||
    !['mainnet','testnet','testnet-staging'].includes(input.network) ||
    !safe(input.earningRoundId) ||
    typeof input.hasActiveInvalidation!=='boolean' ||
    typeof input.hasActiveInviteeWalletRestriction!=='boolean') {
    return {eligible:false,reason:'INVALID_INPUT'};
  }
  const i=input.invitation;
  if(!i || !CODE.test(i.inviteCode) ||
    i.inviteeWallet?.toLowerCase()!==input.wallet.toLowerCase() ||
    i.network!==input.network ||
    i.status!=='COMPLETED' || !['PAID','ELIGIBLE'].includes(i.rewardStatus??'')) {
    return {eligible:false,reason:'NO_COMPLETED_ONBOARDING'};
  }
  if(input.hasActiveInvalidation) {
    return {eligible:false,reason:'HISTORICALLY_INVALIDATED'};
  }
  if(input.hasActiveInviteeWalletRestriction) {
    return {eligible:false,reason:'CURRENT_WALLET_RESTRICTED'};
  }
  const a=input.currentAssessment;
  if(!a || a.inviteCode!==i.inviteCode || a.network!==input.network ||
    a.state!=='CLEAR' || !safe(a.revision) ||
    i.sybilStatus!=='CLEAR' ||
    !['NO_KNOWN_LINK','OPERATOR_CLEARED'].includes(i.identityLinkStatus??'')) {
    return {eligible:false,reason:'CURRENT_SYBIL_NOT_CLEAR'};
  }
  if(!safe(i.voteRoundId) || !safe(i.activationBlock) ||
    !safe(i.appsCompletedBlock) || !safe(i.voteCompletedBlock) ||
    (i.appsCompleted??0)<3 || i.voteCompleted!==true ||
    i.vot3Converted!==true || !TX.test(i.vot3ConversionTxId?.toLowerCase()??'') ||
    i.activationBlock!>i.appsCompletedBlock! ||
    i.appsCompletedBlock!>i.voteCompletedBlock!) {
    return {eligible:false,reason:'INCOMPLETE_LEGACY_PROOF'};
  }
  if(i.voteRoundId!>=input.earningRoundId) {
    return {eligible:false,reason:'ONBOARDING_NOT_OLDER_THAN_ROUND'};
  }
  return {eligible:true,firstOnboardedRoundId:i.voteRoundId!};
}
