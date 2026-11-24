import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readMissionAttemptDisplays } from '@/lib/rewards/missionAutoResetDisplay';

export type MissionBehaviorPattern = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string;
  activated_at: string;
  app_sequence: string[];
  reward_intervals_seconds: Array<number | string> | null;
  attempt_no?: number;
};

export async function loadRetryBehaviorPatterns(invitation: {
  invite_code: string;
  activation_network: string | null;
  vote_completed?: boolean;
  vote_completed_block?: number | string | null;
}) {
  if (process.env.VEINVITE_MISSION_AUTO_RESET_READY !== 'true' || !invitation.activation_network) {
    return { patterns: [] as MissionBehaviorPattern[], attemptNo: null, completionBlock: null };
  }
  const attempts = await readMissionAttemptDisplays([invitation]);
  const active = attempts.get(invitation.invite_code);
  const { data, error } = await supabaseAdmin.rpc('read_mission_retry_behavior_patterns_v1', {
    p_network: invitation.activation_network,
  });
  if (error || !Array.isArray(data)) throw new Error('Retry mission behavior evidence unavailable');
  const patterns = data as MissionBehaviorPattern[];
  for (const pattern of patterns) {
    if (!pattern.invite_code || !Number.isSafeInteger(pattern.attempt_no) ||
      (pattern.attempt_no ?? 0) <= 0 || !Array.isArray(pattern.app_sequence) ||
      pattern.app_sequence.length !== 3 || new Set(pattern.app_sequence).size !== 3 ||
      !Number.isFinite(Date.parse(pattern.activated_at))) {
      throw new Error('Invalid retry behavior evidence');
    }
  }
  return {
    patterns,
    attemptNo: active?.attemptNo ?? null,
    completionBlock: active?.voteCompleted && invitation.vote_completed === true &&
      active.voteBlock === Number(invitation.vote_completed_block) ? active.voteBlock : null,
  };
}

/** One person with several attempts is still one peer. Preserve the maximum
 * signal across original and retry histories; do not dilute old findings. */
export function countDistinctMissionPeers(
  rows: MissionBehaviorPattern[], inviteCode: string,
  similar: (own: MissionBehaviorPattern, peer: MissionBehaviorPattern) => boolean,
): number {
  const peers = new Set<string>();
  for (const own of rows.filter(r => r.invite_code === inviteCode)) {
    for (const peer of rows) {
      if (peer.invite_code !== inviteCode && similar(own, peer)) peers.add(peer.invite_code);
    }
  }
  return peers.size;
}
