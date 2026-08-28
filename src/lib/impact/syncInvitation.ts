import {
  recordQualifyingRewardImpact,
  recordVot3ConversionImpact,
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
  type QualifyingRewardEvent,
} from '@/lib/vebetter/activity';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';
import {
  getVeBetterVot3ConversionProgress,
  MIN_VOT3_CONVERSION_WEI,
  type Vot3ConversionEvent,
} from '@/lib/vebetter/vot3Conversion';
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
  apps_completed_at: string | null;
  apps_completed_block: number | string | null;
  vot3_converted: boolean | null;
  vot3_converted_at: string | null;
  vot3_converted_block: number | string | null;
  vot3_conversion_tx_id: string | null;
  vot3_conversion_amount_wei: string | null;
  vote_completed: boolean | null;
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
  vot3Converted: boolean;
  vot3MinimumAmountWei: string;
  vot3ConversionAmountWei: string | null;
  vot3ConvertedAt: string | null;
  vot3ConvertedBlock: number | null;
  vot3ConversionTxId: string | null;
  conversionObserved: boolean;
  conversionBelowMinimumObserved: boolean;
  conversionBeforeFirstDappObserved: boolean;
  conversionSyncPending: boolean;
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

function buildProgress(args: {
  row: InvitationEvidenceRow;
  appsCompleted: number;
  rewardsReceived: number;
  vot3Converted: boolean;
  vot3ConversionAmountWei: string | null;
  vot3ConvertedAt: string | null;
  vot3ConvertedBlock: number | null;
  vot3ConversionTxId: string | null;
  conversionObserved: boolean;
  conversionBelowMinimumObserved: boolean;
  conversionBeforeFirstDappObserved: boolean;
  conversionSyncPending: boolean;
  voteCompleted: boolean;
  uniqueAppIds: string[];
  activationBlock: number | null;
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
}): InvitationSyncProgress {
  return {
    appsCompleted: args.appsCompleted,
    appsRequired: 3,
    rewardsReceived:
      args.rewardsReceived,
    vot3Converted:
      args.vot3Converted,
    vot3MinimumAmountWei:
      MIN_VOT3_CONVERSION_WEI
        .toString(),
    vot3ConversionAmountWei:
      args.vot3ConversionAmountWei,
    vot3ConvertedAt:
      args.vot3ConvertedAt,
    vot3ConvertedBlock:
      args.vot3ConvertedBlock,
    vot3ConversionTxId:
      args.vot3ConversionTxId,
    conversionObserved:
      args.conversionObserved,
    conversionBelowMinimumObserved:
      args.conversionBelowMinimumObserved,
    conversionBeforeFirstDappObserved:
      args.conversionBeforeFirstDappObserved,
    conversionSyncPending:
      args.conversionSyncPending,
    voteCompleted:
      args.voteCompleted,
    uniqueAppIds:
      args.uniqueAppIds,
    activationBlock:
      args.activationBlock,
    activationNetwork:
      args.row.activation_network,
    latestBlock:
      args.latestBlock,
    appsCompletedAt:
      args.appsCompletedAt,
    appsCompletedBlock:
      args.appsCompletedBlock,
    voteCompletedAt:
      args.voteCompletedAt,
    voteCompletedBlock:
      args.voteCompletedBlock,
    voteRoundId:
      args.voteRoundId,
    activityCheckpointSaved:
      args.activityCheckpointSaved,
    voteSyncPending:
      args.voteSyncPending,
    impactCheckpointSaved:
      args.impactCheckpointSaved,
    impactLastSyncedBlock:
      args.impactLastSyncedBlock,
    impactLastSyncedAt:
      args.impactLastSyncedAt,
    impactSyncCompleteAt:
      args.impactSyncCompleteAt,
    networkMismatch:
      args.networkMismatch,
  };
}

