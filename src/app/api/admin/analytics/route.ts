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
import {
  readVeBetterRoundWindow,
  type VeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

const MAX_REPORT_ROWS = 100;

const REPORT_DEFINITIONS = {
  overview: {
    metricDefinition:
      '선택한 VeBetterDAO 한 라운드의 초대 흐름입니다. 신규·복귀는 진입 증거, 지급 보상은 확정 영수증, dApp 보상은 해당 라운드 블록의 검증 이벤트만 집계합니다.',
    source: 'get_operator_round_overview',
  },
  inviters: {
    metricDefinition:
      '선택한 VeBetterDAO 한 라운드의 초대 생성 수 기준 순위입니다. 해당 라운드의 실제 참여, 완료, 지급, 의심 표시 수를 함께 제공합니다.',
    source:
      'get_operator_round_inviter_analytics',
  },
  'reward-recipients': {
    metricDefinition:
      '선택한 VeBetterDAO 한 라운드에서 VeInvite가 실제 지급한 추천 보상 순위입니다. 확정된 불변 보상 영수증만 집계합니다.',
    source:
      'get_operator_round_reward_recipients',
  },
  'qualifying-dapp-rewards': {
    metricDefinition:
      '선택한 VeBetterDAO 한 라운드 블록 안에서 VeInvite 미션 증거로 검증된 dApp B3TR 보상 순위입니다. 지갑의 전체 B3TR 수령 내역은 아닙니다.',
    source:
      'get_operator_round_dapp_rewards',
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

function readRoundId(
  rawRoundId: string | null,
): number | null | undefined {
  if (rawRoundId === null) {
    return undefined;
  }

  if (!/^[1-9]\d*$/.test(rawRoundId)) {
    return null;
  }

  const roundId = Number(rawRoundId);

  if (!Number.isSafeInteger(roundId)) {
    return null;
  }

  return roundId;
}

async function loadReport(
  report: AnalyticsReport,
  limit: number,
  network: string,
  round: VeBetterRoundWindow,
) {
  const roundParameters = {
    p_network: network,
    p_vebetter_round_id: round.roundId,
    p_round_start_at: round.roundStartAt,
    p_round_end_at: round.roundEndAt,
    p_round_start_block: round.voteStartBlock,
    p_round_end_block: round.voteEndBlock,
  };

  if (report === 'overview') {
    const { data, error } =
      await supabaseAdmin.rpc(
        'get_operator_round_overview',
        roundParameters,
      );

    if (error) {
      throw new Error(
        `Analytics overview could not be loaded: ${error.message}`,
      );
    }

    return data ?? [];
  }

  if (report === 'inviters') {
    const { data, error } =
      await supabaseAdmin.rpc(
        'get_operator_round_inviter_analytics',
        {
          ...roundParameters,
          p_limit: limit,
        },
      );

    if (error) {
      throw new Error(
        `Inviter analytics could not be loaded: ${error.message}`,
      );
    }

    return data ?? [];
  }

  if (report === 'reward-recipients') {
    const { data, error } =
      await supabaseAdmin.rpc(
        'get_operator_round_reward_recipients',
        {
          p_network: network,
          p_vebetter_round_id:
            round.roundId,
          p_limit: limit,
        },
      );

    if (error) {
      throw new Error(
        `Reward recipient leaderboard could not be loaded: ${error.message}`,
      );
    }

    return data ?? [];
  }

  const { data, error } =
    await supabaseAdmin.rpc(
      'get_operator_round_dapp_rewards',
      {
        p_network: network,
        p_vebetter_round_id:
          round.roundId,
        p_round_start_block:
          round.voteStartBlock,
        p_round_end_block:
          round.voteEndBlock,
        p_limit: limit,
      },
    );

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
  const requestedRoundId = readRoundId(
    request.nextUrl.searchParams.get(
      'roundId',
    ),
  );

  if (requestedRoundId === null) {
    return NextResponse.json(
      {
        error:
          'roundId must be a positive safe integer.',
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
    const [pool, round] =
      await Promise.all([
        readVeInviteRewardPoolStatus(),
        readVeBetterRoundWindow({
          ...(requestedRoundId === undefined
            ? {}
            : { roundId: requestedRoundId }),
        }),
      ]);

    if (round.network !== pool.network) {
      throw new Error(
        'Analytics round network does not match the reward pool network.',
      );
    }

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
      round,
    );
    const definition =
      REPORT_DEFINITIONS[rawReport];

    return NextResponse.json(
      {
        report: rawReport,
        network: pool.network,
        scope: 'VEBETTER_ROUND',
        round: {
          id: round.roundId,
          currentRoundId:
            round.currentRoundId,
          status: round.status,
          startBlock:
            round.voteStartBlock,
          endBlock: round.voteEndBlock,
          startAt: round.roundStartAt,
          endAt: round.roundEndAt,
          endAtEstimated:
            round.roundEndAtEstimated,
          checkedThroughBlock:
            round.bestBlock,
        },
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
