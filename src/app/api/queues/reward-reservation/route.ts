import { handleCallback } from '@vercel/queue';

import {
  isRewardReservationContinuationMessage,
} from '@/lib/rewards/rewardReservationContinuationQueue';
import {
  reserveEligibleReferralRewards,
} from '@/lib/rewards/rewardReservation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { ensureSybilV2ReadyForReward } from '@/lib/sybil/v2/pipeline';
import { isSybilV2EnforcementEnabled } from '@/lib/sybil/v2/rollout';

// Do not occupy Vercel's full 300-second function window waiting on
// PostgREST when the database/schema cache is unavailable. A failed read
// stays fail-closed and Vercel Queue may back off before retrying.
const RESERVATION_QUEUE_READ_TIMEOUT_MS = 8_000;
const RESERVATION_DB_OUTAGE_BACKOFF_SECONDS = 900;

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
    .abortSignal(AbortSignal.timeout(RESERVATION_QUEUE_READ_TIMEOUT_MS))
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
    .abortSignal(AbortSignal.timeout(RESERVATION_QUEUE_READ_TIMEOUT_MS))
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

    // CLEAR proof messages are revision-scoped. Older revisions must not
    // continually reassess and reprice a newer verdict. The current proof
    // and durable liveness recovery remain the authoritative wake-ups.
    if (
      message.trigger === 'SYBIL_CLEARANCE' &&
      typeof message.assessmentRevision === 'number'
    ) {
      const { data: assessment, error: assessmentError } =
        await supabaseAdmin
          .from('sybil_v2_referral_assessments')
          .select('revision,state')
          .eq('invite_code', message.inviteCode)
          .abortSignal(AbortSignal.timeout(RESERVATION_QUEUE_READ_TIMEOUT_MS))
          .maybeSingle();

      if (assessmentError) {
        throw new Error(
          `Sybil clearance revision could not be loaded: ${assessmentError.message}`,
        );
      }

      const latestRevision = Number(assessment?.revision);
      // A clearance event may outlive the assessment that issued it.
      // Do not process stale proofs or a referral that has since reverted
      // to pending review. A subsequent fresh clearance or the durable
      // recovery sweep is responsible for resuming the reservation.
      if (
        !assessment ||
        !Number.isSafeInteger(latestRevision) ||
        latestRevision !== message.assessmentRevision ||
        (assessment.state !== 'CLEAR' && assessment.state !== 'WATCH')
      ) {
        return;
      }
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

    const sybilV2Enforced =
      await isSybilV2EnforcementEnabled();

    try {
      const sybilV2 =
        await ensureSybilV2ReadyForReward(
          message.inviteCode,
        );

      if (sybilV2Enforced) {
        if (
          sybilV2.state === 'HOLD' ||
          sybilV2.state === 'RESTRICTED'
        ) {
          // A durable security review/restriction is not a transient Queue
          // error once enforcement is live. Leave the reward unreserved until
          // the operator explicitly clears it.
          return;
        }

        if (
          !(
            (sybilV2.state === 'CLEAR' ||
              sybilV2.state === 'WATCH') &&
            sybilV2.clearanceIssued
          )
        ) {
          throw new Error(
            `Sybil v2 clearance is not ready for ${message.inviteCode}: ${sybilV2.state}`,
          );
        }
      }
    } catch (sybilV2Error) {
      if (sybilV2Enforced) {
        throw sybilV2Error;
      }

      // Shadow mode records/retries analysis but must never block the legacy
      // reservation path because of v2 state or a transient v2 failure.
      console.warn(
        'Ignoring Sybil v2 reservation gate during shadow mode:',
        {
          inviteCode: message.inviteCode,
          error: sybilV2Error,
        },
      );
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
      `Reward reservation continuation remains pending: trigger=${message.trigger ?? 'LEGACY'}, assessmentRevision=${message.assessmentRevision ?? 'none'}, attempted=${sweep.attempted}, reserved=${sweep.reserved}, awaitingFinality=${sweep.awaitingFinality}, skipped=${sweep.skipped}`,
    );
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (error, metadata) => {
      // Recovery sweeps retain durable liveness authority after Queue
      // exhaustion. Avoid retrying a persistently failing message forever.
      if (metadata.deliveryCount >= 10) {
        console.error('Reward reservation Queue retries exhausted; recovery remains pending:', {
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
          error: error instanceof Error ? error.message : String(error),
        });
        return { acknowledge: true };
      }

      const errorText = error instanceof Error ? error.message : String(error);
      // A transient database outage is not evidence that a referral should
      // be permanently discarded. Back off rather than flooding a failed
      // schema-cache/PostgREST endpoint with overlapping Queue attempts.
      if (
        /PGRST002|could not query the database for the schema cache|upstream request timeout|connection (?:terminated|timeout)|abort|timed? ?out|timeout|HTTP 50[34]/i.test(errorText)
      ) {
        console.warn('Reward reservation Queue deferring database outage:', {
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
        });
        return { afterSeconds: RESERVATION_DB_OUTAGE_BACKOFF_SECONDS };
      }

      const exponent = Math.max(
        0,
        Math.min(metadata.deliveryCount - 1, 7),
      );

      return {
        afterSeconds: Math.min(
          900,
          30 * (2 ** exponent),
        ),
      };
    },
  },
);

export function POST(request: Request) {
  return queueCallback(request);
}
