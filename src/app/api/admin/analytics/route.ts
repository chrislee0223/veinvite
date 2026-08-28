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
  VeBetterRoundInputError,
  type VeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

const MAX_REPORT_ROWS = 100;

const REPORT_DEFINITIONS = {
  overview: {
    round: {
      metricDefinition:
        '선택한 VeBetterDAO 한 라운드의 초대 흐름입니다. 신규·복귀는 진입 증거, 지급 보상은 확정 영수증, dApp 보상은 해당 라운드 블록의 검증 이벤트만 집계합니다.',
      source: 'get_operator_round_overview',
    },
    cumulative: {
      metricDefinition:
        '현재 네트워크의 누계 초대 흐름입니다. 증빙 없는 과거 데모 완료는 성공 추천에서 제외하고 별도 미분류 건으로 표시합니다.',
      source: 'get_operator_cumulative_overview',
    },
  },
  inviters: {
    round: {
      metricDefinition:
        '선택한 VeBetterDAO 한 라운드의 초대 생성 수 기준 순위입니다. 해당 라운드의 실제 참여, 완료, 지급, 의심 표시 수를 함께 제공합니다.',
      source:
        'get_operator_round_inviter_analytics',
    },
    cumulative: {
      metricDefinition:
        '전체 기간의 초대 생성 수 기준 순위입니다. 현재 네트워크에서 증명된 참여, 완료, 지급, 의심 표시 수를 함께 제공합니다.',
      source:
        'get_operator_cumulative_inviter_analytics',
    },
  },
  'reward-recipients': {
    round: {
      metricDefinition:
        '선택한 VeBetterDAO 한 라운드에서 VeInvite가 실제 지급한 추천 보상 순위입니다. 확정된 불변 보상 영수증만 집계합니다.',
      source:
        'get_operator_round_reward_recipients',
    },
    cumulative: {
      metricDefinition:
        '전체 기간 동안 VeInvite가 실제 지급한 추천 보상 누계 순위입니다. 확정된 불변 보상 영수증만 집계합니다.',
      source:
        'get_operator_cumulative_reward_recipients',
    },
  },
  'qualifying-dapp-rewards': {
    round: {
      metricDefinition:
        '선택한 VeBetterDAO 한 라운드 블록 안에서 VeInvite 미션 증거로 검증된 dApp B3TR 보상 순위입니다. 지갑의 전체 B3TR 수령 내역은 아닙니다.',
      source:
        'get_operator_round_dapp_rewards',
    },
    cumulative: {
      metricDefinition:
        '전체 기간 동안 VeInvite 미션 증거로 검증된 dApp B3TR 보상 누계 순위입니다. 지갑의 전체 B3TR 수령 내역은 아닙니다.',
      source:
        'get_operator_cumulative_dapp_rewards',
    },
  },
} as const;

type AnalyticsReport =
  keyof typeof REPORT_DEFINITIONS;
type AnalyticsScope = 'round' | 'cumulative';

function isAnalyticsReport(
  value: string,
): value is AnalyticsReport {
  return Object.hasOwn(
    REPORT_DEFINITIONS,
    value,
  );
}

function readScope(
  rawScope: string | null,
): AnalyticsScope | null {
  if (rawScope === null || rawScope === 'round') {
    return 'round';
  }

  return rawScope === 'cumulative'
    ? 'cumulative'
    : null;
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

  return Number.isSafeInteger(roundId)
    ? roundId
    : null;
}

async function loadRoundReport(
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

  const parameters =
    report === 'overview'
      ? roundParameters
      : report === 'inviters'
        ? {
            ...roundParameters,
            p_limit: limit,
          }
        : report === 'reward-recipients'
          ? {
              p_network: network,
              p_vebetter_round_id:
                round.roundId,
              p_limit: limit,
            }
          : {
              p_network: network,
              p_vebetter_round_id:
                round.roundId,
              p_round_start_block:
                round.voteStartBlock,
              p_round_end_block:
                round.voteEndBlock,
              p_limit: limit,
            };

  const functionName =
    REPORT_DEFINITIONS[report].round.source;
  const { data, error } =
    await supabaseAdmin.rpc(
      functionName,
      parameters,
    );

  if (error) {
    throw new Error(
      `Round analytics could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

async function loadCumulativeReport(
  report: AnalyticsReport,
  limit: number,
  network: string,
) {
  const functionName =
    REPORT_DEFINITIONS[report].cumulative
      .source;
  const { data, error } =
    await supabaseAdmin.rpc(
      functionName,
      report === 'overview'
        ? { p_network: network }
        : {
            p_network: network,
            p_limit: limit,
          },
    );

  if (error) {
    throw new Error(
      `Cumulative analytics could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

export async function GET(
  request: NextRequest,
) {
  const rawReport =
    request.nextUrl.searchParams.get(
      'report',
    ) ?? 'overview';
  const scope = readScope(
    request.nextUrl.searchParams.get(
      'scope',
    ),
  );
  const limit = readLimit(
    request.nextUrl.searchParams.get(
      'limit',
    ),
  );
  const requestedRoundId = readRoundId(
    request.nextUrl.searchParams.get(
      'roundId',
    ),
  );

  if (
    !isAnalyticsReport(rawReport) ||
    scope === null ||
    limit === null ||
    requestedRoundId === null ||
    (scope === 'cumulative' &&
      requestedRoundId !== undefined)
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid report, scope, limit, or roundId. scope must be round or cumulative; limit must be 1-100; roundId is only valid for round scope.',
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

    const round =
      scope === 'round'
        ? await readVeBetterRoundWindow({
            ...(requestedRoundId === undefined
              ? {}
              : {
                  roundId:
                    requestedRoundId,
                }),
          })
        : null;

    if (
      round &&
      round.network !== pool.network
    ) {
      throw new Error(
        'Analytics round network does not match the reward pool network.',
      );
    }

    const rows = round
      ? await loadRoundReport(
          rawReport,
          limit,
          pool.network,
          round,
        )
      : await loadCumulativeReport(
          rawReport,
          limit,
          pool.network,
        );
    const definition =
      REPORT_DEFINITIONS[rawReport][scope];

    return NextResponse.json(
      {
        report: rawReport,
        network: pool.network,
        scope:
          scope === 'round'
            ? 'VEBETTER_ROUND'
            : 'CUMULATIVE',
        ...(round
          ? {
              round: {
                id: round.roundId,
                currentRoundId:
                  round.currentRoundId,
                status: round.status,
                startBlock:
                  round.voteStartBlock,
                endBlock:
                  round.voteEndBlock,
                startAt:
                  round.roundStartAt,
                endAt: round.roundEndAt,
                endAtEstimated:
                  round.roundEndAtEstimated,
                checkedThroughBlock:
                  round.bestBlock,
              },
            }
          : {}),
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
      error instanceof WalletAuthenticationError ||
      error instanceof VeBetterRoundInputError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error instanceof WalletAuthenticationError
              ? error.status
              : 400,
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
