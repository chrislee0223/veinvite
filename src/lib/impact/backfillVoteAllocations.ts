import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';
import {
  readMissionVoteAllocationsFromChain,
  recordMissionVoteAllocations,
} from '@/lib/impact/voteAllocations';

type VoteImpactRow = {
  invite_code: string;
  network: string;
  wallet_address: string;
  tx_id: string;
  block_number: number | string;
  block_timestamp: string;
  vote_round_id: number | string;
  clause_index: number | string;
};

function parseSafeInteger(
  value: number | string,
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

function parseBlockTimestamp(
  value: string,
): number | null {
  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const seconds = Math.floor(
    milliseconds / 1000,
  );

  return Number.isSafeInteger(seconds) &&
    seconds >= 0
    ? seconds
    : null;
}

export type VoteAllocationBackfillResult = {
  mode: 'dry-run' | 'write';
  network: VeBetterNetwork;
  evidenceRows: number;
  alreadyStored: number;
  decodedVotes: number;
  decodedAllocations: number;
  savedVotes: number;
  failures: Array<{
    inviteCode: string;
    txId: string;
    error: string;
  }>;
  decoded: Array<{
    inviteCode: string;
    walletAddress: string;
    txId: string;
    roundId: number;
    clauseIndex: number;
    allocations: Array<{
      allocationIndex: number;
      appId: string;
      voteWeight: string;
    }>;
    saved: boolean;
  }>;
};

export async function backfillMissionVoteAllocations({
  write = false,
  limit = 250,
}: {
  write?: boolean;
  limit?: number;
} = {}): Promise<VoteAllocationBackfillResult> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  ) {
    throw new Error(
      'Backfill limit must be an integer between 1 and 1000.',
    );
  }

  const { network } =
    getVeBetterNetworkConfig();

  const {
    data: evidenceData,
    error: evidenceError,
  } = await supabaseAdmin
    .from('invite_impact_events')
    .select(
      'invite_code,network,wallet_address,tx_id,block_number,block_timestamp,vote_round_id,clause_index',
    )
    .eq('event_type', 'ALLOCATION_VOTE')
    .eq('network', network)
    .order('block_number', {
      ascending: true,
    })
    .limit(limit);

  if (evidenceError) {
    throw new Error(
      `Failed to load vote evidence: ${evidenceError.message}`,
    );
  }

  const evidence =
    (evidenceData ?? []) as VoteImpactRow[];

  const {
    data: storedData,
    error: storedError,
  } = await supabaseAdmin
    .from('invite_vote_allocations')
    .select('tx_id,clause_index')
    .eq('network', network);

  if (storedError) {
    throw new Error(
      `Failed to load stored vote allocations: ${storedError.message}`,
    );
  }

  const storedKeys = new Set(
    (storedData ?? []).map(
      (row) =>
        `${String(row.tx_id).toLowerCase()}:${String(row.clause_index)}`,
    ),
  );

  const result: VoteAllocationBackfillResult = {
    mode: write ? 'write' : 'dry-run',
    network,
    evidenceRows: evidence.length,
    alreadyStored: 0,
    decodedVotes: 0,
    decodedAllocations: 0,
    savedVotes: 0,
    failures: [],
    decoded: [],
  };

  for (const row of evidence) {
    const txId = row.tx_id.toLowerCase();
    const expectedClauseIndex =
      parseSafeInteger(row.clause_index);
    const blockNumber =
      parseSafeInteger(row.block_number);
    const voteRoundId =
      parseSafeInteger(row.vote_round_id);
    const blockTimestamp =
      parseBlockTimestamp(row.block_timestamp);

    if (
      expectedClauseIndex === null ||
      blockNumber === null ||
      voteRoundId === null ||
      blockTimestamp === null
    ) {
      result.failures.push({
        inviteCode: row.invite_code,
        txId,
        error:
          'Stored vote evidence contains an invalid block, round, clause, or timestamp.',
      });
      continue;
    }

    const storedKey =
      `${txId}:${expectedClauseIndex}`;

    if (storedKeys.has(storedKey)) {
      result.alreadyStored += 1;
      continue;
    }

    try {
      const decoded =
        await readMissionVoteAllocationsFromChain({
          walletAddress:
            row.wallet_address,
          txId,
          blockNumber,
          voteRoundId,
        });

      if (
        decoded.clauseIndex !==
        expectedClauseIndex
      ) {
        throw new Error(
          `Decoded clause ${decoded.clauseIndex} does not match stored clause ${expectedClauseIndex}.`,
        );
      }

      result.decodedVotes += 1;
      result.decodedAllocations +=
        decoded.allocations.length;

      let saved = false;

      if (write) {
        saved =
          await recordMissionVoteAllocations({
            inviteCode:
              row.invite_code,
            network,
            walletAddress:
              row.wallet_address,
            txId,
            blockNumber,
            blockTimestamp,
            clauseIndex:
              decoded.clauseIndex,
            voteRoundId,
            allocations:
              decoded.allocations,
          });

        if (!saved) {
          throw new Error(
            'Decoded allocations could not be persisted.',
          );
        }

        result.savedVotes += 1;
        storedKeys.add(storedKey);
      }

      result.decoded.push({
        inviteCode: row.invite_code,
        walletAddress:
          row.wallet_address.toLowerCase(),
        txId,
        roundId: voteRoundId,
        clauseIndex:
          decoded.clauseIndex,
        allocations:
          decoded.allocations,
        saved,
      });
    } catch (error) {
      result.failures.push({
        inviteCode: row.invite_code,
        txId,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown vote allocation backfill failure.',
      });
    }
  }

  return result;
}
