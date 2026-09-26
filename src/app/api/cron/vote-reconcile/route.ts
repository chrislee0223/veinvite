import { randomUUID, timingSafeEqual } from 'node:crypto';

import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import {
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
  tryClaimCronJob,
} from '@/lib/monitoring/cronHeartbeat';
import {
  reserveEligibleReferralRewards,
} from '@/lib/rewards/rewardReservation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  runSybilV2AssessmentBatch,
} from '@/lib/sybil/v2/pipeline';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export const maxDuration = 300;

const EVENT_RECONCILIATION_BATCH_SIZE = 25;
const FALLBACK_CANDIDATE_LIMIT = 500;
const EVENT_PAGE_SIZE = 1000;
const INITIAL_LOOKBACK_BLOCKS = 360;
const MAX_EVENT_CATCHUP_BLOCKS = 3600;
const FALLBACK_REPLAY_LOOKBACK_BLOCKS = 720;
const FALLBACK_INTERVAL_SECONDS = 30 * 60;
const RECOVERY_INTERVAL_SECONDS = 5 * 60;
const CADENCE_LEASE_SECONDS = 180;
const RECONCILIATION_LEASE_SECONDS = 600;
const EVENT_WATCH_LEASE_SECONDS = 180;

const VOTE_RECONCILE_JOB =
  'vote-reconcile';
const VOTE_RECOVERY_JOB =
  'vote-reconcile:sybil-reward-recovery';
const VOTE_FALLBACK_JOB =
  'vote-reconcile:full-fallback';

const allocationVoteCastEvent =
  new ABIEvent(
    'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
  );

type RawVoteLog = {
  topics?: string[];
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

type VoteEventPointer = {
  walletAddress: string;
  blockNumber: number;
  txId: string;
};

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

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof topic === 'string'
    ? topic
    : undefined;
}

function readIndexedAddress(
  topic: string | undefined,
): string | null {
  if (
    !topic ||
    !/^0x[0-9a-fA-F]{64}$/.test(topic)
  ) {
    return null;
  }

  const walletAddress =
    `0x${topic.slice(-40)}`.toLowerCase();

  return /^0x[0-9a-f]{40}$/.test(
    walletAddress,
  )
    ? walletAddress
    : null;
}

