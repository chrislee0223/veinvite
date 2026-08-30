import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RESOLVE_REVIEW_INTENT = 'RESOLVE_SYBIL_REVIEW';
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MIN_REASON_LENGTH = 12;
const MAX_REASON_LENGTH = 500;
const REVIEW_LIST_LIMIT = 100;

type ReviewDecision = 'CLEAR' | 'BLOCKED';

type InvitationReviewRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  activation_network: string | null;
  status: string;
  reward_status: string;
  sybil_status: string;
  sybil_risk_level: string;
  sybil_risk_score: number;
  sybil_reason: string | null;
  sybil_checked_at: string | null;
  sybil_source: string;
  activated_at: string | null;
  updated_at: string;
};

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function loadVerifiedOperator(
  request: NextRequest,
) {
  const session = await requireWalletSession({ request });
  const pool = await readVeInviteRewardPoolStatus();

  if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
    return {
      response: NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: noStoreHeaders(),
        },
      ),
      session: null,
      pool: null,
    };
  }

  return {
    response: null,
    session,
    pool,
  };
}

function normalizeInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

async function loadInvitationReview(
  inviteCode: string,
): Promise<InvitationReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code, inviter_wallet, invitee_wallet, activation_network, status, reward_status, sybil_status, sybil_risk_level, sybil_risk_score, sybil_reason, sybil_checked_at, sybil_source, activated_at, updated_at',
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Invitation review state could not be loaded: ${error.message}`,
    );
  }

  return (data as InvitationReviewRow | null) ?? null;
}

async function loadOpenReviews(network: string) {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code, inviter_wallet, invitee_wallet, activation_network, status, reward_status, sybil_status, sybil_risk_level, sybil_risk_score, sybil_reason, sybil_checked_at, sybil_source, activated_at, updated_at',
    )
    .eq('activation_network', network)
    .eq('status', 'UNDER_REVIEW')
    .eq('sybil_status', 'REVIEW')
    .order('sybil_checked_at', {
      ascending: true,
      nullsFirst: true,
    })
    .order('updated_at', { ascending: true })
    .limit(REVIEW_LIST_LIMIT);

  if (error) {
    throw new Error(
      `Open Sybil reviews could not be loaded: ${error.message}`,
    );
  }

  return (data ?? []) as InvitationReviewRow[];
}

async function loadReviewEvents(inviteCode: string) {
  const { data, error } = await supabaseAdmin
    .from('sybil_review_events')
    .select(
      'id, resulting_status, risk_level, risk_score, signal_code, source, summary, details, created_at',
    )
    .eq('invite_code', inviteCode)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(
      `Sybil review history could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

