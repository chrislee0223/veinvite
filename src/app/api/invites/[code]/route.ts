import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterActivityProgress,
} from '@/lib/vebetter/activity';
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
  activation_block: number | string | null;
  apps_completed: number | null;
  rewards_received: number | null;
  vote_completed: boolean | null;
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
  vote_completed
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
    inviterAddress: row.inviter_wallet,
    ...(row.invitee_wallet
      ? {
          inviteeAddress: row.invitee_wallet,
        }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt:
      row.activated_at ?? row.created_at,
    rewardEligibility:
      row.status === 'COMPLETED'
        ? 'ELIGIBLE'
        : row.status === 'CANCELLED'
          ? 'FORFEITED'
          : row.invitee_wallet
            ? 'PENDING'
            : 'NONE',
  };
}

function parseActivationBlock(
  value: number | string | null,
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
  const { code } = await context.params;
  const normalizedCode = code.toUpperCase();

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq('invite_code', normalizedCode)
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load invitation:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Failed to load invitation.',
      },
      { status: 500 },
    );
  }

  const row = toInvitationRow(data);

  if (!row || row.status === 'CANCELLED') {
    return NextResponse.json(
      {
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  let appsCompleted =
    row.apps_completed ?? 0;

  let rewardsReceived =
    row.rewards_received ?? 0;

  let uniqueAppIds: string[] = [];
  let latestBlock: number | null = null;

  const activationBlock =
    parseActivationBlock(
      row.activation_block,
    );

  if (
    row.invitee_wallet &&
    activationBlock !== null
  ) {
    try {
      const activity =
        await getVeBetterActivityProgress({
          receiverAddress:
            row.invitee_wallet,
          activationBlock,
        });

      appsCompleted =
        activity.appsCompleted;

      /*
       * A counted app only qualifies after
       * at least one B3TR reward was received
       * from that unique VeBetter app.
       *
       * Therefore the minimum qualifying
       * reward progress is the same as the
       * unique-app progress, capped at 3.
       */
      rewardsReceived =
        activity.appsCompleted;

      uniqueAppIds =
        activity.uniqueAppIds;

      latestBlock =
        activity.latestBlock;

      if (
        appsCompleted !==
          (row.apps_completed ?? 0) ||
        rewardsReceived !==
          (row.rewards_received ?? 0)
      ) {
        const {
          error: updateError,
        } = await supabaseAdmin
          .from('invitations')
          .update({
            apps_completed:
              appsCompleted,
            rewards_received:
              rewardsReceived,
          })
          .eq(
            'invite_code',
            normalizedCode,
          );

        if (updateError) {
          console.error(
            'Failed to save activity progress:',
            updateError,
          );
        }
      }
    } catch (activityError) {
      console.error(
        'Failed to verify VeBetter activity:',
        activityError,
      );
    }
  }

  return NextResponse.json({
    invite: toInviteRecord(row),

    progress: {
      appsCompleted,
      appsRequired: 3,
      rewardsReceived,
      voteCompleted:
        row.vote_completed ?? false,
      uniqueAppIds,
      activationBlock,
      latestBlock,
    },
  });
}
