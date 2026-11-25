import 'server-only';

import { markCronJobFailed, markCronJobSucceeded, tryClaimCronJob } from '@/lib/monitoring/cronHeartbeat';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { runMissionAutoResetSweep, type MissionResetSweep, type MissionSweepPhase } from './missionAutoResetSweep';

// Each phase is claimed by the existing parent cadence. The lease outlives
// the parent function's 300-second deadline; there is no additional cron.
export const MISSION_PROGRESS_JOB = 'vote-reconcile:mission-progress';
export const MISSION_EXPIRY_JOB = 'vote-reconcile:mission-expiry';
const MISSION_SWEEP_LEASE_SECONDS = 360;

export async function runMissionAutoResetSweepSafe(phase: MissionSweepPhase): Promise<{
  sweep: MissionResetSweep | null;
  failure: Error | null;
}> {
  const job = phase === 'expiry' ? MISSION_EXPIRY_JOB : MISSION_PROGRESS_JOB;
  let claimed = false;
  let sweep: MissionResetSweep | null = null;
  try {
    claimed = await tryClaimCronJob(job, 0, MISSION_SWEEP_LEASE_SECONDS);
    if (!claimed) return { sweep: null, failure: null };
    const { data: state, error } = await supabaseAdmin.from('cron_job_states')
      .select('mission_sweep_cursor,last_started_at').eq('job_name', job).maybeSingle();
    if (error || !state?.last_started_at) throw new Error('Mission sweep checkpoint unavailable.');
    const cursor = state.mission_sweep_cursor as string | null;
    const page = await runMissionAutoResetSweep(phase === 'expiry' ? 10 : 5, phase, cursor);
    const { nextCursor, ...result } = page;
    sweep = result;
    if (page.status === 'CHECKED') {
      // A candidate error is recorded but does not starve later candidates.
      // It remains in the queue for the next complete rotation.
      const saved = await supabaseAdmin.from('cron_job_states')
        .update({ mission_sweep_cursor: nextCursor })
        .eq('job_name', job).eq('last_started_at', state.last_started_at)
        .select('job_name').maybeSingle();
      if (saved.error || !saved.data) throw new Error('Mission sweep checkpoint was not saved.');
    }
    if (sweep.failed > 0) throw new Error('Mission reset candidate chain proof failed.');
    await markCronJobSucceeded(job);
    return { sweep, failure: null };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error('Mission sweep failed.');
    console.error('Mission sweep failed:', { phase, message: failure.message });
    if (claimed) {
      try { await markCronJobFailed(job, failure); }
      catch (heartbeatError) { console.error('Mission sweep heartbeat failed:', heartbeatError); }
    }
    return { sweep, failure };
  }
}
