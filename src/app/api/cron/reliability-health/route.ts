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
  staleSybilScanFailureCodes,
  xPromotionGateCodes,
  xPromotionPipelineCodes,
  type JobHeartbeat,
  type SybilHoldLiveness,
  type SybilScanFailureLiveness,
  type XPromotionLiveness,
  type XPromotionPipelineLiveness,
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

async function readSybilScanFailureLiveness(): Promise<SybilScanFailureLiveness> {
  // Server-only aggregate. This does not change any Sybil verdict or reward.
  const { network } = getVeBetterNetworkConfig();
  const { data, error } = await supabaseAdmin.rpc(
    'read_sybil_v2_failed_scan_liveness',
    { p_network: network },
  ).abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
  if (error) {
    throw new Error('Sybil scan failure liveness could not be read.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('Sybil scan failure liveness response is missing.');
  }
  return {
    failedScans: checkedCount(row.failed_scans, 'failed_scans'),
    failedOver1h: checkedCount(row.failed_over_1h, 'failed_over_1h'),
    failedOver24h: checkedCount(row.failed_over_24h, 'failed_over_24h'),
  };
}

async function readXPromotionLiveness(): Promise<XPromotionLiveness> {
  // Read-only operational coherence check. This never opens/closes the gate,
  // creates an offer, verifies a Post, or signs a payout.
  const { network } = getVeBetterNetworkConfig();
  const { data: config, error: configError } = await supabaseAdmin
    .from('reward_runtime_config')
    .select(
      'reward_x_promotion_enabled,reward_x_promotion_payout_enabled,reward_x_promotion_external_verification_ready',
    )
    .eq('id', 1)
    .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS))
    .maybeSingle();
  if (configError || !config) {
    throw new Error('X promotion runtime config could not be read.');
  }

  const { data: runtime, error: runtimeError } = await supabaseAdmin.rpc(
    'read_reward_x_promotion_external_runtime_readiness_v1',
    {
      p_network: network,
      p_max_age_seconds: 1200,
    },
  ).abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
  if (runtimeError || !runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new Error('X promotion external runtime readiness could not be read.');
  }

  const runtimeRecord = runtime as Record<string, unknown>;
  const runtimeReady = runtimeRecord.ready;
  if (typeof runtimeReady !== 'boolean') {
    throw new Error('X promotion external runtime readiness is malformed.');
  }
  const runtimeProbeStatus =
    typeof runtimeRecord.status === 'string' &&
    /^[A-Z0-9_]{1,64}$/u.test(runtimeRecord.status)
      ? runtimeRecord.status
      : 'UNKNOWN';
  const checkedAtMs = typeof runtimeRecord.checkedAt === 'string'
    ? Date.parse(runtimeRecord.checkedAt)
    : NaN;
  const runtimeProbeAgeSeconds = Number.isFinite(checkedAtMs)
    ? Math.max(0, Math.floor((Date.now() - checkedAtMs) / 1000))
    : null;
  // Keep the safety-critical alert unchanged, but tell a cached-probe expiry
  // apart from an actual failed provider/runtime check in operator telemetry.
  const runtimeProbeState =
    runtimeReady
      ? 'READY'
      : ['READY', 'POST_NOT_FOUND'].includes(runtimeProbeStatus)
        ? 'EXPIRED'
        : 'UNAVAILABLE';

  return {
    liveEnabled: config.reward_x_promotion_enabled === true,
    payoutEnabled: config.reward_x_promotion_payout_enabled === true,
    externalVerificationReady:
      config.reward_x_promotion_external_verification_ready === true,
    runtimeReady,
    runtimeProbeStatus,
    runtimeProbeState,
    runtimeProbeAgeSeconds,
  };
}

