import { NextRequest, NextResponse } from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { isReferralKey } from '@/lib/referralLinks';
import { createCode, normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import {
  checkVeBetterEntryEligibility,
  ENTRY_ELIGIBILITY_RULE_VERSION,
  RETURNING_USER_DORMANCY_ROUNDS,
  type EntryClass,
  type EntryEligibilityResult,
} from '@/lib/vebetter/entryEligibility';
import type {
  InviteRecord,
  InviteStatus,
  RewardEligibility,
} from '@/lib/types';

type ReferralLinkRow = {
  id: string;
  inviter_wallet: string;
};

type ExistingInvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  status: InviteStatus;
  eligibility_check_id: string | number | null;
  activation_network: string | null;
};

type SlotInvitationRow = {
  invite_slot: number;
  status: InviteStatus;
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  sybil_status: string;
};

type PermanentClaimResult = {
  result?:
    | 'CLAIMED'
    | 'NOT_FOUND'
    | 'SELF_REFERRAL'
    | 'ALREADY_REFERRED'
    | 'RELATIONSHIP_CYCLE'
    | 'SLOTS_FULL';
  entry_class?: 'NEW' | 'RETURNING';
  invite_code?: string;
  inviter_wallet?: string;
  invitee_wallet?: string;
  status?: InviteStatus;
  reward_status?: RewardEligibility;
  created_at?: string;
  updated_at?: string;
  invite_slot?: number;
  referral_link_id?: string;
};

function toStoredEntryClass(
  entryClass: EntryClass,
): 'NEW' | 'RETURNING' | 'ACTIVE_EXISTING' {
  switch (entryClass) {
    case 'new_user':
      return 'NEW';
    case 'returning_user':
      return 'RETURNING';
    case 'active_existing_user':
      return 'ACTIVE_EXISTING';
  }
}

function buildEntryCheckDetails(entryCheck: EntryEligibilityResult) {
  return {
    ruleVersion: ENTRY_ELIGIBILITY_RULE_VERSION,
    definition:
      'NEW has no prior rewarded/allocation-voting VeBetter history. RETURNING has historical activity but none from the start of the previous 12 completed rounds through the sealed check block. ACTIVE_EXISTING has activity in that recent window.',
    entryClass: toStoredEntryClass(entryCheck.entryClass),
    dormancyRoundCount: RETURNING_USER_DORMANCY_ROUNDS,
    currentRoundId: entryCheck.dormancyWindow.currentRoundId,
    oldestCompletedRoundId: entryCheck.dormancyWindow.oldestCompletedRoundId,
    newestCompletedRoundId: entryCheck.dormancyWindow.newestCompletedRoundId,
    completedRoundIds: entryCheck.dormancyWindow.completedRoundIds,
    dormancyStartBlock: entryCheck.dormancyWindow.dormancyStartBlock,
    newestCompletedRoundEndBlock:
      entryCheck.dormancyWindow.newestCompletedRoundEndBlock,
    checkedThroughBlock: entryCheck.checkedBlock,
    ongoingRoundGuard: true,
    source: 'permanent_referral_link',
  };
}

async function recordAttempt({
  linkId,
  walletAddress,
  outcome,
  entryCheck,
  details,
}: {
  linkId: string;
  walletAddress: string;
  outcome:
    | 'ACTIVE_EXISTING'
    | 'ALREADY_REFERRED'
    | 'SELF_REFERRAL'
    | 'CHECK_FAILED';
  entryCheck?: EntryEligibilityResult;
  details?: Record<string, unknown>;
}) {
  const rewardEvidence = entryCheck?.recentRewardEvent ?? entryCheck?.priorRewardEvent;
  const voteEvidence = entryCheck?.recentVoteEvent ?? entryCheck?.priorVoteEvent;
  const { error } = await supabaseAdmin.from('referral_link_attempts').insert({
    referral_link_id: linkId,
    wallet_address: walletAddress,
    outcome,
    entry_class: entryCheck ? toStoredEntryClass(entryCheck.entryClass) : null,
    network: entryCheck?.network ?? null,
    checked_block: entryCheck?.checkedBlock ?? null,
    prior_reward_tx_id: rewardEvidence?.txId ?? null,
    prior_vote_tx_id: voteEvidence?.txId ?? null,
    details: entryCheck ? buildEntryCheckDetails(entryCheck) : (details ?? {}),
  });

  if (error) {
    console.error('Failed to record permanent referral attempt:', error);
  }
}

