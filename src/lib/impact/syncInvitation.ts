import {
  recordQualifyingRewardImpact,
  recordVoteImpact,
} from '@/lib/impact/record';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  evaluatePostVoteSybilRisk,
  type SybilRiskLevel,
  type SybilSource,
  type SybilStatus,
} from '@/lib/sybil/risk';
import {
  getVeBetterActivityProgress,
} from '@/lib/vebetter/activity';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';
import {
  getVeBetterVoteProgress,
} from '@/lib/vebetter/vote';
import type {
  InviteStatus,
  RewardEligibility,
} from '@/lib/types';

export type InvitationEvidenceRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  reward_status: RewardEligibility;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  activation_block: number | string | null;
  activation_network: VeBetterNetwork | null;
  apps_completed: number | null;
  rewards_received: number | null;
  vote_completed: boolean | null;
  apps_completed_at: string | null;
  apps_completed_block: number | string | null;
  vote_completed_at: string | null;
  vote_completed_block: number | string | null;
  vote_round_id: number | string | null;
  sybil_status: SybilStatus;
  sybil_risk_level: SybilRiskLevel;
  sybil_risk_score: number;
  sybil_reason: string | null;
  sybil_checked_at: string | null;
  sybil_source: SybilSource;
  impact_last_synced_block: number | string | null;
  impact_last_synced_at: string | null;
  impact_sync_complete_at: string | null;
};

export type InvitationSyncProgress = {
  appsCompleted: number;
  appsRequired: 3;
  rewardsReceived: number;
  voteCompleted: boolean;
  uniqueAppIds: string[];
  activationBlock: number | null;
  activationNetwork: VeBetterNetwork | null;
  latestBlock: number | null;
  appsCompletedAt: string | null;
  appsCompletedBlock: number | null;
  voteCompletedAt: string | null;
  voteCompletedBlock: number | null;
  voteRoundId: number | null;
  activityCheckpointSaved: boolean;
  voteSyncPending: boolean;
  impactCheckpointSaved: boolean;
  impactLastSyncedBlock: number | null;
  impactLastSyncedAt: string | null;
  impactSyncCompleteAt: string | null;
  networkMismatch: boolean;
};

