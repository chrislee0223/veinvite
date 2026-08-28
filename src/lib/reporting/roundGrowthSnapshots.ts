import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  readVeBetterRoundWindow,
  type VeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';

const MAX_AUTOMATED_BACKFILL_ROUNDS = 52;
const AUTOMATED_REVISION_REASON =
  'AUTOMATED_POST_RECONCILIATION';

type ReportingConfigRow = {
  reporting_start_at: string | null;
  reporting_network: string;
  reporting_baseline_round_id:
    | string
    | number
    | null;
  reporting_baseline_locked_at: string | null;
  reporting_baseline_set_by_wallet: string | null;
};

type SnapshotIdRow = {
  round_id: string | number;
};

type RefreshRow = {
  round_id: string | number;
  snapshot_id: string | number;
  version: string | number;
  changed: boolean;
};

export type RoundGrowthReportingConfig = {
  enabled: boolean;
  network: string;
  startAt: string | null;
  roundId: number | null;
  lockedAt: string | null;
  setByWallet: string | null;
};

export type RoundGrowthMaintenanceSummary = {
  enabled: boolean;
  network: string;
  baselineRoundId: number | null;
  currentRoundId: number;
  finalizedRoundIds: number[];
  checkedSnapshotCount: number;
  revisedRoundIds: number[];
};

function safePositiveInteger(
  value: string | number | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

export async function loadRoundGrowthReportingConfig(): Promise<RoundGrowthReportingConfig> {
  const { data, error } = await supabaseAdmin
    .from('operator_reporting_config')
    .select(
      'reporting_start_at, reporting_network, reporting_baseline_round_id, reporting_baseline_locked_at, reporting_baseline_set_by_wallet',
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Round growth reporting config could not be loaded: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      'Round growth reporting config is missing.',
    );
  }

  const row = data as ReportingConfigRow;
  const roundId = safePositiveInteger(
    row.reporting_baseline_round_id,
  );
  const enabled =
    row.reporting_start_at !== null &&
    row.reporting_baseline_locked_at !== null &&
    row.reporting_baseline_set_by_wallet !== null &&
    roundId !== null;

  return {
    enabled,
    network: row.reporting_network,
    startAt: row.reporting_start_at,
    roundId,
    lockedAt:
      row.reporting_baseline_locked_at,
    setByWallet:
      row.reporting_baseline_set_by_wallet,
  };
}

export async function finalizeRoundGrowthSnapshot({
  network,
  round,
  checkedThroughBlock,
  revisionReason = null,
  operatorWallet = null,
}: {
  network: string;
  round: VeBetterRoundWindow;
  checkedThroughBlock: number;
  revisionReason?: string | null;
  operatorWallet?: string | null;
}): Promise<string> {
  if (
    round.status !== 'COMPLETED' ||
    round.roundEndAtEstimated
  ) {
    throw new Error(
      `VeBetterDAO round ${round.roundId} is not sealed and cannot be finalized.`,
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    'finalize_operator_round_growth_report',
    {
      p_network: network,
      p_round_id: round.roundId,
      p_round_start_at: round.roundStartAt,
      p_round_end_at: round.roundEndAt,
      p_round_start_block:
        round.voteStartBlock,
      p_round_end_block: round.voteEndBlock,
      p_checked_through_block:
        checkedThroughBlock,
      p_revision_reason: revisionReason,
      p_operator_wallet: operatorWallet,
    },
  );

  if (error) {
    throw new Error(
      `Round growth snapshot could not be finalized: ${error.message}`,
    );
  }

  return String(data);
}

export async function maintainRoundGrowthSnapshots(): Promise<RoundGrowthMaintenanceSummary> {
  const [config, currentRound] = await Promise.all([
    loadRoundGrowthReportingConfig(),
    readVeBetterRoundWindow(),
  ]);

  if (config.network !== currentRound.network) {
    if (config.enabled) {
      throw new Error(
        'Round growth reporting network does not match the reviewed chain.',
      );
    }

    return {
      enabled: false,
      network: currentRound.network,
      baselineRoundId: config.roundId,
      currentRoundId: currentRound.currentRoundId,
      finalizedRoundIds: [],
      checkedSnapshotCount: 0,
      revisedRoundIds: [],
    };
  }

  if (!config.enabled || config.roundId === null) {
    return {
      enabled: false,
      network: currentRound.network,
      baselineRoundId: config.roundId,
      currentRoundId: currentRound.currentRoundId,
      finalizedRoundIds: [],
      checkedSnapshotCount: 0,
      revisedRoundIds: [],
    };
  }

  const lastCompletedRoundId =
    currentRound.status === 'COMPLETED'
      ? currentRound.roundId
      : currentRound.roundId - 1;

  if (lastCompletedRoundId < config.roundId) {
    return {
      enabled: true,
      network: currentRound.network,
      baselineRoundId: config.roundId,
      currentRoundId: currentRound.currentRoundId,
      finalizedRoundIds: [],
      checkedSnapshotCount: 0,
      revisedRoundIds: [],
    };
  }

  const expectedRoundCount =
    lastCompletedRoundId - config.roundId + 1;

  if (
    expectedRoundCount >
    MAX_AUTOMATED_BACKFILL_ROUNDS
  ) {
    throw new Error(
      `Automated round growth backfill exceeds ${MAX_AUTOMATED_BACKFILL_ROUNDS} rounds and requires reviewed manual backfill.`,
    );
  }

  const { data: existingData, error: existingError } =
    await supabaseAdmin
      .from(
        'operator_latest_round_growth_report_snapshots',
      )
      .select('round_id')
      .eq('network', currentRound.network)
      .gte('round_id', config.roundId)
      .lte('round_id', lastCompletedRoundId);

  if (existingError) {
    throw new Error(
      `Existing round growth snapshots could not be loaded: ${existingError.message}`,
    );
  }

  const existingRoundIds = new Set(
    ((existingData ?? []) as SnapshotIdRow[])
      .map((row) =>
        safePositiveInteger(row.round_id),
      )
      .filter(
        (roundId): roundId is number =>
          roundId !== null,
      ),
  );
  const finalizedRoundIds: number[] = [];

  for (
    let roundId = config.roundId;
    roundId <= lastCompletedRoundId;
    roundId += 1
  ) {
    if (existingRoundIds.has(roundId)) {
      continue;
    }

    const round = await readVeBetterRoundWindow({
      roundId,
    });

    await finalizeRoundGrowthSnapshot({
      network: currentRound.network,
      round,
      checkedThroughBlock:
        currentRound.bestBlock,
    });
    finalizedRoundIds.push(roundId);
  }

  const { data: refreshData, error: refreshError } =
    await supabaseAdmin.rpc(
      'refresh_operator_round_growth_reports',
      {
        p_network: currentRound.network,
        p_checked_through_block:
          currentRound.bestBlock,
        p_revision_reason:
          AUTOMATED_REVISION_REASON,
      },
    );

  if (refreshError) {
    throw new Error(
      `Round growth snapshot revisions could not be checked: ${refreshError.message}`,
    );
  }

  const refreshRows =
    (refreshData ?? []) as RefreshRow[];

  return {
    enabled: true,
    network: currentRound.network,
    baselineRoundId: config.roundId,
    currentRoundId: currentRound.currentRoundId,
    finalizedRoundIds,
    checkedSnapshotCount: refreshRows.length,
    revisedRoundIds: refreshRows
      .filter((row) => row.changed)
      .map((row) =>
        safePositiveInteger(row.round_id),
      )
      .filter(
        (roundId): roundId is number =>
          roundId !== null,
      ),
  };
}
