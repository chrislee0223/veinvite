import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

export type VoteRoundBatchCandidate = {
  invite_code: string;
  completion_block: string | number;
  completion_tx_index: number;
  completion_clause_index: number;
  reward_cohort_round_id: string | number;
  reward_funding_allocation_receipt_id: string | number;
};

/**
 * The main legacy scanner is globally limited to 25 referrals. Its first
 * page may contain only old, currently unpriceable cohorts, preventing ANY
 * new vote-round close attempt. Load one verified candidate per future
 * completion round independently (service-only, env+DB gated).
 */
export async function readReadyVoteRoundBatchRepresentatives(
  network: string,
): Promise<VoteRoundBatchCandidate[]> {
  if (process.env.VEINVITE_VOTE_ROUND_CLOSE_ENABLED !== 'true') return [];

  const { data: rawMode, error: modeError } = await supabaseAdmin.rpc(
    'read_reward_vote_round_close_mode_v1',
    { p_network: network },
  );
  if (modeError || !rawMode || typeof rawMode !== 'object' ||
      Array.isArray(rawMode)) {
    throw new Error('Vote round scanner is unavailable: ' +
      (modeError?.message ?? 'bad mode'));
  }

  const mode = rawMode as Record<string, unknown>;
  const firstRound = Number(mode.firstVoteRoundId);
  if (typeof mode.enabled !== 'boolean' ||
      typeof mode.paused !== 'boolean' ||
      !Number.isSafeInteger(firstRound) || firstRound < 1) {
    throw new Error('Vote round scanner received invalid rollout settings');
  }
  // Do not schedule a new round while its pricing is intentionally paused.
  if (!mode.enabled || mode.paused) return [];

  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_vote_round_batch_representatives_v1',
    {
      p_network: network,
      p_first_vote_round_id: firstRound,
      p_limit: 25,
    },
  );
  if (error || !Array.isArray(data)) {
    throw new Error('Vote round batch representatives unavailable: ' +
      (error?.message ?? 'malformed candidates'));
  }
  for (const raw of data) {
    if (!raw || typeof raw !== 'object' ||
        typeof raw.invite_code !== 'string' ||
        !/^[A-HJ-NP-Z2-9]{7}$/.test(raw.invite_code) ||
        !Number.isSafeInteger(Number(raw.completion_block)) ||
        !Number.isSafeInteger(Number(raw.reward_cohort_round_id)) ||
        !Number.isSafeInteger(Number(raw.reward_funding_allocation_receipt_id))) {
      throw new Error('Vote round batch representative contains invalid evidence');
    }
  }
  return data as VoteRoundBatchCandidate[];
}

type RoundCloseOutcome =
  | { kind: 'LEGACY' }
  | { kind: 'RESERVED'; count: number }
  | { kind: 'WAITING'; reason: string };

/**
 * Opt-in future-round policy only. A missing canonical completion round must
 * NOT fall through to the legacy immediate writer once this flag is enabled.
 * SQL carries the transaction, atomicity and X financial protections.
 */
export async function tryReserveVoteRoundBatch({
  inviteCode,
  network,
  observedPoolBalanceWei,
  finalizedBlock,
}: {
  inviteCode: string;
  network: string;
  observedPoolBalanceWei: string;
  finalizedBlock: number;
}): Promise<RoundCloseOutcome> {
  if (process.env.VEINVITE_VOTE_ROUND_CLOSE_ENABLED !== 'true') {
    return { kind: 'LEGACY' };
  }

  const { data: roundMode, error: roundModeError } = await supabaseAdmin.rpc(
    'read_reward_vote_round_close_mode_v1',
    { p_network: network },
  );
  if (roundModeError || !roundMode || typeof roundMode !== 'object' ||
      Array.isArray(roundMode) ||
      typeof (roundMode as Record<string, unknown>).enabled !== 'boolean' ||
      typeof (roundMode as Record<string, unknown>).paused !== 'boolean' ||
      !Number.isSafeInteger((roundMode as Record<string, unknown>).firstVoteRoundId)) {
    throw new Error('Vote-round settlement mode is unavailable: ' +
      (roundModeError?.message ?? 'malformed mode'));
  }

  const { data: completion, error: completionError } = await supabaseAdmin
    .from('invitations')
    .select('vote_round_id')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (completionError || !completion) {
    throw new Error('Vote-round completion authority could not be verified: ' +
      (completionError?.message ?? 'missing invitation'));
  }

  const rawVoteRoundId = completion.vote_round_id;
  const voteRoundId = Number(rawVoteRoundId);
  const firstRound = Number((roundMode as Record<string, unknown>).firstVoteRoundId);
  if (rawVoteRoundId === null || rawVoteRoundId === undefined ||
      !Number.isSafeInteger(voteRoundId) || voteRoundId < 1 ||
      !Number.isSafeInteger(firstRound) || firstRound < 1) {
    throw new Error('Vote-round settlement cannot resolve a verified completion round');
  }
  if (voteRoundId < firstRound) return { kind: 'LEGACY' };

  if (!(roundMode as { enabled: boolean }).enabled) {
    return { kind: 'WAITING', reason: 'ROUND_CLOSE_NOT_ACTIVATED' };
  }
  if ((roundMode as { paused: boolean }).paused) {
    return { kind: 'WAITING', reason: 'ROUND_CLOSE_PAUSED' };
  }

  const { data: batchRaw, error: batchError } = await supabaseAdmin.rpc(
    'commit_reward_vote_round_close_batch_v1',
    {
      p_invite_code: inviteCode,
      p_network: network,
      p_observed_pool_balance_wei: observedPoolBalanceWei,
      p_observed_at: new Date().toISOString(),
      p_finalized_block: finalizedBlock,
    },
  );
  if (batchError || !batchRaw || typeof batchRaw !== 'object' ||
      Array.isArray(batchRaw)) {
    throw new Error('Atomic vote-round batch failed: ' +
      (batchError?.message ?? 'malformed result'));
  }

  const result = batchRaw as Record<string, unknown>;
  const mode = String(result.mode ?? '');
  if (mode === 'ROUND_BATCH_RESERVED') {
    const count = Number(result.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > 5000 ||
        result.reserved !== true) {
      throw new Error('Vote-round batch count or reservation proof is invalid');
    }
    return { kind: 'RESERVED', count };
  }
  // A retry cannot be reported as another paid/awarded referral.
  if (mode === 'ALREADY_RESERVED') {
    return { kind: 'RESERVED', count: 0 };
  }
  if (mode === 'DEFER' || mode === 'BLOCKED' || mode === 'PAUSED') {
    return { kind: 'WAITING', reason: String(result.reason ?? mode) };
  }
  throw new Error('Vote-round batch returned unsafe mode: ' + mode);
}
