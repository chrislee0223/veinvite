import { supabaseAdmin } from '@/lib/supabaseServer';

const MAX_ERROR_LENGTH = 2000;
// Cron heartbeat writes are idempotent; bound the transport wait so a
// database outage cannot consume an entire Vercel Function execution.
const CRON_HEARTBEAT_TIMEOUT_MS = 8_000;
// Retry only the idempotent START marker, never a cadence claim or a payout.
const CRON_START_TRANSIENT_RETRY_DELAY_MS = 250;

function normalizeCronError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown cron error.';

  return message.slice(0, MAX_ERROR_LENGTH);
}

function isTransientHeartbeatStartWriteError(
  error: { message?: string } | null,
): boolean {
  // A write may have committed before the client timed out. Repeating the
  // *same* START marker is safe; lease claims and other writes are not retried.
  return (
    /TimeoutError|operation was aborted due to timeout|fetch failed/i.test(
      error?.message ?? '',
    )
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function upsertCronJobState(
  jobName: string,
  values: Record<string, unknown>,
  retryTransientStart = false,
) {
  // Preserve identical values/timestamps across attempts so the retry does
  // not create a second logical start event.
  const now = new Date().toISOString();
  const payload = {
    job_name: jobName,
    updated_at: now,
    ...values,
  };
  const write = () =>
    supabaseAdmin
      .from('cron_job_states')
      .upsert(payload, { onConflict: 'job_name' })
      .abortSignal(
        AbortSignal.timeout(CRON_HEARTBEAT_TIMEOUT_MS),
      );

  let { error } = await write();

  if (
    retryTransientStart &&
    isTransientHeartbeatStartWriteError(error)
  ) {
    await wait(CRON_START_TRANSIENT_RETRY_DELAY_MS);
    ({ error } = await write());
    if (!error) {
      console.info(
        'Cron START heartbeat recovered after transient transport error:',
        jobName,
      );
    }
  }

  if (error) {
    throw new Error(
      `Failed to update cron state for ${jobName}: ${error.message}`,
    );
  }
}

export async function markCronJobStarted(
  jobName: string,
) {
  await upsertCronJobState(
    jobName,
    { last_started_at: new Date().toISOString() },
    true,
  );
}

export async function markCronJobSucceeded(
  jobName: string,
) {
  await upsertCronJobState(jobName, {
    last_succeeded_at: new Date().toISOString(),
    last_error: null,
    lease_until: null,
  });
}

export async function markCronJobFailed(
  jobName: string,
  error: unknown,
) {
  await upsertCronJobState(jobName, {
    last_failed_at: new Date().toISOString(),
    last_error: normalizeCronError(error),
    lease_until: null,
  });
}

export async function tryClaimCronJob(
  jobName: string,
  minSuccessIntervalSeconds: number,
  leaseSeconds = 180,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_claim_cron_job',
    {
      p_job_name: jobName,
      p_min_success_interval_seconds:
        minSuccessIntervalSeconds,
      p_lease_seconds: leaseSeconds,
    },
  ).abortSignal(AbortSignal.timeout(CRON_HEARTBEAT_TIMEOUT_MS));

  if (error) {
    throw new Error(
      `Failed to claim cron job ${jobName}: ${error.message}`,
    );
  }

  return data === true;
}