async function readXPromotionPipelineLiveness():
Promise<XPromotionPipelineLiveness> {
  // Use indexed filters and LIMIT 1 to avoid full-table scans or returning
  // wallet/Post identifiers to operator logs. Only active HELD obligations
  // qualify; historical RELEASED or PAID rows cannot cause false alerts.
  const { network } = getVeBetterNetworkConfig();
  const now = Date.now();
  const before = (hours: number) =>
    new Date(now - hours * 60 * 60 * 1000).toISOString();

  const [pending, final, payout] = await Promise.all([
    supabaseAdmin
      .from('reward_x_promotion_post_submissions')
      .select('id,reward_x_promotion_obligations!inner(financial_state)')
      .eq('network', network)
      .eq('submission_state', 'PENDING')
      .eq('reward_x_promotion_obligations.financial_state', 'HELD')
      .lt('submitted_at', before(2))
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS)),
    supabaseAdmin
      .from('reward_x_promotion_post_verifications')
      .select('id,reward_x_promotion_obligations!inner(financial_state)')
      .eq('network', network)
      .in('verification_state', ['INITIAL_VERIFIED', 'REVIEW_REQUIRED'])
      .eq('reward_x_promotion_obligations.financial_state', 'HELD')
      .lt('verify_after', before(2))
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS)),
    supabaseAdmin
      .from('reward_x_promotion_post_verifications')
      .select('id,reward_x_promotion_obligations!inner(financial_state)')
      .eq('network', network)
      .eq('verification_state', 'FINAL_VERIFIED')
      .is('invalidated_at', null)
      .eq('reward_x_promotion_obligations.financial_state', 'HELD')
      .lt('final_verified_at', before(3))
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS)),
  ]);

  if (pending.error || final.error || payout.error ||
      !Array.isArray(pending.data) ||
      !Array.isArray(final.data) ||
      !Array.isArray(payout.data)) {
    throw new Error('X promotion pipeline liveness could not be read.');
  }

  return {
    pendingPostStalled: pending.data.length > 0,
    finalCheckStalled: final.data.length > 0,
    payoutStalled: payout.data.length > 0,
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
    const [delayedRewards, sybilHolds, sybilScanFailures, xPromotion, xPromotionPipeline] = await Promise.all([
      readRewardReservationDelay(),
      readSybilHoldLiveness(),
      readSybilScanFailureLiveness(),
      readXPromotionLiveness(),
      readXPromotionPipelineLiveness(),
    ]);
    const current = stableAlarmCodes([
      ...staleCronCodes(rows as JobHeartbeat[], Date.now()),
      ...delayedRewardCode(delayedRewards),
      ...staleSybilHoldCodes(sybilHolds),
      ...staleSybilScanFailureCodes(sybilScanFailures),
      ...xPromotionGateCodes(xPromotion),
      ...xPromotionPipelineCodes(xPromotionPipeline, xPromotion),
    ]);
    const changes = alarmChanges(previous, current);
    // Operator-only warnings (a one-hour HOLD or a safely closed X gate)
    // need attention without mislabeling the whole app as unavailable.
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
        // A successful *check* updates its heartbeat even when it discovered
        // an actionable issue. Keep alert state independently in last_error.
        last_succeeded_at: now,
        // Warning-only states are pending operator tasks, not failed monitors.
        ...(changes.newlyActive.some((code) =>
          isReliabilityDegraded([code]),
        ) ? { last_failed_at: now } : {}),
      }, { onConflict: 'job_name' })
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));
    if (saveError) throw new Error('Reliability alert checkpoint could not be persisted.');

    if (changes.newlyActive.length) {
      console.error('VeInvite sustained reliability alert:', {
        newlyActive: changes.newlyActive,
        active: current,
        delayedRewards,
        sybilHolds,
        sybilScanFailures,
        xPromotion,
        xPromotionPipeline,
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
      sybilScanFailures,
      xPromotion,
      xPromotionPipeline,
      // Warning-only HOLD/X-gate states stay HTTP 200; critical reliability
      // faults still return 503.
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
