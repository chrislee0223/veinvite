import { randomUUID } from 'node:crypto';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const DEFAULT_RECONCILIATION_BATCH_SIZE = 10;
export const MAX_RECONCILIATION_BATCH_SIZE = 25;

const RECONCILIATION_LEASE_SECONDS = 600;

const invitationEvidenceColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at,
  activated_at,
  activation_block,
  activation_network,
  apps_completed,
  rewards_received,
  vote_completed,
  apps_completed_at,
  apps_completed_block,
  vote_completed_at,
  vote_completed_block,
  vote_round_id,
  sybil_status,
  sybil_risk_level,
  sybil_risk_score,
  sybil_reason,
  sybil_checked_at,
  sybil_source,
  impact_last_synced_block,
  impact_last_synced_at,
  impact_sync_complete_at
` as const;

export type ReconciliationResult = {
  inviteCode: string;
  status: string;
  rewardStatus: string;
  appsCompleted: number;
  voteCompleted: boolean;
  impactCheckpointSaved: boolean;
  impactSyncComplete: boolean;
  networkMismatch: boolean;
  error?: string;
};

export type ReconciliationBatchSummary = {
  mode: 'CHAIN_RECONCILIATION';
  network: string;
  writesLimitedToEvidenceAndDerivedInvitationState: true;
  rewardRoundsPrepared: false;
  transfersPerformed: false;
  skippedBecauseLocked: boolean;
  selected: number;
  completed: number;
  failedOrIncomplete: number;
  results: ReconciliationResult[];
};

function validateLimit(limit: number) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_RECONCILIATION_BATCH_SIZE
  ) {
    throw new Error(
      `limit must be an integer from 1 to ${MAX_RECONCILIATION_BATCH_SIZE}.`,
    );
  }
}

async function acquireLock(
  lockName: string,
  ownerToken: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: RECONCILIATION_LEASE_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `Failed to acquire reconciliation lock: ${error.message}`,
    );
  }

  return data === true;
}

async function releaseLock(
  lockName: string,
  ownerToken: string,
) {
  const { error } = await supabaseAdmin.rpc(
    'release_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
    },
  );

  if (error) {
    console.error(
      'Failed to release reconciliation lock:',
      error,
    );
  }
}

export async function runReconciliationBatch(
  limit = DEFAULT_RECONCILIATION_BATCH_SIZE,
): Promise<ReconciliationBatchSummary> {
  validateLimit(limit);

  const { network } =
    getVeBetterNetworkConfig();
  const lockName =
    `chain_reconcile:${network}`;
  const ownerToken = randomUUID();

  const acquired =
    await acquireLock(lockName, ownerToken);

  if (!acquired) {
    return {
      mode: 'CHAIN_RECONCILIATION',
      network,
      writesLimitedToEvidenceAndDerivedInvitationState:
        true,
      rewardRoundsPrepared: false,
      transfersPerformed: false,
      skippedBecauseLocked: true,
      selected: 0,
      completed: 0,
      failedOrIncomplete: 0,
      results: [],
    };
  }

  try {
    // Only modern accepted referrals with an immutable entry proof are
    // candidates. Legacy rows stay preserved but cannot be silently promoted.
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(invitationEvidenceColumns)
      .eq('activation_network', network)
      .not('invitee_wallet', 'is', null)
      .not('eligibility_check_id', 'is', null)
      .neq('status', 'CANCELLED')
      .is('impact_sync_complete_at', null)
      .order('impact_last_synced_at', {
        ascending: true,
        nullsFirst: true,
      })
      .order('activated_at', {
        ascending: true,
        nullsFirst: true,
      })
      .limit(limit);

    if (error) {
      throw new Error(
        `Failed to load reconciliation batch: ${error.message}`,
      );
    }

    const rows =
      (data ?? []) as InvitationEvidenceRow[];

    const results: ReconciliationResult[] = [];

    // Intentionally serialized. This keeps RPC/node pressure bounded and makes
    // the worker predictable on the current small launch workload.
    for (const row of rows) {
      try {
        const synced =
          await syncInvitationEvidence(row);

        results.push({
          inviteCode: row.invite_code,
          status: synced.row.status,
          rewardStatus:
            synced.row.reward_status,
          appsCompleted:
            synced.progress.appsCompleted,
          voteCompleted:
            synced.progress.voteCompleted,
          impactCheckpointSaved:
            synced.progress
              .impactCheckpointSaved,
          impactSyncComplete:
            Boolean(
              synced.progress
                .impactSyncCompleteAt,
            ),
          networkMismatch:
            synced.progress.networkMismatch,
        });
      } catch (syncError) {
        console.error(
          `Unexpected reconciliation failure for ${row.invite_code}:`,
          syncError,
        );

        results.push({
          inviteCode: row.invite_code,
          status: row.status,
          rewardStatus: row.reward_status,
          appsCompleted:
            row.apps_completed ?? 0,
          voteCompleted:
            row.vote_completed ?? false,
          impactCheckpointSaved: false,
          impactSyncComplete: false,
          networkMismatch: false,
          error:
            syncError instanceof Error
              ? syncError.message
              : 'Unexpected reconciliation failure.',
        });
      }
    }

    const completed = results.filter(
      (result) => result.impactSyncComplete,
    ).length;

    return {
      mode: 'CHAIN_RECONCILIATION',
      network,
      writesLimitedToEvidenceAndDerivedInvitationState:
        true,
      rewardRoundsPrepared: false,
      transfersPerformed: false,
      skippedBecauseLocked: false,
      selected: rows.length,
      completed,
      failedOrIncomplete:
        results.length - completed,
      results,
    };
  } finally {
    await releaseLock(lockName, ownerToken);
  }
}
