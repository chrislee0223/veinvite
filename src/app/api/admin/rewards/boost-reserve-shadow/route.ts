import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isVeInviteRewardOperator,
  readVeInviteOperatorAccess,
} from '@/lib/rewards/operatorAccess';
import {
  readRewardBoostReserveShadow,
} from '@/lib/rewards/rewardBoostReserveShadow';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await requireWalletSession({ request });
    const access =
      await readVeInviteOperatorAccess();

    if (
      !isVeInviteRewardOperator(
        session.walletAddress,
        access,
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

    const shadow =
      await readRewardBoostReserveShadow();

    return NextResponse.json(
      {
        mode: 'SHADOW',
        ...shadow,
        verifiedOperator:
          session.walletAddress,
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
      'Failed to load reward boost reserve shadow:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Reward boost reserve shadow could not be loaded.',
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
