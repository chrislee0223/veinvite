import { NextRequest, NextResponse } from 'next/server';

import {
  clampAvailableSlots,
  isReferralKey,
  PERMANENT_REFERRAL_SLOT_LIMIT,
} from '@/lib/referralLinks';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ReferralLinkRow = {
  id: string;
  inviter_wallet: string;
};

type ActiveInvitationRow = {
  invite_slot: number;
  status: string;
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  sybil_status: string;
};

function isSlotOccupying(invitation: ActiveInvitationRow): boolean {
  if (invitation.status === 'PENDING_ACCEPTANCE') return true;
  return (
    (invitation.status === 'ACTIVATING' || invitation.status === 'UNDER_REVIEW') &&
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network) &&
    invitation.sybil_status !== 'BLOCKED'
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const normalizedKey = key.trim();

  if (!isReferralKey(normalizedKey)) {
    return NextResponse.json(
      { outcome: 'invalid_link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { data: linkData, error: linkError } = await supabaseAdmin
    .from('referral_links')
    .select('id,inviter_wallet')
    .eq('referral_key', normalizedKey)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (linkError) {
    console.error('Failed to load referral link:', linkError);
    return NextResponse.json(
      { outcome: 'server_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const link = (linkData as ReferralLinkRow | null) ?? null;
  if (!link) {
    return NextResponse.json(
      { outcome: 'invalid_link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { data: invitations, error: invitationError } = await supabaseAdmin
    .from('invitations')
    .select('invite_slot,status,eligibility_check_id,activation_network,sybil_status')
    .eq('inviter_wallet', link.inviter_wallet)
    .in('status', ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW']);

  if (invitationError) {
    console.error('Failed to load referral slot availability:', invitationError);
    return NextResponse.json(
      { outcome: 'server_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const occupied = new Set<number>();
  for (const invitation of (invitations ?? []) as ActiveInvitationRow[]) {
    if (isSlotOccupying(invitation)) occupied.add(Number(invitation.invite_slot));
  }

  const slotsAvailable = clampAvailableSlots(
    PERMANENT_REFERRAL_SLOT_LIMIT - occupied.size,
  );

  return NextResponse.json(
    {
      outcome: slotsAvailable > 0 ? 'available' : 'slots_full',
      slotsAvailable,
      slotLimit: PERMANENT_REFERRAL_SLOT_LIMIT,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
