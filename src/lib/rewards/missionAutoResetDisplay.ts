import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { missionAutoResetSchemaReady } from '@/lib/rewards/missionAutoResetRuntime';
import { MIN_VOT3_CONVERSION_WEI } from '@/lib/vebetter/vot3Conversion';
import type { InvitationEvidenceRow, InvitationSyncProgress } from '@/lib/impact/syncInvitation';

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
  /** Independent early vote; voteCompleted remains the full-proof gate. */
  voteObserved?: boolean;
  conversionAmountWei: string | null;
  finalizedThroughBlock: number | null;
  completionRoundId: number | null;
  appsCompletedAt: string | null;
  appsCompletedBlock: number | null;
  conversionTxId: string | null;
  conversionBlock: number | null;
  conversionAt: string | null;
  voteBlock: number | null;
  voteAt: string | null;
};

type DisplayRow = { invite_code: string; activation_network: string | null };

function validPositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function validTimestamp(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v));
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
      (p.finalizedThroughBlock !== null &&
        (!validPositive(p.finalizedThroughBlock) || p.finalizedThroughBlock < p.attemptStartBlock)) ||
      (p.appsCompleted === 3 &&
        (!validPositive(p.appsCompletedBlock) || !validTimestamp(p.appsCompletedAt))) ||
      typeof p.vot3Converted !== 'boolean' || typeof p.voteCompleted !== 'boolean' ||
      (p.vot3Converted && (!validPositive(p.conversionBlock) ||
        !validTimestamp(p.conversionAt) || typeof p.conversionTxId !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(p.conversionTxId))) ||
      (p.voteObserved !== undefined && typeof p.voteObserved !== 'boolean') ||
      ((p.voteCompleted || p.voteObserved === true) && (!validPositive(p.voteBlock) || !validTimestamp(p.voteAt))) ||
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
  if (!missionAutoResetSchemaReady()) return result;
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
    vot3_converted: attempt.vot3Converted, vote_completed: attempt.voteObserved ?? attempt.voteCompleted } : row;
}

export function attemptDetailProgress(p: MissionAttemptDisplay) {
  return {
    appsCompleted: p.appsCompleted, appsRequired: 3 as const,
    rewardsReceived: p.appsCompleted,
    vot3Converted: p.vot3Converted,
    vot3MinimumAmountWei: MIN_VOT3_CONVERSION_WEI.toString(),
    vot3ConversionAmountWei: p.vot3Converted ? p.conversionAmountWei : null,
    voteCompleted: p.voteObserved ?? p.voteCompleted, uniqueAppIds: p.appIds,
    activationBlock: p.attemptStartBlock, latestBlock: p.finalizedThroughBlock,
    attemptNo: p.attemptNo, dappRoundId: p.dappRoundId, voteRoundId: p.voteRoundId,
  };
}

/** Shared by the legacy cron reconciler as well as the authenticated API.
 * Only display state is projected; the immutable invitation row is unchanged.
 * No legacy sync, eligibility promotion or financial side effect runs here.
 */
export async function readActiveAttemptSync(
  row: InvitationEvidenceRow,
): Promise<{ row: InvitationEvidenceRow; progress: InvitationSyncProgress } | null> {
  const attempt = (await readMissionAttemptDisplays([row])).get(row.invite_code);
  if (!attempt) return null;
  const p = attemptDetailProgress(attempt);
  return {
    row,
    progress: {
      ...p,
      // Cron callers must not treat a partial vote as mission completion.
      voteCompleted: attempt.voteCompleted,
      vot3ConvertedAt: attempt.conversionAt,
      vot3ConvertedBlock: attempt.conversionBlock,
      vot3ConversionTxId: attempt.conversionTxId,
      conversionObserved: attempt.vot3Converted,
      conversionBelowMinimumObserved: false,
      conversionBeforeFirstDappObserved: false,
      conversionSyncPending: false,
      activationNetwork: row.activation_network,
      appsCompletedAt: attempt.appsCompletedAt,
      appsCompletedBlock: attempt.appsCompletedBlock,
      voteCompletedAt: attempt.voteAt,
      voteCompletedBlock: attempt.voteBlock,
      voteRoundId: attempt.voteCompleted ? attempt.voteRoundId : null,
      activityCheckpointSaved: true,
      voteSyncPending: false,
      impactCheckpointSaved: true,
      impactLastSyncedBlock: attempt.finalizedThroughBlock,
      impactLastSyncedAt: null,
      impactSyncCompleteAt: null,
      networkMismatch: false,
    },
  };
}
