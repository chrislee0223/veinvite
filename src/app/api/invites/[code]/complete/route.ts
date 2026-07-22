import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { verifyActivation } from '@/lib/vebetter/missionVerifier';
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
  updated_at: string;
  apps_completed: number;
  rewards_received: number;
  vote_completed: boolean;
  reward_status: string;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  created_at,
  updated_at,
  apps_completed,
  rewards_received,
  vote_completed,
  reward_status
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
      row.reward_status === 'ELIGIBLE' ||
      row.reward_status === 'PAID'
        ? 'ELIGIBLE'
        : row.reward_status === 'FORFEITED'
          ? 'FORFEITED'
          : row.invitee_wallet
            ? 'PENDING'
            : 'NONE',
  };
}

function isDemoCompletionEnabled() {
  const explicitlyEnabled =
    process.env.VEINVITE_ALLOW_DEMO_COMPLETION ===
    'true';

  const isPreviewDeployment =
    process.env.VERCEL_ENV === 'preview';

  const isLocalDevelopment =
    process.env.VERCEL !== '1' &&
    process.env.NODE_ENV === 'development';

  return (
    explicitlyEnabled &&
    (isPreviewDeployment || isLocalDevelopment)
  );
}

export async function POST(
  _request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  /*
   * This endpoint force-completes demo missions.
   * It must never run in a Production deployment.
   *
   * It is enabled only when:
   * 1. VEINVITE_ALLOW_DEMO_COMPLETION=true, and
   * 2. the deployment is Vercel Preview or local development.
   */
  if (!isDemoCompletionEnabled()) {
    console.warn(
      'Blocked demo completion request.',
      {
        vercelEnvironment:
          process.env.VERCEL_ENV ?? 'unknown',
      },
    );

    return NextResponse.json(
      {
        error:
          'Demo completion is disabled in this environment.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

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

  const invitation = toInvitationRow(data);

  if (
    !invitation ||
    !invitation.invitee_wallet ||
    invitation.status === 'CANCELLED'
  ) {
    return NextResponse.json(
      {
        error: 'Active invite not found.',
      },
      { status: 404 },
    );
  }

  if (invitation.status === 'COMPLETED') {
    return NextResponse.json({
      invite: toInviteRecord(invitation),
      verification: {
        complete: true,
      },
    });
  }

  // Demo-only verification until real on-chain checks are connected.
  const verification = verifyActivation({
    walletConnected: true,
    distinctVeBetterAppsUsed: 3,
    b3trEarned: true,
    convertedToVot3: true,
    voted: true,
  });

  if (!verification.complete) {
    return NextResponse.json(
      {
        error: verification.reason,
      },
      { status: 422 },
    );
  }

  const {
    data: completedData,
    error: updateError,
  } = await supabaseAdmin
    .from('invitations')
    .update({
      status: 'COMPLETED',
      apps_completed: 3,
      rewards_received: 3,
      vote_completed: true,
      reward_status: 'ELIGIBLE',
    })
    .eq('invite_code', normalizedCode)
    .in('status', [
      'ACTIVATING',
      'UNDER_REVIEW',
    ])
    .select(invitationColumns)
    .maybeSingle();

  if (updateError) {
    console.error(
      'Failed to complete invitation:',
      updateError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to complete invitation.',
      },
      { status: 500 },
    );
  }

  const completedInvitation =
    toInvitationRow(completedData);

  if (!completedInvitation) {
    return NextResponse.json(
      {
        error:
          'Invitation is not in a completable state.',
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      invite: toInviteRecord(
        completedInvitation,
      ),
      verification,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
