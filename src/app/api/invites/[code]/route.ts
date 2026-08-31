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
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  InviteRecord,
} from '@/lib/types';
import {
  MIN_VOT3_CONVERSION_WEI,
} from '@/lib/vebetter/vot3Conversion';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const INVITE_READ_CODE_LIMIT = 720;
const INVITE_READ_IP_LIMIT = 1440;
const INVITE_SYNC_CODE_LIMIT = 240;
const INVITE_SYNC_IP_LIMIT = 480;
const INVITE_WINDOW_SECONDS = 60 * 60;

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

function parseNonNegativeInteger(
  value: number | string | null,
): number | null {
  if (value === null) return null;
  const parsed =
    typeof value === 'number'
      ? value
      : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function toStoredProgress(
  row: InvitationEvidenceRow,
) {
  return {
    appsCompleted: row.apps_completed ?? 0,
    appsRequired: 3 as const,
    rewardsReceived: row.rewards_received ?? 0,
    vot3Converted: row.vot3_converted ?? false,
    vot3MinimumAmountWei:
      MIN_VOT3_CONVERSION_WEI.toString(),
    vot3ConversionAmountWei:
      row.vot3_conversion_amount_wei,
    voteCompleted: row.vote_completed ?? false,
    uniqueAppIds: [] as string[],
    activationBlock:
      parseNonNegativeInteger(row.activation_block),
    latestBlock:
      parseNonNegativeInteger(
        row.impact_last_synced_block,
      ),
  };
}

function invalidInviteResponse() {
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

async function loadInvitation(
  normalizedCode: string,
): Promise<InvitationEvidenceRow | null> {
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
    throw new Error(
      `Failed to load invitation: ${error.message}`,
    );
  }

  const row = toInvitationRow(data);
  if (!row || row.status === 'CANCELLED') {
    return null;
  }

  return row;
}

async function enforceInviteRateLimit({
  request,
  normalizedCode,
  mode,
}: {
  request: NextRequest;
  normalizedCode: string;
  mode: 'read' | 'sync';
}) {
  const clientIp = getClientIpSubject(request);
  const sync = mode === 'sync';

  return enforceRateLimits([
    {
      scope: sync
        ? 'invite_progress_sync_code'
        : 'invite_progress_read_code',
      subject: normalizedCode,
      limit: sync
        ? INVITE_SYNC_CODE_LIMIT
        : INVITE_READ_CODE_LIMIT,
      windowSeconds: INVITE_WINDOW_SECONDS,
    },
    clientIp
      ? {
          scope: sync
            ? 'invite_progress_sync_ip'
            : 'invite_progress_read_ip',
          subject: clientIp,
          limit: sync
            ? INVITE_SYNC_IP_LIMIT
            : INVITE_READ_IP_LIMIT,
          windowSeconds: INVITE_WINDOW_SECONDS,
        }
      : null,
  ]);
}

async function resolveCode(
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } = await context.params;
  const normalizedCode = code.trim().toUpperCase();

  return INVITE_CODE_PATTERN.test(normalizedCode)
    ? normalizedCode
    : null;
}

/**
 * Passive public read.
 *
 * GET deliberately never performs chain reconciliation or starts the reward
 * worker. This prevents link previews, crawlers, browser prefetchers and
 * cross-site navigations from causing expensive RPC work or payout attempts.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const normalizedCode = await resolveCode(context);
  if (!normalizedCode) return invalidInviteResponse();

  const rateLimitResponse =
    await enforceInviteRateLimit({
      request,
      normalizedCode,
      mode: 'read',
    });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const row = await loadInvitation(normalizedCode);
    if (!row) return invalidInviteResponse();

    return NextResponse.json(
      {
        invite: toInviteRecord(row),
        progress: toStoredProgress(row),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
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
}

/**
 * Explicit reconciliation request.
 *
 * Browser POSTs are covered by the centralized same-origin / Fetch Metadata
 * guard in src/proxy.ts. This route remains public because the invitee mission
 * page must be able to reconcile before a reward exists; valid invite codes,
 * bounded rate limits and the underlying immutable evidence checks remain the
 * authorization boundary for progress observation.
 */
export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const normalizedCode = await resolveCode(context);
  if (!normalizedCode) return invalidInviteResponse();

  const rateLimitResponse =
    await enforceInviteRateLimit({
      request,
      normalizedCode,
      mode: 'sync',
    });
  if (rateLimitResponse) return rateLimitResponse;

  let row: InvitationEvidenceRow | null;
  try {
    row = await loadInvitation(normalizedCode);
  } catch (error) {
    console.error(
      'Failed to load invitation for reconciliation:',
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

  if (!row) return invalidInviteResponse();

  try {
    const synced =
      await syncInvitationEvidence(row);

    // Once immutable on-chain evidence has promoted the referral to a verified
    // completed/eligible state, make one fail-closed automatic payout attempt.
    // The payout worker remains independently protected by its DB lease,
    // immutable manifest/checkpoint, signed-transaction journal, chain finality
    // verification and reward runtime gates.
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
        invite: toInviteRecord(synced.row),
        progress: synced.progress,
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
