import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readRewardPayoutObservability,
} from '@/lib/rewards/payoutObservability';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

function parseLimit(value: string | null): number {
  if (value === null) {
    return 30;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('limit must be an integer.');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('limit must be between 1 and 50.');
  }

  return parsed;
}

export async function GET(request: NextRequest) {
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
            : 'Invalid payout history request.',
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
    const pool =
      await readVeInviteRewardPoolStatus();

    if (
      !canOperateVeInviteRewards(
        session.walletAddress,
        pool,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const observability =
      await readRewardPayoutObservability(limit);

    return NextResponse.json(
      {
        ...observability,
        verifiedOperator:
          session.walletAddress,
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
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
      'Failed to load VeInvite payout observability:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite payout history and diagnostics could not be loaded.',
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