function toInviteRecord(result: PermanentClaimResult): InviteRecord | null {
  if (
    result.result !== 'CLAIMED' ||
    !result.invite_code ||
    !result.inviter_wallet ||
    !result.invitee_wallet ||
    !result.status ||
    !result.reward_status ||
    !result.created_at ||
    !result.updated_at
  ) {
    return null;
  }

  return {
    code: result.invite_code,
    inviterAddress: result.inviter_wallet,
    inviteeAddress: result.invitee_wallet,
    status: result.status,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    rewardEligibility: result.reward_status,
    inviteSlot: result.invite_slot === 2 ? 2 : 1,
    ...(result.referral_link_id
      ? { referralLinkId: result.referral_link_id }
      : {}),
  };
}

async function loadExistingInvitation(
  inviteeAddress: string,
): Promise<{
  invitation: ExistingInvitationRow | null;
  error: unknown | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('invite_code,inviter_wallet,status,eligibility_check_id,activation_network')
    .eq('invitee_wallet', inviteeAddress)
    .order('created_at', { ascending: false })
    .limit(1);

  return {
    invitation:
      Array.isArray(data) && data.length > 0
        ? data[0] as ExistingInvitationRow
        : null,
    error: error ?? null,
  };
}

function isResumableForSponsor(
  invitation: ExistingInvitationRow,
  inviterWallet: string,
): boolean {
  return (
    normalizeAddress(invitation.inviter_wallet) === normalizeAddress(inviterWallet) &&
    ['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED'].includes(invitation.status) &&
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network)
  );
}