function parseNonNegativeInteger(
  value: number | string | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

function chainTimestampToIso(
  unixSeconds: number,
): string {
  if (
    !Number.isSafeInteger(unixSeconds) ||
    unixSeconds < 0
  ) {
    throw new Error(
      'Invalid VeChain block timestamp.',
    );
  }

  return new Date(
    unixSeconds * 1000,
  ).toISOString();
}

function laterIso(
  first: string,
  second: string,
): string {
  return new Date(first).getTime() >=
    new Date(second).getTime()
    ? first
    : second;
}

/**
 * Reconciles one accepted invitation against chain truth.
 *
 * This is deliberately reusable outside the public GET route so a future
 * background reconciler can keep thousands of invitations complete even when
 * users never reopen VeInvite. Public reporting must never assume a page view
 * happened.
 */
export async function syncInvitationEvidence(
  initial: InvitationEvidenceRow,
): Promise<{
  row: InvitationEvidenceRow;
  progress: InvitationSyncProgress;
}> {
  let row = { ...initial };

  let appsCompleted =
    row.apps_completed ?? 0;
  let rewardsReceived =
    row.rewards_received ?? 0;
  let voteCompleted =
    row.vote_completed ?? false;
  let appsCompletedAt =
    row.apps_completed_at;
  let appsCompletedBlock =
    parseNonNegativeInteger(
      row.apps_completed_block,
    );
  let voteCompletedAt =
    row.vote_completed_at;
  let voteCompletedBlock =
    parseNonNegativeInteger(
      row.vote_completed_block,
    );
  let voteRoundId =
    parseNonNegativeInteger(
      row.vote_round_id,
    );
  let impactLastSyncedBlock =
    parseNonNegativeInteger(
      row.impact_last_synced_block,
    );
  let impactLastSyncedAt =
    row.impact_last_synced_at;
  let impactSyncCompleteAt =
    row.impact_sync_complete_at;

  const activationBlock =
    parseNonNegativeInteger(
      row.activation_block,
    );

  let uniqueAppIds: string[] = [];
  let latestBlock: number | null = null;
  let activityCheckpointSaved = true;
  let voteSyncPending = false;
  let impactCheckpointSaved = true;
  let networkMismatch = false;

  if (
    !row.invitee_wallet ||
    activationBlock === null ||
    !row.activation_network
  ) {
    return {
      row,
      progress: {
        appsCompleted,
        appsRequired: 3,
        rewardsReceived,
        voteCompleted,
        uniqueAppIds,
        activationBlock,
        activationNetwork:
          row.activation_network,
        latestBlock,
        appsCompletedAt,
        appsCompletedBlock,
        voteCompletedAt,
        voteCompletedBlock,
        voteRoundId,
        activityCheckpointSaved,
        voteSyncPending,
        impactCheckpointSaved,
        impactLastSyncedBlock,
        impactLastSyncedAt,
        impactSyncCompleteAt,
        networkMismatch,
      },
    };
  }

  const currentNetwork =
    getVeBetterNetworkConfig().network;

  if (
    currentNetwork !==
    row.activation_network
  ) {
    networkMismatch = true;
    impactCheckpointSaved = false;

    return {
      row,
      progress: {
        appsCompleted,
        appsRequired: 3,
        rewardsReceived,
        voteCompleted,
        uniqueAppIds,
        activationBlock,
        activationNetwork:
          row.activation_network,
        latestBlock,
        appsCompletedAt,
        appsCompletedBlock,
        voteCompletedAt,
        voteCompletedBlock,
        voteRoundId,
        activityCheckpointSaved: false,
        voteSyncPending: true,
        impactCheckpointSaved,
        impactLastSyncedBlock,
        impactLastSyncedAt,
        impactSyncCompleteAt,
        networkMismatch,
      },
    };
  }

  let activityLatestBlock:
    number | null = null;
  let threeRewardEventsPersisted = false;

  try {
    const activity =
      await getVeBetterActivityProgress({
        receiverAddress:
          row.invitee_wallet,
        activationBlock,
      });

    appsCompleted =
      activity.appsCompleted;
    rewardsReceived =
      activity.appsCompleted;
    uniqueAppIds =
      activity.uniqueAppIds;
    latestBlock =
      activity.latestBlock;
    activityLatestBlock =
      activity.latestBlock;

    if (
      appsCompleted >= 3 &&
      (
        activity.thirdAppCompletedBlock ===
          null ||
        activity.thirdAppCompletedTimestamp ===
          null
      )
    ) {
      throw new Error(
        'Three apps were detected without a complete chain checkpoint.',
      );
    }

    appsCompletedBlock =
      activity.thirdAppCompletedBlock;
    appsCompletedAt =
      activity.thirdAppCompletedTimestamp ===
      null
        ? null
        : chainTimestampToIso(
            activity.thirdAppCompletedTimestamp,
          );

    const dappImpactSaved =
      await recordQualifyingRewardImpact({
        inviteCode: row.invite_code,
        network:
          row.activation_network,
        walletAddress:
          row.invitee_wallet,
        events:
          activity.qualifyingRewardEvents,
      });

    impactCheckpointSaved =
      impactCheckpointSaved &&
      dappImpactSaved;

    threeRewardEventsPersisted =
      appsCompleted >= 3 &&
      activity.qualifyingRewardEvents
        .length === 3 &&
      dappImpactSaved;

    const {
      data: persistedActivity,
      error: activityUpdateError,
    } = await supabaseAdmin
      .from('invitations')
      .update({
        apps_completed:
          appsCompleted,
        rewards_received:
          rewardsReceived,
        apps_completed_at:
          appsCompletedAt,
        apps_completed_block:
          appsCompletedBlock,
      })
      .eq(
        'invite_code',
        row.invite_code,
      )
      .select('*')
      .maybeSingle();

    if (activityUpdateError) {
      activityCheckpointSaved = false;
      impactCheckpointSaved = false;

      console.error(
        'Failed to persist invitation activity checkpoint:',
        activityUpdateError,
      );
    } else if (persistedActivity) {
      row =
        persistedActivity as InvitationEvidenceRow;
    }
  } catch (activityError) {
    activityCheckpointSaved = false;
    impactCheckpointSaved = false;

    console.error(
      'Failed to reconcile VeBetter activity:',
      activityError,
    );
  }

  let voteScanSucceeded =
    appsCompleted < 3;
  let voteImpactSaved = false;

  if (
    activityCheckpointSaved &&
    row.invitee_wallet &&
    appsCompleted >= 3 &&
    appsCompletedBlock !== null
  ) {
    try {
      const vote =
        await getVeBetterVoteProgress({
          voterAddress:
            row.invitee_wallet,
          fromBlock:
            appsCompletedBlock,
        });

      voteScanSucceeded = true;
      latestBlock = Math.max(
        latestBlock ?? 0,
        vote.latestBlock,
      );

      if (vote.voteCompleted) {
        if (
          vote.voteCompletedBlock === null ||
          vote.voteRoundId === null ||
          vote.voteTxId === null ||
          vote.voteBlockTimestamp === null
        ) {
          throw new Error(
            'Vote completion was returned without complete chain provenance.',
          );
        }

        voteCompleted = true;
        voteCompletedBlock =
          vote.voteCompletedBlock;
        voteRoundId =
          vote.voteRoundId;
        voteCompletedAt =
          chainTimestampToIso(
            vote.voteBlockTimestamp,
          );

        voteImpactSaved =
          await recordVoteImpact({
            inviteCode: row.invite_code,
            network:
              row.activation_network,
            walletAddress:
              row.invitee_wallet,
            txId: vote.voteTxId,
            blockNumber:
              vote.voteCompletedBlock,
            blockTimestamp:
              vote.voteBlockTimestamp,
            voteRoundId:
              vote.voteRoundId,
          });

        impactCheckpointSaved =
          impactCheckpointSaved &&
          voteImpactSaved;

        const existingSybilCheckedAt =
          row.sybil_checked_at;
        const hasFreshClear =
          row.sybil_status === 'CLEAR' &&
          Boolean(existingSybilCheckedAt) &&
          new Date(
            existingSybilCheckedAt as string,
          ).getTime() >=
            new Date(
              voteCompletedAt,
            ).getTime();

        let nextStatus:
          InviteStatus =
            row.sybil_status === 'CLEAR'
              ? 'COMPLETED'
              : 'UNDER_REVIEW';

        const voteUpdate: Record<
          string,
          unknown
        > = {
          vote_completed: true,
          vote_completed_at:
            voteCompletedAt,
          vote_completed_block:
            voteCompletedBlock,
          vote_round_id:
            voteRoundId,
        };

        if (!hasFreshClear) {
          const sybilDecision =
            evaluatePostVoteSybilRisk({
              currentStatus:
                row.sybil_status,
              inviteStatus:
                row.status,
              currentRiskLevel:
                row.sybil_risk_level,
              currentRiskScore:
                row.sybil_risk_score,
              currentReason:
                row.sybil_reason,
              currentSource:
                row.sybil_source,
            });

          nextStatus =
            sybilDecision.status === 'CLEAR'
              ? 'COMPLETED'
              : 'UNDER_REVIEW';

          const checkedAt =
            laterIso(
              new Date().toISOString(),
              voteCompletedAt,
            );

          Object.assign(
            voteUpdate,
            {
              sybil_status:
                sybilDecision.status,
              sybil_risk_level:
                sybilDecision.riskLevel,
              sybil_risk_score:
                sybilDecision.riskScore,
              sybil_reason:
                sybilDecision.reason,
              sybil_checked_at:
                checkedAt,
              sybil_source:
                sybilDecision.source,
            },
          );
        }

        voteUpdate.status =
          nextStatus;

        const {
          data: persistedVote,
          error: voteUpdateError,
        } = await supabaseAdmin
          .from('invitations')
          .update(voteUpdate)
          .eq(
            'invite_code',
            row.invite_code,
          )
          .select('*')
          .maybeSingle();

        if (voteUpdateError) {
          voteSyncPending = true;
          impactCheckpointSaved = false;

          console.error(
            'Failed to persist invitation vote checkpoint:',
            voteUpdateError,
          );
        } else if (persistedVote) {
          row =
            persistedVote as InvitationEvidenceRow;
        }
      } else if (row.vote_completed) {
        // Do not silently delete an already-recorded vote because one node
        // query unexpectedly returned no result. Mark the reconciliation as
        // incomplete; operator/public reports rely on raw impact provenance.
        voteSyncPending = true;
        impactCheckpointSaved = false;
      } else {
        voteCompleted = false;
      }
    } catch (voteError) {
      voteScanSucceeded = false;
      voteSyncPending = true;
      impactCheckpointSaved = false;

      console.error(
        'Failed to reconcile VeBetter vote:',
        voteError,
      );
    }
  }

  const syncReachedBlock =
    activityLatestBlock !== null &&
    activityCheckpointSaved &&
    impactCheckpointSaved &&
    voteScanSucceeded
      ? latestBlock ??
        activityLatestBlock
      : null;

  const completedImpactEvidence =
    syncReachedBlock !== null &&
    appsCompleted >= 3 &&
    voteCompleted &&
    threeRewardEventsPersisted &&
    voteImpactSaved;

  if (syncReachedBlock !== null) {
    const syncedAt =
      new Date().toISOString();

    const {
      data: persistedSync,
      error: syncUpdateError,
    } = await supabaseAdmin
      .from('invitations')
      .update({
        impact_last_synced_block:
          syncReachedBlock,
        impact_last_synced_at:
          syncedAt,
        impact_sync_complete_at:
          completedImpactEvidence
            ? row.impact_sync_complete_at ??
              syncedAt
            : null,
      })
      .eq(
        'invite_code',
        row.invite_code,
      )
      .select('*')
      .maybeSingle();

    if (syncUpdateError) {
      impactCheckpointSaved = false;

      console.error(
        'Failed to persist impact reconciliation watermark:',
        syncUpdateError,
      );
    } else if (persistedSync) {
      row =
        persistedSync as InvitationEvidenceRow;

      impactLastSyncedBlock =
        syncReachedBlock;
      impactLastSyncedAt =
        row.impact_last_synced_at;
      impactSyncCompleteAt =
        row.impact_sync_complete_at;
    }
  }

  appsCompleted =
    row.apps_completed ??
    appsCompleted;
  rewardsReceived =
    row.rewards_received ??
    rewardsReceived;
  voteCompleted =
    row.vote_completed ??
    voteCompleted;
  appsCompletedAt =
    row.apps_completed_at;
  appsCompletedBlock =
    parseNonNegativeInteger(
      row.apps_completed_block,
    );
  voteCompletedAt =
    row.vote_completed_at;
  voteCompletedBlock =
    parseNonNegativeInteger(
      row.vote_completed_block,
    );
  voteRoundId =
    parseNonNegativeInteger(
      row.vote_round_id,
    );
  impactLastSyncedBlock =
    parseNonNegativeInteger(
      row.impact_last_synced_block,
    );
  impactLastSyncedAt =
    row.impact_last_synced_at;
  impactSyncCompleteAt =
    row.impact_sync_complete_at;

  return {
    row,
    progress: {
      appsCompleted,
      appsRequired: 3,
      rewardsReceived,
      voteCompleted,
      uniqueAppIds,
      activationBlock,
      activationNetwork:
        row.activation_network,
      latestBlock,
      appsCompletedAt,
      appsCompletedBlock,
      voteCompletedAt,
      voteCompletedBlock,
      voteRoundId,
      activityCheckpointSaved,
      voteSyncPending,
      impactCheckpointSaved,
      impactLastSyncedBlock,
      impactLastSyncedAt,
      impactSyncCompleteAt,
      networkMismatch,
    },
  };
}
