import { NextRequest, NextResponse } from 'next/server';

import {
  createCode,
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

const invitationColumns = [
  'invite_code',
  'inviter_wallet',
  'invitee_wallet',
  'status',
  'created_at',
].join(',');

function toInviteRecord(
  row: InvitationRow,
): InviteRecord {
  return {
    code: row.invite_code,
    inviterAddress: row.inviter_wallet,
    ...(row.invitee_wallet
      ? { inviteeAddress: row.invitee_wallet }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    rewardEligibility: 'NONE',
  };
}

export async function GET(
  request: NextRequest,
) {
  const inviterAddress =
    request.nextUrl.searchParams.get('inviter');

  if (!inviterAddress) {
    return NextResponse.json(
      {
        error:
          'inviter query parameter is required',
      },
      { status: 400 },
    );
  }

  const normalized =
    normalizeAddress(inviterAddress);

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('inviter_wallet', normalized)
    .order('created_at', {
      ascending: false,
    });

  if (error) {
    console.error(
      'Failed to load invitations:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Failed to load invitations.',
      },
      { status: 500 },
    );
  }

  const invites = (
    (data ?? []) as InvitationRow[]
  ).map(toInviteRecord);

  return NextResponse.json({ invites });
}

export async function POST(
  request: NextRequest,
) {
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

  const inviterAddress = normalizeAddress(
    body.inviterAddress,
  );

  const { data: activeRows, error: activeError } =
    await supabaseAdmin
      .from('invitations')
      .select(invitationColumns)
      .eq('inviter_wallet', inviterAddress)
      .in('status', [
        'PENDING_ACCEPTANCE',
        'ACTIVATING',
        'UNDER_REVIEW',
      ])
      .order('created_at', {
        ascending: false,
      })
      .limit(1);

  if (activeError) {
    console.error(
      'Failed to check active invitation:',
      activeError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to check active invitation.',
      },
      { status: 500 },
    );
  }

  const activeRow = (
    activeRows as InvitationRow[] | null
  )?.[0];

  if (activeRow) {
    return NextResponse.json(
      {
        error:
          'Only one active invitation is allowed.',
        invite: toInviteRecord(activeRow),
      },
      { status: 409 },
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();

    const { data, error } = await supabaseAdmin
      .from('invitations')
      .insert({
        invite_code: code,
        inviter_wallet: inviterAddress,
        status: 'PENDING_ACCEPTANCE',
      })
      .select(invitationColumns)
      .single();

    if (!error && data) {
      return NextResponse.json(
        {
          invite: toInviteRecord(
            data as InvitationRow,
          ),
        },
        { status: 201 },
      );
    }

    // 초대코드 중복이면 새 코드를 만들어 재시도합니다.
    if (error?.code === '23505') {
      continue;
    }

    console.error(
      'Failed to create invitation:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Failed to create invitation.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      error:
        'Failed to generate a unique invitation code.',
    },
    { status: 500 },
  );
}
