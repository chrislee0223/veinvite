import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  deriveMissionAutoReset,
  type MissionAutoResetInput,
} from '@/lib/rewards/missionAutoResetPolicy';
import {
  verifyPreviousMissionVoteWindow,
  verifyPreviousMissionCompletionWindow,
} from '@/lib/rewards/missionAutoResetExpiryProof';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { missionAutoResetSchemaReady } from '@/lib/rewards/missionAutoResetRuntime';
import { recordTwoRoundResolution } from '@/lib/rewards/missionOriginalWindow';
import { syncInvitationEvidence, type InvitationEvidenceRow } from '@/lib/impact/syncInvitation';
import { readMissionAttemptDisplays } from '@/lib/rewards/missionAutoResetDisplay';
import { continueCompletedRetry } from '@/lib/rewards/missionRetryEligibility';
import { readMissionAutoResetChainProgress } from '@/lib/rewards/missionAutoResetChainReader';
import {
  readVeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

/**
 * Optional five-minute sweep using the EXISTING vote-reconcile cron.
 *
 * Release gates default closed (environment + service-only DB flag). Never
 * activate until the new attempt's funding/reservation and Sybil proof are
 * independently integrated, or users could complete again without payout.
 *
 * This reconciles the original voting window BEFORE starting a reset; it
 * never calls the legacy evidence writer to clear apps_completed (which is
 * append-only), and never touches the payout/claim/Sybil state.
 */
const MAX_SELECTION = 5;
const LEASE_SECONDS = 360;
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{7}$/;

type Candidate = {
  invite_code: string;
  invitee_wallet: string | null;
  status: string;
  reward_status: string;
  sybil_status: string | null;
  ineligible_at: string | null;
  eligibility_check_id: string | number | null;
  vote_completed: boolean | null;
  reward_cohort_round_id: string | number | null;
  activation_block: string | number | null;
};

type RetryRead = {
  state?: string;
  latestAttemptNo?: unknown;
  attemptRoundId?: unknown;
};

type Settings = {
  enabled: boolean;
  firstAutomaticRoundId: number;
  minimumFinalityBlocks: number;
  twoRoundPolicyEnabled: boolean;
};

export type MissionResetSweep = {
  status: 'OFF' | 'DB_DISABLED' | 'CHECKED';
  selected: number;
  started: number;
  blocked: number;
  failed: number;
  failedInviteCodes: string[];
};

function safeRound(value: unknown): number | null {
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function readSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Mission reset configuration unavailable.');
  }
  const row = value as Record<string, unknown>;
  const firstAutomaticRoundId = safeRound(row.firstAutomaticRoundId);
  const minimumFinalityBlocks = safeRound(row.minimumFinalityBlocks);
  if (typeof row.enabled !== 'boolean' ||
      firstAutomaticRoundId === null ||
      minimumFinalityBlocks === null ||
      minimumFinalityBlocks < 12 || minimumFinalityBlocks > 10000) {
    throw new Error('Mission reset configuration is invalid.');
  }
  return {
    enabled: row.enabled,
    firstAutomaticRoundId,
    minimumFinalityBlocks,
    twoRoundPolicyEnabled: row.twoRoundPolicyEnabled === true,
  };
}

async function loadRetryRead(inviteCode: string, network: string): Promise<RetryRead> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_invitation_mission_retry_state_v1',
    { p_invite_code: inviteCode, p_network: network },
  );
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Retry attempt state could not be verified: ' +
      (error?.message ?? 'malformed state'));
  }
  return data as RetryRead;
}

async function lockedCandidate(inviteCode: string, network: string): Promise<Candidate | null> {
  const { data, error } = await supabaseAdmin.from('invitations')
    .select('invite_code,invitee_wallet,status,reward_status,sybil_status,ineligible_at,eligibility_check_id,vote_completed,reward_cohort_round_id,activation_block')
    .eq('invite_code', inviteCode)
    .eq('activation_network', network)
    .maybeSingle();
  if (error) throw new Error('Reset invitation could not be rechecked: ' + error.message);
  return data as Candidate | null;
}

