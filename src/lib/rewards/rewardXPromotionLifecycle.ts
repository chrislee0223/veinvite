import 'server-only';

import {
  findVeInvitePromotionUrl,
  lookupXPromotionPost,
} from '@/lib/rewards/rewardXPromotionXApi';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

type PendingCandidate = {
  inviteCode: string;
  submissionId: number;
  xPostId: string;
  shareToken: string;
  submittedAt: string;
};

type FinalCandidate = {
  inviteCode: string;
  submissionId: number;
  verificationId: number;
  xPostId: string;
  xAuthorId: string;
  shareToken: string;
  verifyAfter: string;
  verificationState: string;
};

type CandidateEnvelope<T> = {
  candidateCount?: unknown;
  candidates?: unknown;
};

type CandidateSummary = {
  selected: number;
  verified: number;
  invalidated: number;
  reviewRequired: number;
  retry: number;
  failed: number;
};

export type RewardXPromotionLifecycleResult = {
  network: string;
  terminalSecurity: unknown;
  opportunitySync: unknown;
  expiredBeforeVerification: unknown;
  pending: CandidateSummary;
  final: CandidateSummary;
  expiredAfterVerification: unknown;
};

const PENDING_LIMIT = 10;
const FINAL_LIMIT = 10;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value),
  );
}