function resumeResponse(invitation: ExistingInvitationRow) {
  return NextResponse.json(
    {
      outcome: 'already_claimed',
      inviteCode: invitation.invite_code,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function occupiesSlot(invitation: SlotInvitationRow): boolean {
  if (invitation.status === 'PENDING_ACCEPTANCE') return true;
  return (
    (invitation.status === 'ACTIVATING' || invitation.status === 'UNDER_REVIEW') &&
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network) &&
    invitation.sybil_status !== 'BLOCKED'
  );
}

async function hasFreeSlot(inviterWallet: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('invite_slot,status,eligibility_check_id,activation_network,sybil_status')
    .eq('inviter_wallet', normalizeAddress(inviterWallet))
    .in('status', ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW']);

  if (error) throw error;

  const occupied = new Set<number>();
  for (const row of (data ?? []) as SlotInvitationRow[]) {
    if (occupiesSlot(row)) occupied.add(Number(row.invite_slot));
  }
  return occupied.size < 2;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const referralKey = key.trim();
  if (!isReferralKey(referralKey)) {
    return NextResponse.json({ outcome: 'invalid_link' }, { status: 404 });
  }

  const { data: linkData, error: linkError } = await supabaseAdmin
    .from('referral_links')
    .select('id,inviter_wallet')
    .eq('referral_key', referralKey)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (linkError) {
    console.error('Failed to load permanent referral link:', linkError);
    return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
  }

  const link = (linkData as ReferralLinkRow | null) ?? null;
  if (!link) {
    return NextResponse.json({ outcome: 'invalid_link' }, { status: 404 });
  }

  let body: { inviteeAddress?: string };
  try {
    body = (await request.json()) as { inviteeAddress?: string };
  } catch {
    return NextResponse.json({ outcome: 'invalid_request' }, { status: 400 });
  }

  if (!body.inviteeAddress) {
    return NextResponse.json({ outcome: 'invalid_request' }, { status: 400 });
  }

  const inviteeAddress = normalizeAddress(body.inviteeAddress);
  if (!/^0x[0-9a-f]{40}$/.test(inviteeAddress)) {
    return NextResponse.json({ outcome: 'invalid_request' }, { status: 400 });
  }

  try {
    await requireWalletSession({ request, expectedWallet: inviteeAddress });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { outcome: 'wallet_verification_failed', error: error.message },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
    console.error('Failed to validate permanent-referral wallet session:', error);
    return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
  }

  const clientIp = getClientIpSubject(request);
  const rateLimitResponse = await enforceRateLimits([
    clientIp
      ? {
          scope: 'permanent_referral_claim_ip',
          subject: clientIp,
          limit: 20,
          windowSeconds: 300,
        }
      : null,
    {
      scope: 'permanent_referral_claim_wallet',
      subject: inviteeAddress,
      limit: 6,
      windowSeconds: 300,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (inviteeAddress === normalizeAddress(link.inviter_wallet)) {
    await recordAttempt({
      linkId: link.id,
      walletAddress: inviteeAddress,
      outcome: 'SELF_REFERRAL',
      details: { source: 'precheck' },
    });
    return NextResponse.json({ outcome: 'self_referral' }, { status: 422 });
  }

  const existingCheck = await loadExistingInvitation(inviteeAddress);
  if (existingCheck.error) {
    console.error('Failed to check existing permanent referral:', existingCheck.error);
    return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
  }

  if (existingCheck.invitation) {
    if (isResumableForSponsor(existingCheck.invitation, link.inviter_wallet)) {
      return resumeResponse(existingCheck.invitation);
    }

    await recordAttempt({
      linkId: link.id,
      walletAddress: inviteeAddress,
      outcome: 'ALREADY_REFERRED',
      details: { source: 'precheck' },
    });
    return NextResponse.json({ outcome: 'already_referred' }, { status: 422 });
  }

  // Do a cheap authenticated concurrency check before the expensive chain
  // eligibility scan. This is only an early exit; the atomic database RPC is
  // still authoritative and closes races between this read and reservation.
  try {
    if (!(await hasFreeSlot(link.inviter_wallet))) {
      return NextResponse.json({ outcome: 'slots_full' }, { status: 409 });
    }
  } catch (error) {
    console.error('Failed to check permanent-referral slot capacity:', error);
    return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
  }

  let entryCheck: EntryEligibilityResult;
  try {
    entryCheck = await checkVeBetterEntryEligibility({
      walletAddress: inviteeAddress,
    });
  } catch (error) {
    console.error('Failed to verify permanent-referral entry history:', error);
    await recordAttempt({
      linkId: link.id,
      walletAddress: inviteeAddress,
      outcome: 'CHECK_FAILED',
      details: { source: 'eligibility_check' },
    });
    return NextResponse.json(
      { outcome: 'eligibility_check_failed' },
      { status: 503, headers: { 'Retry-After': '10' } },
    );
  }

  if (entryCheck.entryClass === 'active_existing_user') {
    await recordAttempt({
      linkId: link.id,
      walletAddress: inviteeAddress,
      outcome: 'ACTIVE_EXISTING',
      entryCheck,
    });
    return NextResponse.json(
      { outcome: 'active_existing_user', entryClass: 'active_existing_user' },
      { status: 422 },
    );
  }

  const storedEntryClass = toStoredEntryClass(entryCheck.entryClass);
  const priorRewardTxId =
    entryCheck.entryClass === 'returning_user'
      ? entryCheck.priorRewardEvent?.txId ?? null
      : null;
  const priorVoteTxId =
    entryCheck.entryClass === 'returning_user'
      ? entryCheck.priorVoteEvent?.txId ?? null
      : null;
  const details = {
    ...buildEntryCheckDetails(entryCheck),
    entryClass: storedEntryClass,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = createCode();
    const { data, error } = await supabaseAdmin.rpc(
      'claim_permanent_referral_with_entry_proof',
      {
        p_referral_key: referralKey,
        p_invite_code: inviteCode,
        p_invitee_wallet: inviteeAddress,
        p_network: entryCheck.network,
        p_checked_block: entryCheck.checkedBlock,
        p_prior_reward_tx_id: priorRewardTxId,
        p_prior_vote_tx_id: priorVoteTxId,
        p_details: details,
      },
    );

    if (error?.code === '23505') continue;
    if (error) {
      console.error('Failed to atomically claim permanent referral:', error);
      return NextResponse.json(
        { outcome: 'eligibility_record_failed' },
        { status: 503, headers: { 'Retry-After': '10' } },
      );
    }

    const result = (data ?? {}) as PermanentClaimResult;
    switch (result.result) {
      case 'SLOTS_FULL':
        return NextResponse.json({ outcome: 'slots_full' }, { status: 409 });
      case 'SELF_REFERRAL':
        return NextResponse.json({ outcome: 'self_referral' }, { status: 422 });
      case 'ALREADY_REFERRED': {
        // Another request may have claimed between the precheck and the atomic
        // RPC. If it is this same sponsor relationship, resume it rather than
        // mislabeling the user's own successful concurrent claim as a conflict.
        const racedExisting = await loadExistingInvitation(inviteeAddress);
        if (
          !racedExisting.error &&
          racedExisting.invitation &&
          isResumableForSponsor(racedExisting.invitation, link.inviter_wallet)
        ) {
          return resumeResponse(racedExisting.invitation);
        }
        return NextResponse.json({ outcome: 'already_referred' }, { status: 422 });
      }
      case 'RELATIONSHIP_CYCLE':
        return NextResponse.json({ outcome: 'already_referred' }, { status: 422 });
      case 'NOT_FOUND':
        return NextResponse.json({ outcome: 'invalid_link' }, { status: 404 });
      case 'CLAIMED': {
        const invite = toInviteRecord(result);
        if (!invite || !result.entry_class) {
          return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
        }
        return NextResponse.json({
          outcome: 'claimed',
          invite,
          entryClass:
            result.entry_class === 'RETURNING'
              ? 'returning_user'
              : 'new_user',
        });
      }
      default:
        return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
    }
  }

  return NextResponse.json({ outcome: 'server_error' }, { status: 500 });
}
