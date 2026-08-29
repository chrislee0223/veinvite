import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const SET_PAUSE_INTENT =
  'SET_EMERGENCY_REWARD_PAUSE';
const MIN_REASON_LENGTH = 12;
const MAX_REASON_LENGTH = 500;

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

async function loadVerifiedOperator(
  request: NextRequest,
) {
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
    return {
      response: NextResponse.json(
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
      ),
      session: null,
      pool: null,
    };
  }

  return {
    response: null,
    session,
    pool,
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    const operator =
      await loadVerifiedOperator(request);

    if (operator.response) {
      return operator.response;
    }

    const runtime =
      await readRewardRuntimeSafety();

    return NextResponse.json(
      {
        runtime,
        onChainDistributionPaused:
          operator.pool!.distributionPaused,
        effectivePause:
          runtime.emergencyRewardsPaused ||
          operator.pool!.distributionPaused,
        verifiedOperator:
          operator.session!.walletAddress,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag':
            'noindex, nofollow, noarchive',
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
      'Failed to read emergency reward pause status:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Emergency reward pause status could not be loaded.',
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

export async function POST(
  request: NextRequest,
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
    body.intent !== SET_PAUSE_INTENT ||
    !('paused' in body) ||
    typeof body.paused !== 'boolean' ||
    !('reason' in body) ||
    typeof body.reason !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${SET_PAUSE_INTENT}, paused must be boolean, and reason is required.`,
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const reason = body.reason.trim();

  if (
    reason.length < MIN_REASON_LENGTH ||
    reason.length > MAX_REASON_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          `reason must be between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.`,
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
    const operator =
      await loadVerifiedOperator(request);

    if (operator.response) {
      return operator.response;
    }

    const { data, error } =
      await supabaseAdmin.rpc(
        'set_reward_emergency_pause',
        {
          p_paused: body.paused,
          p_reason: reason,
          p_operator_wallet:
            operator.session!.walletAddress,
          p_network:
            operator.pool!.network,
        },
      );

    if (error) {
      throw new Error(
        `set_reward_emergency_pause failed: ${error.message}`,
      );
    }

    const runtime =
      await readRewardRuntimeSafety();

    return NextResponse.json(
      {
        changed:
          Boolean(
            data &&
              typeof data === 'object' &&
              'changed' in data &&
              data.changed === true,
          ),
        runtime,
        onChainDistributionPaused:
          operator.pool!.distributionPaused,
        effectivePause:
          runtime.emergencyRewardsPaused ||
          operator.pool!.distributionPaused,
        verifiedOperator:
          operator.session!.walletAddress,
        transfersPerformed: false,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag':
            'noindex, nofollow, noarchive',
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
      'Failed to change emergency reward pause:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Emergency reward pause could not be changed.',
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
