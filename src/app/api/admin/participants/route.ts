import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { loadRoundGrowthReportingConfig } from '@/lib/reporting/roundGrowthSnapshots';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import {
  readVeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';

type EligibilityCheckRow = {
  id: string | number;
  invite_code: string;
  wallet_address: string;
  network: string;
  checked_block: string | number;
  outcome: string;
  entry_class: string | null;
  created_at: string;
};

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: string;
  reward_status: string;
  apps_completed: number;
  rewards_received: number;
  vot3_converted: boolean;
  vote_completed: boolean;
  reward_eligible_at: string | null;
  reward_paid_at: string | null;
  sybil_status: string | null;
  sybil_risk_level: string | null;
  impact_last_synced_at: string | null;
  activated_at: string | null;
  updated_at: string;
  eligibility_check_id: string | number | null;
};

type RewardQueueRow = {
  invite_code: string;
  entry_class: string;
  status: string;
  assigned_round_id: string | number | null;
  queued_at: string;
  assigned_at: string | null;
};

type GrowthRow = {
  round_id: string | number;
  verified_new_users: string | number;
  activated_new_users: string | number;
  flagged_new_users: string | number;
  verified_returning_users: string | number;
  activated_returning_users: string | number;
  active_existing_rejected_users: string | number;
  active_existing_rejection_attempts: string | number;
  cumulative_verified_new_users: string | number;
  cumulative_activated_new_users: string | number;
  cumulative_flagged_new_users: string | number;
  cumulative_verified_returning_users: string | number;
  cumulative_activated_returning_users: string | number;
  cumulative_active_existing_rejected_users: string | number;
  cumulative_active_existing_rejection_attempts: string | number;
  first_verified_entry_at: string | null;
  latest_verified_entry_at: string | null;
};

const ADMIN_PAGE_SIZE = 1000;
const GROWTH_HISTORY_ROUNDS = 52;

function countString(value: string | number) {
  return String(value);
}

function normalizeGrowthRow(row: GrowthRow) {
  return {
    roundId: countString(row.round_id),
    verifiedNewUsers: countString(
      row.verified_new_users,
    ),
    activatedNewUsers: countString(
      row.activated_new_users,
    ),
    flaggedNewUsers: countString(
      row.flagged_new_users,
    ),
    verifiedReturningUsers: countString(
      row.verified_returning_users,
    ),
    activatedReturningUsers: countString(
      row.activated_returning_users,
    ),
    activeExistingRejectedUsers: countString(
      row.active_existing_rejected_users,
    ),
    activeExistingRejectionAttempts: countString(
      row.active_existing_rejection_attempts,
    ),
    cumulativeVerifiedNewUsers: countString(
      row.cumulative_verified_new_users,
    ),
    cumulativeActivatedNewUsers: countString(
      row.cumulative_activated_new_users,
    ),
    cumulativeFlaggedNewUsers: countString(
      row.cumulative_flagged_new_users,
    ),
    cumulativeVerifiedReturningUsers: countString(
      row.cumulative_verified_returning_users,
    ),
    cumulativeActivatedReturningUsers: countString(
      row.cumulative_activated_returning_users,
    ),
    cumulativeActiveExistingRejectedUsers: countString(
      row.cumulative_active_existing_rejected_users,
    ),
    cumulativeActiveExistingRejectionAttempts: countString(
      row.cumulative_active_existing_rejection_attempts,
    ),
    firstVerifiedEntryAt:
      row.first_verified_entry_at,
    latestVerifiedEntryAt:
      row.latest_verified_entry_at,
  };
}

function idKey(value: string | number | null) {
  return value === null ? '' : String(value);
}

