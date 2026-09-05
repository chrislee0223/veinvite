import { NextRequest, NextResponse } from 'next/server';

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

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;

function readDays(raw: string | null): number | null {
  if (raw === null) return DEFAULT_DAYS;
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isSafeInteger(days) && days <= MAX_DAYS
    ? days
    : null;
}

function seoulDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

async function rpc(
  functionName: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin.rpc(
    functionName,
    parameters,
  );
  if (error) {
    throw new Error(
      `${functionName} failed: ${error.message}`,
    );
  }
  return data ?? [];
}

export async function GET(request: NextRequest) {
  const days = readDays(
    request.nextUrl.searchParams.get('days'),
  );
  if (days === null) {
    return NextResponse.json(
      {
        error: `days must be an integer from 1 to ${MAX_DAYS}.`,
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const session = await requireWalletSession({
      request,
    });
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

    const now = new Date();
    const toDate = seoulDate(now);
    const fromDate = seoulDate(
      new Date(
        now.getTime() -
          (days - 1) * 86_400_000,
      ),
    );
    const range = {
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    const [
      daily,
      locale,
      device,
      source,
      views,
      dataQualityExclusions,
    ] = await Promise.all([
      rpc(
        'read_app_usage_daily_summary',
        range,
      ),
      rpc(
        'read_app_usage_dimension_breakdown',
        {
          ...range,
          p_dimension: 'locale',
        },
      ),
      rpc(
        'read_app_usage_dimension_breakdown',
        {
          ...range,
          p_dimension: 'device',
        },
      ),
      rpc(
        'read_app_usage_dimension_breakdown',
        {
          ...range,
          p_dimension: 'source',
        },
      ),
      rpc(
        'read_app_usage_view_breakdown',
        range,
      ),
      rpc(
        'read_app_usage_quality_exclusions',
        range,
      ),
    ]);

    return NextResponse.json(
      {
        report: 'usage-analytics',
        generatedAt: new Date().toISOString(),
        timezone: 'Asia/Seoul',
        range: { fromDate, toDate, days },
        metricDefinitions: {
          uniqueVisitors:
            '서울 시간 기준 같은 일일 익명 브라우저 ID는 하루에 여러 번 방문해도 1명으로 집계합니다. 다음 날에는 새 익명 ID를 사용합니다.',
          sessions:
            '한 브라우저 탭의 방문 세션입니다. 새 탭·다시 열기, 날짜 변경 또는 30분 이상 비활성 후 재사용은 새 세션이 될 수 있습니다.',
          returningVisitors:
            '브라우저에는 과거 방문 여부만 남기며, 서버는 이전 날짜의 익명 ID와 현재 익명 ID를 연결하지 않습니다.',
          activeSeconds:
            'VeInvite가 화면에 보이고 브라우저 포커스가 있는 동안의 활성 사용시간만 집계합니다.',
          walletConnected:
            '검증된 지갑 세션 존재 여부만 기록하며 지갑 주소는 이용 분석 데이터에 저장하지 않습니다.',
          views:
            '관리자 사용을 정확히 제거할 수 없는 초기 부트스트랩 날짜는 뷰 분포 합계에서 제외하고 dataQualityExclusions에 표시합니다.',
        },
        privacy: {
          rawIpStored: false,
          rawUserAgentStored: false,
          walletAddressStored: false,
          inviteCodeStored: false,
          queryStringStored: false,
          dailyAnonymousIdentity: true,
          crossDayIdentityLinking: false,
          rawSessionRetentionDays: 30,
          userCanOptOut: true,
          rewardAuthority: false,
        },
        verifiedOperator: session.walletAddress,
        daily,
        breakdowns: {
          locale,
          device,
          source,
          views,
        },
        dataQualityExclusions,
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
      'Failed to load usage analytics:',
      error,
    );
    return NextResponse.json(
      {
        error:
          'Usage analytics could not be loaded.',
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
