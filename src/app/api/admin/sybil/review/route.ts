import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  enqueueRewardReservationContinuation,
} from '@/lib/rewards/rewardReservationContinuationQueue';
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

type V2AssessmentRow = {
  invite_code: string;
  network: string;
  state: string;
  risk_score: number;
  policy_version: string;
  analyzer_version: string;
  revision: number | string;
  evidence_cutoff_block: number | string | null;
  required_checks: unknown;
  completed_checks: unknown;
  reason_codes: unknown;
  evidence_summary: unknown;
  source: string;
  assessed_at: string;
  updated_at: string;
};

type PostPayoutReviewRow = {
  invite_code: string;
  network: string;
  subject_wallet: string;
  state: string;
  risk_score: number;
  revision: number | string;
  reason_codes: unknown;
  evidence_summary: unknown;
  source: string;
  opened_at: string;
  resolved_at: string | null;
  operator_wallet: string | null;
  operator_reason: string | null;
  updated_at: string;
};

type InviterReviewCandidateRow = {
  network: string;
  inviter_wallet: string;
  incident_count_90d: number | string;
  strong_direct_link_incident_count_90d: number | string;
  posture: string;
  reason_codes: unknown;
  evidence_summary: unknown;
  latest_invite_code: string;
  latest_incident_at: string;
  latest_incident_id: string;
};

type ReviewRow = InvitationReviewRow & {
  v2_state: string | null;
  v2_risk_score: number | null;
  v2_revision: number | string | null;
  v2_reason_codes: unknown;
  v2_updated_at: string | null;
  post_payout_state: string | null;
  post_payout_risk_score: number | null;
  post_payout_revision: number | string | null;
  post_payout_reason_codes: unknown;
  post_payout_subject_wallet: string | null;
  post_payout_updated_at: string | null;
  inviter_escalation_posture: string | null;
  inviter_escalation_incident_count_90d: number | string | null;
  inviter_escalation_strong_direct_link_count_90d: number | string | null;
  inviter_escalation_reason_codes: unknown;
  inviter_escalation_latest_incident_at: string | null;
  inviter_escalation_latest_incident_id: string | null;
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

  if (!origin) return false;

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
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function safeRevision(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed >= 1
    ? parsed
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

async function loadV2Assessment(
  inviteCode: string,
): Promise<V2AssessmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_referral_assessments')
    .select(
      'invite_code,network,state,risk_score,policy_version,analyzer_version,revision,evidence_cutoff_block,required_checks,completed_checks,reason_codes,evidence_summary,source,assessed_at,updated_at',
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Sybil v2 assessment could not be loaded: ${error.message}`,
    );
  }

  return (data as V2AssessmentRow | null) ?? null;
}

async function loadPostPayoutReview(
  inviteCode: string,
): Promise<PostPayoutReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_post_payout_reviews')
    .select(
      'invite_code,network,subject_wallet,state,risk_score,revision,reason_codes,evidence_summary,source,opened_at,resolved_at,operator_wallet,operator_reason,updated_at',
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Post-payout Sybil v2 review could not be loaded: ${error.message}`,
    );
  }

  return (data as PostPayoutReviewRow | null) ?? null;
}

async function loadInviterReviewCandidate(
  inviteCode: string,
): Promise<InviterReviewCandidateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_inviter_review_candidates')
    .select(
      'network,inviter_wallet,incident_count_90d,strong_direct_link_incident_count_90d,posture,reason_codes,evidence_summary,latest_invite_code,latest_incident_at,latest_incident_id',
    )
    .eq('latest_invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Inviter escalation review could not be loaded: ${error.message}`,
    );
  }

  return (data as InviterReviewCandidateRow | null) ?? null;
}

