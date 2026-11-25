import type { InvitationEvidenceRow, InvitationSyncProgress } from '@/lib/impact/syncInvitation';
import { MIN_VOT3_CONVERSION_WEI } from '@/lib/vebetter/vot3Conversion';

export function buildProgress(args: {
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


export function parseNonNegativeInteger(
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

export function chainTimestampToIso(
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

export function laterIso(
  first: string,
  second: string,
): string {
  return new Date(first).getTime() >=
    new Date(second).getTime()
    ? first
    : second;
}

