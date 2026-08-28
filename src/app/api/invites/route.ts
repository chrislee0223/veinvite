import { NextRequest, NextResponse } from 'next/server';

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
};

type RewardQueueRow = {
  invite_code: string;
  status: RewardQueueStatus;
  claim_requested_at: string | null;
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
  activation_network
` as const;

const activeInviteStatuses: InviteStatus[] = [
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
];

function toInvitationRows(
  value: unknown,
): InvitationRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as InvitationRow[];
}

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
  rewardQueue?: RewardQueueRow,
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
    rewardEligibility: row.reward_status,
    ...(rewardQueue
      ? {
          rewardQueueStatus:
            rewardQueue.status,
        }
      : {}),
    ...(rewardQueue?.claim_requested_at
      ? {
          rewardClaimRequestedAt:
            rewardQueue.claim_requested_at,
        }
      : {}),
  };
}

function walletAuthResponse(
  error: unknown,
): NextResponse | null {
  if (error instanceof WalletAuthenticationError) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  return null;
}

function isCurrentActiveInvite(
  invitation: InvitationRow,
): boolean {
  if (
    invitation.status ===
    'PENDING_ACCEPTANCE'
  ) {
    return true;
  }

  if (
    invitation.status === 'ACTIVATING' ||
    invitation.status === 'UNDER_REVIEW'
  ) {
    // Invitations accepted before entry-proof enforcement are kept as audit
    // history, but must not permanently consume the inviter's active slot.
    return (
      invitation.eligibility_check_id !== null &&
      Boolean(invitation.activation_network)
    );
  }

  return false;
}

async function loadActiveInvite(
  inviterAddress: string,
): Promise<{
  invitation: InvitationRow | null;
  error: unknown | null;
}> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('inviter_wallet', inviterAddress)
    .in('status', activeInviteStatuses)
    .order('created_at', {
      ascending: false,
    });

  return {
    invitation:
      toInvitationRows(data).find(
        isCurrentActiveInvite,
      ) ?? null,
    error: error ?? null,
  };
}

function activeInviteConflict(
  invitation: InvitationRow,
) {
  return NextResponse.json(
    {
      error:
        'Only one active invitation is allowed.',
      invite: toInviteRecord(invitation),
    },
    { status: 409 },
  );
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

  try {
    await requireWalletSession({
      request,
      expectedWallet: normalized,
    });
  } catch (error) {
    const response =
      walletAuthResponse(error);

    if (response) {
      return response;
    }

    console.error(
      'Failed to validate inviter wallet session:',
      error,
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

  const invitationRows =
    toInvitationRows(data);
  const inviteCodes = invitationRows.map(
    (invitation) =>
      invitation.invite_code,
  );
  const queueResult =
    inviteCodes.length > 0
      ? await supabaseAdmin
          .from('reward_queue_entries')
          .select(
            'invite_code, status, claim_requested_at',
          )
          .in('invite_code', inviteCodes)
      : {
          data: [] as RewardQueueRow[],
          error: null,
        };

  if (queueResult.error) {
    console.error(
      'Failed to load invitation reward claims:',
      queueResult.error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load invitation reward status.',
      },
      { status: 500 },
    );
  }

  const rewardQueueByInvite =
    new Map<string, RewardQueueRow>(
      (
        (queueResult.data ??
          []) as RewardQueueRow[]
      ).map((entry) => [
        entry.invite_code,
        entry,
      ]),
    );
  const invites = invitationRows.map(
    (invitation) =>
      toInviteRecord(
        invitation,
        rewardQueueByInvite.get(
          invitation.invite_code,
        ),
      ),
  );

  return NextResponse.json(
    { invites },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
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

  const inviterAddress = normalizeAddress(
    body.inviterAddress,
  );

  try {
    await requireWalletSession({
      request,
      expectedWallet: inviterAddress,
    });
  } catch (error) {
    const response =
      walletAuthResponse(error);

    if (response) {
      return response;
    }

    console.error(
      'Failed to validate inviter wallet session:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to validate wallet verification.',
      },
      { status: 500 },
    );
  }

  const activeCheck =
    await loadActiveInvite(inviterAddress);

  if (activeCheck.error) {
    console.error(
      'Failed to check active invitation:',
      activeCheck.error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to check active invitation.',
      },
      { status: 500 },
    );
  }

  if (activeCheck.invitation) {
    return activeInviteConflict(
      activeCheck.invitation,
    );
  }

  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const code = createCode();

    const { data, error } =
      await supabaseAdmin
        .from('invitations')
        .insert({
          invite_code: code,
          inviter_wallet: inviterAddress,
          status: 'PENDING_ACCEPTANCE',
        })
        .select(invitationColumns)
        .single();

    const insertedRow =
      toInvitationRow(data);

    if (!error && insertedRow) {
      return NextResponse.json(
        {
          invite:
            toInviteRecord(insertedRow),
        },
        { status: 201 },
      );
    }

    if (error?.code === '23505') {
      // A unique violation can mean either a rare invite-code collision or a
      // concurrent request that won the one-active-invite race. Re-read the
      // invariant so the latter returns the correct 409 instead of retrying
      // until it becomes a misleading 500.
      const conflictCheck =
        await loadActiveInvite(inviterAddress);

      if (conflictCheck.error) {
        console.error(
          'Failed to resolve invitation uniqueness conflict:',
          conflictCheck.error,
        );

        return NextResponse.json(
          {
            error:
              'Failed to resolve invitation conflict.',
          },
          { status: 500 },
        );
      }

      if (conflictCheck.invitation) {
        return activeInviteConflict(
          conflictCheck.invitation,
        );
      }

      continue;
    }

    console.error(
      'Failed to create invitation:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to create invitation.',
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
