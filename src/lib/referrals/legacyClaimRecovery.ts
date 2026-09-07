import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  InviteRecord,
  InviteStatus,
  RewardEligibility,
} from '@/lib/types';

export type RecoveredLegacyInviteClaim = {
  entryClass: 'new_user' | 'returning_user';
  invite: InviteRecord;
};

type ClaimedInvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  reward_status: RewardEligibility;
  created_at: string;
  updated_at: string;
  eligibility_check_id: number | string | null;
};

type EligibilityCheckRow = {
  invite_code: string;
  wallet_address: string;
  outcome: string;
  entry_class: string | null;
};

function normalizeWallet(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Recover a legacy one-time invite claim only when canonical database evidence
 * proves that this exact wallet already completed the modern atomic claim.
 *
 * Older pre-proof referrals intentionally return null. We must not infer NEW or
 * RETURNING for historical rows that have no eligibility_check_id.
 */
export async function recoverCommittedLegacyInviteClaim({
  inviteCode,
  walletAddress,
}: {
  inviteCode: string;
  walletAddress: string;
}): Promise<RecoveredLegacyInviteClaim | null> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const normalizedWallet = normalizeWallet(walletAddress);

  const invitationResult = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code, inviter_wallet, invitee_wallet, status, reward_status, created_at, updated_at, eligibility_check_id',
    )
    .eq('invite_code', normalizedCode)
    .maybeSingle();

  if (invitationResult.error) {
    throw new Error(
      `Could not reload committed legacy invitation: ${invitationResult.error.message}`,
    );
  }

  const invitation =
    invitationResult.data as ClaimedInvitationRow | null;

  if (
    !invitation ||
    invitation.status === 'CANCELLED' ||
    invitation.invitee_wallet === null ||
    normalizeWallet(invitation.invitee_wallet) !== normalizedWallet ||
    invitation.eligibility_check_id === null
  ) {
    return null;
  }

  const eligibilityResult = await supabaseAdmin
    .from('eligibility_check_events')
    .select('invite_code, wallet_address, outcome, entry_class')
    .eq('id', invitation.eligibility_check_id)
    .maybeSingle();

  if (eligibilityResult.error) {
    throw new Error(
      `Could not verify committed legacy invite eligibility: ${eligibilityResult.error.message}`,
    );
  }

  const eligibility =
    eligibilityResult.data as EligibilityCheckRow | null;

  if (
    !eligibility ||
    eligibility.invite_code.trim().toUpperCase() !== normalizedCode ||
    normalizeWallet(eligibility.wallet_address) !== normalizedWallet ||
    eligibility.outcome !== 'ELIGIBLE' ||
    (eligibility.entry_class !== 'NEW' &&
      eligibility.entry_class !== 'RETURNING')
  ) {
    return null;
  }

  return {
    entryClass:
      eligibility.entry_class === 'NEW'
        ? 'new_user'
        : 'returning_user',
    invite: {
      code: invitation.invite_code,
      inviterAddress: invitation.inviter_wallet,
      inviteeAddress: invitation.invitee_wallet,
      status: invitation.status,
      createdAt: invitation.created_at,
      updatedAt: invitation.updated_at,
      rewardEligibility: invitation.reward_status,
    },
  };
}
