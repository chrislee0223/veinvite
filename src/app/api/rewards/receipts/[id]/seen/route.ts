import {
  NextRequest,
  NextResponse,
} from 'next/server';

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
