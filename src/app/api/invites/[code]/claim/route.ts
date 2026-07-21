import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  normalizeAddress,
} from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { checkEligibility } from '@/lib/vebetter/eligibility';
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
  activation_block: number | null;
};

type BestBlockResponse = {
  number?: unknown;
};

const invitationColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  created_at,
  activated_at,
  activation_block
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

function toInvitationRows(
  value: unknown,
): InvitationRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as InvitationRow[];
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

async function getBestBlockNumber(): Promise<number> {
  const nodeUrl = (
    process.env.VECHAIN_NODE_URL ??
    'https://mainnet.vechain.org'
  ).replace(/\/+$/, '');

  const response = await fetch(
    `${nodeUrl}/blocks/best`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(
      `VeChain node returned HTTP ${response.status}`,
    );
  }

  const block =
    (await response.json()) as BestBlockResponse;

  if (
    typeof block.number !== 'number' ||
    !Number.isSafeInteger(block.number) ||
    block.number < 0
  ) {
    throw new Error(
      'VeChain node returned an invalid block number.',
    );
  }

  return block.number;
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

  const invitation = toInvitationRow(data);

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

  const body = (await request.json()) as {
    inviteeAddress?: string;
    demoOutcome?: string;
  };

  if (!body.inviteeAddress) {
    return NextResponse.json(
      {
        error: 'inviteeAddress is required',
      },
      { status: 400 },
    );
  }

  const inviteeAddress = normalizeAddress(
    body.inviteeAddress,
  );

  if (
    inviteeAddress ===
    normalizeAddress(invitation.inviter_wallet)
  ) {
    return NextResponse.json(
      {
        outcome: 'ineligible',
        message:
          '초대자 본인의 지갑은 연결할 수 없습니다.',
      },
      { status: 422 },
    );
  }

  const {
    data: existingRows,
    error: existingError,
  } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
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
    toInvitationRows(existingRows).length > 0
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

  const eligibility = await checkEligibility({
    inviterAddress:
      invitation.inviter_wallet,
    inviteeAddress,
    requestedDemoOutcome:
      body.demoOutcome,
  });

  if (
    eligibility.outcome !== 'eligible' &&
    eligibility.outcome !== 'review'
  ) {
    return NextResponse.json(
      eligibility,
      { status: 422 },
    );
  }

  const nextStatus: InviteStatus =
    eligibility.outcome === 'review'
      ? 'UNDER_REVIEW'
      : 'ACTIVATING';

  let activationBlock: number;

  try {
    activationBlock =
      await getBestBlockNumber();
  } catch (blockError) {
    console.error(
      'Failed to get VeChain activation block:',
      blockError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to record the VeChain activation block. Please try again.',
      },
      { status: 503 },
    );
  }

  const activatedAt =
    new Date().toISOString();

  const {
    data: claimedData,
    error: claimError,
  } = await supabaseAdmin
    .from('invitations')
    .update({
      invitee_wallet: inviteeAddress,
      status: nextStatus,
      reward_status: 'PENDING',
      activated_at: activatedAt,
      activation_block: activationBlock,
    })
    .eq('invite_code', normalizedCode)
    .is('invitee_wallet', null)
    .neq('status', 'CANCELLED')
    .select(invitationColumns)
    .maybeSingle();

  if (claimError) {
    console.error(
      'Failed to claim invitation:',
      claimError,
    );

    return NextResponse.json(
      {
        error: 'Failed to claim invitation.',
      },
      { status: 500 },
    );
  }

  const claimedInvitation =
    toInvitationRow(claimedData);

  if (!claimedInvitation) {
    return NextResponse.json(
      {
        error:
          'This invite link has already been used.',
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      outcome: eligibility.outcome,
      message: eligibility.message,
      invite: toInviteRecord(
        claimedInvitation,
      ),
    },
    {
      status:
        eligibility.outcome === 'review'
          ? 202
          : 200,
    },
  );
}
