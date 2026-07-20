import {
  NextRequest,
  NextResponse,
} from 'next/server';

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
    updatedAt: row.created_at,
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

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } = await context.params;
  const normalizedCode = code.toUpperCase();

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

  const row = toInvitationRow(data);

  if (!row || row.status === 'CANCELLED') {
    return NextResponse.json(
      {
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    invite: toInviteRecord(row),
  });
}
