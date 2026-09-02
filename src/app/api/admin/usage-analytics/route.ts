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
const MAX_DAYS = 180;

function readDays(raw: string | null): number | null {
  if (raw === null) return DEFAULT_DAYS;
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isSafeInteger(days) && days <= MAX_DAYS ? days : null;
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

async function rpc(functionName: string, parameters: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(functionName, parameters);
  if (error) {
    throw new Error(`${functionName} failed: ${error.message}`);
  }
  return data ?? [];
}

export async function GET(request: NextRequest) {
  const days = readDays(request.nextUrl.searchParams.get('days'));
  if (days === null) {
    return NextResponse.json(
      { error: `days must be an integer from 1 to ${MAX_DAYS}.` },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();

    if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
      return NextResponse.json(
        { error: 'The verified wallet is not the VeInvite reward operator.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const now = new Date();
    const toDate = seoulDate(now);
    const fromDate = seoulDate(new Date(now.getTime() - (days - 1) * 86_400_000));
    const range = { p_from_date: fromDate, p_to_date: toDate };

    const [daily, locale, device, source, views] = await Promise.all([
      rpc('read_app_usage_daily_summary', range),
      rpc('read_app_usage_dimension_breakdown', { ...range, p_dimension: 'locale' }),
      rpc('read_app_usage_dimension_breakdown', { ...range, p_dimension: 'device' }),
      rpc('read_app_usage_dimension_breakdown', { ...range, p_dimension: 'source' }),
      rpc('read_app_usage_view_breakdown', range),
    ]);

    return NextResponse.json(
      {
        report: 'usage-analytics',
        generatedAt: new Date().toISOString(),
        timezone: 'Asia/Seoul',
        range: { fromDate, toDate, days },
        metricDefinitions: {
          uniqueVisitors: '같은 익명 브라우저 식별자는 하루에 여러 번 방문해도 1명으로 집계합니다.',
          sessions: '한 브라우저 탭의 방문 세션입니다. 새 탭·다시 열기 또는 30분 이상 비활성 후 재사용은 새 세션이 될 수 있습니다.',
          returningVisitors: '이전에 VeInvite 방문 기록이 있는 익명 브라우저가 해당 날짜에 다시 방문한 수입니다.',
          activeSeconds: 'VeInvite가 화면에 보이고 브라우저 포커스가 있는 동안의 활성 사용시간만 집계합니다.',
          walletConnected: '검증된 지갑 세션 존재 여부만 기록하며 지갑 주소는 이용 분석 데이터에 저장하지 않습니다.',
        },
        privacy: {
          rawIpStored: false,
          rawUserAgentStored: false,
          walletAddressStored: false,
          inviteCodeStored: false,
          queryStringStored: false,
          rewardAuthority: false,
        },
        verifiedOperator: session.walletAddress,
        daily,
        breakdowns: { locale, device, source, views },
        writesPerformed: false,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.error('Failed to load usage analytics:', error);
    return NextResponse.json(
      { error: 'Usage analytics could not be loaded.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