function inputFor({
  candidate,
  retry,
  currentRoundId,
  settings,
  startBlock,
  endBlock,
  finalizedBlock,
}: {
  candidate: Candidate;
  retry: RetryRead;
  currentRoundId: number;
  settings: Settings;
  startBlock: number | null;
  endBlock: number | null;
  finalizedBlock: number | null;
}): MissionAutoResetInput {
  const latestAttemptDappRoundId = retry.latestAttemptNo === null ||
    retry.latestAttemptNo === undefined
    ? null
    : safeRound(retry.attemptRoundId);
  return {
    originalDappRoundId: safeRound(candidate.reward_cohort_round_id),
    latestAttemptDappRoundId,
    currentRoundId,
    firstAutomaticRoundId: settings.firstAutomaticRoundId,
    invitationStatus: candidate.status,
    rewardStatus: candidate.reward_status,
    sybilStatus: candidate.sybil_status,
    ineligibleAt: candidate.ineligible_at,
    voteCompleted: !settings.twoRoundPolicyEnabled && candidate.vote_completed === true,
    // Absence will be proved on finalized VeChain events before commit.
    voteProofPending: false,
    // Final money/Sybil constraints are rechecked under the DB row lock.
    hasDurableReservation: false,
    hasOutstandingHeldFunds: false,
    hasVerifiedEntryProof: candidate.eligibility_check_id !== null,
    targetRoundStartBlock: startBlock,
    targetRoundEndBlock: endBlock,
    finalizedBestBlock: finalizedBlock,
  };
}

async function bindCompletion(network: string, code: string, attemptNo: number) {
  const result = await supabaseAdmin.rpc('bind_mission_retry_completion_v1', {
    p_network: network, p_invite_code: code, p_attempt_no: attemptNo,
  });
  if (result.error) throw new Error('Attempt funding binding failed: ' + result.error.message);
  if (result.data?.bound === true) {
    const checkpoint = await supabaseAdmin.rpc('publish_mission_retry_completion_checkpoint_v1', {
      p_network: network, p_invite_code: code, p_attempt_no: attemptNo,
    });
    if (checkpoint.error || checkpoint.data?.published !== true) {
      throw new Error('Canonical retry checkpoint failed: ' +
        (checkpoint.error?.message ?? checkpoint.data?.reason ?? 'UNKNOWN'));
    }
    await continueCompletedRetry(network, code);
    return true;
  }
  if (result.data?.reason === 'FUNDING_NOT_FINALIZED') return false;
  throw new Error('Attempt funding binding rejected: ' + (result.data?.reason ?? 'UNKNOWN'));
}

async function reconcileOriginalUnderLease(code: string, network: string) {
  const { data, error } = await supabaseAdmin.from('invitations').select('*')
    .eq('invite_code',code).eq('activation_network',network).maybeSingle();
  if (error || !data) throw new Error('Original mission reconciliation unavailable');
  if (data.reward_status === 'PENDING' && data.status === 'ACTIVATING') {
    await syncInvitationEvidence(data as InvitationEvidenceRow);
  }
}

