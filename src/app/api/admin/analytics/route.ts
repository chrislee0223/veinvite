import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

const MAX_REPORT_ROWS = 100;

const REPORT_DEFINITIONS = {
  overview: {
    metricDefinition:
      '전체 초대 흐름 요약입니다. 지급 보상은 확정 영수증, dApp 보상은 검증된 미션 이벤트만 집계합니다.',
    source: 'operator_analytics_overview',
  },
  inviters: {
    metricDefinition:
      '초대 생성 수 기준 순위입니다. 실제 참여, 완료, 지급, 의심 표시 수를 함께 제공합니다.',
    source: 'operator_inviter_analytics',
  },
  'reward-recipients': {
    metricDefinition:
      'VeInvite가 실제 지급한 추천 보상의 누적 금액 순위입니다. 확정된 불변 보상 영수증만 집계합니다.',
    source:
      'operator_reward_recipient_leaderboard',
  },
  'qualifying-dapp-rewards': {
    metricDefinition:
      'VeInvite 미션 증거로 검증된 dApp B3TR 보상 합계 순위입니다. 지갑의 전체 B3TR 수령 내역은 아닙니다.',
    source:
      'operator_qualifying_dapp_reward_leaderboard',
  },
} as const;

type AnalyticsReport =
  keyof typeof REPORT_DEFINITIONS;

function isAnalyticsReport(
  value: string,
): value is AnalyticsReport {
  return Object.hasOwn(
    REPORT_DEFINITIONS,
    value,
  );
}

function readLimit(
  rawLimit: string | null,
): number | null {
  if (rawLimit === null) {
    return MAX_REPORT_ROWS;
  }

  const limit = Number(rawLimit);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_REPORT_ROWS
  ) {
    return null;
  }

  return limit;
}

async function loadReport(
  report: AnalyticsReport,
  limit: number,
  network: string,
) {
  if (report === 'overview') {
    const { data, error } = await supabaseAdmin
      .from('operator_analytics_overview')
      .select(
        'total_invitations, unique_inviters, claimed_invitations, completed_referrals, currently_eligible_referrals, paid_referrals, total_veinvite_reward_wei, qualifying_dapp_reward_events, total_qualifying_dapp_reward_wei, flagged_referrals, latest_recorded_activity_at',
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `Analytics overview could not be loaded: ${error.message}`,
      );
    }

    return data ? [data] : [];
  }

  if (report === 'inviters') {
    const { data, error } = await supabaseAdmin
      .from('operator_inviter_analytics')
      .select(
        'wallet_address, invitations_created, claimed_invitations, unique_invitees, verified_new_invitees, verified_returning_invitees, completed_referrals, currently_eligible_referrals, paid_referrals, reward_receipt_count, total_veinvite_reward_wei, cancelled_invitations, flagged_referrals, first_invite_at, last_activity_at, last_reward_paid_at',
      )
      .order('invitations_created', {
        ascending: false,
      })
      .order('completed_referrals', {
        ascending: false,
      })
      .order('wallet_address', {
        ascending: true,
      })
      .limit(limit);

    if (error) {
      throw new Error(
        `Inviter analytics could not be loaded: ${error.message}`,
      );
    }

    return data ?? [];
  }

  if (report === 'reward-recipients') {
    const { data, error } = await supabaseAdmin
      .from(
        'operator_reward_recipient_leaderboard',
      )
      .select(
        'network, wallet_address, reward_receipt_count, paid_referral_count, paid_round_count, total_reward_wei, first_paid_at, last_paid_at',
      )
      .eq('network', network)
      .order('total_reward_wei', {
        ascending: false,
      })
      .order('reward_receipt_count', {
        ascending: false,
      })
      .order('wallet_address', {
        ascending: true,
      })
      .limit(limit);

    if (error) {
      throw new Error(
        `Reward recipient leaderboard could not be loaded: ${error.message}`,
      );
    }

    return data ?? [];
  }

  const { data, error } = await supabaseAdmin
    .from(
      'operator_qualifying_dapp_reward_leaderboard',
    )
    .select(
      'network, wallet_address, qualifying_reward_event_count, invite_count, distinct_dapp_count, total_qualifying_reward_wei, first_reward_at, last_reward_at',
    )
    .eq('network', network)
    .order('total_qualifying_reward_wei', {
      ascending: false,
    })
    .order('qualifying_reward_event_count', {
      ascending: false,
    })
    .order('wallet_address', {
      ascending: true,
    })
    .limit(limit);

  if (error) {
    throw new Error(
      `Qualifying dApp reward leaderboard could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

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

    const rawReport =
      request.nextUrl.searchParams.get(
        'report',
      ) ?? 'overview';
    const limit = readLimit(
      request.nextUrl.searchParams.get(
        'limit',
      ),
    );

    if (
      !isAnalyticsReport(rawReport) ||
      limit === null
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid analytics report or limit. Limit must be between 1 and 100.',
          allowedReports: Object.keys(
            REPORT_DEFINITIONS,
          ),
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const rows = await loadReport(
      rawReport,
      limit,
      pool.network,
    );
    const definition =
      REPORT_DEFINITIONS[rawReport];

    return NextResponse.json(
      {
        report: rawReport,
        network: pool.network,
        generatedAt: new Date().toISOString(),
        verifiedOperator:
          session.walletAddress,
        metricDefinition:
          definition.metricDefinition,
        source: definition.source,
        rowCount: rows.length,
        limit:
          rawReport === 'overview'
            ? 1
            : limit,
        rows,
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
      'Failed to load operator analytics:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Operator analytics could not be loaded.',
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