export async function GET(request: NextRequest) {
  const rawInviteCode =
    request.nextUrl.searchParams.get('inviteCode');
  const inviteCode = rawInviteCode
    ? normalizeInviteCode(rawInviteCode)
    : null;

  if (rawInviteCode && !inviteCode) {
    return NextResponse.json(
      { error: 'A valid 7-character inviteCode is required.' },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);

    if (operator.response) {
      return operator.response;
    }

    if (!inviteCode) {
      const reviews =
        await loadOpenReviews(operator.pool!.network);

      return NextResponse.json(
        {
          network: operator.pool!.network,
          verifiedOperator:
            operator.session!.walletAddress,
          reviews,
          reviewCount: reviews.length,
          resultLimit: REVIEW_LIST_LIMIT,
          allowedDecisions: ['CLEAR', 'BLOCKED'],
          transfersPerformed: false,
        },
        {
          headers: noStoreHeaders(),
        },
      );
    }

    const invitation =
      await loadInvitationReview(inviteCode);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found.' },
        {
          status: 404,
          headers: noStoreHeaders(),
        },
      );
    }

    if (
      invitation.activation_network &&
      invitation.activation_network !== operator.pool!.network
    ) {
      return NextResponse.json(
        {
          error:
            'Invitation network does not match the operator network.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    const events = await loadReviewEvents(inviteCode);

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator:
          operator.session!.walletAddress,
        invitation,
        reviewEvents: events,
        canResolve:
          invitation.status === 'UNDER_REVIEW' &&
          invitation.sybil_status === 'REVIEW',
        allowedDecisions: ['CLEAR', 'BLOCKED'],
        transfersPerformed: false,
      },
      {
        headers: noStoreHeaders(),
      },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: noStoreHeaders(),
        },
      );
    }

    console.error(
      'Failed to load manual Sybil review:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Manual Sybil review could not be loaded.',
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: noStoreHeaders(),
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== RESOLVE_REVIEW_INTENT ||
    !('inviteCode' in body) ||
    !('decision' in body) ||
    (body.decision !== 'CLEAR' &&
      body.decision !== 'BLOCKED') ||
    !('reason' in body) ||
    typeof body.reason !== 'string' ||
    !('confirmation' in body) ||
    typeof body.confirmation !== 'string' ||
    !('expectedCheckedAt' in body) ||
    typeof body.expectedCheckedAt !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${RESOLVE_REVIEW_INTENT}; inviteCode, decision (CLEAR or BLOCKED), reason, confirmation, and expectedCheckedAt are required.`,
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  const inviteCode = normalizeInviteCode(body.inviteCode);
  const decision = body.decision as ReviewDecision;
  const reason = body.reason.trim();
  const expectedCheckedAt = body.expectedCheckedAt.trim();

  if (!inviteCode) {
    return NextResponse.json(
      { error: 'A valid 7-character inviteCode is required.' },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  if (
    body.confirmation.trim().toUpperCase() !== inviteCode
  ) {
    return NextResponse.json(
      {
        error:
          'confirmation must exactly match the invitation code.',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  if (
    reason.length < MIN_REASON_LENGTH ||
    reason.length > MAX_REASON_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          `reason must be between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.`,
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  if (Number.isNaN(Date.parse(expectedCheckedAt))) {
    return NextResponse.json(
      { error: 'expectedCheckedAt must be a valid timestamp.' },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);

    if (operator.response) {
      return operator.response;
    }

    const before = await loadInvitationReview(inviteCode);

    if (!before) {
      return NextResponse.json(
        { error: 'Invitation not found.' },
        {
          status: 404,
          headers: noStoreHeaders(),
        },
      );
    }

    if (!before.invitee_wallet) {
      return NextResponse.json(
        {
          error:
            'Invitation has no invitee wallet to review.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    if (before.activation_network !== operator.pool!.network) {
      return NextResponse.json(
        {
          error:
            'Invitation network does not match the operator network.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    if (
      before.status !== 'UNDER_REVIEW' ||
      before.sybil_status !== 'REVIEW'
    ) {
      return NextResponse.json(
        {
          error:
            'Only an invitation currently in UNDER_REVIEW with Sybil status REVIEW can be resolved manually.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    if (
      !before.sybil_checked_at ||
      before.sybil_checked_at !== expectedCheckedAt
    ) {
      return NextResponse.json(
        {
          error:
            'This review changed after it was opened. Reload the latest review state before deciding.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    const { error: rpcError } = await supabaseAdmin.rpc(
      'resolve_invitation_sybil_review',
      {
        p_invite_code: inviteCode,
        p_decision: decision,
        p_reason: reason,
        p_expected_checked_at: expectedCheckedAt,
        p_operator_wallet:
          operator.session!.walletAddress,
        p_network: operator.pool!.network,
      },
    );

    if (rpcError) {
      if (
        rpcError.message.includes(
          'manual Sybil review state changed',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'This review changed after it was opened. Reload the latest review state before deciding.',
          },
          {
            status: 409,
            headers: noStoreHeaders(),
          },
        );
      }

      throw new Error(
        `resolve_invitation_sybil_review failed: ${rpcError.message}`,
      );
    }

    const after = await loadInvitationReview(inviteCode);
    const events = await loadReviewEvents(inviteCode);

    if (!after) {
      throw new Error(
        'Invitation disappeared after the manual Sybil decision.',
      );
    }

    if (after.sybil_status !== decision) {
      throw new Error(
        'Manual Sybil decision did not persist the requested status.',
      );
    }

    return NextResponse.json(
      {
        changed: true,
        network: operator.pool!.network,
        verifiedOperator:
          operator.session!.walletAddress,
        decision,
        invitation: after,
        latestReviewEvent: events[0] ?? null,
        rewardStatus: after.reward_status,
        transfersPerformed: false,
      },
      {
        headers: noStoreHeaders(),
      },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: noStoreHeaders(),
        },
      );
    }

    console.error(
      'Failed to resolve manual Sybil review:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Manual Sybil review could not be resolved.',
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }
}