/**
 * Reconciles one accepted invitation against chain truth.
 *
 * Mission ordering is intentionally flexible after the first verified dApp
 * reward. A user may do:
 *
 *   dApp #1 -> >=1 B3TR to VOT3 -> allocation vote -> dApps #2 and #3
 *
 * and still complete VeInvite. The remaining dApp missions therefore never
 * invalidate an already-valid conversion/vote sequence.
 *
 * What is not accepted:
 * - VOT3 held before VeInvite without a new conversion;
 * - a conversion before the first qualifying dApp reward;
 * - a conversion below 1 B3TR;
 * - a vote that predates the qualifying conversion.
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
  let appsCompletedAt =
    row.apps_completed_at;
  let appsCompletedBlock =
    parseNonNegativeInteger(
      row.apps_completed_block,
    );

  let vot3Converted =
    row.vot3_converted ?? false;
  let vot3ConvertedAt =
    row.vot3_converted_at;
  let vot3ConvertedBlock =
    parseNonNegativeInteger(
      row.vot3_converted_block,
    );
  let vot3ConversionTxId =
    row.vot3_conversion_tx_id;
  let vot3ConversionAmountWei =
    row.vot3_conversion_amount_wei;

  let voteCompleted =
    row.vote_completed ?? false;
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
  let conversionSyncPending = false;
  let voteSyncPending = false;
  let impactCheckpointSaved = true;
  let networkMismatch = false;
  let conversionObserved = false;
  let conversionBelowMinimumObserved = false;
  let conversionBeforeFirstDappObserved = false;

  const currentProgress = () =>
    buildProgress({
      row,
      appsCompleted,
      rewardsReceived,
      vot3Converted,
      vot3ConversionAmountWei,
      vot3ConvertedAt,
      vot3ConvertedBlock,
      vot3ConversionTxId,
      conversionObserved,
      conversionBelowMinimumObserved,
      conversionBeforeFirstDappObserved,
      conversionSyncPending,
      voteCompleted,
      uniqueAppIds,
      activationBlock,
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
    });

  if (
    !row.invitee_wallet ||
    activationBlock === null ||
    !row.activation_network
  ) {
    return {
      row,
      progress:
        currentProgress(),
    };
  }

  const currentNetwork =
    getVeBetterNetworkConfig().network;

  if (
    currentNetwork !==
    row.activation_network
  ) {
    networkMismatch = true;
    activityCheckpointSaved = false;
    impactCheckpointSaved = false;
    conversionSyncPending = true;
    voteSyncPending = true;

    return {
      row,
      progress:
        currentProgress(),
    };
  }

  let activityLatestBlock:
    number | null = null;
  let threeRewardEventsPersisted = false;
  let qualifyingRewardEvents:
    QualifyingRewardEvent[] = [];

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
    qualifyingRewardEvents =
      activity.qualifyingRewardEvents;

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

  let conversionScanSucceeded =
    qualifyingRewardEvents.length === 0;
  let conversionImpactSaved = false;
  let qualifyingConversionProof:
    Vot3ConversionEvent | null = null;

  const firstQualifyingReward =
    qualifyingRewardEvents[0] ?? null;

  if (
    activityCheckpointSaved &&
    row.invitee_wallet &&
    firstQualifyingReward
  ) {
    try {
      const conversion =
        await getVeBetterVot3ConversionProgress({
          walletAddress:
            row.invitee_wallet,
          activationBlock,
          firstQualifyingReward,
        });

      conversionScanSucceeded = true;
      latestBlock = Math.max(
        latestBlock ?? 0,
        conversion.latestBlock,
      );

      conversionObserved =
        conversion.matchedConversionEvents
          .length > 0;
      conversionBelowMinimumObserved =
        conversion.belowMinimumEvents
          .length > 0;
      conversionBeforeFirstDappObserved =
        conversion.beforeFirstDappEvents
          .length > 0;

      const conversionEventsSaved =
        await recordVot3ConversionImpact({
          inviteCode: row.invite_code,
          network:
            row.activation_network,
          walletAddress:
            row.invitee_wallet,
          events:
            conversion.matchedConversionEvents,
        });

      impactCheckpointSaved =
        impactCheckpointSaved &&
        conversionEventsSaved;

      conversionImpactSaved =
        conversion.converted &&
        conversionEventsSaved;

      if (
        conversion.converted &&
        conversion.qualifyingConversion
      ) {
        const proof =
          conversion.qualifyingConversion;
        qualifyingConversionProof = proof;

        vot3Converted = true;
        vot3ConvertedAt =
          chainTimestampToIso(
            proof.blockTimestamp,
          );
        vot3ConvertedBlock =
          proof.blockNumber;
        vot3ConversionTxId =
          proof.txId;
        vot3ConversionAmountWei =
          proof.amountWei;

        const {
          data: persistedConversion,
          error: conversionUpdateError,
        } = await supabaseAdmin
          .from('invitations')
          .update({
            vot3_converted: true,
            vot3_converted_at:
              vot3ConvertedAt,
            vot3_converted_block:
              vot3ConvertedBlock,
            vot3_conversion_tx_id:
              vot3ConversionTxId,
            vot3_conversion_amount_wei:
              vot3ConversionAmountWei,
          })
          .eq(
            'invite_code',
            row.invite_code,
          )
          .select('*')
          .maybeSingle();

        if (conversionUpdateError) {
          conversionSyncPending = true;
          impactCheckpointSaved = false;

          console.error(
            'Failed to persist VOT3 conversion checkpoint:',
            conversionUpdateError,
          );
        } else if (persistedConversion) {
          row =
            persistedConversion as InvitationEvidenceRow;

          // The database eligibility trigger can invalidate stale vote fields
          // that predate this conversion. Refresh local state immediately.
          voteCompleted =
            row.vote_completed ?? false;
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
        }
      } else if (row.vot3_converted) {
        // Never erase an already-recorded conversion because one node query
        // unexpectedly returned no qualifying result. Mark reconciliation as
        // incomplete so an operator can inspect the raw evidence.
        conversionSyncPending = true;
        impactCheckpointSaved = false;
      } else {
        vot3Converted = false;
        vot3ConvertedAt = null;
        vot3ConvertedBlock = null;
        vot3ConversionTxId = null;
        vot3ConversionAmountWei = null;
      }
    } catch (conversionError) {
      conversionScanSucceeded = false;
      conversionSyncPending = true;
      impactCheckpointSaved = false;

      console.error(
        'Failed to reconcile B3TR to VOT3 conversion:',
        conversionError,
      );
    }
  }

  let voteScanSucceeded =
    !vot3Converted;
  let voteImpactSaved = false;

  if (
    activityCheckpointSaved &&
    conversionScanSucceeded &&
    !conversionSyncPending &&
    row.invitee_wallet &&
    vot3Converted &&
    qualifyingConversionProof
  ) {
    try {
      const vote =
        await getVeBetterVoteProgress({
          voterAddress:
            row.invitee_wallet,
          conversionPosition:
            qualifyingConversionProof,
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

        const {
          data: persistedVote,
          error: voteUpdateError,
        } = await supabaseAdmin
          .from('invitations')
          .update({
            vote_completed: true,
            vote_completed_at:
              voteCompletedAt,
            vote_completed_block:
              voteCompletedBlock,
            vote_round_id:
              voteRoundId,
          })
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
        // Preserve an already-recorded vote when a later node query is
        // unexpectedly incomplete. The raw-event audit trail remains the
        // source of truth for operator review.
        voteSyncPending = true;
        impactCheckpointSaved = false;
      } else {
        voteCompleted = false;
        voteCompletedAt = null;
        voteCompletedBlock = null;
        voteRoundId = null;
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

  const rawMissionEvidenceReady =
    appsCompleted >= 3 &&
    threeRewardEventsPersisted &&
    vot3Converted &&
    conversionImpactSaved &&
    voteCompleted &&
    voteImpactSaved &&
    vot3ConvertedBlock !== null &&
    voteCompletedBlock !== null &&
    voteCompletedBlock >=
      vot3ConvertedBlock;

  if (
    rawMissionEvidenceReady &&
    activityCheckpointSaved &&
    conversionScanSucceeded &&
    !conversionSyncPending &&
    voteScanSucceeded &&
    !voteSyncPending &&
    impactCheckpointSaved &&
    voteCompletedAt
  ) {
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

    if (hasFreshClear) {
      if (row.status !== 'COMPLETED') {
        const {
          data: completedRow,
          error: completedUpdateError,
        } = await supabaseAdmin
          .from('invitations')
          .update({
            status: 'COMPLETED',
          })
          .eq(
            'invite_code',
            row.invite_code,
          )
          .select('*')
          .maybeSingle();

        if (completedUpdateError) {
          impactCheckpointSaved = false;

          console.error(
            'Failed to persist completed invitation status:',
            completedUpdateError,
          );
        } else if (completedRow) {
          row =
            completedRow as InvitationEvidenceRow;
        }
      }
    } else {
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

      const nextStatus:
        InviteStatus =
          sybilDecision.status === 'CLEAR'
            ? 'COMPLETED'
            : 'UNDER_REVIEW';

      const checkedAt =
        laterIso(
          new Date().toISOString(),
          voteCompletedAt,
        );

      const {
        data: sybilRow,
        error: sybilUpdateError,
      } = await supabaseAdmin
        .from('invitations')
        .update({
          status: nextStatus,
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
        })
        .eq(
          'invite_code',
          row.invite_code,
        )
        .select('*')
        .maybeSingle();

      if (sybilUpdateError) {
        impactCheckpointSaved = false;

        console.error(
          'Failed to persist post-mission Sybil decision:',
          sybilUpdateError,
        );
      } else if (sybilRow) {
        row =
          sybilRow as InvitationEvidenceRow;
      }
    }
  }

  const syncReachedBlock =
    activityLatestBlock !== null &&
    activityCheckpointSaved &&
    conversionScanSucceeded &&
    !conversionSyncPending &&
    voteScanSucceeded &&
    !voteSyncPending &&
    impactCheckpointSaved
      ? latestBlock ??
        activityLatestBlock
      : null;

  const completedImpactEvidence =
    syncReachedBlock !== null &&
    rawMissionEvidenceReady;

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
  appsCompletedAt =
    row.apps_completed_at;
  appsCompletedBlock =
    parseNonNegativeInteger(
      row.apps_completed_block,
    );

  vot3Converted =
    row.vot3_converted ??
    vot3Converted;
  vot3ConvertedAt =
    row.vot3_converted_at;
  vot3ConvertedBlock =
    parseNonNegativeInteger(
      row.vot3_converted_block,
    );
  vot3ConversionTxId =
    row.vot3_conversion_tx_id;
  vot3ConversionAmountWei =
    row.vot3_conversion_amount_wei;

  voteCompleted =
    row.vote_completed ??
    voteCompleted;
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
    progress:
      currentProgress(),
  };
}
