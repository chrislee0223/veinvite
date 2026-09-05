import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import { verifyActivation } from '@/lib/vebetter/missionVerifier';
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
  created_at: string;
  updated_at: string;
  apps_completed: number;
  rewards_received: number;
  vot3_converted: boolean;
  vote_completed: boolean;
  reward_status: RewardEligibility;
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
  vot3_converted,
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
      row.reward_status,
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
  request: NextRequest,
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
   *
   * Even in Preview/local development, only the verified invitee wallet may
   * mutate its own demo invitation. Demo mission completion is intentionally
   * NOT enough to make a referral reward-eligible. The database trigger keeps
   * reward_status=PENDING until real on-chain app and vote evidence exists.
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

  try {
    await requireWalletSession({
      request,
      expectedWallet: invitation.invitee_wallet,
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
      'Failed to validate demo invitee wallet session:',
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

  if (invitation.status === 'COMPLETED') {
    return NextResponse.json({
      invite: toInviteRecord(invitation),
      verification: {
        complete: true,
      },
    });
  }

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
      vot3_converted: true,
      vote_completed: true,
      // The eligibility trigger deliberately keeps this PENDING because demo
      // completion does not contain on-chain block/round evidence.
      reward_status: 'PENDING',
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
