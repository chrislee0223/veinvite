import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
} from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const WALLET_RATE_LIMIT = 8;
const INVITE_RATE_LIMIT = 4;

type SplitRow = {
  invite_code: string;
  recipient_wallet: string;
  mode: string;
};

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function unavailable(
  newOffersEnabled: boolean,
  reason: string,
) {
  return NextResponse.json(
    {
      newOffersEnabled,
      promotion: null,
      reason,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  if (!sameOrigin(request)) {
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

  let body: {
    inviteCode?: string;
  };

  try {
    body = (await request.json()) as {
      inviteCode?: string;
    };
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

  const inviteCode =
    body.inviteCode?.trim().toUpperCase() ?? '';

  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    return NextResponse.json(
      { error: 'A valid inviteCode is required.' },
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
    const wallet =
      session.walletAddress.toLowerCase();

    const rateLimitResponse =
      await enforceRateLimits([
        {
          scope: 'x_promotion_open_wallet',
          subject: wallet,
          limit: WALLET_RATE_LIMIT,
          windowSeconds:
            RATE_LIMIT_WINDOW_SECONDS,
        },
        {
          scope: 'x_promotion_open_invite',
          subject: inviteCode,
          limit: INVITE_RATE_LIMIT,
          windowSeconds:
            RATE_LIMIT_WINDOW_SECONDS,
        },
      ]);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const runtime =
      await supabaseAdmin
        .from('reward_runtime_config')
        .select(
          'reward_x_promotion_enabled,reward_x_promotion_live_started_at',
        )
        .eq('id', 1)
        .single();

    if (runtime.error || !runtime.data) {
      throw new Error(
        `X promotion runtime state could not be loaded: ${runtime.error?.message ?? 'missing row'}`,
      );
    }

    const newOffersEnabled =
      runtime.data.reward_x_promotion_enabled === true &&
      typeof runtime.data.reward_x_promotion_live_started_at ===
        'string' &&
      !Number.isNaN(
        Date.parse(
          runtime.data.reward_x_promotion_live_started_at,
        ),
      );

    if (!newOffersEnabled) {
      return unavailable(false, 'LIVE_DISABLED');
    }

    const splitResult =
      await supabaseAdmin
        .from('reward_x_promotion_splits')
        .select(
          'invite_code,recipient_wallet,mode',
        )
        .eq('invite_code', inviteCode)
        .eq('mode', 'LIVE')
        .maybeSingle();

    if (splitResult.error) {
      throw new Error(
        `X promotion split could not be loaded: ${splitResult.error.message}`,
      );
    }

    const split =
      splitResult.data as SplitRow | null;

    if (!split) {
      return unavailable(true, 'NOT_ELIGIBLE');
    }

    if (
      split.recipient_wallet.toLowerCase() !==
      wallet
    ) {
      return NextResponse.json(
        {
          error:
            'This X promotion opportunity belongs to a different wallet.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const activation =
      await supabaseAdmin.rpc(
        'activate_reward_x_promotion_obligation_v1',
        {
          p_invite_code: inviteCode,
        },
      );

    if (activation.error) {
      const message =
        activation.error.message;

      if (
        message.includes(
          'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR',
        ) ||
        message.includes(
          'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVABLE',
        )
      ) {
        return unavailable(
          true,
          'NOT_AVAILABLE',
        );
      }

      if (
        message.includes(
          'REWARD_X_PROMOTION_BASE_PAYOUT_MISMATCH',
        ) ||
        message.includes(
          'REWARD_X_PROMOTION_BASE_RECEIPT_MISSING',
        )
      ) {
        return NextResponse.json(
          {
            newOffersEnabled: true,
            promotion: null,
            reason: 'RETRY_LATER',
          },
          {
            status: 202,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      throw new Error(
        `X promotion obligation could not be activated: ${message}`,
      );
    }

    const opportunity =
      await supabaseAdmin.rpc(
        'create_reward_x_promotion_opportunity_v1',
        {
          p_invite_code: inviteCode,
        },
      );

    if (opportunity.error) {
      const message =
        opportunity.error.message;

      if (
        message.includes(
          'REWARD_X_PROMOTION_OPPORTUNITY_NOT_HELD',
        ) ||
        message.includes(
          'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING',
        )
      ) {
        return NextResponse.json(
          {
            newOffersEnabled: true,
            promotion: null,
            reason: 'RETRY_LATER',
          },
          {
            status: 202,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      throw new Error(
        `X promotion opportunity could not be created: ${message}`,
      );
    }

    return NextResponse.json(
      {
        newOffersEnabled: true,
        promotion:
          opportunity.data &&
          typeof opportunity.data === 'object' &&
          !Array.isArray(opportunity.data)
            ? opportunity.data
            : null,
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
      error instanceof
      WalletAuthenticationError
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
      'Failed to open X promotion opportunity:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'The X promotion opportunity could not be opened right now.',
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
