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
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const INVITE_READ_CODE_LIMIT = 720;
const INVITE_READ_IP_LIMIT = 7200;
const INVITE_SYNC_CODE_LIMIT = 240;
const INVITE_SYNC_IP_LIMIT = 2400;
const INVITE_WINDOW_SECONDS = 60 * 60;

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at,
  eligibility_check_id,
  ineligibility_check_id,
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

type InvitationRouteRow = InvitationEvidenceRow & {
  eligibility_check_id: string | number | null;
  ineligibility_check_id: string | number | null;
};

function toInvitationRow(
  value: unknown,
): InvitationRouteRow | null {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return null;
  }

  return value as InvitationRouteRow;
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

function closedIneligibleInviteResponse() {
  return NextResponse.json(
    {
      error:
        'This invitation has ended. Please ask the inviter for a new link.',
      outcome: 'ineligible_invite_closed',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function legacyIneligibleInviteResponse() {
  return NextResponse.json(
    {
      error:
        'This wallet does not currently meet VeInvite participation requirements.',
      outcome: 'active_existing_user',
    },
    {
      status: 422,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function walletAuthResponse(
  error: unknown,
): NextResponse | null {
  if (error instanceof WalletAuthenticationError) {
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

  return null;
}

async function loadInvitation(
  normalizedCode: string,
): Promise<InvitationRouteRow | null> {
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
  if (!row) return null;

  // A normal inviter cancellation is a generic unavailable link. A system-
  // closed ineligible link is retained long enough to return a neutral terminal
  // response without pretending that a future visitor is the rejected wallet.
  if (
    row.status === 'CANCELLED' &&
    row.ineligibility_check_id === null
  ) {
    return null;
  }

  return row;
}

async function isVerifiedLegacyIneligibleInvitation(
  row: InvitationRouteRow,
): Promise<boolean> {
  // New terminal rejections have their own explicit marker and use the neutral
  // closed-link response because the rejected wallet is intentionally not bound
  // to the invitation row.
  if (row.ineligibility_check_id !== null) {
    return false;
  }

  // Modern accepted invitations have immutable eligible entry proof and must
  // never be overridden by a legacy backfill lookup.
  if (row.eligibility_check_id !== null) {
    return false;
  }

  // A fresh pending invitation has not been consumed or historically accepted.
  if (row.status === 'PENDING_ACCEPTANCE') {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('legacy_entry_classification_backfill')
    .select('id')
    .eq('invite_code', row.invite_code)
    .eq('classification_status', 'VERIFIED')
    .eq('entry_class', 'ACTIVE_EXISTING')
    .eq('outcome', 'EXISTING_VEBETTER_USER')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load historical invitation eligibility: ${error.message}`,
    );
  }

  return Boolean(data);
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

  if (mode === 'read') {
    return enforceRateLimits([
      {
        scope: 'invite_progress_code',
        subject: normalizedCode,
        limit: INVITE_READ_CODE_LIMIT,
        windowSeconds: INVITE_WINDOW_SECONDS,
      },
      clientIp
        ? {
            scope: 'invite_progress_ip',
            subject: clientIp,
            limit: INVITE_READ_IP_LIMIT,
            windowSeconds: INVITE_WINDOW_SECONDS,
          }
        : null,
    ]);
  }

  return enforceRateLimits([
    {
      scope: 'invite_progress_sync_code',
      subject: normalizedCode,
      limit: INVITE_SYNC_CODE_LIMIT,
      windowSeconds: INVITE_WINDOW_SECONDS,
    },
    clientIp
      ? {
          scope: 'invite_progress_sync_ip',
          subject: clientIp,
          limit: INVITE_SYNC_IP_LIMIT,
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
    if (row.ineligibility_check_id !== null) {
      return closedIneligibleInviteResponse();
    }
    if (await isVerifiedLegacyIneligibleInvitation(row)) {
      return legacyIneligibleInviteResponse();
    }

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
 * Reconciliation is available only to an authenticated wallet that owns this
 * accepted referral: either the bound invitee or its inviter. The invite page
 * and Home are both wrapped in WalletSessionGate. This lets the verified
 * inviter provide a low-frequency recovery sync without reopening expensive
 * chain scans to leaked/shared invite codes or anonymous scripts.
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

  let sessionWallet: string;
  try {
    const session = await requireWalletSession({ request });
    sessionWallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate invitation reconciliation session:',
      error,
    );
    return NextResponse.json(
      {
        error:
          'Failed to validate wallet verification.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let row: InvitationRouteRow | null;
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

  const normalizedInvitee =
    row.invitee_wallet?.toLowerCase() ?? null;
  const normalizedInviter =
    row.inviter_wallet.toLowerCase();
  const sessionOwnsReferral =
    normalizedInvitee !== null &&
    (
      normalizedInvitee === sessionWallet ||
      normalizedInviter === sessionWallet
    );

  if (!sessionOwnsReferral) {
    return NextResponse.json(
      {
        error:
          'The verified wallet does not match this invitation.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const rateLimitResponse =
    await enforceInviteRateLimit({
      request,
      normalizedCode,
      mode: 'sync',
    });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    if (row.ineligibility_check_id !== null) {
      return closedIneligibleInviteResponse();
    }
    if (await isVerifiedLegacyIneligibleInvitation(row)) {
      return legacyIneligibleInviteResponse();
    }

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
