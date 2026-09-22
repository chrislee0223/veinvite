import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isRewardActionQueueStatus,
  type RewardActionItem,
} from '@/lib/notifications/rewardAction';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type QueueRow = {
  invite_code: string;
  status: string;
  reserved_amount_wei: string | number | null;
  reserved_at: string | null;
  eligible_at: string | null;
  assigned_round_id: string | number | null;
  sybil_clearance_id: string | null;
};

type SybilV2ClearanceRow = {
  id: string;
  invite_code: string;
  verdict: string;
};

type RoundRow = {
  id: string | number;
  broadcast_confirmed_at: string | null;
};

type SubmissionRow = {
  round_id: string | number;
  tx_id: string | null;
};

type InvitationRow = {
  invite_code: string;
  invitee_wallet: string | null;
  inviter_wallet: string;
  status: string;
  reward_status: string | null;
  reward_eligible_at: string | null;
  sybil_status: string | null;
  sybil_checked_at: string | null;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function positiveWei(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value);
  if (!/^\d+$/u.test(normalized)) return null;

  try {
    return BigInt(normalized) > 0n ? normalized : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  let walletAddress: string;

  try {
    const session = await requireWalletSession({ request });
    walletAddress = session.walletAddress.toLowerCase();
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return noStoreJson(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(
      'Failed to validate notification reward-action session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const queueResult = await supabaseAdmin
      .from('reward_queue_entries')
      .select(
        'invite_code, status, reserved_amount_wei, reserved_at, eligible_at, assigned_round_id, sybil_clearance_id',
      )
      .eq('recipient_wallet', walletAddress)
      .in('status', ['AWAITING_CLAIM', 'QUEUED', 'ASSIGNED'])
      .order('eligible_at', { ascending: true })
      .order('invite_code', { ascending: true });

    if (queueResult.error) {
      throw new Error(
        `Notification reward actions could not be loaded: ${queueResult.error.message}`,
      );
    }

    const queueRows = ((queueResult.data ?? []) as QueueRow[]).filter(
      (row) =>
        isRewardActionQueueStatus(row.status) &&
        positiveWei(row.reserved_amount_wei) !== null &&
        typeof row.reserved_at === 'string' &&
        !Number.isNaN(Date.parse(row.reserved_at)),
    );

    if (queueRows.length === 0) {
      return noStoreJson({
        walletAddress,
        actions: [],
      });
    }

    const inviteCodes = queueRows.map((row) => row.invite_code);
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, invitee_wallet, inviter_wallet, status, reward_status, reward_eligible_at, sybil_status, sybil_checked_at',
      )
      .eq('inviter_wallet', walletAddress)
      .in('invite_code', inviteCodes);

    if (invitationResult.error) {
      throw new Error(
        `Notification reward action invitations could not be loaded: ${invitationResult.error.message}`,
      );
    }

    const invitationByCode = new Map<string, InvitationRow>(
      ((invitationResult.data ?? []) as InvitationRow[]).map((row) => [
        row.invite_code,
        row,
      ]),
    );

    const clearanceIds = Array.from(new Set(
      queueRows
        .map((row) => row.sybil_clearance_id)
        .filter((value): value is string => Boolean(value)),
    ));
    const validV2ClearanceById = new Map<string, SybilV2ClearanceRow>();

    if (clearanceIds.length > 0) {
      const clearanceResult = await supabaseAdmin
        .from('sybil_v2_reward_clearances')
        .select('id, invite_code, verdict')
        .in('id', clearanceIds)
        .in('verdict', ['CLEAR', 'WATCH']);

      if (clearanceResult.error) {
        throw new Error(
          `Sybil v2 reward authority could not be loaded: ${clearanceResult.error.message}`,
        );
      }

      for (const row of (clearanceResult.data ?? []) as SybilV2ClearanceRow[]) {
        validV2ClearanceById.set(row.id, row);
      }
    }

    const assignedRoundIds = Array.from(new Set(
      queueRows
        .map((row) =>
          row.assigned_round_id === null
            ? null
            : String(row.assigned_round_id),
        )
        .filter((value): value is string => Boolean(value)),
    ));
    const roundById = new Map<string, RoundRow>();
    const submissionByRound = new Map<string, SubmissionRow>();

    if (assignedRoundIds.length > 0) {
      const [roundResult, submissionResult] = await Promise.all([
        supabaseAdmin
          .from('reward_rounds')
          .select('id, broadcast_confirmed_at')
          .in('id', assignedRoundIds),
        supabaseAdmin
          .from('reward_payout_transaction_submissions')
          .select('round_id, tx_id')
          .in('round_id', assignedRoundIds),
      ]);

      if (roundResult.error) {
        throw new Error(
          `Reward broadcast state could not be loaded: ${roundResult.error.message}`,
        );
      }
      if (submissionResult.error) {
        throw new Error(
          `Reward transaction submission could not be loaded: ${submissionResult.error.message}`,
        );
      }

      for (const row of (roundResult.data ?? []) as RoundRow[]) {
        roundById.set(String(row.id), row);
      }
      for (const row of (submissionResult.data ?? []) as SubmissionRow[]) {
        submissionByRound.set(String(row.round_id), row);
      }
    }

    const actions: RewardActionItem[] = queueRows.flatMap((queue) => {
      const invitation = invitationByCode.get(queue.invite_code);
      const amount = positiveWei(queue.reserved_amount_wei);

      const v2Clearance = queue.sybil_clearance_id
        ? validV2ClearanceById.get(queue.sybil_clearance_id) ?? null
        : null;
      const hasValidV2Authority = Boolean(
        v2Clearance &&
        v2Clearance.invite_code === queue.invite_code,
      );
      const legacyAuthority =
        queue.sybil_clearance_id === null &&
        invitation?.status === 'COMPLETED' &&
        invitation.reward_status === 'ELIGIBLE' &&
        invitation.reward_eligible_at !== null &&
        invitation.sybil_status === 'CLEAR' &&
        invitation.sybil_checked_at !== null &&
        queue.eligible_at === invitation.reward_eligible_at;

      if (
        !invitation ||
        invitation.inviter_wallet.toLowerCase() !== walletAddress ||
        invitation.reward_status === 'PAID' ||
        (!hasValidV2Authority && !legacyAuthority) ||
        !amount ||
        !queue.reserved_at ||
        !isRewardActionQueueStatus(queue.status)
      ) {
        return [];
      }

      const assignedRoundId =
        queue.assigned_round_id === null
          ? null
          : String(queue.assigned_round_id);
      const round = assignedRoundId
        ? roundById.get(assignedRoundId) ?? null
        : null;
      const submission = assignedRoundId
        ? submissionByRound.get(assignedRoundId) ?? null
        : null;
      const broadcastConfirmedAt =
        typeof round?.broadcast_confirmed_at === 'string' &&
        !Number.isNaN(Date.parse(round.broadcast_confirmed_at))
          ? round.broadcast_confirmed_at
          : null;
      const txId =
        broadcastConfirmedAt &&
        typeof submission?.tx_id === 'string' &&
        /^0x[0-9a-fA-F]{64}$/u.test(submission.tx_id)
          ? submission.tx_id.toLowerCase()
          : null;

      return [{
        inviteCode: queue.invite_code,
        status: queue.status,
        reservedAmountWei: amount,
        reservedAt: queue.reserved_at,
        friendWallet:
          invitation.invitee_wallet?.toLowerCase() ?? null,
        broadcastConfirmedAt,
        txId,
      }];
    });

    return noStoreJson({
      walletAddress,
      actions,
    });
  } catch (error) {
    console.error(
      'Failed to load notification reward actions:',
      error,
    );
    return noStoreJson(
      { error: 'Could not load reward actions.' },
      { status: 500 },
    );
  }
}
