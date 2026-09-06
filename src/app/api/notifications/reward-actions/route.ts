import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isRewardActionQueueStatus,
  type RewardActionItem,
} from '@/lib/notifications/rewardAction';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type QueueRow = {
  invite_code: string;
  status: string;
  reserved_amount_wei: string | number | null;
  reserved_at: string | null;
  eligible_at: string | null;
};

type InvitationRow = {
  invite_code: string;
  invitee_wallet: string | null;
  inviter_wallet: string;
  status: string;
  reward_status: string | null;
  reward_eligible_at: string | null;
  sybil_status: string | null;
  sybil_checked_at: string | null;
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

function positiveWei(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  if (!/^\d+$/u.test(normalized)) return null;

  try {
    return BigInt(normalized) > 0n ? normalized : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  let walletAddress: string;

  try {
    const session = await requireWalletSession({ request });
    walletAddress = session.walletAddress.toLowerCase();
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return noStoreJson(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(
      'Failed to validate notification reward-action session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const queueResult = await supabaseAdmin
      .from('reward_queue_entries')
      .select(
        'invite_code, status, reserved_amount_wei, reserved_at, eligible_at',
      )
      .eq('recipient_wallet', walletAddress)
      .in('status', ['AWAITING_CLAIM', 'QUEUED', 'ASSIGNED'])
      .order('eligible_at', { ascending: true })
      .order('invite_code', { ascending: true });

    if (queueResult.error) {
      throw new Error(
        `Notification reward actions could not be loaded: ${queueResult.error.message}`,
      );
    }

    const queueRows = ((queueResult.data ?? []) as QueueRow[]).filter(
      (row) =>
        isRewardActionQueueStatus(row.status) &&
        positiveWei(row.reserved_amount_wei) !== null &&
        typeof row.reserved_at === 'string' &&
        !Number.isNaN(Date.parse(row.reserved_at)),
    );

    if (queueRows.length === 0) {
      return noStoreJson({
        walletAddress,
        actions: [],
      });
    }

    const inviteCodes = queueRows.map((row) => row.invite_code);
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, invitee_wallet, inviter_wallet, status, reward_status, reward_eligible_at, sybil_status, sybil_checked_at',
      )
      .eq('inviter_wallet', walletAddress)
      .in('invite_code', inviteCodes);

    if (invitationResult.error) {
      throw new Error(
        `Notification reward action invitations could not be loaded: ${invitationResult.error.message}`,
      );
    }

    const invitationByCode = new Map<string, InvitationRow>(
      ((invitationResult.data ?? []) as InvitationRow[]).map((row) => [
        row.invite_code,
        row,
      ]),
    );

    const actions: RewardActionItem[] = queueRows.flatMap((queue) => {
      const invitation = invitationByCode.get(queue.invite_code);
      const amount = positiveWei(queue.reserved_amount_wei);

      if (
        !invitation ||
        invitation.inviter_wallet.toLowerCase() !== walletAddress ||
        invitation.status !== 'COMPLETED' ||
        invitation.reward_status !== 'ELIGIBLE' ||
        invitation.reward_eligible_at === null ||
        invitation.sybil_status !== 'CLEAR' ||
        invitation.sybil_checked_at === null ||
        queue.eligible_at !== invitation.reward_eligible_at ||
        !amount ||
        !queue.reserved_at ||
        !isRewardActionQueueStatus(queue.status)
      ) {
        return [];
      }

      return [{
        inviteCode: queue.invite_code,
        status: queue.status,
        reservedAmountWei: amount,
        reservedAt: queue.reserved_at,
        friendWallet:
          invitation.invitee_wallet?.toLowerCase() ?? null,
      }];
    });

    return noStoreJson({
      walletAddress,
      actions,
    });
  } catch (error) {
    console.error(
      'Failed to load notification reward actions:',
      error,
    );
    return noStoreJson(
      { error: 'Could not load reward actions.' },
      { status: 500 },
    );
  }
}
