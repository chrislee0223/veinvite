import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  deriveMissionAutoReset,
  type MissionAutoResetInput,
} from '@/lib/rewards/missionAutoResetPolicy';
import {
  verifyPreviousMissionVoteWindow,
} from '@/lib/rewards/missionAutoResetExpiryProof';
import { supabaseAdmin } from '@/lib/supabaseServer';
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
const PAGE_CANDIDATES = 100;
const LEASE_SECONDS = 240;
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
    .select('invite_code,invitee_wallet,status,reward_status,sybil_status,ineligible_at,eligibility_check_id,vote_completed,reward_cohort_round_id')
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
    voteCompleted: candidate.vote_completed === true,
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
    if (['COMPLETION_PROTECTED','SECURITY_REVIEW','TERMINAL',
         'LEGACY_UNBOUND_REVIEW','LEGACY_UNBOUND_EXPIRED_REVIEW',
         'FUTURE_ROUND_INVALID'].includes(retry.state ?? '')) {
      return 'BLOCKED';
    }
    const preliminary = deriveMissionAutoReset(inputFor({
      candidate: live, retry, currentRoundId, settings,
      startBlock: null, endBlock: null, finalizedBlock: null,
    }));
    if (preliminary.state !== 'ROUND_PROOF_UNAVAILABLE' ||
        preliminary.targetDappRoundId === null) {
      return 'BLOCKED';
    }

    const latestAttempt = retry.latestAttemptNo === null ||
      retry.latestAttemptNo === undefined
      ? null : safeRound(retry.attemptRoundId);
    // An already-created attempt needs no repeated on-chain vote absence
    // check. The DB writer's exact-once guard handles concurrent retries.
    if (latestAttempt === preliminary.targetDappRoundId) {
      return 'BLOCKED';
    }
    const base = latestAttempt ?? safeRound(live.reward_cohort_round_id);
    if (base === null) return 'BLOCKED';
    const priorVoteRoundId = base + 1;
    if (!Number.isSafeInteger(priorVoteRoundId)) return 'BLOCKED';

    // No reset while any previous vote remains unindexed or unfinalized.
    const absence = await verifyPreviousMissionVoteWindow({
      walletAddress: live.invitee_wallet!,
      expectedNetwork: network,
      voteRoundId: priorVoteRoundId,
      minFinalityBlocks: settings.minimumFinalityBlocks,
    });
    if (absence.outcome !== 'SAFE_TO_RESET') return 'BLOCKED';

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
  if (process.env.VEINVITE_MISSION_AUTO_RESET_READY !== 'true') {
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

  const { data: rows, error } = await supabaseAdmin.from('invitations')
    .select('invite_code,invitee_wallet,status,reward_status,sybil_status,ineligible_at,eligibility_check_id,vote_completed,reward_cohort_round_id')
    .eq('activation_network', config.network)
    .eq('status', 'ACTIVATING')
    .eq('reward_status', 'PENDING')
    .or('vote_completed.eq.false,vote_completed.is.null')
    .not('invitee_wallet','is',null)
    .order('activated_at',{ ascending:true })
    .limit(PAGE_CANDIDATES);
  if (error) throw new Error('Mission reset pending invitation list failed: ' + error.message);

  const all = (rows ?? []) as Candidate[];
  const windows = Math.max(1, Math.ceil(all.length / limit));
  // Move the fixed batch every 5 minutes so one REVIEW case cannot starve
  // later invitees; no paid infrastructure, no new cron or mutable cursor.
  const rotation = Math.floor(Date.now() / (5 * 60_000)) % windows;
  const selected = all.slice(rotation * limit, rotation * limit + limit);
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
