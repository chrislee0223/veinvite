import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
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

type PromotionOfferStatus =
  | 'DISABLED'
  | 'NOT_ELIGIBLE'
  | 'PREPARING'
  | 'AVAILABLE'
  | 'CLOSED';

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

    const runtime =
      await supabaseAdmin
        .from('reward_runtime_config')
        .select(
          'reward_x_promotion_enabled,reward_x_promotion_live_started_at',
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
      safeIso(
        runtime.data.reward_x_promotion_live_started_at,
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
      const splitResult =
        await supabaseAdmin
          .from('reward_x_promotion_splits')
          .select('id,promotion_amount_wei')
          .eq('invite_code', inviteCode)
          .eq('recipient_wallet', wallet)
          .eq('mode', 'LIVE')
          .maybeSingle();

      if (splitResult.error) {
        throw new Error(
          `X promotion split state could not be loaded: ${splitResult.error.message}`,
        );
      }

      let offerStatus: PromotionOfferStatus =
        newOffersEnabled
          ? 'NOT_ELIGIBLE'
          : 'DISABLED';
      let pendingPromotionAmountWei: string | null = null;
      let pendingPromotionAmountB3tr: string | null = null;

      if (splitResult.data) {
        const splitAmountWei =
          String(
            splitResult.data.promotion_amount_wei ?? '',
          );

        if (
          !/^\d+$/u.test(splitAmountWei)
        ) {
          throw new Error(
            'Stored X promotion split amount is malformed.',
          );
        }

        if (BigInt(splitAmountWei) > 0n) {
          pendingPromotionAmountWei =
            splitAmountWei;
          pendingPromotionAmountB3tr =
            formatWeiAsB3tr(
              splitAmountWei,
              18,
            );

          const obligationResult =
            await supabaseAdmin
              .from('reward_x_promotion_obligations')
              .select('financial_state')
              .eq(
                'split_id',
                splitResult.data.id,
              )
              .eq('invite_code', inviteCode)
              .eq('recipient_wallet', wallet)
              .maybeSingle();

          if (obligationResult.error) {
            throw new Error(
              `X promotion obligation state could not be loaded: ${obligationResult.error.message}`,
            );
          }

          const financialState =
            obligationResult.data
              ? String(
                  obligationResult.data
                    .financial_state ?? '',
                )
              : '';

          if (
            !financialState ||
            financialState === 'RESERVED' ||
            financialState === 'HELD'
          ) {
            offerStatus = 'PREPARING';
          } else if (
            financialState === 'RELEASED' ||
            financialState === 'PAID'
          ) {
            offerStatus = 'CLOSED';
          } else {
            throw new Error(
              'Stored X promotion obligation state is invalid.',
            );
          }
        } else {
          offerStatus = 'NOT_ELIGIBLE';
        }
      }

      return NextResponse.json(
        {
          newOffersEnabled,
          offerStatus,
          pendingPromotionAmountWei,
          pendingPromotionAmountB3tr,
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
    if (verification.error) {
      throw new Error(
        `X promotion verification could not be loaded: ${verification.error.message}`,
      );
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
        offerStatus: 'AVAILABLE',
        pendingPromotionAmountWei: null,
        pendingPromotionAmountB3tr: null,
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
