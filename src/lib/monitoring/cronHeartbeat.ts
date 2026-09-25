import { supabaseAdmin } from '@/lib/supabaseServer';

const MAX_ERROR_LENGTH = 2000;

function normalizeCronError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown cron error.';

  return message.slice(0, MAX_ERROR_LENGTH);
}

async function upsertCronJobState(
  jobName: string,
  values: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('cron_job_states')
    .upsert(
      {
        job_name: jobName,
        updated_at: now,
        ...values,
      },
      {
        onConflict: 'job_name',
      },
    );

  if (error) {
    throw new Error(
      `Failed to update cron state for ${jobName}: ${error.message}`,
    );
  }
}

export async function markCronJobStarted(
  jobName: string,
) {
  await upsertCronJobState(jobName, {
    last_started_at: new Date().toISOString(),
  });
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
  );

  if (error) {
    throw new Error(
      `Failed to claim cron job ${jobName}: ${error.message}`,
    );
  }

  return data === true;
}
