import { handleCallback } from '@vercel/queue';

import {
  isRewardReservationContinuationMessage,
} from '@/lib/rewards/rewardReservationContinuationQueue';
import {
  reserveEligibleReferralRewards,
} from '@/lib/rewards/rewardReservation';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ReservationQueueRow = {
  status: string;
  reserved_amount_wei: string | null;
  reserved_at: string | null;
};

type InvitationState = {
  status: string;
  reward_status: string;
};

function hasDurableReservation(
  row: ReservationQueueRow | null,
): boolean {
  if (
    !row ||
    !row.reserved_at ||
    !row.reserved_amount_wei ||
    !/^\d+$/.test(row.reserved_amount_wei) ||
    BigInt(row.reserved_amount_wei) <= 0n
  ) {
    return false;
  }

  return [
    'AWAITING_CLAIM',
    'QUEUED',
    'ASSIGNED',
  ].includes(row.status);
}

async function readReservationState(
  inviteCode: string,
): Promise<ReservationQueueRow | null> {
  const { data, error } = await supabaseAdmin
    .from('reward_queue_entries')
    .select(
      'status, reserved_amount_wei, reserved_at',
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward reservation state could not be loaded: ${error.message}`,
    );
  }

  return data as ReservationQueueRow | null;
}

async function readInvitationState(
  inviteCode: string,
): Promise<InvitationState | null> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('status, reward_status')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Reward reservation invitation state could not be loaded: ${error.message}`,
    );
  }

  return data as InvitationState | null;
}

const queueCallback = handleCallback(
  async (message, metadata) => {
    if (!isRewardReservationContinuationMessage(message)) {
      console.error(
        'Ignoring malformed reward reservation continuation message:',
        {
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
        },
      );
      return;
    }

    const before = await readReservationState(
      message.inviteCode,
    );

    if (hasDurableReservation(before)) {
      return;
    }

    const invitation = await readInvitationState(
      message.inviteCode,
    );

    if (
      !invitation ||
      invitation.status !== 'COMPLETED' ||
      invitation.reward_status !== 'ELIGIBLE'
    ) {
      return;
    }

    const sweep =
      await reserveEligibleReferralRewards();

    const after = await readReservationState(
      message.inviteCode,
    );

    if (hasDurableReservation(after)) {
      return;
    }

    const refreshedInvitation =
      await readInvitationState(
        message.inviteCode,
      );

    if (
      !refreshedInvitation ||
      refreshedInvitation.status !== 'COMPLETED' ||
      refreshedInvitation.reward_status !== 'ELIGIBLE'
    ) {
      return;
    }

    throw new Error(
      `Reward reservation continuation remains pending: attempted=${sweep.attempted}, reserved=${sweep.reserved}, awaitingFinality=${sweep.awaitingFinality}, skipped=${sweep.skipped}`,
    );
  },
  {
    visibilityTimeoutSeconds: 180,
    retry: (_error, metadata) => {
      const exponent = Math.max(
        0,
        Math.min(metadata.deliveryCount - 1, 5),
      );

      return {
        afterSeconds: Math.min(
          120,
          5 * (2 ** exponent),
        ),
      };
    },
  },
);

export function POST(request: Request) {
  return queueCallback(request);
}
