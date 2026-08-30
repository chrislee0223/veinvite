import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readPredictiveRewardPlanning,
} from '@/lib/rewards/predictivePlanning';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export async function GET(
  request: NextRequest,
) {
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

    const planning =
      await readPredictiveRewardPlanning({
        network: pool.network,
        appId: pool.appId,
        observedPoolBalanceWei:
          pool.effectiveRewardPoolWei,
      });

    return NextResponse.json(
      {
        pool: {
          network: pool.network,
          appId: pool.appId,
          effectiveRewardPoolWei:
            pool.effectiveRewardPoolWei,
          distributionPaused:
            pool.distributionPaused,
        },
        planning,
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
      'Failed to load predictive VeInvite reward planning:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite predictive reward planning could not be loaded.',
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
