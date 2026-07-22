import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterActivityProgress,
} from '@/lib/vebetter/activity';
import {
  getVeBetterVoteProgress,
} from '@/lib/vebetter/vote';
import type {
  InviteRecord,
  InviteStatus,
} from '@/lib/types';

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  created_at: string;
  activated_at: string | null;
  activation_block:
    | number
    | string
    | null;
  apps_completed: number | null;
  rewards_received: number | null;
  vote_completed: boolean | null;
  apps_completed_at: string | null;
  apps_completed_block:
    | number
    | string
    | null;
  vote_completed_at: string | null;
  vote_completed_block:
    | number
    | string
    | null;
  vote_round_id:
    | number
    | string
    | null;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  created_at,
  activated_at,
  activation_block,
  apps_completed,
  rewards_received,
  vote_completed,
  apps_completed_at,
  apps_completed_block,
  vote_completed_at,
  vote_completed_block,
  vote_round_id
` as const;

function toInvitationRow(
  value: unknown,
): InvitationRow | null {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return null;
  }

  return value as InvitationRow;
}

function toInviteRecord(
  row: InvitationRow,
): InviteRecord {
  return {
    code: row.invite_code,
    inviterAddress:
      row.inviter_wallet,
    ...(row.invitee_wallet
      ? {
          inviteeAddress:
            row.invitee_wallet,
        }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt:
      row.activated_at ??
      row.created_at,
    rewardEligibility:
      row.status === 'COMPLETED'
        ? 'ELIGIBLE'
        : row.status ===
            'CANCELLED'
          ? 'FORFEITED'
          : row.invitee_wallet
            ? 'PENDING'
            : 'NONE',
  };
}

function parseNonNegativeInteger(
  value:
    | number
    | string
    | null,
): number | null {
  if (value === null) {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } =
    await context.params;

  const normalizedCode =
    code.toUpperCase();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq(
      'invite_code',
      normalizedCode,
    )
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load invitation:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load invitation.',
      },
      { status: 500 },
    );
  }

  const row =
    toInvitationRow(data);

  if (
    !row ||
    row.status === 'CANCELLED'
  ) {
    return NextResponse.json(
      {
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  let effectiveStatus =
    row.status;

  let appsCompleted =
    row.apps_completed ?? 0;

  let rewardsReceived =
    row.rewards_received ?? 0;

  let uniqueAppIds:
    string[] = [];

  let latestBlock:
    number | null = null;

  let appsCompletedAt =
    row.apps_completed_at;

  let appsCompletedBlock =
    parseNonNegativeInteger(
      row.apps_completed_block,
    );

  let voteCompleted =
    row.vote_completed ?? false;

  let voteCompletedAt =
    row.vote_completed_at;

  let voteCompletedBlock =
    parseNonNegativeInteger(
      row.vote_completed_block,
    );

  let voteRoundId =
    parseNonNegativeInteger(
      row.vote_round_id,
    );

  const activationBlock =
    parseNonNegativeInteger(
      row.activation_block,
    );

  let activityCheckpointSaved =
    true;

  let voteSyncPending =
    false;

  /*
   * STEP 1
   *
   * Scan B3TR rewards received
   * after the invitation started.
   */
  if (
    row.invitee_wallet &&
    activationBlock !== null
  ) {
    try {
      const activity =
        await getVeBetterActivityProgress(
          {
            receiverAddress:
              row.invitee_wallet,
            activationBlock,
          },
        );

      appsCompleted =
        activity.appsCompleted;

      rewardsReceived =
        activity.appsCompleted;

      uniqueAppIds =
        activity.uniqueAppIds;

      latestBlock =
        activity.latestBlock;

      const reachedThreeApps =
        appsCompleted >= 3;

      if (
        reachedThreeApps &&
        activity.thirdAppCompletedBlock ===
          null
      ) {
        throw new Error(
          'Three apps were detected without a valid third-app completion block.',
        );
      }

      /*
       * Always use the actual block of
       * the third distinct app reward.
       *
       * This also repairs Preview rows
       * that previously stored the block
       * at which VeInvite refreshed.
       */
      const correctCompletionBlock =
        reachedThreeApps
          ? activity
              .thirdAppCompletedBlock
          : null;

      const needsProgressUpdate =
        appsCompleted !==
          (row.apps_completed ??
            0) ||
        rewardsReceived !==
          (row.rewards_received ??
            0);

      const needsCheckpointUpdate =
        correctCompletionBlock !==
          null &&
        (
          !appsCompletedAt ||
          appsCompletedBlock !==
            correctCompletionBlock
        );

      if (
        correctCompletionBlock !==
        null
      ) {
        appsCompletedAt ??=
          new Date().toISOString();

        appsCompletedBlock =
          correctCompletionBlock;
      }

      if (
        needsProgressUpdate ||
        needsCheckpointUpdate
      ) {
        const updatePayload: {
          apps_completed: number;
          rewards_received: number;
          apps_completed_at?: string;
          apps_completed_block?: number;
        } = {
          apps_completed:
            appsCompleted,
          rewards_received:
            rewardsReceived,
        };

        if (
          correctCompletionBlock !==
          null &&
          appsCompletedAt
        ) {
          updatePayload.apps_completed_at =
            appsCompletedAt;

          updatePayload.apps_completed_block =
            correctCompletionBlock;
        }

        const {
          error: updateError,
        } = await supabaseAdmin
          .from('invitations')
          .update(updatePayload)
          .eq(
            'invite_code',
            normalizedCode,
          );

        if (updateError) {
          activityCheckpointSaved =
            false;

          console.error(
            'Failed to save activity progress:',
            updateError,
          );
        }
      }
    } catch (
      activityError
    ) {
      console.error(
        'Failed to verify VeBetter activity:',
        activityError,
      );
    }
  }

  /*
   * STEP 2
   *
   * After the third distinct app
   * reward, scan for the first
   * allocation governance vote.
   */
  if (
    row.invitee_wallet &&
    appsCompleted >= 3 &&
    appsCompletedBlock !== null &&
    !voteCompleted
  ) {
    try {
      const vote =
        await getVeBetterVoteProgress(
          {
            voterAddress:
              row.invitee_wallet,
            fromBlock:
              appsCompletedBlock,
          },
        );

      if (vote.voteCompleted) {
        const detectedVoteAt =
          new Date().toISOString();

        const {
          error: voteUpdateError,
        } = await supabaseAdmin
          .from('invitations')
          .update({
            apps_completed:
              appsCompleted,
            rewards_received:
              rewardsReceived,
            apps_completed_at:
              appsCompletedAt,
            apps_completed_block:
              appsCompletedBlock,
            vote_completed: true,
            vote_completed_at:
              detectedVoteAt,
            vote_completed_block:
              vote.voteCompletedBlock,
            vote_round_id:
              vote.voteRoundId,
            status: 'COMPLETED',
          })
          .eq(
            'invite_code',
            normalizedCode,
          );

        /*
         * Do not show COMPLETED unless
         * the completion was actually
         * stored in Supabase.
         */
        if (voteUpdateError) {
          voteSyncPending = true;

          console.error(
            'Vote was found but completion could not be saved:',
            voteUpdateError,
          );
        } else {
          voteCompleted = true;

          voteCompletedAt =
            detectedVoteAt;

          voteCompletedBlock =
            vote.voteCompletedBlock;

          voteRoundId =
            vote.voteRoundId;

          effectiveStatus =
            'COMPLETED';

          activityCheckpointSaved =
            true;
        }
      }
    } catch (
      voteError
    ) {
      console.error(
        'Failed to verify VeBetter vote:',
        voteError,
      );
    }
  }

  const responseRow: InvitationRow = {
    ...row,
    status:
      effectiveStatus,
    apps_completed:
      appsCompleted,
    rewards_received:
      rewardsReceived,
    vote_completed:
      voteCompleted,
    apps_completed_at:
      appsCompletedAt,
    apps_completed_block:
      appsCompletedBlock,
    vote_completed_at:
      voteCompletedAt,
    vote_completed_block:
      voteCompletedBlock,
    vote_round_id:
      voteRoundId,
  };

  return NextResponse.json({
    invite:
      toInviteRecord(
        responseRow,
      ),

    progress: {
      appsCompleted,
      appsRequired: 3,
      rewardsReceived,
      voteCompleted,
      uniqueAppIds,
      activationBlock,
      latestBlock,
      appsCompletedAt,
      appsCompletedBlock,
      voteCompletedAt,
      voteCompletedBlock,
      voteRoundId,
      activityCheckpointSaved,
      voteSyncPending,
    },
  });
}
