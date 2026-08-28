import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  rewardReceiptColumns,
  toRewardReceipt,
  type RewardReceiptRow,
} from '@/lib/rewards/rewardReceipt';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

function parseLimit(
  value: string | null,
): number {
  if (value === null) {
    return 20;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('limit must be an integer.');
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > 50
  ) {
    throw new Error(
      'limit must be between 1 and 50.',
    );
  }

  return parsed;
}

export async function GET(
  request: NextRequest,
) {
  let limit: number;

  try {
    limit = parseLimit(
      request.nextUrl.searchParams.get('limit'),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid receipt history request.',
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

    const [
      historyResult,
      latestUnseenResult,
      unseenCountResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('reward_receipts')
        .select(rewardReceiptColumns)
        .eq('recipient_wallet', walletAddress)
        .order('paid_at', {
          ascending: false,
        })
        .order('id', {
          ascending: false,
        })
        .limit(limit),
      supabaseAdmin
        .from('reward_receipts')
        .select(rewardReceiptColumns)
        .eq('recipient_wallet', walletAddress)
        .is('seen_at', null)
        .order('paid_at', {
          ascending: false,
        })
        .order('id', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_receipts')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('recipient_wallet', walletAddress)
        .is('seen_at', null),
    ]);

    if (historyResult.error) {
      throw new Error(
        `Reward receipt history could not be loaded: ${historyResult.error.message}`,
      );
    }

    if (latestUnseenResult.error) {
      throw new Error(
        `Latest unseen reward receipt could not be loaded: ${latestUnseenResult.error.message}`,
      );
    }

    if (unseenCountResult.error) {
      throw new Error(
        `Unseen reward receipt count could not be loaded: ${unseenCountResult.error.message}`,
      );
    }

    const receipts = (
      (historyResult.data ?? []) as RewardReceiptRow[]
    ).map(toRewardReceipt);
    const latestUnseen =
      latestUnseenResult.data
        ? toRewardReceipt(
            latestUnseenResult.data as RewardReceiptRow,
          )
        : null;

    return NextResponse.json(
      {
        walletAddress,
        receipts,
        unseenCount:
          unseenCountResult.count ?? 0,
        latestUnseen,
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
      'Failed to load VeInvite reward receipts:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward receipts could not be loaded.',
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
