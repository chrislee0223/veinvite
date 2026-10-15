import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  alarmChanges,
  decodeAlarmState,
  delayedRewardCode,
  encodeAlarmState,
  RELIABILITY_JOBS,
  stableAlarmCodes,
  staleCronCodes,
  type JobHeartbeat,
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
    .maybeSingle()
    .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
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
    const delayedRewards = await readRewardReservationDelay();
    const current = stableAlarmCodes([
      ...staleCronCodes(rows as JobHeartbeat[], Date.now()),
      ...delayedRewardCode(delayedRewards),
    ]);
    const changes = alarmChanges(previous, current);
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
      });
    }
    if (changes.resolved.length) {
      console.info('VeInvite reliability alert recovered:', {
        recovered: changes.resolved,
        remaining: current,
      });
    }

    return NextResponse.json({
      ok: current.length === 0,
      checkedJobs: RELIABILITY_JOBS.length,
      activeAlerts: current,
      delayedRewards,
      // The same active fault returns 503 for accurate health status,
      // while log notifications are emitted only on transitions.
      newAlerts: changes.newlyActive.length,
      recoveredAlerts: changes.resolved.length,
    }, { status: current.length ? 503 : 200, headers: HEADERS });
  } catch (error) {
    console.error('VeInvite reliability monitor unavailable:', error);
    return NextResponse.json(
      { error: 'CRON_HEALTH_DB_UNAVAILABLE' },
      { status: 503, headers: HEADERS },
    );
  }
}
