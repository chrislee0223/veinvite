import 'server-only';

import {supabaseAdmin} from '@/lib/supabaseServer';
import {
  qualifyLegacyActiveMembership,
  type LegacyReferralEvidence,
  type LegacySybilAssessment,
  type LegacyMembershipDecision,
} from '@/lib/rewards/multilevelLegacyEligibility';

/**
 * Private preview-only, READ-ONLY lookup of the canonical historical
 * onboarding and Sybil status. It does not accept a browser session, has no
 * exported API route and NEVER returns a payout entitlement.
 *
 * The preview DB may not contain the production historical snapshots; in
 * that case fail closed instead of filling in missing facts from guesses.
 */
const PREVIEW='https://bpppslplhmppxzvdkwxs.supabase.co';
const WALLET=/^0x[0-9a-f]{40}$/;
const NETWORKS=['testnet','testnet-staging'] as const;

export async function readPreviewLegacyMembership(input:{
  wallet:string;
  network:'testnet'|'testnet-staging';
  earningRoundId:number;
}):Promise<LegacyMembershipDecision> {
  if(process.env.VERCEL_ENV!=='preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!==PREVIEW ||
    process.env.VEINVITE_MULTILEVEL_PREVIEW_OBSERVATION_ENABLED!=='true' ||
    !NETWORKS.includes(input.network) ||
    typeof input.wallet!=='string' || !WALLET.test(input.wallet.toLowerCase()) ||
    !Number.isSafeInteger(input.earningRoundId) || input.earningRoundId<2) {
    throw new Error('MULTILEVEL_LEGACY_READER_PREVIEW_ONLY');
  }
  const wallet=input.wallet.toLowerCase(),network=input.network;
  const invitations=await supabaseAdmin.from('invitations').select(
    'invite_code,activation_network,invitee_wallet,status,reward_status,sybil_status,identity_link_status,apps_completed,vote_completed,vot3_converted,vot3_conversion_tx_id,activation_block,apps_completed_block,vote_completed_block,vote_round_id',
  ).eq('invitee_wallet',wallet).eq('activation_network',network)
    .eq('status','COMPLETED').limit(2);
  if(invitations.error)throw new Error('MULTILEVEL_LEGACY_INVITATIONS_READ_FAILED');
  if((invitations.data??[]).length!==1) {
    return {eligible:false,reason:'NO_COMPLETED_ONBOARDING'};
  }
  const row=invitations.data![0];
  const code=row.invite_code;
  if(typeof code!=='string')return {eligible:false,reason:'NO_COMPLETED_ONBOARDING'};
  const [assess,invalid,restricted]=await Promise.all([
    supabaseAdmin.from('sybil_v2_referral_assessments')
      .select('invite_code,network,state,revision')
      .eq('network',network).eq('invite_code',code).limit(2),
    supabaseAdmin.from('sybil_v2_referral_invalidations')
      .select('id').eq('network',network).eq('invite_code',code)
      .eq('status','ACTIVE').limit(1),
    supabaseAdmin.from('sybil_v2_wallet_restrictions')
      .select('id').eq('network',network).eq('wallet_address',wallet)
      .eq('status','ACTIVE').limit(1),
  ]);
  if(assess.error||invalid.error||restricted.error) {
    throw new Error('MULTILEVEL_SYBIL_EVIDENCE_READ_FAILED');
  }
  // An ambiguous Sybil assessment is never treated as CLEAR.
  const ar=(assess.data??[]).length===1 ? assess.data![0] : null;
  const assessment:LegacySybilAssessment|null=ar ? {
    inviteCode:ar.invite_code,
    network:ar.network,
    state:ar.state,
    revision:ar.revision,
  } : null;
  const i:LegacyReferralEvidence={
    inviteCode:code,network:row.activation_network,
    inviteeWallet:row.invitee_wallet,status:row.status,
    rewardStatus:row.reward_status,sybilStatus:row.sybil_status,
    identityLinkStatus:row.identity_link_status,appsCompleted:row.apps_completed,
    voteCompleted:row.vote_completed,vot3Converted:row.vot3_converted,
    vot3ConversionTxId:row.vot3_conversion_tx_id,
    activationBlock:row.activation_block,
    appsCompletedBlock:row.apps_completed_block,
    voteCompletedBlock:row.vote_completed_block,
    voteRoundId:row.vote_round_id,
  };
  return qualifyLegacyActiveMembership({
    wallet,network,earningRoundId:input.earningRoundId,invitation:i,
    currentAssessment:assessment,
    hasActiveInvalidation:(invalid.data??[]).length>0,
    hasActiveInviteeWalletRestriction:(restricted.data??[]).length>0,
  });
}