async function loadPostPayoutReviewEvents(
  inviteCode: string,
) {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_post_payout_review_events')
    .select(
      'id,action,risk_score,revision,reason_codes,evidence_summary,source,operator_wallet,operator_reason,created_at',
    )
    .eq('invite_code', inviteCode)
    .order('revision', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(
      `Post-payout Sybil v2 review history could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}


function decorateReview(
  invitation: InvitationReviewRow,
  assessment: V2AssessmentRow | null,
  postPayout: PostPayoutReviewRow | null = null,
  inviterReview: InviterReviewCandidateRow | null = null,
): ReviewRow {
  return {
    ...invitation,
    v2_state: assessment?.state ?? null,
    v2_risk_score: assessment?.risk_score ?? null,
    v2_revision: assessment?.revision ?? null,
    v2_reason_codes: assessment?.reason_codes ?? [],
    v2_updated_at: assessment?.updated_at ?? null,
    post_payout_state: postPayout?.state ?? null,
    post_payout_risk_score:
      postPayout?.risk_score ?? null,
    post_payout_revision:
      postPayout?.revision ?? null,
    post_payout_reason_codes:
      postPayout?.reason_codes ?? [],
    post_payout_subject_wallet:
      postPayout?.subject_wallet ?? null,
    post_payout_updated_at:
      postPayout?.updated_at ?? null,
    inviter_escalation_posture:
      inviterReview?.posture ?? null,
    inviter_escalation_incident_count_90d:
      inviterReview?.incident_count_90d ?? null,
    inviter_escalation_strong_direct_link_count_90d:
      inviterReview?.strong_direct_link_incident_count_90d ?? null,
    inviter_escalation_reason_codes:
      inviterReview?.reason_codes ?? [],
    inviter_escalation_latest_incident_at:
      inviterReview?.latest_incident_at ?? null,
    inviter_escalation_latest_incident_id:
      inviterReview?.latest_incident_id ?? null,
  };
}

async function loadOpenReviews(
  network: string,
): Promise<ReviewRow[]> {
  const [
    legacyResult,
    v2Result,
    postPayoutResult,
    inviterResult,
  ] = await Promise.all([
    supabaseAdmin
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
      .limit(REVIEW_LIST_LIMIT),
    supabaseAdmin
      .from('sybil_v2_referral_assessments')
      .select(
        'invite_code,network,state,risk_score,policy_version,analyzer_version,revision,evidence_cutoff_block,required_checks,completed_checks,reason_codes,evidence_summary,source,assessed_at,updated_at',
      )
      .eq('network', network)
      .eq('state', 'HOLD')
      .order('updated_at', { ascending: true })
      .limit(REVIEW_LIST_LIMIT),
    supabaseAdmin
      .from('sybil_v2_post_payout_reviews')
      .select(
        'invite_code,network,subject_wallet,state,risk_score,revision,reason_codes,evidence_summary,source,opened_at,resolved_at,operator_wallet,operator_reason,updated_at',
      )
      .eq('network', network)
      .eq('state', 'HOLD')
      .order('updated_at', { ascending: true })
      .limit(REVIEW_LIST_LIMIT),
    supabaseAdmin
      .from('operator_sybil_v2_inviter_review_candidates')
      .select(
        'network,inviter_wallet,incident_count_90d,strong_direct_link_incident_count_90d,posture,reason_codes,evidence_summary,latest_invite_code,latest_incident_at,latest_incident_id',
      )
      .eq('network', network)
      .order('latest_incident_at', { ascending: true })
      .limit(REVIEW_LIST_LIMIT),
  ]);

  if (legacyResult.error) {
    throw new Error(
      `Open legacy Sybil reviews could not be loaded: ${legacyResult.error.message}`,
    );
  }
  if (v2Result.error) {
    throw new Error(
      `Open Sybil v2 reviews could not be loaded: ${v2Result.error.message}`,
    );
  }
  if (postPayoutResult.error) {
    throw new Error(
      `Open post-payout Sybil reviews could not be loaded: ${postPayoutResult.error.message}`,
    );
  }
  if (inviterResult.error) {
    throw new Error(
      `Open inviter escalation reviews could not be loaded: ${inviterResult.error.message}`,
    );
  }

  const legacyRows =
    (legacyResult.data ?? []) as InvitationReviewRow[];
  const v2Rows =
    (v2Result.data ?? []) as V2AssessmentRow[];
  const postPayoutRows =
    (postPayoutResult.data ?? []) as PostPayoutReviewRow[];
  const inviterRows =
    (inviterResult.data ?? []) as InviterReviewCandidateRow[];

  const v2ByCode = new Map(
    v2Rows.map((row) => [row.invite_code, row]),
  );
  const postPayoutByCode = new Map(
    postPayoutRows.map((row) => [
      row.invite_code,
      row,
    ]),
  );
  const inviterByCode = new Map(
    inviterRows.map((row) => [
      row.latest_invite_code,
      row,
    ]),
  );

  const allReviewCodes = Array.from(new Set([
    ...legacyRows.map((row) => row.invite_code),
    ...v2Rows.map((row) => row.invite_code),
    ...postPayoutRows.map((row) => row.invite_code),
    ...inviterRows.map((row) => row.latest_invite_code),
  ]));

  const legacyByCode = new Map(
    legacyRows.map((row) => [
      row.invite_code,
      row,
    ]),
  );

  const missingCodes = allReviewCodes.filter(
    (code) => !legacyByCode.has(code),
  );

  let supplementalInvitations: InvitationReviewRow[] = [];
  if (missingCodes.length > 0) {
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, inviter_wallet, invitee_wallet, activation_network, status, reward_status, sybil_status, sybil_risk_level, sybil_risk_score, sybil_reason, sybil_checked_at, sybil_source, activated_at, updated_at',
      )
      .in('invite_code', missingCodes);

    if (invitationResult.error) {
      throw new Error(
        `Sybil review invitations could not be loaded: ${invitationResult.error.message}`,
      );
    }

    supplementalInvitations =
      (invitationResult.data ?? []) as InvitationReviewRow[];
  }

  const allInvitations = [
    ...legacyRows,
    ...supplementalInvitations,
  ];

  const deduped = new Map<string, ReviewRow>();
  for (const invitation of allInvitations) {
    deduped.set(
      invitation.invite_code,
      decorateReview(
        invitation,
        v2ByCode.get(invitation.invite_code) ?? null,
        postPayoutByCode.get(invitation.invite_code) ?? null,
        inviterByCode.get(invitation.invite_code) ?? null,
      ),
    );
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const leftTime = Date.parse(
        left.inviter_escalation_latest_incident_at ??
          left.post_payout_updated_at ??
          left.v2_updated_at ??
          left.sybil_checked_at ??
          left.updated_at,
      );
      const rightTime = Date.parse(
        right.inviter_escalation_latest_incident_at ??
          right.post_payout_updated_at ??
          right.v2_updated_at ??
          right.sybil_checked_at ??
          right.updated_at,
      );
      return leftTime - rightTime;
    })
    .slice(0, REVIEW_LIST_LIMIT);
}

async function loadLegacyReviewEvents(
  inviteCode: string,
) {
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

async function loadV2AssessmentEvents(
  inviteCode: string,
) {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_assessment_events')
    .select(
      'id,state,risk_score,policy_version,analyzer_version,revision,evidence_cutoff_block,required_checks,completed_checks,reason_codes,evidence_summary,source,created_at',
    )
    .eq('invite_code', inviteCode)
    .order('revision', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(
      `Sybil v2 assessment history could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

async function loadV2Evidence(
  inviteCode: string,
) {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select(
      'id,evidence_family,signal_code,strength,score,related_wallet,app_id,observed_block,observed_at,analyzer_version,evidence,created_at',
    )
    .eq('invite_code', inviteCode)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(
      `Sybil v2 evidence could not be loaded: ${error.message}`,
    );
  }

  return data ?? [];
}

async function enqueueClearedReward(
  inviteCode: string,
) {
  try {
    await enqueueRewardReservationContinuation({
      inviteCode,
      detectedAt: new Date().toISOString(),
    });
  } catch (error) {
    // The operator decision and clearance are already durable. Cron and the
    // reservation retry path remain safe fallbacks.
    console.error(
      'Failed to queue reward reservation after Sybil v2 operator CLEAR:',
      {
        inviteCode,
        error,
      },
    );
  }
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

    if (operator.response) return operator.response;

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

    const [
      invitation,
      v2Assessment,
      postPayoutReview,
      inviterReview,
    ] = await Promise.all([
      loadInvitationReview(inviteCode),
      loadV2Assessment(inviteCode),
      loadPostPayoutReview(inviteCode),
      loadInviterReviewCandidate(inviteCode),
    ]);

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
      invitation.activation_network !==
        operator.pool!.network
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

    const [
      reviewEvents,
      v2AssessmentEvents,
      v2Evidence,
      postPayoutReviewEvents,
    ] = await Promise.all([
      loadLegacyReviewEvents(inviteCode),
      loadV2AssessmentEvents(inviteCode),
      loadV2Evidence(inviteCode),
      loadPostPayoutReviewEvents(inviteCode),
    ]);

    const legacyCanResolve =
      invitation.status === 'UNDER_REVIEW' &&
      invitation.sybil_status === 'REVIEW';
    const v2CanResolve =
      v2Assessment?.state === 'HOLD';
    const postPayoutCanResolve =
      postPayoutReview?.state === 'HOLD';
    const inviterCanResolve =
      inviterReview?.posture === 'HOLD';

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator:
          operator.session!.walletAddress,
        invitation: decorateReview(
          invitation,
          v2Assessment,
          postPayoutReview,
          inviterReview,
        ),
        v2Assessment,
        postPayoutReview,
        inviterReview,
        reviewEvents,
        v2AssessmentEvents,
        postPayoutReviewEvents,
        v2Evidence,
        reviewMode: inviterCanResolve
          ? 'INVITER'
          : postPayoutCanResolve
            ? 'POST_PAYOUT'
            : v2CanResolve
              ? 'V2'
              : legacyCanResolve
                ? 'LEGACY'
                : 'NONE',
        canResolve:
          inviterCanResolve ||
          postPayoutCanResolve ||
          v2CanResolve ||
          legacyCanResolve,
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
    typeof body.confirmation !== 'string'
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${RESOLVE_REVIEW_INTENT}; inviteCode, decision (CLEAR or BLOCKED), reason, and confirmation are required.`,
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  const inviteCode =
    normalizeInviteCode(body.inviteCode);
  const decision =
    body.decision as ReviewDecision;
  const reason = body.reason.trim();

  if (!inviteCode) {
    return NextResponse.json(
      {
        error:
          'A valid 7-character inviteCode is required.',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      },
    );
  }

  if (
    body.confirmation.trim().toUpperCase() !==
    inviteCode
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

  try {
    const operator = await loadVerifiedOperator(request);
    if (operator.response) return operator.response;

    const [
      before,
      v2Assessment,
      postPayoutReview,
      inviterReview,
    ] = await Promise.all([
      loadInvitationReview(inviteCode),
      loadV2Assessment(inviteCode),
      loadPostPayoutReview(inviteCode),
      loadInviterReviewCandidate(inviteCode),
    ]);

    if (!before || !before.invitee_wallet) {
      return NextResponse.json(
        {
          error:
            'Invitation with an invitee wallet was not found.',
        },
        {
          status: 404,
          headers: noStoreHeaders(),
        },
      );
    }

    if (
      before.activation_network !==
      operator.pool!.network
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

    if (inviterReview?.posture === 'HOLD') {
      const expectedIncidentId =
        'expectedInviterIncidentId' in body &&
        typeof body.expectedInviterIncidentId === 'string'
          ? body.expectedInviterIncidentId.trim().toLowerCase()
          : '';

      if (
        !expectedIncidentId ||
        expectedIncidentId !==
          inviterReview.latest_incident_id.toLowerCase()
      ) {
        return NextResponse.json(
          {
            error:
              'This inviter escalation review changed after it was opened. Reload the latest review state before deciding.',
          },
          {
            status: 409,
            headers: noStoreHeaders(),
          },
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        'resolve_sybil_v2_inviter_review',
        {
          p_inviter_wallet: inviterReview.inviter_wallet,
          p_decision:
            decision === 'BLOCKED'
              ? 'RESTRICT'
              : 'CLEAR',
          p_reason: reason,
          p_expected_latest_incident_id:
            inviterReview.latest_incident_id,
          p_operator_wallet:
            operator.session!.walletAddress,
          p_network: operator.pool!.network,
        },
      );

      if (error) {
        if (
          error.message.includes('INVITER_REVIEW_STATE_CHANGED') ||
          error.message.includes('INVITER_REVIEW_NOT_HOLD')
        ) {
          return NextResponse.json(
            {
              error:
                'This inviter escalation review changed after it was opened. Reload the latest review state before deciding.',
            },
            {
              status: 409,
              headers: noStoreHeaders(),
            },
          );
        }

        throw new Error(
          `resolve_sybil_v2_inviter_review failed: ${error.message}`,
        );
      }

      const after =
        await loadInvitationReview(inviteCode);

      return NextResponse.json(
        {
          changed: true,
          reviewMode: 'INVITER',
          network: operator.pool!.network,
          verifiedOperator:
            operator.session!.walletAddress,
          decision,
          result: data,
          invitation: after
            ? decorateReview(after, v2Assessment, postPayoutReview)
            : null,
          rewardStatus:
            after?.reward_status ?? null,
          pastRewardChanged: false,
          transfersPerformed: false,
        },
        {
          headers: noStoreHeaders(),
        },
      );
    }

    if (postPayoutReview?.state === 'HOLD') {
      const expectedRevision =
        'expectedRevision' in body
          ? safeRevision(body.expectedRevision)
          : null;

      if (expectedRevision === null) {
        return NextResponse.json(
          {
            error:
              'expectedRevision is required for a post-payout HOLD decision.',
          },
          {
            status: 400,
            headers: noStoreHeaders(),
          },
        );
      }

      const currentRevision =
        safeRevision(postPayoutReview.revision);

      if (
        currentRevision === null ||
        currentRevision !== expectedRevision
      ) {
        return NextResponse.json(
          {
            error:
              'This post-payout review changed after it was opened. Reload the latest review state before deciding.',
          },
          {
            status: 409,
            headers: noStoreHeaders(),
          },
        );
      }

      const { data, error } = await supabaseAdmin.rpc(
        'resolve_sybil_v2_post_payout_review',
        {
          p_invite_code: inviteCode,
          p_decision:
            decision === 'BLOCKED'
              ? 'BLACKLIST'
              : 'CLEAR',
          p_reason: reason,
          p_expected_revision: expectedRevision,
          p_operator_wallet:
            operator.session!.walletAddress,
          p_network: operator.pool!.network,
        },
      );

      if (error) {
        if (
          error.message.includes(
            'POST_PAYOUT_REVIEW_STATE_CHANGED',
          )
        ) {
          return NextResponse.json(
            {
              error:
                'This post-payout review changed after it was opened. Reload the latest review state before deciding.',
            },
            {
              status: 409,
              headers: noStoreHeaders(),
            },
          );
        }

        throw new Error(
          `resolve_sybil_v2_post_payout_review failed: ${error.message}`,
        );
      }

      const [
        after,
        afterAssessment,
        afterPostPayout,
      ] = await Promise.all([
        loadInvitationReview(inviteCode),
        loadV2Assessment(inviteCode),
        loadPostPayoutReview(inviteCode),
      ]);

      return NextResponse.json(
        {
          changed: true,
          reviewMode: 'POST_PAYOUT',
          network: operator.pool!.network,
          verifiedOperator:
            operator.session!.walletAddress,
          decision,
          result: data,
          invitation: after
            ? decorateReview(
                after,
                afterAssessment,
                afterPostPayout,
              )
            : null,
          v2Assessment: afterAssessment,
          postPayoutReview: afterPostPayout,
          rewardStatus:
            after?.reward_status ?? null,
          pastRewardChanged: false,
          transfersPerformed: false,
        },
        {
          headers: noStoreHeaders(),
        },
      );
    }

    if (v2Assessment?.state === 'HOLD') {
      const expectedRevision =
        'expectedRevision' in body
          ? safeRevision(body.expectedRevision)
          : null;

      if (expectedRevision === null) {
        return NextResponse.json(
          {
            error:
              'expectedRevision is required for a Sybil v2 HOLD decision.',
          },
          {
            status: 400,
            headers: noStoreHeaders(),
          },
        );
      }

      const currentRevision =
        safeRevision(v2Assessment.revision);

      if (
        currentRevision === null ||
        currentRevision !== expectedRevision
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

      const { data, error } = await supabaseAdmin.rpc(
        'resolve_sybil_v2_review',
        {
          p_invite_code: inviteCode,
          p_decision:
            decision === 'BLOCKED'
              ? 'BLACKLIST'
              : 'CLEAR',
          p_reason: reason,
          p_expected_revision: expectedRevision,
          p_operator_wallet:
            operator.session!.walletAddress,
          p_network: operator.pool!.network,
        },
      );

      if (error) {
        if (
          error.message.includes(
            'SYBIL_V2_REVIEW_STATE_CHANGED',
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
          `resolve_sybil_v2_review failed: ${error.message}`,
        );
      }

      if (decision === 'CLEAR') {
        await enqueueClearedReward(inviteCode);
      }

      const [after, afterAssessment] =
        await Promise.all([
          loadInvitationReview(inviteCode),
          loadV2Assessment(inviteCode),
        ]);

      return NextResponse.json(
        {
          changed: true,
          reviewMode: 'V2',
          network: operator.pool!.network,
          verifiedOperator:
            operator.session!.walletAddress,
          decision,
          result: data,
          invitation: after
            ? decorateReview(after, afterAssessment)
            : null,
          v2Assessment: afterAssessment,
          rewardStatus:
            after?.reward_status ?? null,
          transfersPerformed: false,
        },
        {
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
            'This invitation is not currently awaiting manual Sybil review.',
        },
        {
          status: 409,
          headers: noStoreHeaders(),
        },
      );
    }

    const expectedCheckedAt =
      'expectedCheckedAt' in body &&
      typeof body.expectedCheckedAt === 'string'
        ? body.expectedCheckedAt.trim()
        : '';

    if (
      !expectedCheckedAt ||
      Number.isNaN(Date.parse(expectedCheckedAt))
    ) {
      return NextResponse.json(
        {
          error:
            'expectedCheckedAt is required for a legacy review.',
        },
        {
          status: 400,
          headers: noStoreHeaders(),
        },
      );
    }

    if (
      !before.sybil_checked_at ||
      before.sybil_checked_at !==
        expectedCheckedAt
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

    const { error: rpcError } =
      await supabaseAdmin.rpc(
        'resolve_invitation_sybil_review',
        {
          p_invite_code: inviteCode,
          p_decision: decision,
          p_reason: reason,
          p_expected_checked_at:
            expectedCheckedAt,
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

    const after =
      await loadInvitationReview(inviteCode);

    return NextResponse.json(
      {
        changed: true,
        reviewMode: 'LEGACY',
        network: operator.pool!.network,
        verifiedOperator:
          operator.session!.walletAddress,
        decision,
        invitation: after,
        rewardStatus:
          after?.reward_status ?? null,
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
