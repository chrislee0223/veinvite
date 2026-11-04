import { NextRequest, NextResponse } from 'next/server';

import { requireWalletSession, WalletAuthenticationError } from '@/lib/walletAuthServer';
import { canOperateVeInviteRewards, readVeInviteRewardPoolStatus } from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readStagedAdmissionFundingStatus } from '@/lib/rewards/readStagedAdmissionFundingStatus';
import { summarizeRewardActivationReadiness } from '@/lib/rewards/rewardActivationReadiness';

export const dynamic = 'force-dynamic';
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

function requiredString(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value !== 'string' || !value) {
    throw new Error('Readiness SQL returned invalid ' + field);
  }
  return value;
}
function requiredCount(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Readiness SQL returned invalid ' + field);
  }
  return value;
}
function requiredBool(row: Record<string, unknown>, field: string) {
  const value = row[field];
  if (typeof value !== 'boolean') {
    throw new Error('Readiness SQL returned invalid ' + field);
  }
  return value;
}

/**
 * Operator-only, read-only financial diagnostics. This endpoint NEVER
 * authorizes funding, admission, Claim, X payouts, reserves or signing.
 * Exact Wei values come from on-chain reads and SQL JSONB fields that
 * explicitly stringify NUMERIC (never rounded JavaScript numbers).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();
    if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
      return NextResponse.json(
        { error: 'The verified wallet is not the VeInvite reward operator.' },
        { status: 403, headers: HEADERS },
      );
    }

    const [auditResult, latestReceipt, latestForecast, pending, eligible, threeApps] =
      await Promise.all([
        supabaseAdmin.rpc('read_reward_boost_reserve_audit_snapshot', {
          p_network: pool.network,
          p_app_id: pool.appId,
        }),
        supabaseAdmin
          .from('vebetter_round_allocations')
          .select('id,vebetter_round_id')
          .eq('network', pool.network)
          .eq('app_id', pool.appId)
          .order('vebetter_round_id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('reward_forecast_snapshots')
          .select('created_at')
          .eq('network', pool.network)
          .eq('app_id', pool.appId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .not('reward_cohort_round_id', 'is', null)
          .eq('sybil_status', 'NOT_CHECKED')
          .is('reward_paid_at', null),
        supabaseAdmin
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .not('reward_cohort_round_id', 'is', null)
          .not('reward_eligible_at', 'is', null)
          .is('reward_paid_at', null),
        supabaseAdmin
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .not('reward_cohort_round_id', 'is', null)
          .eq('sybil_status', 'NOT_CHECKED')
          .is('reward_paid_at', null)
          .gte('apps_completed', 3)
          .eq('vote_completed', false),
      ]);

    for (const [name, error] of [
      ['reserve audit', auditResult.error],
      ['allocation receipt', latestReceipt.error],
      ['forecast observation', latestForecast.error],
      ['unreviewed invites', pending.error],
      ['eligible invites', eligible.error],
      ['three app incomplete votes', threeApps.error],
    ] as const) {
      if (error) throw new Error('Readiness ' + name + ': ' + error.message);
    }
    if (!latestReceipt.data || !latestForecast.data || !auditResult.data
        || !Number.isSafeInteger(latestReceipt.data.vebetter_round_id)
        || !Number.isSafeInteger(latestReceipt.data.id)
        || pending.count === null || eligible.count === null
        || threeApps.count === null) {
      throw new Error('Reward readiness is missing mandatory evidence');
    }

    const cohortRoundId = latestReceipt.data.vebetter_round_id + 1;
    const bridge = await readStagedAdmissionFundingStatus({
      network: pool.network,
      appId: pool.appId,
      cohortRoundId: String(cohortRoundId),
      receiptId: String(latestReceipt.data.id),
    });
    const audit = auditResult.data as Record<string, unknown>;
    const readiness = summarizeRewardActivationReadiness({
      nowMs: Date.now(),
      liveOnchainPoolWei: pool.effectiveRewardPoolWei,
      latestForecastAt: latestForecast.data.created_at,
      sourceRetainedProtectionWei: requiredString(audit, 'sourceRetainedProtectionWei'),
      recentCohortProtectedWei: requiredString(audit, 'recentCohortProtectedWei'),
      bankBalanceWei: requiredString(audit, 'bankBalanceWei'),
      bankStressReserveWei: requiredString(audit, 'bankStressReserveWei'),
      ordinaryBoostAvailableWei: requiredString(audit, 'ordinaryBoostAvailableWei'),
      sourceOverrunCount: requiredCount(audit, 'sourceOverrunCount'),
      destinationOverrunCount: requiredCount(audit, 'destinationOverrunCount'),
      unprotectedMatureSourceCount: requiredCount(audit, 'unprotectedMatureSourceCount'),
      conservationOk: requiredBool(audit, 'conservationOk'),
      stressReserveCovered: requiredBool(audit, 'stressReserveCovered'),
      unreviewedUnpaidInvites: pending.count,
      eligibleUnpaidInvites: eligible.count,
      threeAppsVoteMissingInvites: threeApps.count,
      admissionBridgeStatus: bridge.status,
      distributionPaused: pool.distributionPaused,
    });

    return NextResponse.json({
      ...readiness,
      fundingCohortRoundId: cohortRoundId,
      verifiedOperator: session.walletAddress,
    }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status, headers: HEADERS,
      });
    }
    console.error('Reward activation readiness read-only check failed:', error);
    return NextResponse.json({
      error: 'Reward activation readiness could not be verified.',
      canActivate: false,
      canSign: false,
      canReleaseHistoricalProtection: false,
      writesPerformed: false,
      transfersPerformed: false,
    }, { status: 503, headers: HEADERS });
  }
}
