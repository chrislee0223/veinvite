import { NextRequest, NextResponse } from 'next/server';

import {
  enforceRateLimits,
} from '@/lib/rateLimitServer';
import {
  createCode,
  normalizeAddress,
} from '@/lib/serverStore';
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

const activeInviteStatuses: InviteStatus[] = [
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
  'COMPLETED',
];

function toInvitationRows(value: unknown): InvitationRow[] {
  return Array.isArray(value) ? (value as InvitationRow[]) : [];
}

function toInvitationRow(value: unknown): InvitationRow | null {
  if (value === null || typeof value !== 'object') return null;
  return value as InvitationRow;
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

function hasEntryProof(invitation: InvitationRow): boolean {
  return (
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network)
  );
}

function isCurrentActiveInvite(invitation: InvitationRow): boolean {
  if (invitation.sybil_status === 'BLOCKED') return false;
  if (invitation.status === 'PENDING_ACCEPTANCE') return true;
  if (
    invitation.status === 'ACTIVATING' ||
    invitation.status === 'UNDER_REVIEW'
  ) {
    return hasEntryProof(invitation);
  }
  if (invitation.status === 'COMPLETED') {
    return (
      hasEntryProof(invitation) &&
      invitation.slot_released_at === null
    );
  }
  return false;
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

async function loadActiveInvite(
  inviterAddress: string,
): Promise<{ invitation: InvitationRow | null; error: unknown | null }> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('inviter_wallet', inviterAddress)
    .in('status', activeInviteStatuses)
    .order('created_at', { ascending: false });

  return {
    invitation: toInvitationRows(data).find(isCurrentActiveInvite) ?? null,
    error: error ?? null,
  };
}

function activeInviteConflict(invitation: InvitationRow) {
  return NextResponse.json(
    {
      error: 'A legacy one-time invitation is already active.',
      invite: toInviteRecord(invitation),
    },
    { status: 409 },
  );
}

export async function GET(request: NextRequest) {
  const inviterAddress = request.nextUrl.searchParams.get('inviter');
  if (!inviterAddress) {
    return NextResponse.json(
      { error: 'inviter query parameter is required' },
      { status: 400 },
    );
  }

  const normalized = normalizeAddress(inviterAddress);

  try {
    await requireWalletSession({ request, expectedWallet: normalized });
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;
    console.error('Failed to validate inviter wallet session:', error);
    return NextResponse.json(
      { error: 'Failed to validate wallet verification.' },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('inviter_wallet', normalized)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load invitations:', error);
    return NextResponse.json(
      { error: 'Failed to load invitations.' },
      { status: 500 },
    );
  }

  const invitationRows = toInvitationRows(data).filter(isUserVisibleInvite);
  const inviteCodes = invitationRows.map((invitation) => invitation.invite_code);
  const queueResult = inviteCodes.length > 0
    ? await supabaseAdmin
        .from('reward_queue_entries')
        .select(
          'invite_code, status, claim_requested_at, reserved_amount_wei, reserved_at',
        )
        .in('invite_code', inviteCodes)
    : { data: [] as RewardQueueRow[], error: null };

  if (queueResult.error) {
    console.error('Failed to load invitation reward claims:', queueResult.error);
    return NextResponse.json(
      { error: 'Failed to load invitation reward status.' },
      { status: 500 },
    );
  }

  const rewardQueueByInvite = new Map<string, RewardQueueRow>(
    ((queueResult.data ?? []) as RewardQueueRow[]).map((entry) => [
      entry.invite_code,
      entry,
    ]),
  );
  const invites = invitationRows.map((invitation) =>
    toInviteRecord(
      invitation,
      rewardQueueByInvite.get(invitation.invite_code),
    ),
  );

  return NextResponse.json(
    { invites },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// Legacy one-time-link creation remains for backward compatibility with older
// clients. The main VeInvite UI uses /api/referral-links instead. Keeping this
// path intentionally one-at-a-time avoids changing the semantics of already
// distributed /i/<code> links while the database safely supports two v2 slots.
export async function POST(request: NextRequest) {
  let body: { inviterAddress?: string };
  try {
    body = (await request.json()) as { inviterAddress?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.inviterAddress) {
    return NextResponse.json({ error: 'inviterAddress is required' }, { status: 400 });
  }

  const inviterAddress = normalizeAddress(body.inviterAddress);

  try {
    await requireWalletSession({ request, expectedWallet: inviterAddress });
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;
    console.error('Failed to validate inviter wallet session:', error);
    return NextResponse.json(
      { error: 'Failed to validate wallet verification.' },
      { status: 500 },
    );
  }

  const rateLimitResponse = await enforceRateLimits([
    {
      scope: 'invite_create_wallet',
      subject: inviterAddress,
      limit: 6,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  const activeCheck = await loadActiveInvite(inviterAddress);
  if (activeCheck.error) {
    console.error('Failed to check active invitation:', activeCheck.error);
    return NextResponse.json(
      { error: 'Failed to check active invitation.' },
      { status: 500 },
    );
  }
  if (activeCheck.invitation) return activeInviteConflict(activeCheck.invitation);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .insert({
        invite_code: code,
        inviter_wallet: inviterAddress,
        status: 'PENDING_ACCEPTANCE',
        invite_slot: 1,
      })
      .select(invitationColumns)
      .single();

    const insertedRow = toInvitationRow(data);
    if (!error && insertedRow) {
      return NextResponse.json(
        { invite: toInviteRecord(insertedRow) },
        { status: 201 },
      );
    }

    if (error?.code === '23505') {
      const conflictCheck = await loadActiveInvite(inviterAddress);
      if (conflictCheck.error) {
        console.error(
          'Failed to resolve invitation uniqueness conflict:',
          conflictCheck.error,
        );
        return NextResponse.json(
          { error: 'Failed to resolve invitation conflict.' },
          { status: 500 },
        );
      }
      if (conflictCheck.invitation) {
        return activeInviteConflict(conflictCheck.invitation);
      }
      continue;
    }

    console.error('Failed to create invitation:', error);
    return NextResponse.json(
      { error: 'Failed to create invitation.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: 'Failed to generate a unique invitation code.' },
    { status: 500 },
  );
}
