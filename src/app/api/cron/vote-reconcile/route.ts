import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import {
  reserveEligibleReferralRewards,
} from '@/lib/rewards/rewardReservation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  runSybilV2AssessmentBatch,
} from '@/lib/sybil/v2/pipeline';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const maxDuration = 300;

const BATCH_SIZE = 25;
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
  apps_completed_at,
  apps_completed_block,
  vot3_converted,
  vot3_converted_at,
  vot3_converted_block,
  vot3_conversion_tx_id,
  vot3_conversion_amount_wei,
  vote_completed,
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

function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Cron secret is not configured.',
    };
  }

  const authorization =
    request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (
    !authorization ||
    !secureEquals(authorization, expected)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
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
      `Failed to acquire vote reconciliation lock: ${error.message}`,
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
      'Failed to release vote reconciliation lock:',
      error,
    );
  }
}

async function reconcileVoteOnlyCandidates() {
  const { network } = getVeBetterNetworkConfig();
  const lockName = `chain_reconcile:${network}`;
  const ownerToken = randomUUID();

  const acquired =
    await acquireLock(lockName, ownerToken);

  if (!acquired) {
    return {
      network,
      skippedBecauseLocked: true,
      selected: 0,
      voteDetected: 0,
      failed: 0,
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(invitationEvidenceColumns)
      .eq('activation_network', network)
      .eq('status', 'ACTIVATING')
      .eq('reward_status', 'PENDING')
      .gte('apps_completed', 3)
      .gte('rewards_received', 3)
      .eq('vot3_converted', true)
      .or('vote_completed.eq.false,vote_completed.is.null')
      .not('invitee_wallet', 'is', null)
      .not('eligibility_check_id', 'is', null)
      .is('impact_sync_complete_at', null)
      .order('impact_last_synced_at', {
        ascending: true,
        nullsFirst: true,
      })
      .order('activated_at', {
        ascending: true,
        nullsFirst: true,
      })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(
        `Failed to load vote reconciliation candidates: ${error.message}`,
      );
    }

    const rows =
      (data ?? []) as InvitationEvidenceRow[];

    let voteDetected = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const synced =
          await syncInvitationEvidence(row);

        if (synced.progress.voteCompleted) {
          voteDetected += 1;
        }
      } catch (syncError) {
        failed += 1;
        console.error(
          `Vote reconciliation failed for ${row.invite_code}:`,
          syncError,
        );
      }
    }

    return {
      network,
      skippedBecauseLocked: false,
      selected: rows.length,
      voteDetected,
      failed,
    };
  } finally {
    await releaseLock(lockName, ownerToken);
  }
}

/**
 * Pro-plan fast safety net for invitees who have finished every mission except
 * governance voting. It intentionally avoids the heavier daily maintenance
 * work in /api/cron/reconcile.
 *
 * Once a vote is finalized, syncInvitationEvidence performs the current
 * Security Client refresh and Sybil v2 gate before any reward reservation can
 * continue. The assessment and reservation sweeps below provide a bounded,
 * fail-closed recovery path for transient final-assessment/finality delays.
 */
export async function GET(request: NextRequest) {
  const authorization =
    authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const reconciliation =
      await reconcileVoteOnlyCandidates();

    const sybilV2Assessment =
      await runSybilV2AssessmentBatch(25);

    const rewardReservation =
      await reserveEligibleReferralRewards();

    return NextResponse.json(
      {
        mode: 'VOTE_RECONCILIATION',
        reconciliation,
        sybilV2Assessment,
        rewardReservation,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Frequent vote reconciliation failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Frequent vote reconciliation failed.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