function readSafeId(
  value: unknown,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function readString(
  value: unknown,
): string | null {
  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function readPendingCandidates(
  value: unknown,
): PendingCandidate[] {
  if (!isRecord(value)) return [];

  const candidates =
    (value as CandidateEnvelope<PendingCandidate>)
      .candidates;

  if (!Array.isArray(candidates)) return [];

  const result: PendingCandidate[] = [];

  for (const item of candidates) {
    if (!isRecord(item)) continue;

    const inviteCode =
      readString(item.inviteCode);
    const submissionId =
      readSafeId(item.submissionId);
    const xPostId =
      readString(item.xPostId);
    const shareToken =
      readString(item.shareToken);
    const submittedAt =
      readString(item.submittedAt);

    if (
      !inviteCode ||
      !submissionId ||
      !xPostId ||
      !shareToken ||
      !submittedAt
    ) {
      continue;
    }

    result.push({
      inviteCode,
      submissionId,
      xPostId,
      shareToken,
      submittedAt,
    });
  }

  return result;
}

function readFinalCandidates(
  value: unknown,
): FinalCandidate[] {
  if (!isRecord(value)) return [];

  const candidates =
    (value as CandidateEnvelope<FinalCandidate>)
      .candidates;

  if (!Array.isArray(candidates)) return [];

  const result: FinalCandidate[] = [];

  for (const item of candidates) {
    if (!isRecord(item)) continue;

    const inviteCode =
      readString(item.inviteCode);
    const submissionId =
      readSafeId(item.submissionId);
    const verificationId =
      readSafeId(item.verificationId);
    const xPostId =
      readString(item.xPostId);
    const xAuthorId =
      readString(item.xAuthorId);
    const shareToken =
      readString(item.shareToken);
    const verifyAfter =
      readString(item.verifyAfter);
    const verificationState =
      readString(item.verificationState);

    if (
      !inviteCode ||
      !submissionId ||
      !verificationId ||
      !xPostId ||
      !xAuthorId ||
      !shareToken ||
      !verifyAfter ||
      !verificationState
    ) {
      continue;
    }

    result.push({
      inviteCode,
      submissionId,
      verificationId,
      xPostId,
      xAuthorId,
      shareToken,
      verifyAfter,
      verificationState,
    });
  }

  return result;
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } =
    await supabaseAdmin.rpc(name, args);

  if (error) {
    throw new Error(
      `${name} failed: ${error.message}`,
    );
  }

  return data;
}

async function recordAttempt(args: {
  inviteCode: string;
  submissionId: number;
  verificationId: number | null;
  phase: 'INITIAL_RETRY' | 'FINAL_CHECK';
  xPostId: string;
  outcome:
    | 'RETRY'
    | 'INITIAL_VERIFIED'
    | 'INVALIDATED'
    | 'REVIEW_REQUIRED'
    | 'FINAL_VERIFIED';
  reason: string;
  details?: Record<string, unknown>;
}) {
  await rpc(
    'record_reward_x_promotion_verification_attempt_v1',
    {
      p_invite_code: args.inviteCode,
      p_submission_id:
        args.submissionId,
      p_verification_id:
        args.verificationId,
      p_phase: args.phase,
      p_x_post_id: args.xPostId,
      p_outcome: args.outcome,
      p_reason: args.reason,
      p_details: args.details ?? {},
    },
  );
}

async function invalidatePendingSubmission(
  candidate: PendingCandidate,
  reason: string,
) {
  await rpc(
    'invalidate_reward_x_promotion_post_submission_v1',
    {
      p_invite_code:
        candidate.inviteCode,
      p_x_post_id:
        candidate.xPostId,
      p_reason: reason,
    },
  );
}

async function markReviewRequired(
  inviteCode: string,
  reason: string,
) {
  await rpc(
    'mark_reward_x_promotion_post_review_required_v1',
    {
      p_invite_code: inviteCode,
      p_reason: reason,
    },
  );
}

async function invalidateFinalVerification(
  candidate: FinalCandidate,
  reason: string,
) {
  await rpc(
    'invalidate_reward_x_promotion_post_verification_v1',
    {
      p_invite_code:
        candidate.inviteCode,
      p_reason: reason,
    },
  );
}

function initialTerminalReason(
  message: string,
): string | null {
  if (
    message.includes(
      'REWARD_X_PROMOTION_POST_CREATED_OUTSIDE_WINDOW',
    )
  ) {
    return 'POST_CREATED_OUTSIDE_WINDOW';
  }
  if (
    message.includes(
      'REWARD_X_PROMOTION_WALLET_AUTHOR_MISMATCH',
    )
  ) {
    return 'WALLET_AUTHOR_MISMATCH';
  }
  if (
    message.includes(
      'REWARD_X_PROMOTION_AUTHOR_ALREADY_BOUND',
    )
  ) {
    return 'AUTHOR_ALREADY_BOUND';
  }
  if (
    message.includes(
      'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH',
    )
  ) {
    return 'POST_IDENTITY_MISMATCH';
  }
  if (
    message.includes(
      'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING',
    )
  ) {
    return 'SHARE_TOKEN_MISSING';
  }

  return null;
}

async function processPendingCandidate(
  candidate: PendingCandidate,
): Promise<
  'VERIFIED' | 'INVALIDATED' | 'RETRY'
> {
  const lookup =
    await lookupXPromotionPost(
      candidate.xPostId,
    );

  if (lookup.status === 'RETRY') {
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason: lookup.reason,
    });

    return 'RETRY';
  }

  if (lookup.status === 'NOT_FOUND') {
    await invalidatePendingSubmission(
      candidate,
      lookup.reason,
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'INVALIDATED',
      reason: lookup.reason,
    });

    return 'INVALIDATED';
  }

  if (!lookup.isOriginalPost) {
    await invalidatePendingSubmission(
      candidate,
      'POST_NOT_ORIGINAL',
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'INVALIDATED',
      reason: 'POST_NOT_ORIGINAL',
    });

    return 'INVALIDATED';
  }

  const matchedUrl =
    findVeInvitePromotionUrl(
      lookup.expandedUrls,
      candidate.shareToken,
    );

  if (!matchedUrl) {
    await invalidatePendingSubmission(
      candidate,
      'SHARE_TOKEN_MISSING',
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'INVALIDATED',
      reason: 'SHARE_TOKEN_MISSING',
    });

    return 'INVALIDATED';
  }

  const { error } =
    await supabaseAdmin.rpc(
      'record_reward_x_promotion_initial_post_verification_v1',
      {
        p_invite_code:
          candidate.inviteCode,
        p_x_post_id:
          lookup.postId,
        p_x_author_id:
          lookup.authorId,
        p_x_post_created_at:
          lookup.createdAt,
        p_matched_expanded_url:
          matchedUrl,
      },
    );

  if (error) {
    const terminalReason =
      initialTerminalReason(
        error.message,
      );

    if (terminalReason) {
      try {
        await invalidatePendingSubmission(
          candidate,
          terminalReason,
        );
        await recordAttempt({
          inviteCode:
            candidate.inviteCode,
          submissionId:
            candidate.submissionId,
          verificationId: null,
          phase: 'INITIAL_RETRY',
          xPostId:
            candidate.xPostId,
          outcome: 'INVALIDATED',
          reason: terminalReason,
        });

        return 'INVALIDATED';
      } catch (invalidationError) {
        console.error(
          'X promotion initial verification could not persist terminal invalidation:',
          {
            inviteCode:
              candidate.inviteCode,
            postId:
              candidate.xPostId,
            error:
              invalidationError,
          },
        );
      }
    }

    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason:
        terminalReason
          ? 'INVALIDATION_RETRY_REQUIRED'
          : 'INITIAL_VERIFICATION_RETRY_REQUIRED',
      details: {
        databaseError:
          error.message.slice(0, 500),
      },
    });

    return 'RETRY';
  }

  await recordAttempt({
    inviteCode:
      candidate.inviteCode,
    submissionId:
      candidate.submissionId,
    verificationId: null,
    phase: 'INITIAL_RETRY',
    xPostId: candidate.xPostId,
    outcome: 'INITIAL_VERIFIED',
    reason: 'INITIAL_VERIFIED',
  });

  return 'VERIFIED';
}