function normalizedWallet(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

async function loadEligibilityChecks(
  network: string,
): Promise<EligibilityCheckRow[]> {
  const rows: EligibilityCheckRow[] = [];

  for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('eligibility_check_events')
      .select(
        'id, invite_code, wallet_address, network, checked_block, outcome, entry_class, created_at',
      )
      .eq('network', network)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Eligibility checks could not be loaded: ${error.message}`,
      );
    }

    const page = (data ?? []) as EligibilityCheckRow[];
    rows.push(...page);

    if (page.length < ADMIN_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function loadInvitations(): Promise<InvitationRow[]> {
  const rows: InvitationRow[] = [];

  for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, inviter_wallet, invitee_wallet, status, reward_status, apps_completed, rewards_received, vot3_converted, vote_completed, reward_eligible_at, reward_paid_at, sybil_status, sybil_risk_level, impact_last_synced_at, activated_at, updated_at, eligibility_check_id',
      )
      .order('created_at', { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Invitations could not be loaded: ${error.message}`,
      );
    }

    const page = (data ?? []) as InvitationRow[];
    rows.push(...page);

    if (page.length < ADMIN_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function loadRewardQueue(
  network: string,
): Promise<RewardQueueRow[]> {
  const rows: RewardQueueRow[] = [];

  for (let from = 0; ; from += ADMIN_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('reward_queue_entries')
      .select(
        'invite_code, entry_class, status, assigned_round_id, queued_at, assigned_at',
      )
      .eq('network', network)
      .order('created_at', { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Reward queue could not be loaded: ${error.message}`,
      );
    }

    const page = (data ?? []) as RewardQueueRow[];
    rows.push(...page);

    if (page.length < ADMIN_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function loadGrowth(
  network: string,
  currentRoundId: number,
  scope: 'INTERNAL' | 'PUBLIC' = 'INTERNAL',
) {
  const { data, error } =
    await supabaseAdmin.rpc(
      scope === 'PUBLIC'
        ? 'get_operator_public_new_user_growth'
        : 'get_operator_new_user_growth',
      {
        p_network: network,
        p_current_round_id:
          currentRoundId,
        p_limit: GROWTH_HISTORY_ROUNDS,
      },
    );

  if (error) {
    throw new Error(
      `${scope === 'PUBLIC' ? 'Public' : 'Internal'} new-user growth could not be loaded: ${error.message}`,
    );
  }

  return ((data ?? []) as GrowthRow[]).map(
    normalizeGrowthRow,
  );
}

export async function GET(request: NextRequest) {
  try {
    const session =
      await requireWalletSession({ request });
    const pool =
      await readVeInviteRewardPoolStatus();

    if (
      !canOperateVeInviteRewards(
        session.walletAddress,
        pool,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const round =
      await readVeBetterRoundWindow();

    if (round.network !== pool.network) {
      throw new Error(
        'Participant growth round network does not match the reward pool network.',
      );
    }

    const reporting =
      await loadRoundGrowthReportingConfig();
    const publicReportingEnabled =
      reporting.enabled &&
      reporting.network === pool.network;

    const [
      eligibilityChecks,
      invitations,
      queueEntries,
      growthTrend,
      publicGrowthTrend,
    ] = await Promise.all([
      loadEligibilityChecks(pool.network),
      loadInvitations(),
      loadRewardQueue(pool.network),
      loadGrowth(
        pool.network,
        round.roundId,
      ),
      publicReportingEnabled
        ? loadGrowth(
            pool.network,
            round.roundId,
            'PUBLIC',
          )
        : Promise.resolve([]),
    ]);

    const invitationByEligibilityCheck = new Map(
      invitations
        .filter(
          (row) => row.eligibility_check_id !== null,
        )
        .map((row) => [
          idKey(row.eligibility_check_id),
          row,
        ]),
    );

    const invitationByCode = new Map(
      invitations.map((row) => [
        row.invite_code,
        row,
      ]),
    );

    const queueByInviteCode = new Map(
      queueEntries.map((row) => [
        row.invite_code,
        row,
      ]),
    );

    // eligibilityChecks is ordered newest-first. Keep one latest decision per
    // wallet so a wallet that later becomes RETURNING is not double-counted
    // with an older ACTIVE_EXISTING attempt.
    const seenWallets = new Set<string>();
    const participants = eligibilityChecks
      .filter((check) => {
        const wallet = check.wallet_address.toLowerCase();

        if (seenWallets.has(wallet)) {
          return false;
        }

        seenWallets.add(wallet);
        return true;
      })
      .map((check) => {
        const directInvitation =
          invitationByEligibilityCheck.get(
            idKey(check.id),
          ) ?? null;
        const codeInvitation =
          invitationByCode.get(check.invite_code) ?? null;
        // Rejected eligibility attempts do not consume an invite. That same
        // invite code may later be claimed by a different wallet. Never attach
        // that later claimant's mission/reward state to the rejected wallet.
        const invitation =
          directInvitation ??
          (normalizedWallet(codeInvitation?.invitee_wallet ?? null) ===
          normalizedWallet(check.wallet_address)
            ? codeInvitation
            : null);
        const queue = invitation
          ? queueByInviteCode.get(
              invitation.invite_code,
            ) ?? null
          : null;
        const entryClass =
          check.entry_class ??
          queue?.entry_class ??
          'UNKNOWN';

        return {
          eligibilityCheckId: String(check.id),
          walletAddress: check.wallet_address,
          inviteCode: check.invite_code,
          entryClass,
          outcome: check.outcome,
          checkedBlock: String(check.checked_block),
          checkedAt: check.created_at,
          inviterWallet:
            invitation?.inviter_wallet ?? null,
          invitationStatus:
            invitation?.status ?? null,
          activatedAt:
            invitation?.activated_at ?? null,
          updatedAt:
            invitation?.updated_at ?? null,
          mission: invitation
            ? {
                appsCompleted:
                  invitation.apps_completed,
                appsRequired: 3,
                rewardsReceived:
                  invitation.rewards_received,
                rewardsRequired: 3,
                vot3Converted:
                  invitation.vot3_converted,
                voteCompleted:
                  invitation.vote_completed,
                lastSyncedAt:
                  invitation.impact_last_synced_at,
              }
            : null,
          reward: invitation
            ? {
                rewardStatus:
                  invitation.reward_status,
                rewardEligibleAt:
                  invitation.reward_eligible_at,
                rewardPaidAt:
                  invitation.reward_paid_at,
                queueStatus:
                  queue?.status ?? null,
                assignedRoundId:
                  queue?.assigned_round_id !== null &&
                  queue?.assigned_round_id !== undefined
                    ? String(queue.assigned_round_id)
                    : null,
                queuedAt:
                  queue?.queued_at ?? null,
                assignedAt:
                  queue?.assigned_at ?? null,
              }
            : null,
          sybil: invitation
            ? {
                status:
                  invitation.sybil_status,
                riskLevel:
                  invitation.sybil_risk_level,
              }
            : null,
        };
      });

    const summary = participants.reduce(
      (counts, participant) => {
        if (participant.entryClass === 'NEW') {
          counts.newUsers += 1;
        } else if (
          participant.entryClass === 'RETURNING'
        ) {
          counts.returningUsers += 1;
        } else if (
          participant.entryClass === 'ACTIVE_EXISTING'
        ) {
          counts.activeExistingUsers += 1;
        }

        if (
          participant.reward?.queueStatus === 'QUEUED'
        ) {
          counts.queuedRewards += 1;
        }

        return counts;
      },
      {
        newUsers: 0,
        returningUsers: 0,
        activeExistingUsers: 0,
        queuedRewards: 0,
      },
    );

    return NextResponse.json(
      {
        network: pool.network,
        verifiedOperator:
          session.walletAddress,
        generatedAt: new Date().toISOString(),
        summary,
        growth: {
          metricDefinition:
            '검증 신규·복귀 진입은 운영용 진행 퍼널입니다. 공식 공개 성과인 활성화 신규·복귀는 각 분류에서 모든 미션을 완료하고 Sybil 판정이 CLEAR인 고유 지갑만 집계합니다. 라운드별 완료자는 완료 시점이 아니라 최초 유입 라운드 코호트에 귀속됩니다.',
          currentRound: {
            id: String(round.roundId),
            status: round.status,
            startAt:
              round.roundStartAt,
            endAt: round.roundEndAt,
            endAtEstimated:
              round.roundEndAtEstimated,
            checkedThroughBlock:
              String(round.bestBlock),
          },
          current:
            growthTrend.find(
              (row) =>
                row.roundId ===
                String(round.roundId),
            ) ?? null,
          previous:
            growthTrend.find(
              (row) =>
                row.roundId ===
                String(round.roundId - 1),
            ) ?? null,
          trend: growthTrend,
          publicReporting: {
            enabled:
              publicReportingEnabled,
            startAt: reporting.startAt,
            baselineRoundId:
              reporting.roundId === null
                ? null
                : String(reporting.roundId),
            lockedAt: reporting.lockedAt,
            current:
              publicGrowthTrend.find(
                (row) =>
                  row.roundId ===
                  String(round.roundId),
              ) ?? null,
            previous:
              publicGrowthTrend.find(
                (row) =>
                  row.roundId ===
                  String(round.roundId - 1),
              ) ?? null,
            trend: publicGrowthTrend,
          },
        },
        participants,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to load participant admin overview:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Participant overview could not be loaded.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
