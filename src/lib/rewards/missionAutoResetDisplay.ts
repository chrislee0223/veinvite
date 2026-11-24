import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { MIN_VOT3_CONVERSION_WEI } from '@/lib/vebetter/vot3Conversion';

export type MissionAttemptDisplay = {
  inviteCode: string;
  attemptNo: number;
  dappRoundId: number;
  voteRoundId: number;
  attemptStartBlock: number;
  appsCompleted: number;
  appIds: string[];
  vot3Converted: boolean;
  voteCompleted: boolean;
  conversionAmountWei: string | null;
  finalizedThroughBlock: number | null;
  completionRoundId: number | null;
};

type DisplayRow = { invite_code: string; activation_network: string | null };

function validPositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function parseDisplay(raw: unknown, expected: Set<string>): MissionAttemptDisplay {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid attempt projection');
  const p = raw as MissionAttemptDisplay;
  if (!expected.has(p.inviteCode) || !validPositive(p.attemptNo) ||
      !validPositive(p.dappRoundId) || p.voteRoundId !== p.dappRoundId + 1 ||
      !validPositive(p.attemptStartBlock) ||
      !Number.isInteger(p.appsCompleted) || p.appsCompleted < 0 || p.appsCompleted > 3 ||
      !Array.isArray(p.appIds) || p.appIds.length !== p.appsCompleted ||
      new Set(p.appIds).size !== p.appsCompleted ||
      !p.appIds.every(id => /^0x[0-9a-f]{64}$/.test(id)) ||
      typeof p.vot3Converted !== 'boolean' || typeof p.voteCompleted !== 'boolean' ||
      (p.vot3Converted && (typeof p.conversionAmountWei !== 'string' ||
        !/^[0-9]+$/.test(p.conversionAmountWei) || BigInt(p.conversionAmountWei) <= 0n)) ||
      (p.voteCompleted && (p.appsCompleted !== 3 || !p.vot3Converted ||
        p.completionRoundId !== p.voteRoundId))) {
    throw new Error('Invalid attempt projection');
  }
  return p;
}

// Call ONLY with invitation rows already authorized to the session wallet.
// Batch by verified network, not by client-supplied parameters. Fail closed
// rather than displaying old 3/3 when the active attempt read fails.
export async function readMissionAttemptDisplays(rows: readonly DisplayRow[]) {
  const result = new Map<string, MissionAttemptDisplay>();
  if (process.env.VEINVITE_MISSION_AUTO_RESET_READY !== 'true') return result;
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.activation_network) continue;
    const codes = groups.get(row.activation_network) ?? new Set<string>();
    codes.add(row.invite_code);
    groups.set(row.activation_network, codes);
  }
  for (const [network, codes] of groups) {
    const all = [...codes];
    for (let i = 0; i < all.length; i += 100) {
      const batch = all.slice(i, i + 100);
      const { data, error } = await supabaseAdmin.rpc('read_mission_auto_reset_progress_v1', {
        p_network: network, p_invite_codes: batch,
      });
      if (error || !Array.isArray(data)) throw new Error('Mission attempt projection unavailable');
      for (const raw of data) {
        const p = parseDisplay(raw, new Set(batch));
        if (result.has(p.inviteCode)) throw new Error('Duplicate attempt projection');
        result.set(p.inviteCode, p);
      }
    }
  }
  return result;
}

export function applyAttemptDisplay<T extends { apps_completed: number | null;
    vot3_converted: boolean | null; vote_completed: boolean | null }>(
    row: T, attempt: MissionAttemptDisplay | undefined): T {
  return attempt ? { ...row, apps_completed: attempt.appsCompleted,
    vot3_converted: attempt.vot3Converted, vote_completed: attempt.voteCompleted } : row;
}

export function attemptDetailProgress(p: MissionAttemptDisplay) {
  return {
    appsCompleted: p.appsCompleted, appsRequired: 3 as const,
    rewardsReceived: p.appsCompleted,
    vot3Converted: p.vot3Converted,
    vot3MinimumAmountWei: MIN_VOT3_CONVERSION_WEI.toString(),
    vot3ConversionAmountWei: p.vot3Converted ? p.conversionAmountWei : null,
    voteCompleted: p.voteCompleted, uniqueAppIds: p.appIds,
    activationBlock: p.attemptStartBlock, latestBlock: p.finalizedThroughBlock,
    attemptNo: p.attemptNo, dappRoundId: p.dappRoundId, voteRoundId: p.voteRoundId,
  };
}