async function processFinalCandidate(
  candidate: FinalCandidate,
): Promise<
  'FINAL_VERIFIED' |
  'INVALIDATED' |
  'REVIEW_REQUIRED' |
  'RETRY'
> {
  const lookup =
    await lookupXPromotionPost(
      candidate.xPostId,
    );

  if (lookup.status === 'RETRY') {
    await markReviewRequired(
      candidate.inviteCode,
      lookup.reason,
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId:
        candidate.verificationId,
      phase: 'FINAL_CHECK',
      xPostId: candidate.xPostId,
      outcome: 'REVIEW_REQUIRED',
      reason: lookup.reason,
    });

    return 'REVIEW_REQUIRED';
  }

  if (lookup.status === 'NOT_FOUND') {
    await invalidateFinalVerification(
      candidate,
      lookup.reason,
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId:
        candidate.verificationId,
      phase: 'FINAL_CHECK',
      xPostId: candidate.xPostId,
      outcome: 'INVALIDATED',
      reason: lookup.reason,
    });

    return 'INVALIDATED';
  }

  let terminalReason: string | null =
    null;

  if (
    lookup.authorId !==
    candidate.xAuthorId
  ) {
    terminalReason =
      'POST_AUTHOR_MISMATCH';
  } else if (!lookup.isOriginalPost) {
    terminalReason =
      'POST_NOT_ORIGINAL';
  }

  const matchedUrl =
    terminalReason
      ? null
      : findVeInvitePromotionUrl(
          lookup.expandedUrls,
          candidate.shareToken,
        );

  if (!terminalReason && !matchedUrl) {
    terminalReason =
      'SHARE_TOKEN_MISSING';
  }

  if (terminalReason) {
    await invalidateFinalVerification(
      candidate,
      terminalReason,
    );
    await recordAttempt({
      inviteCode:
        candidate.inviteCode,
      submissionId:
        candidate.submissionId,
      verificationId:
        candidate.verificationId,
      phase: 'FINAL_CHECK',
      xPostId: candidate.xPostId,
      outcome: 'INVALIDATED',
      reason: terminalReason,
    });

    return 'INVALIDATED';
  }

  const { error } =
    await supabaseAdmin.rpc(
      'finalize_reward_x_promotion_post_verification_v1',
      {
        p_invite_code:
          candidate.inviteCode,
        p_x_post_id:
          lookup.postId,
        p_x_author_id:
          lookup.authorId,
        p_matched_expanded_url:
          matchedUrl,
      },
    );

  if (error) {
    const securityHold =
      error.message.includes(
        'REWARD_X_PROMOTION_POST_SECURITY_NOT_CLEAR',
      );

    try {
      await markReviewRequired(
        candidate.inviteCode,
        securityHold
          ? 'SECURITY_NOT_CLEAR'
          : 'FINAL_VERIFICATION_RETRY_REQUIRED',
      );

      await recordAttempt({
        inviteCode:
          candidate.inviteCode,
        submissionId:
          candidate.submissionId,
        verificationId:
          candidate.verificationId,
        phase: 'FINAL_CHECK',
        xPostId:
          candidate.xPostId,
        outcome: 'REVIEW_REQUIRED',
        reason:
          securityHold
            ? 'SECURITY_NOT_CLEAR'
            : 'FINAL_VERIFICATION_RETRY_REQUIRED',
        details: {
          databaseError:
            error.message.slice(0, 500),
        },
      });

      return 'REVIEW_REQUIRED';
    } catch (reviewError) {
      console.error(
        'X promotion final verification could not persist REVIEW_REQUIRED:',
        {
          inviteCode:
            candidate.inviteCode,
          postId:
            candidate.xPostId,
          error: reviewError,
        },
      );

      await recordAttempt({
        inviteCode:
          candidate.inviteCode,
        submissionId:
          candidate.submissionId,
        verificationId:
          candidate.verificationId,
        phase: 'FINAL_CHECK',
        xPostId:
          candidate.xPostId,
        outcome: 'RETRY',
        reason:
          'FINAL_STATE_RETRY_REQUIRED',
      });

      return 'RETRY';
    }
  }

  await recordAttempt({
    inviteCode:
      candidate.inviteCode,
    submissionId:
      candidate.submissionId,
    verificationId:
      candidate.verificationId,
    phase: 'FINAL_CHECK',
    xPostId: candidate.xPostId,
    outcome: 'FINAL_VERIFIED',
    reason: 'FINAL_VERIFIED',
  });

  return 'FINAL_VERIFIED';
}

