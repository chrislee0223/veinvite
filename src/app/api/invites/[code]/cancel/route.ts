import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
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
} from '@/lib/types';

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  reward_status: RewardEligibility;
  created_at: string;
  updated_at: string;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at
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
    updatedAt: row.updated_at,
    rewardEligibility:
      row.reward_status,
  };
}

async function loadInvitationForInviter(
  inviteCode: string,
  inviterWallet: string,
): Promise<{
  invitation: InvitationRow | null;
  error: unknown | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('invite_code', inviteCode)
    .eq('inviter_wallet', inviterWallet)
    .maybeSingle();

  return {
    invitation: toInvitationRow(data),
    error: error ?? null,
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
  const normalizedCode =
    code.trim().toUpperCase();

  let body: {
    inviterAddress?: string;
  };

  try {
    body = (await request.json()) as {
      inviterAddress?: string;
    };
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    );
  }

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

  try {
    await requireWalletSession({
      request,
      expectedWallet: normalizedInviter,
    });
  } catch (authError) {
    if (
      authError instanceof
      WalletAuthenticationError
    ) {
      return NextResponse.json(
        {
          error: authError.message,
        },
        {
          status: authError.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to validate inviter wallet session:',
      authError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to validate wallet verification.',
      },
      { status: 500 },
    );
  }

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
    normalizeAddress(
      invitation.inviter_wallet,
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to cancel this invite.',
      },
      { status: 403 },
    );
  }

  if (invitation.status === 'CANCELLED') {
    return NextResponse.json({
      invite: toInviteRecord(invitation),
    });
  }

  // Once an invitee has accepted the referral, the inviter must not be able
  // to cancel the journey underneath them or evade an UNDER_REVIEW state.
  // Cancellation is only for an unused PENDING_ACCEPTANCE link.
  if (
    invitation.status !==
      'PENDING_ACCEPTANCE' ||
    invitation.invitee_wallet !== null
  ) {
    return NextResponse.json(
      {
        error:
          'Accepted invitations cannot be cancelled.',
      },
      { status: 409 },
    );
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
    .eq('status', 'PENDING_ACCEPTANCE')
    .is('invitee_wallet', null)
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
    // A second near-simultaneous request can observe PENDING_ACCEPTANCE before
    // the first request commits, then lose the conditional UPDATE race. Re-read
    // the same inviter-owned row and treat an already committed cancellation as
    // success. If the invite was accepted or changed to any other state, keep
    // failing closed with 409.
    const retryState =
      await loadInvitationForInviter(
        normalizedCode,
        normalizedInviter,
      );

    if (retryState.error) {
      console.error(
        'Failed to verify invitation cancellation retry:',
        retryState.error,
      );

      return NextResponse.json(
        {
          error: 'Failed to verify invitation cancellation.',
        },
        { status: 500 },
      );
    }

    if (
      retryState.invitation?.status ===
      'CANCELLED'
    ) {
      return NextResponse.json({
        invite: toInviteRecord(
          retryState.invitation,
        ),
      });
    }

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
