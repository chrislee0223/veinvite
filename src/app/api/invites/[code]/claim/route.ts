import {
  NextRequest,
  NextResponse,
} from 'next/server';

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

async function recordRejectedEntryCheck({
  inviteCode,
  walletAddress,
  network,
  checkedBlock,
  priorRewardTxId,
  priorVoteTxId,
}: {
  inviteCode: string;
  walletAddress: string;
  network: string;
  checkedBlock: number;
  priorRewardTxId: string | null;
  priorVoteTxId: string | null;
}) {
  const { error } = await supabaseAdmin
    .from('eligibility_check_events')
    .insert({
      invite_code: inviteCode,
      wallet_address: walletAddress,
      network,
      checked_block: checkedBlock,
      outcome: 'EXISTING_VEBETTER_USER',
      prior_reward_tx_id:
        priorRewardTxId,
      prior_vote_tx_id:
        priorVoteTxId,
      details: {
        ruleVersion:
          'entry-history-v1',
        definition:
          'No prior rewarded or allocation-voting VeBetter history through the checked block.',
      },
    });

  if (error) {
    // Rejected attempts do not consume the invite even if this audit append
    // fails. Log loudly so the operator can investigate data-quality health.
    console.error(
      'Failed to record rejected VeBetter entry check:',
      error,
    );
  }
}

function claimConflictResponse(
  result: ClaimRpcResult['result'],
) {
  switch (result) {
    case 'NOT_FOUND':
    case 'CANCELLED':
      return NextResponse.json(
        {
          error:
            'Invite link is invalid or cancelled.',
        },
        { status: 404 },
      );

    case 'SELF_REFERRAL':
      return NextResponse.json(
        {
          outcome: 'self_referral',
          message:
            '초대자 본인의 지갑은 연결할 수 없습니다.',
        },
        { status: 422 },
      );

    case 'ALREADY_REFERRED':
      return NextResponse.json(
        {
          outcome: 'already_referred',
          message:
            '이미 다른 추천인에게 연결된 지갑입니다.',
        },
        { status: 422 },
      );

    case 'ALREADY_USED':
    default:
      return NextResponse.json(
        {
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
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  if (invitation.invitee_wallet) {
    return NextResponse.json(
      {
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
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    );
  }

  if (!body.inviteeAddress) {
    return NextResponse.json(
      {
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
        error:
          'Failed to validate wallet verification.',
      },
      { status: 500 },
    );
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
        message:
          '초대자 본인의 지갑은 연결할 수 없습니다.',
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
        message:
          '이미 다른 추천인에게 연결된 지갑입니다.',
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

    // Fail closed. A chain/indexing problem must never silently classify an
    // existing VeBetter wallet as new.
    return NextResponse.json(
      {
        error:
          'VeBetter activity history could not be verified. The invite was not used. Please try again.',
      },
      { status: 503 },
    );
  }

  if (
    entryCheck.outcome ===
    'existing_vebetter_user'
  ) {
    await recordRejectedEntryCheck({
      inviteCode: normalizedCode,
      walletAddress: inviteeAddress,
      network: entryCheck.network,
      checkedBlock:
        entryCheck.checkedBlock,
      priorRewardTxId:
        entryCheck.priorRewardEvent
          ?.txId ?? null,
      priorVoteTxId:
        entryCheck.priorVoteEvent
          ?.txId ?? null,
    });

    return NextResponse.json(
      {
        outcome:
          'existing_vebetter_user',
        message:
          '이미 VeBetterDAO에서 보상 또는 거버넌스 활동 이력이 확인된 지갑입니다.',
      },
      { status: 422 },
    );
  }

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
      p_prior_reward_tx_id: null,
      p_prior_vote_tx_id: null,
      p_details: {
        ruleVersion:
          'entry-history-v1',
        definition:
          'No prior rewarded or allocation-voting VeBetter history through the checked block.',
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
        error:
          'Invitation was claimed but its stored state could not be verified.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      outcome: 'eligible',
      message:
        '참여 자격을 확인했습니다.',
      invite: toInviteRecord(
        claimedInvitation,
      ),
    },
    { status: 200 },
  );
}