function readSafeBlockNumber(
  value: unknown,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  return Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

async function acquireLock(
  lockName: string,
  ownerToken: string,
  leaseSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: leaseSeconds,
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

async function loadActivePendingInvitations(
  network: VeBetterNetwork,
): Promise<InvitationEvidenceRow[]> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationEvidenceColumns)
    .eq('activation_network', network)
    .eq('reward_status', 'PENDING')
    .neq('status', 'CANCELLED')
    .or(
      'vote_completed.eq.false,vote_completed.is.null',
    )
    .not('invitee_wallet', 'is', null)
    .not('eligibility_check_id', 'is', null)
    .is('impact_sync_complete_at', null)
    .order('activated_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(1000);

  if (error) {
    throw new Error(
      `Failed to load active vote-watch invitations: ${error.message}`,
    );
  }

  return (data ?? []) as InvitationEvidenceRow[];
}

async function readVoteScanCheckpoint(
  network: VeBetterNetwork,
): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from('vote_reconcile_scan_checkpoints')
    .select('last_scanned_block')
    .eq('network', network)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load vote scan checkpoint: ${error.message}`,
    );
  }

  return readSafeBlockNumber(
    data?.last_scanned_block,
  );
}

async function saveVoteScanCheckpoint(
  network: VeBetterNetwork,
  lastScannedBlock: number,
) {
  const { error } = await supabaseAdmin
    .from('vote_reconcile_scan_checkpoints')
    .upsert(
      {
        network,
        last_scanned_block:
          lastScannedBlock,
        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict: 'network',
      },
    );

  if (error) {
    throw new Error(
      `Failed to persist vote scan checkpoint: ${error.message}`,
    );
  }
}

async function readFinalizedBlockNumber(
  nodeUrl: string,
): Promise<number> {
  const thor = ThorClient.at(nodeUrl);
  const finalized =
    await thor.blocks.getBlockCompressed(
      'finalized',
    );
  const blockNumber =
    readSafeBlockNumber(finalized?.number);

  if (blockNumber === null) {
    throw new Error(
      'VeChain finalized block is unavailable.',
    );
  }

  return blockNumber;
}

async function readFinalizedVoteEvents({
  nodeUrl,
  votingAddress,
  fromBlock,
  toBlock,
}: {
  nodeUrl: string;
  votingAddress: string;
  fromBlock: number;
  toBlock: number;
}): Promise<{
  eventCount: number;
  voters: Map<string, VoteEventPointer>;
}> {
  if (fromBlock > toBlock) {
    return {
      eventCount: 0,
      voters: new Map(),
    };
  }

  const thor = ThorClient.at(nodeUrl);
  const topics =
    allocationVoteCastEvent
      .encodeFilterTopics([
        null,
        null,
      ]);
  const topic0 =
    getSingleTopic(topics[0]);

  if (!topic0) {
    throw new Error(
      'AllocationVoteCast topic could not be encoded.',
    );
  }

  let offset = 0;
  let eventCount = 0;
  const voters =
    new Map<string, VoteEventPointer>();

  while (true) {
    const logs =
      await thor.logs.filterRawEventLogs({
        range: {
          unit: 'block',
          from: fromBlock,
          to: toBlock,
        },
        options: {
          offset,
          limit: EVENT_PAGE_SIZE,
        },
        criteriaSet: [
          {
            address: votingAddress,
            topic0,
          },
        ],
        order: 'asc',
      });

    const rawLogs =
      logs as RawVoteLog[];

    for (const log of rawLogs) {
      const walletAddress =
        readIndexedAddress(
          log.topics?.[1],
        );
      const blockNumber =
        readSafeBlockNumber(
          log.meta?.blockNumber,
        );
      const txId =
        log.meta?.txID?.toLowerCase();

      if (
        !walletAddress ||
        blockNumber === null ||
        !txId ||
        !/^0x[0-9a-f]{64}$/.test(txId)
      ) {
        continue;
      }

      eventCount += 1;
      voters.set(
        walletAddress,
        {
          walletAddress,
          blockNumber,
          txId,
        },
      );
    }

    if (
      rawLogs.length <
      EVENT_PAGE_SIZE
    ) {
      break;
    }

    offset += EVENT_PAGE_SIZE;
  }

  return {
    eventCount,
    voters,
  };
}

async function reconcileRows(
  rows: InvitationEvidenceRow[],
  network: VeBetterNetwork,
  limit: number,
) {
  if (rows.length === 0) {
    return {
      skippedBecauseLocked: false,
      selected: 0,
      voteDetected: 0,
      failed: 0,
      overflow: false,
    };
  }

  const lockName =
    `chain_reconcile:${network}`;
  const ownerToken = randomUUID();

  const acquired =
    await acquireLock(
      lockName,
      ownerToken,
      RECONCILIATION_LEASE_SECONDS,
    );

  if (!acquired) {
    return {
      skippedBecauseLocked: true,
      selected: 0,
      voteDetected: 0,
      failed: 0,
      overflow: rows.length > 0,
    };
  }

  try {
    const selectedRows =
      rows.slice(0, limit);

    let voteDetected = 0;
    let failed = 0;

    for (const row of selectedRows) {
      try {
        const synced =
          await syncInvitationEvidence(row);

        if (
          synced.progress.voteCompleted
        ) {
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
      skippedBecauseLocked: false,
      selected: selectedRows.length,
      voteDetected,
      failed,
      overflow:
        rows.length >
        selectedRows.length,
    };
  } finally {
    await releaseLock(
      lockName,
      ownerToken,
    );
  }
}

async function runEventDrivenVoteWatcher() {
  const {
    network,
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const watchLockName =
    `vote_event_watch:${network}`;
  const ownerToken = randomUUID();

  const acquired =
    await acquireLock(
      watchLockName,
      ownerToken,
      EVENT_WATCH_LEASE_SECONDS,
    );

  if (!acquired) {
    return {
      network,
      skippedBecauseLocked: true,
      activePending: 0,
      fromBlock: null,
      toBlock: null,
      chainVoteEvents: 0,
      matchedInvitations: 0,
      selected: 0,
      voteDetected: 0,
      failed: 0,
      checkpointAdvanced: false,
    };
  }

  try {
    const finalizedBlock =
      await readFinalizedBlockNumber(
        nodeUrl,
      );
    const checkpoint =
      await readVoteScanCheckpoint(
        network,
      );
    const recoveryFloor =
      Math.max(
        0,
        finalizedBlock -
          INITIAL_LOOKBACK_BLOCKS,
      );
    // A persisted cursor is authoritative. Never jump it forward to a recent
    // recovery floor after an outage, because doing so can permanently skip
    // governance votes that happened while the cron was unavailable. Bound
    // each pass instead and catch up over successive one-minute invocations.
    const fromBlock =
      checkpoint === null
        ? recoveryFloor
        : checkpoint + 1;
    const scanToBlock =
      Math.min(
        finalizedBlock,
        fromBlock +
          MAX_EVENT_CATCHUP_BLOCKS -
          1,
      );

    if (fromBlock > finalizedBlock) {
      return {
        network,
        skippedBecauseLocked: false,
        activePending: null,
        fromBlock,
        toBlock: finalizedBlock,
        finalizedBlock,
        catchupRemainingBlocks: 0,
        chainVoteEvents: 0,
        matchedInvitations: 0,
        selected: 0,
        voteDetected: 0,
        failed: 0,
        checkpointAdvanced: false,
      };
    }

    const voteEvents =
      await readFinalizedVoteEvents({
        nodeUrl,
        votingAddress:
          xAllocationVotingAddress,
        fromBlock,
        toBlock: scanToBlock,
      });

    // Most one-minute passes contain no AllocationVoteCast event. Advance the
    // finalized cursor immediately and avoid loading every active invitation
    // from Postgres unless there is an actual governance vote to match.
    if (voteEvents.eventCount === 0) {
      await saveVoteScanCheckpoint(
        network,
        scanToBlock,
      );

      return {
        network,
        skippedBecauseLocked: false,
        activePending: null,
        fromBlock,
        toBlock: scanToBlock,
        finalizedBlock,
        catchupRemainingBlocks:
          finalizedBlock - scanToBlock,
        chainVoteEvents: 0,
        matchedInvitations: 0,
        selected: 0,
        voteDetected: 0,
        failed: 0,
        checkpointAdvanced: true,
      };
    }

    const activeRows =
      await loadActivePendingInvitations(
        network,
      );

    if (activeRows.length === 0) {
      await saveVoteScanCheckpoint(
        network,
        scanToBlock,
      );

      return {
        network,
        skippedBecauseLocked: false,
        activePending: 0,
        fromBlock,
        toBlock: scanToBlock,
        finalizedBlock,
        catchupRemainingBlocks:
          finalizedBlock - scanToBlock,
        chainVoteEvents:
          voteEvents.eventCount,
        matchedInvitations: 0,
        selected: 0,
        voteDetected: 0,
        failed: 0,
        checkpointAdvanced: true,
      };
    }

    const matchedRows =
      activeRows.filter((row) => {
        const wallet =
          row.invitee_wallet
            ?.toLowerCase();

        return Boolean(
          wallet &&
            voteEvents.voters.has(
              wallet,
            ),
        );
      });

    const reconciliation =
      await reconcileRows(
        matchedRows,
        network,
        EVENT_RECONCILIATION_BATCH_SIZE,
      );

    const checkpointSafe =
      !reconciliation
        .skippedBecauseLocked &&
      reconciliation.failed === 0 &&
      !reconciliation.overflow;

    if (checkpointSafe) {
      await saveVoteScanCheckpoint(
        network,
        scanToBlock,
      );
    }

    return {
      network,
      skippedBecauseLocked: false,
      activePending: activeRows.length,
      fromBlock,
      toBlock: scanToBlock,
      finalizedBlock,
      catchupRemainingBlocks:
        finalizedBlock - scanToBlock,
      chainVoteEvents:
        voteEvents.eventCount,
      matchedInvitations:
        matchedRows.length,
      selected:
        reconciliation.selected,
      voteDetected:
        reconciliation.voteDetected,
      failed: reconciliation.failed,
      checkpointAdvanced:
        checkpointSafe,
      overflow:
        reconciliation.overflow,
      reconciliationLocked:
        reconciliation
          .skippedBecauseLocked,
    };
  } finally {
    await releaseLock(
      watchLockName,
      ownerToken,
    );
  }
}

async function loadVoteOnlyFallbackCandidates(
  network: VeBetterNetwork,
): Promise<InvitationEvidenceRow[]> {
  const { data, error } =
    await supabaseAdmin
      .from('invitations')
      .select(invitationEvidenceColumns)
      .eq('activation_network', network)
      .eq('status', 'ACTIVATING')
      .eq('reward_status', 'PENDING')
      .gte('apps_completed', 3)
      .gte('rewards_received', 3)
      .eq('vot3_converted', true)
      .or(
        'vote_completed.eq.false,vote_completed.is.null',
      )
      .not('invitee_wallet', 'is', null)
      .not(
        'eligibility_check_id',
        'is',
        null,
      )
      .is(
        'impact_sync_complete_at',
        null,
      )
      .order('activated_at', {
        ascending: true,
        nullsFirst: true,
      })
      .limit(FALLBACK_CANDIDATE_LIMIT);

  if (error) {
    throw new Error(
      `Failed to load vote replay fallback candidates: ${error.message}`,
    );
  }

  return (data ?? []) as InvitationEvidenceRow[];
}

async function replayRecentVoteEventsFallback() {
  const {
    network,
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const finalizedBlock =
    await readFinalizedBlockNumber(
      nodeUrl,
    );
  const fromBlock =
    Math.max(
      0,
      finalizedBlock -
        FALLBACK_REPLAY_LOOKBACK_BLOCKS,
    );

  // This replay is deliberately independent of the primary cursor. It is a
  // cheap safety net for a cursor/write race or a transient one-minute watcher
  // failure, not a second full mission reconciliation loop.
  const voteEvents =
    await readFinalizedVoteEvents({
      nodeUrl,
      votingAddress:
        xAllocationVotingAddress,
      fromBlock,
      toBlock: finalizedBlock,
    });

  if (voteEvents.eventCount === 0) {
    return {
      network,
      fromBlock,
      toBlock: finalizedBlock,
      chainVoteEvents: 0,
      candidateCount: 0,
      matchedInvitations: 0,
      selected: 0,
      voteDetected: 0,
      failed: 0,
      overflow: false,
      skippedBecauseLocked: false,
    };
  }

  const rows =
    await loadVoteOnlyFallbackCandidates(
      network,
    );
  const matchedRows =
    rows.filter((row) => {
      const wallet =
        row.invitee_wallet
          ?.toLowerCase();

      return Boolean(
        wallet &&
          voteEvents.voters.has(
            wallet,
          ),
      );
    });

  const reconciliation =
    await reconcileRows(
      matchedRows,
      network,
      EVENT_RECONCILIATION_BATCH_SIZE,
    );

  return {
    network,
    fromBlock,
    toBlock: finalizedBlock,
    chainVoteEvents:
      voteEvents.eventCount,
    candidateCount:
      rows.length,
    matchedInvitations:
      matchedRows.length,
    ...reconciliation,
  };
}

/**
 * Pro-plan vote watcher:
 * - every minute: scan only newly finalized AllocationVoteCast events; load
 *   active VeInvite referrals from Postgres only when at least one vote exists,
 *   then reconcile only matching invitees;
 * - after five minutes without a successful recovery pass: retry pending
 *   Sybil v2 assessment / reward reservation; a newly detected vote can trigger
 *   this recovery immediately;
 * - after 30 minutes without a successful fallback pass: replay the most recent
 *   finalized vote window without consulting the primary cursor, then run the
 *   existing full reconciliation only for VeInvite wallets that actually voted.
 *   Failed passes release their lease so the next one-minute invocation can
 *   retry instead of waiting for the next wall-clock boundary.
 *
 * Reward authority remains unchanged: syncInvitationEvidence and the existing
 * Sybil v2 clearance / reservation gates stay fail-closed.
 */
export async function GET(
  request: NextRequest,
) {
  const authorization =
    authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status:
          authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const errors: string[] = [];

  try {
    await markCronJobStarted(
      VOTE_RECONCILE_JOB,
    );
  } catch (error) {
    console.error(
      'Vote reconcile heartbeat start failed:',
      error,
    );
    errors.push(
      'CRON_HEARTBEAT_START_FAILED',
    );
  }

  let eventWatcher:
    Awaited<
      ReturnType<
        typeof runEventDrivenVoteWatcher
      >
    > | null = null;
  let fallback:
    Awaited<
      ReturnType<
        typeof replayRecentVoteEventsFallback
      >
    > | null = null;
  let sybilV2Assessment:
    Awaited<
      ReturnType<
        typeof runSybilV2AssessmentBatch
      >
    > | null = null;
  let rewardReservation:
    Awaited<
      ReturnType<
        typeof reserveEligibleReferralRewards
      >
    > | null = null;

  try {
    eventWatcher =
      await runEventDrivenVoteWatcher();
  } catch (error) {
    console.error(
      'Vote event watcher failed:',
      error,
    );
    errors.push('EVENT_WATCHER_FAILED');
  }

  let fallbackClaimed = false;

  try {
    fallbackClaimed =
      await tryClaimCronJob(
        VOTE_FALLBACK_JOB,
        FALLBACK_INTERVAL_SECONDS,
        CADENCE_LEASE_SECONDS,
      );
  } catch (error) {
    console.error(
      'Vote fallback cadence claim failed:',
      error,
    );
    errors.push(
      'FALLBACK_CADENCE_CLAIM_FAILED',
    );
  }

  if (fallbackClaimed) {
    try {
      fallback =
        await replayRecentVoteEventsFallback();

      await markCronJobSucceeded(
        VOTE_FALLBACK_JOB,
      );
    } catch (error) {
      console.error(
        'Vote reconciliation fallback failed:',
        error,
      );
      errors.push(
        'FALLBACK_RECONCILIATION_FAILED',
      );

      try {
        await markCronJobFailed(
          VOTE_FALLBACK_JOB,
          error,
        );
      } catch (heartbeatError) {
        console.error(
          'Vote fallback heartbeat failure:',
          heartbeatError,
        );
      }
    }
  }

  const voteTriggeredRecovery =
    (eventWatcher?.voteDetected ??
      0) > 0 ||
    (fallback?.voteDetected ??
      0) > 0;

  let recoveryClaimed = false;

  try {
    recoveryClaimed =
      await tryClaimCronJob(
        VOTE_RECOVERY_JOB,
        voteTriggeredRecovery
          ? 0
          : RECOVERY_INTERVAL_SECONDS,
        CADENCE_LEASE_SECONDS,
      );
  } catch (error) {
    console.error(
      'Sybil/reward recovery cadence claim failed:',
      error,
    );
    errors.push(
      'RECOVERY_CADENCE_CLAIM_FAILED',
    );
  }

  if (recoveryClaimed) {
    let recoveryFailure:
      unknown | null = null;

    try {
      sybilV2Assessment =
        await runSybilV2AssessmentBatch(
          25,
        );
    } catch (error) {
      recoveryFailure = error;
      console.error(
        'Vote watcher Sybil v2 recovery failed:',
        error,
      );
      errors.push(
        'SYBIL_V2_RECOVERY_FAILED',
      );
    }

    try {
      rewardReservation =
        await reserveEligibleReferralRewards();
    } catch (error) {
      recoveryFailure ??= error;
      console.error(
        'Vote watcher reward reservation recovery failed:',
        error,
      );
      errors.push(
        'REWARD_RESERVATION_RECOVERY_FAILED',
      );
    }

    try {
      if (recoveryFailure) {
        await markCronJobFailed(
          VOTE_RECOVERY_JOB,
          recoveryFailure,
        );
      } else {
        await markCronJobSucceeded(
          VOTE_RECOVERY_JOB,
        );
      }
    } catch (heartbeatError) {
      console.error(
        'Sybil/reward recovery heartbeat failure:',
        heartbeatError,
      );
    }
  }

  try {
    if (errors.length > 0) {
      await markCronJobFailed(
        VOTE_RECONCILE_JOB,
        errors.join(','),
      );
    } else {
      await markCronJobSucceeded(
        VOTE_RECONCILE_JOB,
      );
    }
  } catch (error) {
    console.error(
      'Vote reconcile heartbeat completion failed:',
      error,
    );
    errors.push(
      'CRON_HEARTBEAT_COMPLETION_FAILED',
    );
  }

  return NextResponse.json(
    {
      mode:
        'EVENT_DRIVEN_VOTE_RECONCILIATION',
      cadence: {
        eventWatcherMinutes: 1,
        sybilRewardRecoveryMinutes:
          RECOVERY_INTERVAL_SECONDS / 60,
        fallbackMinutes:
          FALLBACK_INTERVAL_SECONDS / 60,
        basis: 'LAST_SUCCESS',
      },
      eventWatcher,
      fallback,
      sybilV2Assessment,
      rewardReservation,
      errors,
    },
    {
      status:
        errors.length > 0
          ? 500
          : 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
