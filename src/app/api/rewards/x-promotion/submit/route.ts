import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enforceRateLimits,
} from '@/lib/rateLimitServer';
import {
  findVeInvitePromotionUrl,
  lookupXPromotionPost,
  parseXPostUrl,
} from '@/lib/rewards/rewardXPromotionXApi';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const WALLET_RATE_LIMIT = 8;
const INVITE_RATE_LIMIT = 4;

type OpportunityRow = {
  invite_code: string;
  recipient_wallet: string;
  share_token: string;
};

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

async function invalidateSubmission(
  inviteCode: string,
  postId: string,
  reason: string,
) {
  const { error } = await supabaseAdmin.rpc(
    'invalidate_reward_x_promotion_post_submission_v1',
    {
      p_invite_code: inviteCode,
      p_x_post_id: postId,
      p_reason: reason,
    },
  );

  if (error) {
    console.error(
      'Failed to invalidate X promotion submission:',
      {
        inviteCode,
        postId,
        reason,
        error: error.message,
      },
    );
  }
}

function pendingResponse(
  reason: string,
  inviteCode: string,
  postId: string,
) {
  return NextResponse.json(
    {
      verification: {
        inviteCode,
        postId,
        state: 'PENDING',
        retryable: true,
        reason,
      },
    },
    {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function terminalResponse(
  message: string,
  inviteCode: string,
  postId: string,
  reason: string,
) {
  return NextResponse.json(
    {
      error: message,
      verification: {
        inviteCode,
        postId,
        state: 'INVALID',
        samePostRetryable: false,
        reason,
      },
    },
    {
      status: 422,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: {
    inviteCode?: string;
    postUrl?: string;
  };

  try {
    body = (await request.json()) as {
      inviteCode?: string;
      postUrl?: string;
    };
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const inviteCode =
    body.inviteCode?.trim().toUpperCase() ?? '';
  const parsedPost =
    parseXPostUrl(body.postUrl ?? '');

  if (
    !INVITE_CODE_PATTERN.test(inviteCode) ||
    !parsedPost
  ) {
    return NextResponse.json(
      {
        error:
          'A valid inviteCode and public X Post URL are required.',
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

    const rateLimitResponse =
      await enforceRateLimits([
        {
          scope: 'x_promotion_submit_wallet',
          subject: wallet,
          limit: WALLET_RATE_LIMIT,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        },
        {
          scope: 'x_promotion_submit_invite',
          subject: inviteCode,
          limit: INVITE_RATE_LIMIT,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        },
      ]);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const {
      data: opportunityData,
      error: opportunityError,
    } = await supabaseAdmin
      .from('reward_x_promotion_opportunities')
      .select(
        'invite_code,recipient_wallet,share_token',
      )
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (opportunityError) {
      throw new Error(
        `X promotion opportunity lookup failed: ${opportunityError.message}`,
      );
    }

    const opportunity =
      opportunityData as OpportunityRow | null;

    if (!opportunity) {
      return NextResponse.json(
        {
          error:
            'This X promotion opportunity is not available.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      opportunity.recipient_wallet.toLowerCase() !== wallet
    ) {
      return NextResponse.json(
        {
          error:
            'This X promotion opportunity belongs to a different wallet.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const {
      data: submissionData,
      error: submissionError,
    } = await supabaseAdmin.rpc(
      'record_reward_x_promotion_post_submission_v1',
      {
        p_invite_code: inviteCode,
        p_x_post_id: parsedPost.postId,
        p_submitted_post_url:
          parsedPost.normalizedUrl,
      },
    );

    if (submissionError) {
      const message = submissionError.message;

      if (
        message.includes(
          'REWARD_X_PROMOTION_POST_SUBMISSION_EXPIRED',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'The X promotion submission window has expired.',
          },
          {
            status: 409,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      if (
        message.includes(
          'REWARD_X_PROMOTION_POST_ALREADY_USED',
        ) ||
        message.includes(
          'REWARD_X_PROMOTION_POST_SUBMISSION_ALREADY_ACTIVE',
        )
      ) {
        return NextResponse.json(
          {
            error:
              'This X Post cannot be used for this promotion.',
          },
          {
            status: 409,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      throw new Error(
        `X promotion submission failed: ${message}`,
      );
    }

    const lookup =
      await lookupXPromotionPost(parsedPost.postId);

    if (lookup.status === 'RETRY') {
      return pendingResponse(
        lookup.reason,
        inviteCode,
        parsedPost.postId,
      );
    }

    if (lookup.status === 'NOT_FOUND') {
      await invalidateSubmission(
        inviteCode,
        parsedPost.postId,
        lookup.reason,
      );

      return terminalResponse(
        'This X Post could not be found.',
        inviteCode,
        parsedPost.postId,
        lookup.reason,
      );
    }

    if (!lookup.isOriginalPost) {
      await invalidateSubmission(
        inviteCode,
        parsedPost.postId,
        'POST_NOT_ORIGINAL',
      );

      return terminalResponse(
        'Only an original public X Post can qualify.',
        inviteCode,
        parsedPost.postId,
        'POST_NOT_ORIGINAL',
      );
    }

    const matchedUrl =
      findVeInvitePromotionUrl(
        lookup.expandedUrls,
        opportunity.share_token,
      );

    if (!matchedUrl) {
      await invalidateSubmission(
        inviteCode,
        parsedPost.postId,
        'SHARE_TOKEN_MISSING',
      );

      return terminalResponse(
        'The X Post does not contain the required VeInvite promotion link.',
        inviteCode,
        parsedPost.postId,
        'SHARE_TOKEN_MISSING',
      );
    }

    const {
      data: verificationData,
      error: verificationError,
    } = await supabaseAdmin.rpc(
      'record_reward_x_promotion_initial_post_verification_v1',
      {
        p_invite_code: inviteCode,
        p_x_post_id: lookup.postId,
        p_x_author_id: lookup.authorId,
        p_x_post_created_at: lookup.createdAt,
        p_matched_expanded_url: matchedUrl,
      },
    );

    if (verificationError) {
      const message = verificationError.message;
      const terminalReason =
        message.includes(
          'REWARD_X_PROMOTION_POST_CREATED_OUTSIDE_WINDOW',
        )
          ? 'POST_CREATED_OUTSIDE_WINDOW'
          : message.includes(
                'REWARD_X_PROMOTION_WALLET_AUTHOR_MISMATCH',
              )
            ? 'WALLET_AUTHOR_MISMATCH'
            : message.includes(
                  'REWARD_X_PROMOTION_AUTHOR_ALREADY_BOUND',
                )
              ? 'AUTHOR_ALREADY_BOUND'
              : message.includes(
                    'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH',
                  )
                ? 'POST_IDENTITY_MISMATCH'
                : null;

      if (terminalReason) {
        await invalidateSubmission(
          inviteCode,
          parsedPost.postId,
          terminalReason,
        );

        return terminalResponse(
          'This X Post does not meet the promotion verification requirements.',
          inviteCode,
          parsedPost.postId,
          terminalReason,
        );
      }

      console.error(
        'Initial X promotion verification is pending after a durable submission:',
        {
          inviteCode,
          postId: parsedPost.postId,
          error: message,
        },
      );

      return pendingResponse(
        'VERIFICATION_RETRY_REQUIRED',
        inviteCode,
        parsedPost.postId,
      );
    }

    const verification =
      verificationData &&
      typeof verificationData === 'object' &&
      !Array.isArray(verificationData)
        ? verificationData as Record<string, unknown>
        : null;

    return NextResponse.json(
      {
        submission:
          submissionData &&
          typeof submissionData === 'object' &&
          !Array.isArray(submissionData)
            ? submissionData
            : null,
        verification: {
          inviteCode,
          postId: parsedPost.postId,
          state:
            String(
              verification?.state ??
                'INITIAL_VERIFIED',
            ),
          verifyAfter:
            typeof verification?.verifyAfter === 'string'
              ? verification.verifyAfter
              : null,
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
      'Failed to submit X promotion Post:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'The X promotion Post could not be verified right now.',
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
