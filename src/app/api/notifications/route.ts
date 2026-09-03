import {
  NextRequest,
  NextResponse,
} from 'next/server';

import type {
  InviteNotificationSource,
  PaidRewardEvidence,
} from '@/lib/notifications/inviteNotificationState';
import {
  deriveUnreadInviteNotificationV2,
  sortUnreadInviteNotificationsV2,
  type InviteNotificationPayloadV2,
  type InviteNotificationReadStateV2,
  type RewardReadyEvidence,
} from '@/lib/notifications/inviteNotificationStateV2';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MAX_ACKNOWLEDGEMENTS = 10;

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
  activation_network,
  ineligibility_check_id,
  ineligible_at
` as const;

type InvitationRow = InviteNotificationSource & {
  eligibility_check_id: string | number | null;
  activation_network: string | null;
};

type NotificationStateRow = {
  invite_code: string;
  highest_stage: number;
  dapp_progress_acknowledged: number;
  reward_ready_acknowledged_at: string | null;
};

type NotificationAcknowledgement = {
  inviteCode: string;
  stage: number;
  dappProgress: number | null;
  rewardReady: boolean;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
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
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return noStoreJson(
    { error: error.message },
    { status: error.status },
  );
}

function userVisibleAcceptedInvite(invitation: InvitationRow): boolean {
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

function defaultReadState(): InviteNotificationReadStateV2 {
  return {
    highestStage: 0,
    dappProgressAcknowledged: 0,
    rewardReadyAcknowledgedAt: null,
  };
}

async function loadPaidRewards(
  paidInviteCodes: string[],
): Promise<PaidRewardEvidence[]> {
  if (paidInviteCodes.length === 0) return [];

  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select(
      'invite_code, amount_wei, status, tx_id, paid_at',
    )
    .eq('status', 'PAID')
    .in('invite_code', paidInviteCodes);

  if (payoutResult.error) {
    throw new Error(
      `Notification reward evidence could not be loaded: ${payoutResult.error.message}`,
    );
  }

  return (payoutResult.data ?? []) as PaidRewardEvidence[];
}

async function loadUnreadNotifications(
  wallet: string,
): Promise<InviteNotificationPayloadV2[]> {
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

  if (inviteCodes.length === 0) return [];

  const paidInviteCodes = invitations
    .filter((invitation) => invitation.reward_status === 'PAID')
    .map((invitation) => invitation.invite_code);

  const [stateResult, queueResult, paidRewards] = await Promise.all([
    supabaseAdmin
      .from('invite_notification_state')
      .select(
        'invite_code, highest_stage, dapp_progress_acknowledged, reward_ready_acknowledged_at',
      )
      .eq('inviter_wallet', wallet)
      .in('invite_code', inviteCodes),
    supabaseAdmin
      .from('reward_queue_entries')
      .select(
        'invite_code, status, reserved_amount_wei, reserved_at',
      )
      .in('invite_code', inviteCodes),
    loadPaidRewards(paidInviteCodes),
  ]);

  if (stateResult.error) {
    throw new Error(
      `Notification read state could not be loaded: ${stateResult.error.message}`,
    );
  }
  if (queueResult.error) {
    throw new Error(
      `Notification reward reservation could not be loaded: ${queueResult.error.message}`,
    );
  }

  const stateByInvite = new Map<string, InviteNotificationReadStateV2>(
    ((stateResult.data ?? []) as NotificationStateRow[]).map((state) => [
      state.invite_code,
      {
        highestStage: Number(state.highest_stage) || 0,
        dappProgressAcknowledged:
          Number(state.dapp_progress_acknowledged) || 0,
        rewardReadyAcknowledgedAt:
          state.reward_ready_acknowledged_at,
      },
    ]),
  );
  const queueByInvite = new Map<string, RewardReadyEvidence>(
    ((queueResult.data ?? []) as RewardReadyEvidence[]).map((entry) => [
      entry.invite_code,
      entry,
    ]),
  );
  const paidByInvite = new Map<string, PaidRewardEvidence>(
    paidRewards.map((entry) => [entry.invite_code, entry]),
  );

  const unread = invitations
    .map((invitation) =>
      deriveUnreadInviteNotificationV2({
        invitation,
        paidReward: paidByInvite.get(invitation.invite_code) ?? null,
        rewardReady: queueByInvite.get(invitation.invite_code) ?? null,
        readState:
          stateByInvite.get(invitation.invite_code) ?? defaultReadState(),
      }),
    )
    .filter(
      (value): value is InviteNotificationPayloadV2 => value !== null,
    );

  return sortUnreadInviteNotificationsV2(unread);
}

function parseAcknowledgement(value: unknown): NotificationAcknowledgement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const inviteCode = String(raw.inviteCode ?? '')
    .trim()
    .toUpperCase();
  const stage = Number(raw.stage);
  const dappProgress =
    raw.dappProgress === null || raw.dappProgress === undefined
      ? null
      : Number(raw.dappProgress);
  const rewardReady = raw.rewardReady === true;

  if (
    !INVITE_CODE_PATTERN.test(inviteCode) ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > 6 ||
    (
      dappProgress !== null &&
      (!Number.isInteger(dappProgress) || dappProgress < 0 || dappProgress > 3)
    )
  ) {
    return null;
  }

  return {
    inviteCode,
    stage,
    dappProgress,
    rewardReady,
  };
}

function acknowledgementForNotification(
  notification: InviteNotificationPayloadV2,
): NotificationAcknowledgement {
  return {
    inviteCode: notification.inviteCode,
    stage: notification.stage,
    dappProgress: notification.dappProgress,
    rewardReady: notification.kind === 'REWARD_READY',
  };
}

function acknowledgementMatchesCurrent(
  requested: NotificationAcknowledgement,
  current: InviteNotificationPayloadV2,
): boolean {
  return (
    requested.inviteCode === current.inviteCode &&
    requested.stage === current.stage &&
    requested.dappProgress === current.dappProgress &&
    requested.rewardReady === (current.kind === 'REWARD_READY')
  );
}

export async function GET(request: NextRequest) {
  let wallet: string;

  try {
    const session = await requireWalletSession({ request });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

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
    const notifications = await loadUnreadNotifications(wallet);

    return noStoreJson({
      notification: notifications[0] ?? null,
      notifications,
      unreadCount: notifications.length,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const rawItems = Array.isArray(body.acknowledgements)
    ? body.acknowledgements
    : [body];

  if (
    rawItems.length < 1 ||
    rawItems.length > MAX_ACKNOWLEDGEMENTS
  ) {
    return noStoreJson(
      { error: 'Invalid notification acknowledgement count.' },
      { status: 400 },
    );
  }

  const acknowledgements = rawItems.map(parseAcknowledgement);
  if (acknowledgements.some((item) => item === null)) {
    return noStoreJson(
      { error: 'Invalid notification acknowledgement.' },
      { status: 400 },
    );
  }

  let wallet: string;
  try {
    const session = await requireWalletSession({ request });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

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
    const currentNotifications = await loadUnreadNotifications(wallet);
    const currentByInvite = new Map(
      currentNotifications.map((notification) => [
        notification.inviteCode,
        notification,
      ]),
    );

    for (const requested of acknowledgements as NotificationAcknowledgement[]) {
      const current = currentByInvite.get(requested.inviteCode);
      if (!current || !acknowledgementMatchesCurrent(requested, current)) {
        return noStoreJson(
          { error: 'Notification state has changed.' },
          { status: 409 },
        );
      }
    }

    const states = [];
    for (const requested of acknowledgements as NotificationAcknowledgement[]) {
      const current = currentByInvite.get(requested.inviteCode)!;
      const effective = acknowledgementForNotification(current);
      const stageForRpc =
        current.kind === 'DAPP_PROGRESS' &&
        (current.dappProgress ?? 0) < 3
          ? null
          : effective.stage;

      const { data, error } = await supabaseAdmin.rpc(
        'acknowledge_invite_notification_v2',
        {
          p_invite_code: effective.inviteCode,
          p_inviter_wallet: wallet,
          p_stage: stageForRpc,
          p_dapp_progress: effective.dappProgress,
          p_reward_ready: effective.rewardReady,
        },
      );

      if (error) {
        throw new Error(
          `Notification acknowledgement failed: ${error.message}`,
        );
      }
      states.push(data);
    }

    return noStoreJson({
      acknowledged: true,
      states,
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
