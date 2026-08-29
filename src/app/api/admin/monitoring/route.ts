import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  readOperatorMonitoringSnapshots,
} from '@/lib/monitoring/operatorMonitoring';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function readLimit(
  rawLimit: string | null,
): number | null {
  if (rawLimit === null) {
    return DEFAULT_LIMIT;
  }

  if (!/^[1-9]\d*$/.test(rawLimit)) {
    return null;
  }

  const limit = Number(rawLimit);

  return Number.isSafeInteger(limit) &&
    limit <= MAX_LIMIT
    ? limit
    : null;
}

export async function GET(
  request: NextRequest,
) {
  const limit = readLimit(
    request.nextUrl.searchParams.get('limit'),
  );

  if (limit === null) {
    return NextResponse.json(
      {
        error:
          `limit must be an integer from 1 to ${MAX_LIMIT}.`,
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
    const [session, pool] = await Promise.all([
      requireWalletSession({ request }),
      readVeInviteRewardPoolStatus(),
    ]);

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

    const snapshots =
      await readOperatorMonitoringSnapshots(
        limit,
      );

    return NextResponse.json(
      {
        network: pool.network,
        generatedAt: new Date().toISOString(),
        verifiedOperator:
          session.walletAddress,
        rowCount: snapshots.length,
        limit,
        snapshots,
        automaticBlockingEnabled: false,
        rewardPauseChanged: false,
        writesPerformed: false,
      },
      {
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
      'Failed to load operator monitoring history:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Operator monitoring history could not be loaded.',
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
