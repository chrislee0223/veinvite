import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  alarmChanges,
  decodeAlarmState,
  delayedRewardCode,
  encodeAlarmState,
  RELIABILITY_JOBS,
  stableAlarmCodes,
  isReliabilityDegraded,
  staleCronCodes,
  staleSybilHoldCodes,
  type JobHeartbeat,
  type SybilHoldLiveness,
} from '@/lib/monitoring/reliabilityWatchPolicy';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const WATCH_JOB = 'reliability-health';
const HEALTH_READ_TIMEOUT_MS = 8_000;
const HEADERS = { 'Cache-Control': 'no-store' } as const;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization');
  if (!secret || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readRewardReservationDelay(): Promise<number> {
  // This is strictly a read. Never start reservation/payout work in a
  // monitoring endpoint; reuse the security-aware existing liveness RPC.
  const { data: runtime, error: runtimeError } = await supabaseAdmin
    .from('reward_runtime_config')
    .select('mainnet_funded_rewards_enabled,emergency_rewards_paused')
    .eq('id', 1)
    .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS))
    .maybeSingle();
  if (runtimeError || !runtime) {
    throw new Error('Reward runtime state could not be read.');
  }

  const { network } = getVeBetterNetworkConfig();
  if (runtime.emergency_rewards_paused === true ||
      (network === 'mainnet' && runtime.mainnet_funded_rewards_enabled !== true)) {
    return 0;
  }

  const { data, error } = await supabaseAdmin.rpc(
    'read_stale_reward_reservation_liveness',
    { p_network: network, p_stale_minutes: 15 },
  ).abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
  if (error) throw new Error('Reward reservation delay could not be read.');
  const row = Array.isArray(data) ? data[0] : data;
  const missingCount = Number(row?.missing_count);
  if (!Number.isSafeInteger(missingCount) || missingCount < 0) {
    throw new Error('Reward reservation delay result is invalid.');
  }
  return missingCount;
}

function checkedCount(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 ||
      value === null || value === undefined) {
    throw new Error(`Invalid Sybil HOLD liveness count: ${name}.`);
  }
  return parsed;
}

async function readSybilHoldLiveness(): Promise<SybilHoldLiveness> {
  // Read-only and aggregate-only. No wallet identifiers are returned or
  // logged; this cannot clear a HOLD, blacklist a user or release rewards.
  const { network } = getVeBetterNetworkConfig();
  const { data, error } = await supabaseAdmin.rpc(
    'read_sybil_v2_early_hold_liveness',
    { p_network: network },
  ).abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
  if (error) {
    throw new Error('Sybil HOLD liveness could not be read.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('Sybil HOLD liveness response is missing.');
  }

  return {
    openHolds: checkedCount(row.open_holds, 'open_holds'),
    incompleteCoreHolds: checkedCount(row.incomplete_core_holds, 'incomplete_core_holds'),
    stalledOver1h: checkedCount(row.stalled_over_1h, 'stalled_over_1h'),
    stalledOver24h: checkedCount(row.stalled_over_24h, 'stalled_over_24h'),
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET_UNCONFIGURED' }, { status: 503, headers: HEADERS });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: HEADERS });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('cron_job_states')
      .select('job_name,last_succeeded_at,last_error')
      .in('job_name', [...RELIABILITY_JOBS.map(({ name }) => name), WATCH_JOB])
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
    if (error) throw new Error('Scheduled-job health unavailable.');

    const rows = data ?? [];
    const monitor = rows.find((row) => row.job_name === WATCH_JOB);
    const previous = decodeAlarmState(monitor?.last_error ?? null);
    const [delayedRewards, sybilHolds] = await Promise.all([
      readRewardReservationDelay(),
      readSybilHoldLiveness(),
    ]);
    const current = stableAlarmCodes([
      ...staleCronCodes(rows as JobHeartbeat[], Date.now()),
      ...delayedRewardCode(delayedRewards),
      ...staleSybilHoldCodes(sybilHolds),
    ]);
    const changes = alarmChanges(previous, current);
    // A one-hour operator review backlog needs attention, not an artificial
    // app-outage status. A 24-hour stalled HOLD is a critical failure.
    const degraded = isReliabilityDegraded(current);
    const now = new Date().toISOString();

    // Only the existing cron status table is written, never invitation,
    // Sybil or reward records. Its prior fingerprint survives deployments.
    const { error: saveError } = await supabaseAdmin
      .from('cron_job_states')
      .upsert({
        job_name: WATCH_JOB,
        updated_at: now,
        last_started_at: now,
        last_error: encodeAlarmState(current),
        ...(current.length ? {} : { last_succeeded_at: now }),
        ...(changes.newlyActive.length ? { last_failed_at: now } : {}),
      }, { onConflict: 'job_name' })
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
    if (saveError) throw new Error('Reliability alert checkpoint could not be persisted.');

    if (changes.newlyActive.length) {
      console.error('VeInvite sustained reliability alert:', {
        newlyActive: changes.newlyActive,
        active: current,
        delayedRewards,
        sybilHolds,
      });
    }
    if (changes.resolved.length) {
      console.info('VeInvite reliability alert recovered:', {
        recovered: changes.resolved,
        remaining: current,
      });
    }

    return NextResponse.json({
      ok: !degraded,
      checkedJobs: RELIABILITY_JOBS.length,
      activeAlerts: current,
      delayedRewards,
      sybilHolds,
      // Only critical HOLD delays or reliability faults return 503; a 1-hour
      // manual-review warning never mislabels the application as unavailable.
      newAlerts: changes.newlyActive.length,
      recoveredAlerts: changes.resolved.length,
    }, { status: degraded ? 503 : 200, headers: HEADERS });
  } catch (error) {
    console.error('VeInvite reliability monitor unavailable:', error);
    return NextResponse.json(
      { error: 'CRON_HEALTH_DB_UNAVAILABLE' },
      { status: 503, headers: HEADERS },
    );
  }
}
