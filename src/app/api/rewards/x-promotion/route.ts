import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
import { xOAuthConfig } from '@/lib/rewards/rewardXPromotionOAuth';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type OpportunityRow = {
  id: string | number;
  obligation_id: string | number;
  promotion_amount_wei: string | number;
  opened_at: string;
  post_deadline_at: string;
  submission_grace_seconds: number;
  share_token: string;
};

type ObligationRow = {
  id: string | number;
  financial_state: string;
  held_at: string | null;
  released_at: string | null;
  paid_at: string | null;
};

type SubmissionRow = {
  id: string | number;
  submission_state: string;
  submitted_at: string;
  verified_at: string | null;
  invalidated_at: string | null;
};

type VerificationRow = {
  id: string | number;
  verification_state: string;
  initial_verified_at: string;
  verify_after: string;
  final_verified_at: string | null;
  invalidated_at: string | null;
};

type PromotionState =
  | 'OPEN'
  | 'SUBMISSION_GRACE'
  | 'VERIFYING'
  | 'RETENTION'
  | 'REVIEW_REQUIRED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'RELEASED';

function parseInviteCode(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (!INVITE_CODE_PATTERN.test(normalized)) {
    throw new Error('inviteCode is invalid.');
  }
  return normalized;
}

function safeIso(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function readState({
  financialState,
  submissionState,
  verificationState,
  postDeadlineAt,
  submissionGraceSeconds,
}: {
  financialState: string;
  submissionState: string | null;
  verificationState: string | null;
  postDeadlineAt: string;
  submissionGraceSeconds: number;
}): PromotionState {
  if (financialState === 'PAID') return 'PAID';
  if (financialState === 'RELEASED') return 'RELEASED';
  if (verificationState === 'FINAL_VERIFIED') return 'PAYOUT_PENDING';
  if (verificationState === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (verificationState === 'INITIAL_VERIFIED') return 'RETENTION';
  if (submissionState === 'PENDING') return 'VERIFYING';

  const postDeadline =
    Date.parse(postDeadlineAt);
  const now = Date.now();

  if (now <= postDeadline) {
    return 'OPEN';
  }

  return now <=
    postDeadline +
      submissionGraceSeconds * 1000
    ? 'SUBMISSION_GRACE'
    : 'EXPIRED';
}

export async function GET(
  request: NextRequest,
) {
  let inviteCode: string;

  try {
    inviteCode = parseInviteCode(
      request.nextUrl.searchParams.get('inviteCode'),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid X promotion request.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const wallet =
      session.walletAddress.toLowerCase();
    const xConnectAvailable = Boolean(xOAuthConfig(request.nextUrl.origin));
    // URL-less flow is deliberately a separate rollout gate. Never switch
    // existing offers or users to auto-only submission by changing the
    // search worker mode alone.
    const urlLessStart = Date.parse(
      process.env.VEINVITE_X_PROMOTION_URLLESS_START_AT ?? '',
    );
    const dailyReads = process.env.VEINVITE_X_PROMOTION_DAILY_READ_CALLS ?? '';
    const scanHintsConfigured =
      process.env.VEINVITE_X_PROMOTION_SCAN_HINT_ENABLED === 'true';
    const urlLessConfigured = xConnectAvailable &&
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE === 'live' &&
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY === 'author' &&
      /^(?:[1-9]|1[0-9]|20)$/u.test(dailyReads) &&
      Number.isFinite(urlLessStart) && urlLessStart > 0;
    const { network } = getVeBetterNetworkConfig();

    const runtime =
      await supabaseAdmin
        .from('reward_runtime_config')
        .select(
          'reward_x_promotion_enabled,reward_x_promotion_live_started_at,reward_x_promotion_payout_enabled,reward_x_promotion_external_verification_ready,reward_x_promotion_external_verification_started_at',
        )
        .eq('id', 1)
        .single();

    if (runtime.error || !runtime.data) {
      throw new Error(
        `X promotion runtime state could not be loaded: ${runtime.error?.message ?? 'missing row'}`,
      );
    }

    const newOffersEnabled =
      runtime.data.reward_x_promotion_enabled === true &&
      runtime.data.reward_x_promotion_payout_enabled === true &&
      safeIso(
        runtime.data.reward_x_promotion_live_started_at,
      ) !== null &&
      runtime.data.reward_x_promotion_external_verification_ready === true &&
      safeIso(
        runtime.data.reward_x_promotion_external_verification_started_at,
      ) !== null;

    const opportunity =
      await supabaseAdmin
        .from('reward_x_promotion_opportunities')
        .select(
          [
            'id',
            'obligation_id',
            'invite_code',
            'recipient_wallet',
            'promotion_amount_wei',
            'opened_at',
            'post_deadline_at',
            'submission_grace_seconds',
            'share_token',
          ].join(','),
        )
        .eq('invite_code', inviteCode)
        .eq('recipient_wallet', wallet)
        .maybeSingle();

    if (opportunity.error) {
      throw new Error(
        `X promotion opportunity could not be loaded: ${opportunity.error.message}`,
      );
    }

    const opportunityRow =
      opportunity.data as unknown as OpportunityRow | null;

    if (!opportunityRow) {
      const obligation =
        await supabaseAdmin
          .from('reward_x_promotion_obligations')
          .select('financial_state')
          .eq('invite_code', inviteCode)
          .eq('recipient_wallet', wallet)
          .maybeSingle();

      if (obligation.error) {
        throw new Error(
          `X promotion obligation state could not be loaded: ${obligation.error.message}`,
        );
      }

      const financialState =
        typeof obligation.data?.financial_state === 'string'
          ? obligation.data.financial_state
          : null;
      const promotionPending =
        financialState === 'RESERVED' ||
        financialState === 'HELD';

      return NextResponse.json(
        {
          newOffersEnabled,
          promotionPending,
          promotion: null,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const amountWei =
      String(opportunityRow.promotion_amount_wei ?? '');
    const graceSeconds =
      Number(opportunityRow.submission_grace_seconds);
    const deadlineAt =
      safeIso(opportunityRow.post_deadline_at);

    if (
      !/^\d+$/u.test(amountWei) ||
      BigInt(amountWei) < 1n ||
      !Number.isSafeInteger(graceSeconds) ||
      graceSeconds < 0 ||
      !deadlineAt
    ) {
      throw new Error(
        'Stored X promotion opportunity is malformed.',
      );
    }

    const [
      obligation,
      submission,
      verification,
      xIdentity,
      scanHint,
    ] = await Promise.all([
      supabaseAdmin
        .from('reward_x_promotion_obligations')
        .select(
          'id,financial_state,held_at,released_at,paid_at',
        )
        .eq(
          'id',
          opportunityRow.obligation_id,
        )
        .single(),
      supabaseAdmin
        .from('reward_x_promotion_post_submissions')
        .select(
          'id,submission_state,submitted_at,verified_at,invalidated_at',
        )
        .eq(
          'opportunity_id',
          opportunityRow.id,
        )
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_x_promotion_post_verifications')
        .select(
          'id,verification_state,initial_verified_at,verify_after,final_verified_at,invalidated_at',
        )
        .eq(
          'opportunity_id',
          opportunityRow.id,
        )
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      xConnectAvailable
        ? supabaseAdmin
            .from('reward_x_promotion_oauth_proofs')
            .select('x_author_id')
            .eq('network', network)
            .eq('recipient_wallet', wallet)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      scanHintsConfigured
        ? supabaseAdmin.from('reward_x_promotion_scan_requests')
            .select('requested_at').eq('invite_code', inviteCode).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (obligation.error || !obligation.data) {
      throw new Error(
        `X promotion obligation could not be loaded: ${obligation.error?.message ?? 'missing row'}`,
      );
    }
    if (submission.error) {
      throw new Error(
        `X promotion submission could not be loaded: ${submission.error.message}`,
      );
    }
    if (xIdentity.error) {
      throw new Error('X identity state could not be loaded.');
    }
    if (verification.error) {
      throw new Error(
        `X promotion verification could not be loaded: ${verification.error.message}`,
      );
    }
    if (scanHint.error) {
      throw new Error('X scan request status could not be loaded.');
    }

    const obligationRow =
      obligation.data as unknown as ObligationRow;
    const submissionRow =
      submission.data as unknown as SubmissionRow | null;
    const verificationRow =
      verification.data as unknown as VerificationRow | null;

    const financialState =
      String(obligationRow.financial_state ?? '');
    if (
      !['RESERVED', 'HELD', 'RELEASED', 'PAID'].includes(
        financialState,
      )
    ) {
      throw new Error(
        'Stored X promotion obligation state is invalid.',
      );
    }

    const shareToken = String(
      opportunityRow.share_token ?? '',
    ).toLowerCase();

    if (!UUID_PATTERN.test(shareToken)) {
      throw new Error(
        'Stored X promotion share token is malformed.',
      );
    }

    const state = readState({
      financialState,
      submissionState:
        submissionRow
          ? String(
              submissionRow.submission_state ?? '',
            )
          : null,
      verificationState:
        verificationRow
          ? String(
              verificationRow.verification_state ?? '',
            )
          : null,
      postDeadlineAt: deadlineAt,
      submissionGraceSeconds: graceSeconds,
    });

    return NextResponse.json(
      {
        newOffersEnabled,
        xConnectAvailable,
        xConnected: Boolean(xIdentity.data),
        xScanHintEnabled: scanHintsConfigured && urlLessConfigured &&
          Date.parse(opportunityRow.opened_at) >= urlLessStart,
        xScanQueued: Boolean(scanHint.data),
        // Only newly opened offers may omit manual URL submission, and only
        // after both explicit gates are enabled. Legacy receipts keep their
        // existing path regardless of later rollout settings.
        xUrlLessEnabled: urlLessConfigured &&
          safeIso(opportunityRow.opened_at) !== null &&
          Date.parse(opportunityRow.opened_at) >= urlLessStart,
        promotion: {
          inviteCode,
          state,
          amountWei,
          amountB3tr:
            formatWeiAsB3tr(amountWei, 18),
          openedAt:
            safeIso(opportunityRow.opened_at),
          postDeadlineAt: deadlineAt,
          submissionGraceSeconds:
            graceSeconds,
          shareToken:
            state === 'OPEN'
              ? String(
                  shareToken,
                )
              : null,
          submittedAt:
            safeIso(
              submissionRow?.submitted_at,
            ),
          verifyAfter:
            safeIso(
              verificationRow?.verify_after,
            ),
          paidAt:
            safeIso(obligationRow.paid_at),
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      WalletAuthenticationError
    ) {
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

    console.error(
      'Failed to load X promotion state:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'The X promotion state could not be loaded.',
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
