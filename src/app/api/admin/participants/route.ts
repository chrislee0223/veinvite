import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

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

function idKey(value: string | number | null) {
  return value === null ? '' : String(value);
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();

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

    const [
      eligibilityResult,
      invitationsResult,
      queueResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('eligibility_check_events')
        .select(
          'id, invite_code, wallet_address, network, checked_block, outcome, entry_class, created_at',
        )
        .eq('network', pool.network)
        .order('created_at', { ascending: false })
        .limit(250),
      supabaseAdmin
        .from('invitations')
        .select(
          'invite_code, inviter_wallet, invitee_wallet, status, reward_status, apps_completed, rewards_received, vot3_converted, vote_completed, reward_eligible_at, reward_paid_at, sybil_status, sybil_risk_level, impact_last_synced_at, activated_at, updated_at, eligibility_check_id',
        )
        .order('created_at', { ascending: false })
        .limit(500),
      supabaseAdmin
        .from('reward_queue_entries')
        .select(
          'invite_code, entry_class, status, assigned_round_id, queued_at, assigned_at',
        )
        .eq('network', pool.network)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (eligibilityResult.error) {
      throw new Error(
        `Eligibility checks could not be loaded: ${eligibilityResult.error.message}`,
      );
    }

    if (invitationsResult.error) {
      throw new Error(
        `Invitations could not be loaded: ${invitationsResult.error.message}`,
      );
    }

    if (queueResult.error) {
      throw new Error(
        `Reward queue could not be loaded: ${queueResult.error.message}`,
      );
    }

    const eligibilityChecks =
      (eligibilityResult.data ?? []) as EligibilityCheckRow[];
    const invitations =
      (invitationsResult.data ?? []) as InvitationRow[];
    const queueEntries =
      (queueResult.data ?? []) as RewardQueueRow[];

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
        const invitation =
          invitationByEligibilityCheck.get(
            idKey(check.id),
          ) ??
          invitationByCode.get(check.invite_code) ??
          null;
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