async function handleOne(
  candidate: Candidate,
  currentRoundId: number,
  network: string,
  settings: Settings,
): Promise<'STARTED' | 'BLOCKED'> {
  const code = candidate.invite_code;
  if (!INVITE_CODE.test(code) ||
      !candidate.invitee_wallet ||
      !/^0x[0-9a-f]{40}$/i.test(candidate.invitee_wallet)) {
    return 'BLOCKED';
  }
  const leaseName = `invite_evidence_sync:${code}`;
  const ownerToken = randomUUID();
  const lease = await supabaseAdmin.rpc('try_acquire_operator_lock', {
    p_lock_name: leaseName,
    p_owner_token: ownerToken,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (lease.error) throw new Error('Mission reset lease unavailable: ' + lease.error.message);
  if (lease.data !== true) return 'BLOCKED';

  try {
    // Reload inside the same per-invite lease used by the canonical scanner.
    const live = await lockedCandidate(code, network);
    if (!live || live.invitee_wallet?.toLowerCase() !==
        candidate.invitee_wallet.toLowerCase()) {
      return 'BLOCKED';
    }
    const retry = await loadRetryRead(code, network);
    const flexiblePolicy = settings.twoRoundPolicyEnabled;
    if (['COMPLETION_PROTECTED','TERMINAL',
         'LEGACY_UNBOUND_REVIEW','LEGACY_UNBOUND_EXPIRED_REVIEW',
         'FUTURE_ROUND_INVALID'].includes(retry.state ?? '')) {
      return 'BLOCKED';
    }
    const reviewOnly = retry.state === 'SECURITY_REVIEW';
    if (reviewOnly && retry.latestAttemptNo == null) return 'BLOCKED';
    // A published retry checkpoint already has vote_completed=true.
    // Resume its security/eligibility handoff after any crash or delay.
    if (live.vote_completed === true && retry.latestAttemptNo != null) {
      const attempt = (await readMissionAttemptDisplays([{
        invite_code: code, activation_network: network,
      }])).get(code);
      if (attempt?.voteCompleted) await bindCompletion(network, code, attempt.attemptNo);
      return 'BLOCKED';
    }
    const preliminary = deriveMissionAutoReset(inputFor({
      candidate: live, retry, currentRoundId, settings,
      startBlock: null, endBlock: null, finalizedBlock: null,
    }));
    if (flexiblePolicy && !reviewOnly && preliminary.state === 'ORIGINAL_WINDOW') {
      await reconcileOriginalUnderLease(code, network);
      return 'BLOCKED';
    }
    if (!reviewOnly && (preliminary.state !== 'ROUND_PROOF_UNAVAILABLE' ||
        preliminary.targetDappRoundId === null)) {
      return 'BLOCKED';
    }

    const latestAttempt = retry.latestAttemptNo === null ||
      retry.latestAttemptNo === undefined
      ? null : safeRound(retry.attemptRoundId);
    // Reconcile the persisted attempt even if the sweep was delayed into
    // N+2. A valid historical completion always wins over expiration.
    if (latestAttempt !== null) {
      const active = (await readMissionAttemptDisplays([
        { invite_code: code, activation_network: network },
      ])).get(code);
      if (!active || active.dappRoundId !== latestAttempt) {
        throw new Error('Active attempt progress unavailable.');
      }
      // The completed mission is protected. If its funding receipt was not
      // finalized at the prior scan, refresh finality and retry the binding.
      if (active.voteCompleted && await bindCompletion(network, code, active.attemptNo)) {
        return 'BLOCKED';
      }
      const proof = await readMissionAutoResetChainProgress({
        walletAddress: live.invitee_wallet!,
        expectedNetwork: network,
        dappRoundId: active.dappRoundId,
        attemptStartBlock: active.attemptStartBlock,
        allowDappsThroughVoteRound: flexiblePolicy,
      });
      const recorded = await supabaseAdmin.rpc('record_mission_auto_reset_progress_v1', {
        p_network: network,
        p_invite_code: code,
        p_attempt_no: active.attemptNo,
        p_dapp_round_id: proof.dappRoundId,
        p_start_block: proof.attemptStartBlock,
        p_dapp_end_block: proof.dappRoundEndBlock,
        p_vote_start_block: proof.voteRoundStartBlock,
        p_vote_end_block: proof.voteRoundEndBlock,
        p_finalized_block: proof.finalizedThroughBlock,
        p_events: proof.events,
      });
      if (recorded.error || recorded.data?.recorded !== true) {
        throw new Error('Attempt progress persistence failed: ' +
          (recorded.error?.message ?? recorded.data?.reason ?? 'Unknown'));
      }
      if (proof.voteCompleted) {
        if (flexiblePolicy) await recordTwoRoundResolution(network, code, proof);
        await bindCompletion(network, code, active.attemptNo);
        return 'BLOCKED';
      }
      if (reviewOnly || latestAttempt === preliminary.targetDappRoundId) {
        return 'BLOCKED';
      }
    }
    if (reviewOnly || preliminary.targetDappRoundId === null) return 'BLOCKED';
    const base = latestAttempt ?? safeRound(live.reward_cohort_round_id);
    if (base === null) return 'BLOCKED';
    const priorVoteRoundId = base + 1;
    if (!Number.isSafeInteger(priorVoteRoundId)) return 'BLOCKED';

    // No reset while any previous vote remains unindexed or unfinalized.
    const first = Math.max((safeRound(live.reward_cohort_round_id) ?? base) + 2,
      settings.firstAutomaticRoundId);
    // If multiple windows elapsed after rollout, none may be silently skipped.
    // A bounded failure is reviewed rather than resetting over a possible vote.
    const rounds = [priorVoteRoundId];
    for (let round = Math.max(first, base + 2); round < preliminary.targetDappRoundId; round += 2) {
      if (round + 1 > priorVoteRoundId) rounds.push(round + 1);
      if (rounds.length > 8) return 'BLOCKED';
    }
    let absence: {roundEndBlock:number;finalizedBlock:number} | null = null;
    if (flexiblePolicy) {
      const originalRound = safeRound(live.reward_cohort_round_id);
      for (const voteRoundId of rounds) {
        const roundId = voteRoundId - 1;
        const originalActivation = latestAttempt === null && roundId === originalRound;
        const start = originalActivation ? safeRound(live.activation_block)
          : (await readVeBetterRoundWindow({roundId})).voteStartBlock;
        if (start === null) return 'BLOCKED';
        const expiry = await verifyPreviousMissionCompletionWindow({
          walletAddress: live.invitee_wallet!, expectedNetwork: network,
          dappRoundId: roundId, attemptStartBlock: start, originalActivation,
          minFinalityBlocks: settings.minimumFinalityBlocks,
        });
        if (expiry.outcome === 'VOTE_WINDOW_NOT_FINALIZED') return 'BLOCKED';
        await recordTwoRoundResolution(network, code, expiry.proof);
        if (expiry.outcome === 'COMPLETE') {
          if (originalActivation) await reconcileOriginalUnderLease(code, network);
          // A valid completion in an unrecorded historical retry window is
          // protected for reconciliation, never replaced by a new attempt.
          return 'BLOCKED';
        }
        if (expiry.proof.voteRoundEndBlock === null) return 'BLOCKED';
        absence = {roundEndBlock:expiry.proof.voteRoundEndBlock,finalizedBlock:expiry.proof.finalizedThroughBlock};
      }
    } else {
      for (const voteRoundId of rounds) {
        const verified = await verifyPreviousMissionVoteWindow({
          walletAddress: live.invitee_wallet!, expectedNetwork: network,
          voteRoundId, minFinalityBlocks: settings.minimumFinalityBlocks,
        });
        if (verified.outcome !== 'SAFE_TO_RESET') return 'BLOCKED';
        absence = verified;
      }
    }
    if (absence === null) return 'BLOCKED';

    const targetRound = await readVeBetterRoundWindow({
      roundId: preliminary.targetDappRoundId,
    });
    if (targetRound.network !== network ||
        targetRound.currentRoundId !== currentRoundId) {
      return 'BLOCKED';
    }
    const decided = deriveMissionAutoReset(inputFor({
      candidate: live, retry, currentRoundId, settings,
      startBlock: targetRound.voteStartBlock,
      endBlock: targetRound.voteEndBlock,
      finalizedBlock: absence.finalizedBlock,
    }));
    if (decided.state !== 'START_NEW_ATTEMPT') return 'BLOCKED';

    // The database verifies all present funding, Sybil, identity, last-vote
    // and old-payout guards again under row/advisory locks. The action is
    // atomic with the single INVITEE-only notification.
    const { data, error } = await supabaseAdmin.rpc(
      'commit_invitation_mission_auto_reset_v1',
      {
        p_invite_code: code,
        p_network: network,
        p_expected_current_round_id: currentRoundId,
        p_target_dapp_round_id: decided.targetDappRoundId,
        p_target_round_start_block: decided.eligibleDappStartBlock,
        p_target_round_end_block: decided.eligibleDappEndBlock,
        p_previous_vote_window_end_block: absence.roundEndBlock,
        p_chain_best_sealed_block: absence.finalizedBlock,
      },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Atomic mission reset commit failed: ' +
        (error?.message ?? 'malformed response'));
    }
    const result = data as Record<string, unknown>;
    if (result.started === true) return 'STARTED';
    if (result.started === false && typeof result.reason === 'string') {
      return 'BLOCKED';
    }
    throw new Error('Atomic mission reset returned an unknown decision.');
  } finally {
    const { error } = await supabaseAdmin.rpc('release_operator_lock', {
      p_lock_name: leaseName,
      p_owner_token: ownerToken,
    });
    if (error) console.error('Mission reset lease release failed:', error.message);
  }
}

export async function runMissionAutoResetSweep(
  limit: number = MAX_SELECTION,
): Promise<MissionResetSweep> {
  if (!missionAutoResetSchemaReady() || process.env.VEINVITE_MISSION_AUTO_RESET_READY === 'false') {
    return { status: 'OFF', selected: 0, started: 0, blocked: 0,
      failed: 0, failedInviteCodes: [] };
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Mission reset sweep batch limit is invalid.');
  }

  const config = getVeBetterNetworkConfig();
  const read = await supabaseAdmin.rpc('read_mission_auto_reset_settings_v1');
  if (read.error) throw new Error('Mission reset DB capability gate unavailable: ' +
    read.error.message);
  const settings = readSettings(read.data);
  if (!settings.enabled) {
    return { status: 'DB_DISABLED', selected: 0, started: 0, blocked: 0,
      failed: 0, failedInviteCodes: [] };
  }

  const round = await readVeBetterRoundWindow();
  if (round.network !== config.network) {
    throw new Error('Mission reset current round has wrong network.');
  }

  // Page over the ENTIRE eligible backlog, not just the first 100. A stuck
  // review cannot permanently starve later users as the user base grows.
  const countResult = await supabaseAdmin.from('invitations')
    .select('invite_code', { count: 'exact', head: true })
    .eq('activation_network', config.network)
    .in('status', ['ACTIVATING', 'UNDER_REVIEW'])
    .eq('reward_status', 'PENDING')
    .not('invitee_wallet','is',null);
  if (countResult.error || countResult.count === null) {
    throw new Error('Mission reset candidate count unavailable: ' +
      (countResult.error?.message ?? 'missing count'));
  }
  const windows = Math.max(1, Math.ceil(countResult.count / limit));
  // The shared cadence advances the page every five minutes without a
  // separate cron or mutable pagination cursor.
  const rotation = Math.floor(Date.now() / (5 * 60_000)) % windows;
  const offset = rotation * limit;
  const { data: rows, error } = await supabaseAdmin.from('invitations')
    .select('invite_code,invitee_wallet,status,reward_status,sybil_status,ineligible_at,eligibility_check_id,vote_completed,reward_cohort_round_id,activation_block')
    .eq('activation_network', config.network)
    .in('status', ['ACTIVATING', 'UNDER_REVIEW'])
    .eq('reward_status', 'PENDING')
    .not('invitee_wallet','is',null)
    .order('activated_at',{ ascending:true })
    .order('invite_code',{ ascending:true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error('Mission reset candidate page failed: ' + error.message);
  const selected = (rows ?? []) as Candidate[];
  const result: MissionResetSweep = {
    status: 'CHECKED',
    selected: selected.length,
    started: 0,
    blocked: 0,
    failed: 0,
    failedInviteCodes: [],
  };
  for (const invite of selected) {
    try {
      const status = await handleOne(
        invite, round.currentRoundId, config.network, settings,
      );
      if (status === 'STARTED') result.started += 1;
      else result.blocked += 1;
    } catch (error) {
      result.failed += 1;
      result.failedInviteCodes.push(invite.invite_code);
      console.error('Mission reset candidate proof failed:', {
        inviteCode: invite.invite_code,
        message: error instanceof Error ? error.message : 'UNKNOWN',
      });
    }
  }
  return result;
}

/**
 * Only errors from a deliberately enabled reset subsystem affect the existing
 * cron health result. When disabled, this is an inexpensive zero-I/O no-op.
 */
export async function runMissionAutoResetSweepSafe(): Promise<{
  sweep: MissionResetSweep | null;
  failure: Error | null;
}> {
  try {
    const sweep = await runMissionAutoResetSweep();
    return {
      sweep,
      failure: sweep.failed > 0
        ? new Error('Mission reset candidate chain proof failed.')
        : null,
    };
  } catch (error) {
    console.error('Mission auto-reset sweep failed:', error);
    return {
      sweep: null,
      failure: error instanceof Error
        ? error
        : new Error('Mission auto-reset sweep failed.'),
    };
  }
}
