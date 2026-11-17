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
      productSummary,
      productDaily,
      productLocale,
      productDevice,
      productSource,
      networkDaily,
      networkLifetime,
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
      rpc(
        'read_app_product_event_summary',
        range,
      ),
      rpc(
        'read_app_product_event_daily_summary',
        range,
      ),
      rpc(
        'read_app_product_event_dimension_breakdown',
        {
          ...range,
          p_dimension: 'locale',
        },
      ),
      rpc(
        'read_app_product_event_dimension_breakdown',
        {
          ...range,
          p_dimension: 'device',
        },
      ),
      rpc(
        'read_app_product_event_dimension_breakdown',
        {
          ...range,
          p_dimension: 'source',
        },
      ),
      rpc(
        'read_app_network_daily_unique_visitors',
        range,
      ),
      rpc(
        'read_app_network_lifetime_engagement',
        {},
      ).catch((error) => {
        // A new optional statistic must not break existing visit,
        // product, reward, or daily Network reports on temporary outages.
        console.error('Network lifetime analytics temporarily unavailable:', error);
        return null;
      }),
    ]);

    const networkToday = (networkDaily as Array<{
      usage_date: string;
      unique_visitors: string | number;
      node_movers: string | number;
      group_editors: string | number;
    }>).find((row) => row.usage_date === toDate);

    const lifetimeRows = (networkLifetime ?? []) as Array<{
      total_verified_wallets: string | number;
      returning_wallets: string | number;
      node_movers: string | number;
      group_editors: string | number;
      total_active_days: string | number;
    }>;
    const lifetime = lifetimeRows[0];
    const lifetimeAvailable = networkLifetime !== null && lifetime !== undefined;
    const lifetimeUsers = Number(lifetime?.total_verified_wallets ?? 0);
    const returningUsers = Number(lifetime?.returning_wallets ?? 0);

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
          productEvents:
            '제품 행동 횟수입니다. 같은 방문자의 원 이동·그룹 수정 이용자 수는 별도의 networkEngagement 고유 방문자 지표로 확인합니다.',
          networkEngagement:
            '일별 기록은 익명 브라우저 기준입니다. 별도 누적 기록은 인증된 지갑을 서버에서 비밀키로 가명화하여 원 이동 또는 그룹 수정을 실제 수행한 지갑을 평생 1회 집계합니다. 여러 날짜·기기에서 동일 지갑은 1명, 재사용은 서로 다른 서울 날짜에 2회 이상 사용한 경우입니다. 인증 없는 사용과 한 사람이 여러 지갑을 쓰는 경우는 동일인으로 결합할 수 없습니다.',
        },
        privacy: {
          rawIpStored: false,
          rawUserAgentStored: false,
          walletAddressStored: false,
          inviteCodeStored: false,
          queryStringStored: false,
          freeFormMetadataStored: false,
          dailyAnonymousIdentity: true,
          crossDayIdentityLinking: false,
          rawSessionRetentionDays: 365,
          rawProductEventRetentionDays: 365,
          rawArchiveRequiredBeforeCleanup: true,
          permanentAggregateHistory: true,
          userCanOptOut: true,
          networkVerifiedWalletPseudonyms: true,
          networkWalletAddressStored: false,
          networkTrackingAcrossDays: true,
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
        networkEngagement: {
          lifetime: {
            available: lifetimeAvailable,
            unit: 'distinct-verified-wallet',
            uniqueUsers: lifetimeAvailable ? lifetimeUsers : null,
            returningUsers: lifetimeAvailable ? returningUsers : null,
            returningRatePercent: lifetimeAvailable
              ? (lifetimeUsers === 0 ? 0 : Math.round(returningUsers / lifetimeUsers * 1000) / 10)
              : null,
            nodeMovers: lifetimeAvailable ? Number(lifetime?.node_movers ?? 0) : null,
            groupEditors: lifetimeAvailable ? Number(lifetime?.group_editors ?? 0) : null,
            activeWalletDays: lifetimeAvailable ? Number(lifetime?.total_active_days ?? 0) : null,
            crossDayUniqueUsersSupported: true,
            crossDeviceSameWalletSupported: true,
            multipleWalletsPerHumanCannotBeMerged: true,
            anonymousOnlyEventsNotIncluded: true,
            startsAt: '2026-11-18',
          },
          unit: 'daily-anonymous-browser',
          today: {
            date: toDate,
            uniqueVisitors: Number(networkToday?.unique_visitors ?? 0),
            nodeMovers: Number(networkToday?.node_movers ?? 0),
            groupEditors: Number(networkToday?.group_editors ?? 0),
          },
          daily: networkDaily,
          crossDayUniquePeopleSupported: false,
          crossBrowserUniquePeopleSupported: false,
          rawRetentionDays: 365,
        },
        productAnalytics: {
          summary: productSummary,
          daily: productDaily,
          breakdowns: {
            locale: productLocale,
            device: productDevice,
            source: productSource,
          },
          schemaVersion: 1,
          authoritative: false,
          strictAllowlist: true,
          buildIdServerDerived: true,
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
