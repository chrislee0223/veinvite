import 'server-only';

import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabaseServer';

// A single DB-backed lock covers both Queue callbacks and scheduled recovery.
// Keep the lease longer than Vercel's 300-second function limit so two workers
// cannot reprice the same cohort simultaneously after a temporary slowdown.
const RESERVATION_SWEEP_LEASE_SECONDS = 600;
const RESERVATION_SWEEP_RPC_TIMEOUT_MS = 8_000;

export async function withRewardReservationSweepLock<T>(
  network: string,
  work: () => Promise<T>,
  whenBusy: () => T,
): Promise<T> {
  const lockName = `reward_reservation_sweep:${network}`;
  const ownerToken = randomUUID();
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: RESERVATION_SWEEP_LEASE_SECONDS,
    },
  ).abortSignal(AbortSignal.timeout(RESERVATION_SWEEP_RPC_TIMEOUT_MS));

  if (error) {
    // Never proceed without a confirmed lock when the database is unhealthy.
    throw new Error(`Reward reservation sweep lock failed: ${error.message}`);
  }

  if (data !== true) {
    // Keep the pending reservation authoritative; Queue retries and the
    // scheduled recovery pass can revisit it after the current owner exits.
    return whenBusy();
  }

  try {
    return await work();
  } finally {
    // Best effort release; an unreleased lease expires automatically. Never
    // replace the original reservation error with a lock-cleanup error.
    try {
      const { error: releaseError } = await supabaseAdmin.rpc(
        'release_operator_lock',
        {
          p_lock_name: lockName,
          p_owner_token: ownerToken,
        },
      ).abortSignal(AbortSignal.timeout(RESERVATION_SWEEP_RPC_TIMEOUT_MS));

      if (releaseError) {
        console.error('Reward reservation sweep lock release failed:', releaseError);
      }
    } catch (releaseError) {
      console.error('Reward reservation sweep lock release failed:', releaseError);
    }
  }
}
