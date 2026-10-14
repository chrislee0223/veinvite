import { randomUUID } from 'node:crypto';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import { supabaseAdmin } from '@/lib/supabaseServer';

// Greater than the 300s maximum route execution time; a terminated function
// cannot immediately hand another worker the same unexpired invitation lease.
export const INVITATION_EVIDENCE_LEASE_SECONDS = 360;

export type LeasedInvitationSync =
  | { acquired: false }
  | {
      acquired: true;
      synced: Awaited<ReturnType<typeof syncInvitationEvidence>>;
    };

// Share the API's invite_evidence_sync key across daily and vote workers.
// Their broader chain_reconcile locks are not substitutes for per-invite
// exclusion because the authenticated API does not hold a chain-wide lock.
export async function reconcileInvitationWithLease(
  inviteCode: string,
): Promise<LeasedInvitationSync> {
  const lockName = `invite_evidence_sync:${inviteCode}`;
  const ownerToken = randomUUID();
  const { data: acquired, error: acquireError } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: INVITATION_EVIDENCE_LEASE_SECONDS,
    },
  );
  if (acquireError) {
    throw new Error(`Invitation sync lock failed: ${acquireError.message}`);
  }
  if (acquired !== true) return { acquired: false };

  try {
    // A prior listing may be stale by the time this lock is acquired.
    // Read the current Sybil verdict and mission checkpoints under the lease.
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Locked invitation state unavailable: ${error?.message ?? 'missing row'}`);
    }
    return {
      acquired: true,
      synced: await syncInvitationEvidence(data as InvitationEvidenceRow),
    };
  } finally {
    const { error } = await supabaseAdmin.rpc('release_operator_lock', {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
    });
    if (error) {
      // Owner-specific unlock; expiry is the safety net if this fails.
      console.error('Invitation evidence lease release failed:', error);
    }
  }
}
