import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  deriveInviteNotification,
  INVITE_NOTIFICATION_STAGE,
  selectUnreadInviteNotification,
  type InviteNotificationSource,
  type PaidRewardEvidence,
} from '@/lib/notifications/inviteNotificationState';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;

const invitationColumns = `
  invite_code,
  invitee_wallet,
  status,
  updated_at,
  activated_at,
  apps_completed,
  apps_completed_at,
  vot3_converted,
  vot3_converted_at,
  vote_completed,
  vote_completed_at,
  reward_status,
  eligibility_check_id,
  activation_network
` as const;

type InvitationRow = InviteNotificationSource & {
  eligibility_check_id: string | number | null;
  activation_network: string | null;
};

type NotificationStateRow = {
  invite_code: string;
  highest_stage: number;
};

function noStoreJson(
  body: unknown,
  init?: ResponseInit,
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function userVisibleAcceptedInvite(
  invitation: InvitationRow,
): boolean {
  if (
    invitation.status === 'PENDING_ACCEPTANCE' ||
    invitation.status === 'CANCELLED'
  ) {
    return true;
  }

  return (
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network)
  );
}

function walletAuthResponse(
  error: unknown,
): NextResponse | null {
  if (error instanceof WalletAuthenticationError) {
    return noStoreJson(
      { error: error.message },
      { status: error.status },
    );
  }

  return null;
}

async function loadPaidRewards(
  inviteCodes: string[],
): Promise<Map<string, PaidRewardEvidence>> {
  if (inviteCodes.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('reward_payouts')
    .select(
      'invite_code, amount_wei, status, tx_id, paid_at',
    )
    .in('invite_code', inviteCodes);

  if (error) {
    throw new Error(
      `Notification reward evidence could not be loaded: ${error.message}`,
    );
  }

  return new Map(
    ((data ?? []) as PaidRewardEvidence[]).map(
      (reward) => [reward.invite_code, reward],
    ),
  );
}

export async function GET(request: NextRequest) {
  let wallet: string;

  try {
    const session = await requireWalletSession({
      request,
    });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);

    if (response) {
      return response;
    }

    console.error(
      'Failed to validate notification wallet session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select(invitationColumns)
      .eq('inviter_wallet', wallet)
      .order('created_at', { ascending: false });

    if (invitationResult.error) {
      throw new Error(
        `Invitation notifications could not be loaded: ${invitationResult.error.message}`,
      );
    }

    const invitations = (
      (invitationResult.data ?? []) as InvitationRow[]
    ).filter(userVisibleAcceptedInvite);
    const inviteCodes = invitations.map(
      (invitation) => invitation.invite_code,
    );

    const [paidRewards, stateResult] = await Promise.all([
      loadPaidRewards(inviteCodes),
      inviteCodes.length > 0
        ? supabaseAdmin
            .from('invite_notification_state')
            .select('invite_code, highest_stage')
            .eq('inviter_wallet', wallet)
            .in('invite_code', inviteCodes)
        : Promise.resolve({
            data: [] as NotificationStateRow[],
            error: null,
          }),
    ]);

    if (stateResult.error) {
      throw new Error(
        `Notification read state could not be loaded: ${stateResult.error.message}`,
      );
    }

    const acknowledgedByInvite = new Map(
      ((stateResult.data ?? []) as NotificationStateRow[]).map(
        (state) => [
          state.invite_code,
          Number(state.highest_stage) || 0,
        ]),
    );

    const candidates = invitations
      .map((invitation) => {
        const notification = deriveInviteNotification(
          invitation,
          paidRewards.get(invitation.invite_code) ?? null,
        );

        return notification
          ? {
              notification,
              acknowledgedStage:
                acknowledgedByInvite.get(
                  invitation.invite_code,
                ) ?? 0,
            }
          : null;
      })
      .filter(
        (
          value,
        ): value is NonNullable<typeof value> =>
          value !== null,
      );

    const selected =
      selectUnreadInviteNotification(candidates);

    return noStoreJson({
      notification: selected.notification,
      unreadCount: selected.unreadCount,
    });
  } catch (error) {
    console.error(
      'Failed to load VeInvite notifications:',
      error,
    );
    return noStoreJson(
      { error: 'Could not load notifications.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return noStoreJson(
      { error: 'Invalid request origin.' },
      { status: 403 },
    );
  }

  let body: {
    inviteCode?: unknown;
    stage?: unknown;
  };

  try {
    body = (await request.json()) as {
      inviteCode?: unknown;
      stage?: unknown;
    };
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const inviteCode = String(
    body.inviteCode ?? '',
  )
    .trim()
    .toUpperCase();
  const stage = Number(body.stage);

  if (
    !INVITE_CODE_PATTERN.test(inviteCode) ||
    !Number.isInteger(stage) ||
    stage < INVITE_NOTIFICATION_STAGE.accepted ||
    stage > INVITE_NOTIFICATION_STAGE.rewardPaid
  ) {
    return noStoreJson(
      { error: 'Invalid notification acknowledgement.' },
      { status: 400 },
    );
  }

  let wallet: string;

  try {
    const session = await requireWalletSession({
      request,
    });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);

    if (response) {
      return response;
    }

    console.error(
      'Failed to validate notification acknowledgement session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select(invitationColumns)
      .eq('invite_code', inviteCode)
      .eq('inviter_wallet', wallet)
      .maybeSingle();

    if (invitationResult.error) {
      throw new Error(
        `Notification invitation could not be loaded: ${invitationResult.error.message}`,
      );
    }

    const invitation =
      invitationResult.data as InvitationRow | null;

    if (
      !invitation ||
      !userVisibleAcceptedInvite(invitation)
    ) {
      return noStoreJson(
        { error: 'Notification not found.' },
        { status: 404 },
      );
    }

    const paidRewards = await loadPaidRewards([
      inviteCode,
    ]);
    const current = deriveInviteNotification(
      invitation,
      paidRewards.get(inviteCode) ?? null,
    );

    if (!current || stage > current.stage) {
      return noStoreJson(
        { error: 'Notification state has changed.' },
        { status: 409 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      'acknowledge_invite_notification',
      {
        p_invite_code: inviteCode,
        p_inviter_wallet: wallet,
        p_stage: stage,
      },
    );

    if (error) {
      throw new Error(
        `Notification acknowledgement failed: ${error.message}`,
      );
    }

    return noStoreJson({
      acknowledged: true,
      state: data,
    });
  } catch (error) {
    console.error(
      'Failed to acknowledge VeInvite notification:',
      error,
    );
    return noStoreJson(
      { error: 'Could not mark notification as read.' },
      { status: 500 },
    );
  }
}
