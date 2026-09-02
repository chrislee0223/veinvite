import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import {
  normalizeAddress,
} from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import {
  checkVeBetterEntryEligibility,
  ENTRY_ELIGIBILITY_RULE_VERSION,
  RETURNING_USER_DORMANCY_ROUNDS,
  type EntryClass,
  type EntryEligibilityResult,
} from '@/lib/vebetter/entryEligibility';
import type {
  InviteRecord,
  InviteStatus,
  RewardEligibility,
} from '@/lib/types';

type InvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: InviteStatus;
  reward_status: RewardEligibility;
  created_at: string;
  updated_at: string;
};

type ClaimRpcResult = {
  result?:
    | 'CLAIMED'
    | 'NOT_FOUND'
    | 'CANCELLED'
    | 'ALREADY_USED'
    | 'SELF_REFERRAL'
    | 'ALREADY_REFERRED';
  entry_class?:
    | 'NEW'
    | 'RETURNING';
  invite_code?: string;
  inviter_wallet?: string;
  invitee_wallet?: string;
  status?: InviteStatus;
  reward_status?: RewardEligibility;
  created_at?: string;
  updated_at?: string;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at
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
    updatedAt: row.updated_at,
    rewardEligibility:
      row.reward_status,
  };
}

function rpcResultToInvitation(
  value: ClaimRpcResult,
): InvitationRow | null {
  if (
    value.result !== 'CLAIMED' ||
    !value.invite_code ||
    !value.inviter_wallet ||
    !value.invitee_wallet ||
    !value.status ||
    !value.reward_status ||
    !value.created_at ||
    !value.updated_at
  ) {
    return null;
  }

  return {
    invite_code: value.invite_code,
    inviter_wallet: value.inviter_wallet,
    invitee_wallet: value.invitee_wallet,
    status: value.status,
    reward_status: value.reward_status,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function toStoredEntryClass(
  entryClass: EntryClass,
): 'NEW' | 'RETURNING' | 'ACTIVE_EXISTING' {
  switch (entryClass) {
    case 'new_user':
      return 'NEW';
    case 'returning_user':
      return 'RETURNING';
    case 'active_existing_user':
      return 'ACTIVE_EXISTING';
  }
}

function buildEntryCheckDetails(
  entryCheck: EntryEligibilityResult,
) {
  return {
    ruleVersion:
      ENTRY_ELIGIBILITY_RULE_VERSION,
    definition:
      'NEW has no prior rewarded/allocation-voting VeBetter history. RETURNING has historical activity but none from the start of the previous 12 completed rounds through the sealed check block. ACTIVE_EXISTING has activity in that recent window.',
    entryClass:
      toStoredEntryClass(
        entryCheck.entryClass,
      ),
    dormancyRoundCount:
      RETURNING_USER_DORMANCY_ROUNDS,
    currentRoundId:
      entryCheck.dormancyWindow
        .currentRoundId,
    oldestCompletedRoundId:
      entryCheck.dormancyWindow
        .oldestCompletedRoundId,
    newestCompletedRoundId:
      entryCheck.dormancyWindow
        .newestCompletedRoundId,
    completedRoundIds:
      entryCheck.dormancyWindow
        .completedRoundIds,
    dormancyStartBlock:
      entryCheck.dormancyWindow
        .dormancyStartBlock,
    newestCompletedRoundEndBlock:
      entryCheck.dormancyWindow
        .newestCompletedRoundEndBlock,
    checkedThroughBlock:
      entryCheck.checkedBlock,
    ongoingRoundGuard: true,
  };
}

async function recordRejectedEntryCheck({
  inviteCode,
  walletAddress,
  entryCheck,
}: {
  inviteCode: string;
  walletAddress: string;
  entryCheck: EntryEligibilityResult;
}): Promise<boolean> {
  const rewardEvidence =
    entryCheck.recentRewardEvent ??
    entryCheck.priorRewardEvent;
  const voteEvidence =
    entryCheck.recentVoteEvent ??
    entryCheck.priorVoteEvent;

  const { error } = await supabaseAdmin
    .from('eligibility_check_events')
    .insert({
      invite_code: inviteCode,
      wallet_address: walletAddress,
      network: entryCheck.network,
      checked_block:
        entryCheck.checkedBlock,
      outcome: 'EXISTING_VEBETTER_USER',
      entry_class: 'ACTIVE_EXISTING',
      prior_reward_tx_id:
        rewardEvidence?.txId ?? null,
      prior_vote_tx_id:
        voteEvidence?.txId ?? null,
      details:
        buildEntryCheckDetails(
          entryCheck,
        ),
    });

  if (error) {
    // The rejection and the invitation closure are one database transaction via
    // the eligibility trigger. If persistence fails, do not claim the terminal
    // rejection succeeded: keep the invitation untouched and ask for a retry.
    console.error(
      'Failed to persist rejected VeBetter entry check:',
      error,
    );
    return false;
  }

  return true;
}

function claimConflictResponse(
  result: ClaimRpcResult['result'],
) {
  switch (result) {
    case 'NOT_FOUND':
    case 'CANCELLED':
      return NextResponse.json(
        {
          outcome: 'invalid_or_cancelled',
          error:
            'Invite link is invalid or cancelled.',
        },
        { status: 404 },
      );

    case 'SELF_REFERRAL':
      return NextResponse.json(
        {
          outcome: 'self_referral',
        },
        { status: 422 },
      );

    case 'ALREADY_REFERRED':
      return NextResponse.json(
        {
          outcome: 'already_referred',
        },
        { status: 422 },
      );

    case 'ALREADY_USED':
    default:
      return NextResponse.json(
        {
          outcome: 'already_used',
          error:
            'This invite link has already been used.',
        },
        { status: 409 },
      );
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } = await context.params;
  const normalizedCode =
    code.trim().toUpperCase();

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
        outcome: 'server_error',
        error: 'Failed to load invitation.',
      },
      { status: 500 },
    );
  }

  const invitation =
    toInvitationRow(data);

  if (
    !invitation ||
    invitation.status === 'CANCELLED'
  ) {
    return NextResponse.json(
      {
        outcome: 'invalid_or_cancelled',
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  if (invitation.invitee_wallet) {
    return NextResponse.json(
      {
        outcome: 'already_used',
        error:
          'This invite link has already been used.',
      },
      { status: 409 },
    );
  }

  let body: {
    inviteeAddress?: string;
  };

  try {
    body = (await request.json()) as {
      inviteeAddress?: string;
    };
  } catch {
    return NextResponse.json(
      {
        outcome: 'invalid_request',
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    );
  }

  if (!body.inviteeAddress) {
    return NextResponse.json(
      {
        outcome: 'invalid_request',
        error: 'inviteeAddress is required',
      },
      { status: 400 },
    );
  }

  const inviteeAddress =
    normalizeAddress(body.inviteeAddress);

  if (
    !/^0x[0-9a-f]{40}$/.test(
      inviteeAddress,
    )
  ) {
    return NextResponse.json(
      {
        outcome: 'invalid_request',
        error: 'Invalid invitee wallet.',
      },
      { status: 400 },
    );
  }

  try {
    await requireWalletSession({
      request,
      expectedWallet: inviteeAddress,
    });
  } catch (authError) {
    if (
      authError instanceof
      WalletAuthenticationError
    ) {
      return NextResponse.json(
        {
          outcome:
            'wallet_verification_failed',
          error: authError.message,
        },
        {
          status: authError.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to validate invitee wallet session:',
      authError,
    );

    return NextResponse.json(
      {
        outcome: 'server_error',
        error:
          'Failed to validate wallet verification.',
      },
      { status: 500 },
    );
  }

  const clientIp =
    getClientIpSubject(request);
  const rateLimitResponse =
    await enforceRateLimits([
      clientIp
        ? {
            scope: 'invite_claim_ip',
            subject: clientIp,
            limit: 20,
            windowSeconds: 300,
          }
        : null,
      {
        scope: 'invite_claim_wallet',
        subject: inviteeAddress,
        limit: 6,
        windowSeconds: 300,
      },
    ]);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (
    inviteeAddress ===
    normalizeAddress(
      invitation.inviter_wallet,
    )
  ) {
    // Friendly rejection only: no ban, no penalty, and the invite is not
    // consumed.
    return NextResponse.json(
      {
        outcome: 'self_referral',
      },
      { status: 422 },
    );
  }

  // Cheap local duplicate check before the chain scan. The atomic RPC repeats
  // this check under the invitation lock to close the race window.
  const {
    data: existingRows,
    error: existingError,
  } = await supabaseAdmin
    .from('invitations')
    .select('invite_code')
    .eq('invitee_wallet', inviteeAddress)
    .limit(1);

  if (existingError) {
    console.error(
      'Failed to check existing invitee:',
      existingError,
    );

    return NextResponse.json(
      {
        outcome: 'server_error',
        error:
          'Failed to check existing referral.',
      },
      { status: 500 },
    );
  }

  if (
    Array.isArray(existingRows) &&
    existingRows.length > 0
  ) {
    return NextResponse.json(
      {
        outcome: 'already_referred',
      },
      { status: 422 },
    );
  }

  let entryCheck:
    Awaited<
      ReturnType<
        typeof checkVeBetterEntryEligibility
      >
    >;

  try {
    entryCheck =
      await checkVeBetterEntryEligibility({
        walletAddress: inviteeAddress,
      });
  } catch (eligibilityError) {
    console.error(
      'Failed to verify VeBetter entry history:',
      eligibilityError,
    );

    // Fail closed. Chain/indexing/round-clock failures must never silently
    // classify a recently active VeBetter wallet as NEW or RETURNING.
    return NextResponse.json(
      {
        outcome:
          'eligibility_check_failed',
        error:
          'VeBetter activity history could not be verified. The invite was not used. Please try again.',
      },
      { status: 503 },
    );
  }

  if (
    entryCheck.entryClass ===
    'active_existing_user'
  ) {
    const recorded =
      await recordRejectedEntryCheck({
        inviteCode: normalizedCode,
        walletAddress: inviteeAddress,
        entryCheck,
      });

    if (!recorded) {
      return NextResponse.json(
        {
          outcome:
            'eligibility_record_failed',
          error:
            'The eligibility result could not be saved. The invite was not used. Please try again.',
        },
        {
          status: 503,
          headers: {
            'Retry-After': '10',
          },
        },
      );
    }

    return NextResponse.json(
      {
        outcome:
          'active_existing_user',
        entryClass:
          'active_existing_user',
      },
      { status: 422 },
    );
  }

  const storedEntryClass =
    toStoredEntryClass(
      entryCheck.entryClass,
    );

  const {
    data: claimData,
    error: claimError,
  } = await supabaseAdmin.rpc(
    'claim_invitation_with_entry_proof',
    {
      p_invite_code: normalizedCode,
      p_invitee_wallet: inviteeAddress,
      p_network: entryCheck.network,
      p_checked_block:
        entryCheck.checkedBlock,
      p_prior_reward_tx_id:
        entryCheck.entryClass ===
        'returning_user'
          ? entryCheck.priorRewardEvent
              ?.txId ?? null
          : null,
      p_prior_vote_tx_id:
        entryCheck.entryClass ===
        'returning_user'
          ? entryCheck.priorVoteEvent
              ?.txId ?? null
          : null,
      p_details: {
        ...buildEntryCheckDetails(
          entryCheck,
        ),
        entryClass:
          storedEntryClass,
      },
    },
  );

  if (claimError) {
    console.error(
      'Failed to atomically claim invitation:',
      claimError,
    );

    return NextResponse.json(
      {
        outcome: 'server_error',
        error: 'Failed to claim invitation.',
      },
      { status: 500 },
    );
  }

  const claimResult =
    claimData as ClaimRpcResult | null;

  if (
    !claimResult ||
    claimResult.result !== 'CLAIMED'
  ) {
    return claimConflictResponse(
      claimResult?.result,
    );
  }

  const claimedInvitation =
    rpcResultToInvitation(
      claimResult,
    );

  if (!claimedInvitation) {
    console.error(
      'Atomic claim returned malformed invitation data:',
      claimResult,
    );

    return NextResponse.json(
      {
        outcome: 'server_error',
        error:
          'Invitation was claimed but its stored state could not be verified.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      outcome: 'eligible',
      entryClass:
        entryCheck.entryClass,
      invite: toInviteRecord(
        claimedInvitation,
      ),
    },
    { status: 200 },
  );
}
