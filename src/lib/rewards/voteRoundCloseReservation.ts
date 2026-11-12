import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

type RoundCloseOutcome =
  | { kind: 'LEGACY' }
  | { kind: 'RESERVED' }
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
  if (mode === 'ROUND_BATCH_RESERVED' || mode === 'ALREADY_RESERVED') {
    return { kind: 'RESERVED' };
  }
  if (mode === 'DEFER' || mode === 'BLOCKED') {
    return { kind: 'WAITING', reason: String(result.reason ?? mode) };
  }
  throw new Error('Vote-round batch returned unsafe mode: ' + mode);
}