function emptySummary():
CandidateSummary {
  return {
    selected: 0,
    verified: 0,
    invalidated: 0,
    reviewRequired: 0,
    retry: 0,
    failed: 0,
  };
}

export async function runRewardXPromotionLifecycleMaintenance():
Promise<RewardXPromotionLifecycleResult> {
  const { network } =
    getVeBetterNetworkConfig();

  const terminalSecurity =
    await rpc(
      'release_terminal_reward_x_promotion_security_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

  const opportunitySync =
    await rpc(
      'sync_reward_x_promotion_opportunities_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

  const expiredBeforeVerification =
    await rpc(
      'expire_reward_x_promotion_opportunities_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

  const pendingEnvelope =
    await rpc(
      'read_reward_x_promotion_pending_post_candidates_v1',
      {
        p_network: network,
        p_limit: PENDING_LIMIT,
      },
    );
  const pendingCandidates =
    readPendingCandidates(
      pendingEnvelope,
    );
  const pending =
    emptySummary();
  pending.selected =
    pendingCandidates.length;

  for (const candidate of pendingCandidates) {
    try {
      const outcome =
        await processPendingCandidate(
          candidate,
        );

      if (outcome === 'VERIFIED') {
        pending.verified += 1;
      } else if (
        outcome === 'INVALIDATED'
      ) {
        pending.invalidated += 1;
      } else {
        pending.retry += 1;
      }
    } catch (error) {
      pending.failed += 1;
      console.error(
        'X promotion pending Post maintenance failed:',
        {
          inviteCode:
            candidate.inviteCode,
          postId:
            candidate.xPostId,
          error,
        },
      );
    }
  }

  const finalEnvelope =
    await rpc(
      'read_reward_x_promotion_final_post_candidates_v1',
      {
        p_network: network,
        p_limit: FINAL_LIMIT,
      },
    );
  const finalCandidates =
    readFinalCandidates(
      finalEnvelope,
    );
  const final =
    emptySummary();
  final.selected =
    finalCandidates.length;

  for (const candidate of finalCandidates) {
    try {
      const outcome =
        await processFinalCandidate(
          candidate,
        );

      if (
        outcome === 'FINAL_VERIFIED'
      ) {
        final.verified += 1;
      } else if (
        outcome === 'INVALIDATED'
      ) {
        final.invalidated += 1;
      } else if (
        outcome === 'REVIEW_REQUIRED'
      ) {
        final.reviewRequired += 1;
      } else {
        final.retry += 1;
      }
    } catch (error) {
      final.failed += 1;
      console.error(
        'X promotion final Post maintenance failed:',
        {
          inviteCode:
            candidate.inviteCode,
          postId:
            candidate.xPostId,
          error,
        },
      );
    }
  }

  const expiredAfterVerification =
    await rpc(
      'expire_reward_x_promotion_opportunities_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

  return {
    network,
    terminalSecurity,
    opportunitySync,
    expiredBeforeVerification,
    pending,
    final,
    expiredAfterVerification,
  };
}
