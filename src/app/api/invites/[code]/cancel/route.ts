import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  normalizeAddress,
} from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  InviteRecord,
  InviteStatus,
} from '@/lib/types';

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  created_at: string;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  created_at
` as const;

function toInvitationRow(
  value: unknown,
): InvitationRow | null {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return null;
  }

  return value as InvitationRow;
}

function toInviteRecord(
  row: InvitationRow,
): InviteRecord {
  return {
    code: row.invite_code,
    inviterAddress: row.inviter_wallet,
    ...(row.invitee_wallet
      ? {
          inviteeAddress: row.invitee_wallet,
        }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: new Date().toISOString(),
    rewardEligibility:
      row.status === 'COMPLETED'
        ? 'ELIGIBLE'
        : row.status === 'CANCELLED'
          ? 'FORFEITED'
          : row.invitee_wallet
            ? 'PENDING'
            : 'NONE',
  };
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } = await context.params;
  const normalizedCode = code.toUpperCase();

  const body = (await request.json()) as {
    inviterAddress?: string;
  };

  if (!body.inviterAddress) {
    return NextResponse.json(
      {
        error: 'inviterAddress is required',
      },
      { status: 400 },
    );
  }

  const normalizedInviter =
    normalizeAddress(body.inviterAddress);

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('invite_code', normalizedCode)
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load invitation:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Failed to load invitation.',
      },
      { status: 500 },
    );
  }

  const invitation = toInvitationRow(data);

  if (!invitation) {
    return NextResponse.json(
      {
        error: 'Invite not found.',
      },
      { status: 404 },
    );
  }

  if (
    normalizedInviter !==
    normalizeAddress(invitation.inviter_wallet)
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to cancel this invite.',
      },
      { status: 403 },
    );
  }

  if (invitation.status === 'COMPLETED') {
    return NextResponse.json(
      {
        error:
          'Completed invitations cannot be cancelled.',
      },
      { status: 409 },
    );
  }

  if (invitation.status === 'CANCELLED') {
    return NextResponse.json({
      invite: toInviteRecord(invitation),
    });
  }

  const {
    data: cancelledData,
    error: cancelError,
  } = await supabaseAdmin
    .from('invitations')
    .update({
      status: 'CANCELLED',
    })
    .eq('invite_code', normalizedCode)
    .eq('inviter_wallet', normalizedInviter)
    .neq('status', 'COMPLETED')
    .select(invitationColumns)
    .maybeSingle();

  if (cancelError) {
    console.error(
      'Failed to cancel invitation:',
      cancelError,
    );

    return NextResponse.json(
      {
        error: 'Failed to cancel invitation.',
      },
      { status: 500 },
    );
  }

  const cancelledInvitation =
    toInvitationRow(cancelledData);

  if (!cancelledInvitation) {
    return NextResponse.json(
      {
        error:
          'Invitation could not be cancelled.',
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    invite: toInviteRecord(
      cancelledInvitation,
    ),
  });
}
