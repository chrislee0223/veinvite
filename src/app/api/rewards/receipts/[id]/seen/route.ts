import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { INVITE_NOTIFICATION_STAGE } from '@/lib/notifications/inviteNotificationState';
import {
  toRewardReceipt,
  type RewardReceiptRow,
} from '@/lib/rewards/rewardReceipt';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const ACKNOWLEDGE_INTENT =
  'ACKNOWLEDGE_REWARD_RECEIPT';

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function parseReceiptId(
  value: string,
): string {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      'Reward receipt id must be a positive integer.',
    );
  }

  const normalized = BigInt(value);

  if (normalized < 1n) {
    throw new Error(
      'Reward receipt id must be a positive integer.',
    );
  }

  return normalized.toString();
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let receiptId: string;

  try {
    const { id } = await context.params;
    receiptId = parseReceiptId(id);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid reward receipt id.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== ACKNOWLEDGE_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${ACKNOWLEDGE_INTENT}.`,
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();

    const { data, error } =
      await supabaseAdmin.rpc(
        'mark_reward_receipt_seen',
        {
          p_receipt_id: receiptId,
          p_wallet: walletAddress,
        },
      );

    if (error) {
      throw new Error(
        `Reward receipt acknowledgement failed: ${error.message}`,
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error: 'Reward receipt not found.',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const receipt = toRewardReceipt(
      data as RewardReceiptRow,
    );

    // The rich reward receipt and the notification bell describe the same
    // finalized payout. Keep the legacy stage acknowledgement for backwards
    // compatibility, then record/read the same event in persistent history so
    // the user never sees the paid reward twice.
    const { error: notificationError } =
      await supabaseAdmin.rpc(
        'acknowledge_invite_notification',
        {
          p_invite_code: receipt.inviteCode,
          p_inviter_wallet: walletAddress,
          p_stage:
            INVITE_NOTIFICATION_STAGE.rewardPaid,
        },
      );

    if (notificationError) {
      throw new Error(
        `Reward notification acknowledgement failed: ${notificationError.message}`,
      );
    }

    let friendWallet: string | null = null;
    const friendResult = await supabaseAdmin
      .from('invitations')
      .select('invitee_wallet')
      .eq('invite_code', receipt.inviteCode)
      .eq('inviter_wallet', walletAddress)
      .maybeSingle();

    if (!friendResult.error) {
      const value = friendResult.data?.invitee_wallet;
      if (typeof value === 'string') {
        friendWallet = value.toLowerCase();
      }
    } else {
      console.warn(
        'Reward notification friend context could not be loaded:',
        friendResult.error.message,
      );
    }

    const historyResult = await supabaseAdmin.rpc(
      'record_invite_notification_history',
      {
        p_inviter_wallet: walletAddress,
        p_invite_code: receipt.inviteCode,
        p_kind: 'REWARD_PAID',
        p_stage: INVITE_NOTIFICATION_STAGE.rewardPaid,
        p_event_at: receipt.paidAt,
        p_reward_amount_wei: receipt.amountWei,
        p_dapp_progress: 3,
        p_collapsed_progress: false,
        p_friend_wallet: friendWallet,
      },
    );

    if (historyResult.error) {
      throw new Error(
        `Reward notification history could not be recorded: ${historyResult.error.message}`,
      );
    }

    const historyId = String(historyResult.data ?? '');
    if (!/^[1-9][0-9]*$/.test(historyId)) {
      throw new Error('Reward notification history id is invalid.');
    }

    const historyAckResult = await supabaseAdmin.rpc(
      'acknowledge_invite_notification_history',
      {
        p_inviter_wallet: walletAddress,
        p_ids: [historyId],
        p_through_id: null,
      },
    );

    if (historyAckResult.error) {
      throw new Error(
        `Reward notification history acknowledgement failed: ${historyAckResult.error.message}`,
      );
    }

    return NextResponse.json(
      {
        receipt,
        acknowledged: true,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to acknowledge VeInvite reward receipt:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward receipt could not be acknowledged.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
