import { NextRequest, NextResponse } from 'next/server';

import {
  clampAvailableSlots,
  PERMANENT_REFERRAL_SLOT_LIMIT,
} from '@/lib/referralLinks';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import type {
  InviteRecord,
  InviteStatus,
  RewardEligibility,
  RewardQueueStatus,
  SybilStatus,
} from '@/lib/types';

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  reward_status: RewardEligibility;
  created_at: string;
  updated_at: string;
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  apps_completed: number | null;
  vot3_converted: boolean | null;
  vote_completed: boolean | null;
  invite_slot: number;
  slot_released_at: string | null;
  sybil_status: SybilStatus;
  referral_link_id: string | null;
};

type RewardQueueRow = {
  invite_code: string;
  status: RewardQueueStatus;
  claim_requested_at: string | null;
  reserved_amount_wei: string | null;
  reserved_at: string | null;
};

type ReferralLinkRow = {
  referral_key: string;
  created_at: string;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at,
  eligibility_check_id,
  activation_network,
  apps_completed,
  vot3_converted,
  vote_completed,
  invite_slot,
  slot_released_at,
  sybil_status,
  referral_link_id
` as const;

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function toInvitationRows(value: unknown): InvitationRow[] {
  return Array.isArray(value) ? (value as InvitationRow[]) : [];
}

function hasEntryProof(invitation: InvitationRow): boolean {
  return (
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network)
  );
}

function isUserVisibleInvite(invitation: InvitationRow): boolean {
  if (
    invitation.status === 'ACTIVATING' ||
    invitation.status === 'UNDER_REVIEW' ||
    invitation.status === 'COMPLETED'
  ) {
    return hasEntryProof(invitation);
  }
  return true;
}

function isSlotOccupying(invitation: InvitationRow): boolean {
  if (invitation.status === 'PENDING_ACCEPTANCE') return true;

  const hasActiveProof =
    hasEntryProof(invitation) &&
    invitation.sybil_status !== 'BLOCKED';

  if (
    invitation.status === 'ACTIVATING' ||
    invitation.status === 'UNDER_REVIEW'
  ) {
    return hasActiveProof;
  }

  return (
    invitation.status === 'COMPLETED' &&
    hasActiveProof &&
    invitation.slot_released_at === null
  );
}

function toInviteRecord(
  row: InvitationRow,
  rewardQueue?: RewardQueueRow,
): InviteRecord {
  return {
    code: row.invite_code,
    inviterAddress: row.inviter_wallet,
    ...(row.invitee_wallet ? { inviteeAddress: row.invitee_wallet } : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rewardEligibility: row.reward_status,
    appsCompleted: Math.max(0, Math.min(3, row.apps_completed ?? 0)),
    vot3Converted: row.vot3_converted ?? false,
    voteCompleted: row.vote_completed ?? false,
    inviteSlot: row.invite_slot === 2 ? 2 : 1,
    ...(row.slot_released_at ? { slotReleasedAt: row.slot_released_at } : {}),
    sybilStatus: row.sybil_status,
    ...(row.referral_link_id ? { referralLinkId: row.referral_link_id } : {}),
    ...(rewardQueue ? { rewardQueueStatus: rewardQueue.status } : {}),
    ...(rewardQueue?.claim_requested_at
      ? { rewardClaimRequestedAt: rewardQueue.claim_requested_at }
      : {}),
    ...(rewardQueue?.reserved_amount_wei
      ? { rewardReservedAmountWei: rewardQueue.reserved_amount_wei }
      : {}),
    ...(rewardQueue?.reserved_at
      ? { rewardReservedAt: rewardQueue.reserved_at }
      : {}),
  };
}

export async function GET(request: NextRequest) {
  const rawInviter = request.nextUrl.searchParams.get('inviter');
  if (!rawInviter) {
    return NextResponse.json(
      { error: 'inviter query parameter is required' },
      { status: 400 },
    );
  }

  const inviter = normalizeAddress(rawInviter);
  if (!/^0x[0-9a-f]{40}$/.test(inviter)) {
    return NextResponse.json(
      { error: 'Invalid inviter wallet.' },
      { status: 400 },
    );
  }

  try {
    await requireWalletSession({ request, expectedWallet: inviter });
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;
    console.error('Failed to validate Home bootstrap wallet session:', error);
    return NextResponse.json(
      { error: 'Failed to validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    // The old Home startup called /api/invites and /api/referral-links in
    // parallel. Both routes independently revalidated the same wallet session
    // and both queried invitations. This read model performs those shared
    // reads once, while keeping referral-link creation on the existing POST
    // mutation route when a wallet does not have a permanent link yet.
    const [invitationResult, referralResult] = await Promise.all([
      supabaseAdmin
        .from('invitations')
        .select(invitationColumns)
        .eq('inviter_wallet', inviter)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('referral_links')
        .select('referral_key,created_at')
        .eq('inviter_wallet', inviter)
        .eq('status', 'ACTIVE')
        .maybeSingle(),
    ]);

    if (invitationResult.error) throw invitationResult.error;
    if (referralResult.error) throw referralResult.error;

    const allInvitations = toInvitationRows(invitationResult.data);
    const visibleInvitations = allInvitations.filter(isUserVisibleInvite);
    const inviteCodes = visibleInvitations.map(
      (invitation) => invitation.invite_code,
    );

    const queueResult = inviteCodes.length > 0
      ? await supabaseAdmin
          .from('reward_queue_entries')
          .select(
            'invite_code, status, claim_requested_at, reserved_amount_wei, reserved_at',
          )
          .in('invite_code', inviteCodes)
      : { data: [] as RewardQueueRow[], error: null };

    if (queueResult.error) throw queueResult.error;

    const rewardQueueByInvite = new Map<string, RewardQueueRow>(
      ((queueResult.data ?? []) as RewardQueueRow[]).map((entry) => [
        entry.invite_code,
        entry,
      ]),
    );

    const invites = visibleInvitations.map((invitation) =>
      toInviteRecord(
        invitation,
        rewardQueueByInvite.get(invitation.invite_code),
      ),
    );

    const occupiedSlots = new Set<number>();
    for (const invitation of allInvitations) {
      if (isSlotOccupying(invitation)) {
        occupiedSlots.add(Number(invitation.invite_slot));
      }
    }
    const slotsAvailable = clampAvailableSlots(
      PERMANENT_REFERRAL_SLOT_LIMIT - occupiedSlots.size,
    );

    const referralRow =
      (referralResult.data as ReferralLinkRow | null) ?? null;
    const referralLink = referralRow
      ? {
          key: referralRow.referral_key,
          createdAt: referralRow.created_at,
          slotsAvailable,
        }
      : null;

    return NextResponse.json(
      { invites, referralLink },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to load Home bootstrap data:', error);
    return NextResponse.json(
      { error: 'Failed to load Home data.' },
      { status: 500 },
    );
  }
}
