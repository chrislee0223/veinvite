import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

// A separate low-frequency heartbeat check still runs when daily reconciliation
// and analytics maintenance fail, without invoking their expensive workloads.
// This monitors job liveness, not the Supabase CPU metric itself.
const MONITORED_JOBS = [
  { name: 'vote-reconcile', maxAgeMinutes: 15 },
  { name: 'vote-reconcile:submitted-payout-recovery', maxAgeMinutes: 20 },
  { name: 'vote-reconcile:reward-boost-reserve', maxAgeMinutes: 120 },
  { name: 'daily-reconcile', maxAgeMinutes: 30 * 60 },
  { name: 'analytics-maintenance', maxAgeMinutes: 30 * 60 },
] as const;
const HEALTH_READ_TIMEOUT_MS = 8_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization');
  const expected = secret ? `Bearer ${secret}` : '';

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET_UNCONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const suppliedBytes = Buffer.from(supplied ?? '');
  const expectedBytes = Buffer.from(expected);
  if (!supplied || suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let rows: Array<{ job_name: string; last_succeeded_at: string | null }> = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('cron_job_states')
      .select('job_name,last_succeeded_at')
      .in('job_name', MONITORED_JOBS.map((job) => job.name))
      .abortSignal(AbortSignal.timeout(HEALTH_READ_TIMEOUT_MS));

    if (error) {
      throw new Error(error.message);
    }
    rows = data ?? [];
  } catch (error) {
    console.error('VeInvite reliability check could not read cron states:', error);
    return NextResponse.json(
      { error: 'CRON_HEALTH_DB_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const lastSuccess = new Map<string, string | null>(
    rows.map((row) => [row.job_name, row.last_succeeded_at]),
  );
  const now = Date.now();
  const staleJobs = MONITORED_JOBS.filter(({ name, maxAgeMinutes }) => {
    const at = lastSuccess.get(name);
    const parsed = at ? Date.parse(at) : NaN;
    return !Number.isFinite(parsed) ||
      now - parsed > maxAgeMinutes * 60_000;
  }).map(({ name }) => name);

  if (staleJobs.length > 0) {
    // Runtime errors provide a visible independent alert signal when normal
    // monitoring snapshots stop because a parent daily cron is unhealthy.
    console.error('VeInvite scheduled-job liveness warning:', { staleJobs });
    return NextResponse.json(
      { error: 'CRON_HEALTH_STALE', staleJobs },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { ok: true, checkedJobs: MONITORED_JOBS.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
