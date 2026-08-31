import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import {
  runAutomaticRewardPayout,
} from '@/lib/rewards/automaticRewardPayout';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  InviteRecord,
} from '@/lib/types';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const INVITE_READ_CODE_LIMIT = 360;
const INVITE_READ_IP_LIMIT = 720;
const INVITE_READ_WINDOW_SECONDS = 60 * 60;

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at,
  activated_at,
  activation_block,
  activation_network,
  apps_completed,
  rewards_received,
  apps_completed_at,
  apps_completed_block,
  vot3_converted,
  vot3_converted_at,
  vot3_converted_block,
  vot3_conversion_tx_id,
  vot3_conversion_amount_wei,
  vote_completed,
  vote_completed_at,
  vote_completed_block,
  vote_round_id,
  sybil_status,
  sybil_risk_level,
  sybil_risk_score,
  sybil_reason,
  sybil_checked_at,
  sybil_source,
  impact_last_synced_block,
  impact_last_synced_at,
  impact_sync_complete_at
` as const;

function toInvitationRow(
  value: unknown,
): InvitationEvidenceRow | null {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return null;
  }

  return value as InvitationEvidenceRow;
}

function toInviteRecord(
  row: InvitationEvidenceRow,
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
    updatedAt: row.updated_at,
    rewardEligibility:
      row.reward_status,
  };
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } =
    await context.params;

  const normalizedCode =
    code.trim().toUpperCase();

  // Reject impossible codes before touching shared rate-limit storage, the
  // database, or VeChain. Generated VeInvite codes are exactly seven symbols
  // from the ambiguity-safe alphabet in createCode().
  if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
    return NextResponse.json(
      {
        error:
          'Invite link is invalid or cancelled.',
      },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const clientIp =
    getClientIpSubject(request);

  // This public endpoint can perform multiple on-chain reads while an accepted
  // invitation is active. Keep normal 30-second polling and a few open tabs
  // comfortably below the limit while bounding accidental refresh loops and
  // deliberate repeated scans. The shared limiter stores hashes only.
  const rateLimitResponse =
    await enforceRateLimits([
      {
        scope: 'invite_progress_code',
        subject: normalizedCode,
        limit: INVITE_READ_CODE_LIMIT,
        windowSeconds:
          INVITE_READ_WINDOW_SECONDS,
      },
      clientIp
        ? {
            scope: 'invite_progress_ip',
            subject: clientIp,
            limit: INVITE_READ_IP_LIMIT,
            windowSeconds:
              INVITE_READ_WINDOW_SECONDS,
          }
        : null,
    ]);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
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
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const synced =
      await syncInvitationEvidence(
        row,
      );

    // Once immutable on-chain evidence has promoted the referral to a verified
    // completed/eligible state, make one fail-closed automatic payout attempt.
    // Repeated polling is safe: the worker uses a DB lease, immutable manifest,
    // deterministic signed transaction journal and unique settlement records.
    // Any payout infrastructure failure must not turn a valid invite-progress
    // read into an error, so this remains best-effort and independently logged.
    if (
      synced.row.status === 'COMPLETED' &&
      synced.row.reward_status === 'ELIGIBLE'
    ) {
      try {
        await runAutomaticRewardPayout();
      } catch (rewardError) {
        console.error(
          'Automatic VeInvite reward payout iteration failed:',
          rewardError,
        );
      }
    }

    return NextResponse.json(
      {
        invite:
          toInviteRecord(
            synced.row,
          ),
        progress:
          synced.progress,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (syncError) {
    console.error(
      'Failed to reconcile invitation evidence:',
      syncError,
    );

    // Do not pretend stale or partially reconciled data is current. The
    // invitation remains intact and can be retried without consuming any
    // additional invite or reward state.
    return NextResponse.json(
      {
        error:
          'Invitation activity could not be verified right now. Please try again.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '10',
        },
      },
    );
  }
}
