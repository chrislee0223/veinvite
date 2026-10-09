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
  submissionId: string;
  xPostId: string;
  shareToken: string;
};

type FinalCandidate = {
  inviteCode: string;
  submissionId: string;
  verificationId: string;
  xPostId: string;
  xAuthorId: string;
  shareToken: string;
};

type MaintenanceCounts = {
  opportunityCreated: number;
  opportunityExpired: number;
  securityReleased: number;
  pendingProcessed: number;
  pendingVerified: number;
  pendingInvalidated: number;
  pendingRetry: number;
  finalProcessed: number;
  finalVerified: number;
  finalInvalidated: number;
  finalReviewRequired: number;
  finalRetry: number;
};

export type RewardXPromotionMaintenanceResult = {
  enabled: boolean;
  network: string;
  counts: MaintenanceCounts;
};

const ZERO_COUNTS: MaintenanceCounts = {
  opportunityCreated: 0,
  opportunityExpired: 0,
  securityReleased: 0,
  pendingProcessed: 0,
  pendingVerified: 0,
  pendingInvalidated: 0,
  pendingRetry: 0,
  finalProcessed: 0,
  finalVerified: 0,
  finalInvalidated: 0,
  finalReviewRequired: 0,
  finalRetry: 0,
};

function asRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`X promotion maintenance ${fieldName} is malformed.`);
  }
  return value as Record<string, unknown>;
}

function positiveId(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/u.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error(`X promotion maintenance ${fieldName} is invalid.`);
  }
  return BigInt(normalized).toString();
}

function countValue(
  value: unknown,
  fieldName: string,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`X promotion maintenance ${fieldName} is invalid.`);
  }
  return parsed;
}

function stringValue(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`X promotion maintenance ${fieldName} is invalid.`);
  }
  return normalized;
}

async function rpcRecord(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.rpc(
    name as never,
    args as never,
  );

  if (error) {
    throw new Error(
      `X promotion maintenance ${name} failed: ${error.message}`,
    );
  }

  return asRecord(data, name);
}

async function liveEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('reward_runtime_config')
    .select('reward_x_promotion_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `X promotion runtime state could not be loaded: ${error.message}`,
    );
  }

  if (
    !data ||
    typeof data.reward_x_promotion_enabled !== 'boolean'
  ) {
    throw new Error(
      'X promotion runtime state is malformed.',
    );
  }

  return data.reward_x_promotion_enabled;
}

function readPendingCandidates(
  value: Record<string, unknown>,
  network: string,
): PendingCandidate[] {
  if (
    String(value.network ?? '').toLowerCase() !== network ||
    !Array.isArray(value.candidates)
  ) {
    throw new Error(
      'X promotion pending candidate response is malformed.',
    );
  }

  return value.candidates.map((item, index) => {
    const row = asRecord(
      item,
      `pending candidate ${index}`,
    );

    return {
      inviteCode: stringValue(
        row.inviteCode,
        'pending invite code',
      ).toUpperCase(),
      submissionId: positiveId(
        row.submissionId,
        'pending submission id',
      ),
      xPostId: stringValue(
        row.xPostId,
        'pending Post id',
      ),
      shareToken: stringValue(
        row.shareToken,
        'pending share token',
      ),
    };
  });
}

function readFinalCandidates(
  value: Record<string, unknown>,
  network: string,
): FinalCandidate[] {
  if (
    String(value.network ?? '').toLowerCase() !== network ||
    !Array.isArray(value.candidates)
  ) {
    throw new Error(
      'X promotion final candidate response is malformed.',
    );
  }

  return value.candidates.map((item, index) => {
    const row = asRecord(
      item,
      `final candidate ${index}`,
    );

    return {
      inviteCode: stringValue(
        row.inviteCode,
        'final invite code',
      ).toUpperCase(),
      submissionId: positiveId(
        row.submissionId,
        'final submission id',
      ),
      verificationId: positiveId(
        row.verificationId,
        'final verification id',
      ),
      xPostId: stringValue(
        row.xPostId,
        'final Post id',
      ),
      xAuthorId: stringValue(
        row.xAuthorId,
        'final author id',
      ),
      shareToken: stringValue(
        row.shareToken,
        'final share token',
      ),
    };
  });
}

async function recordAttempt(input: {
  inviteCode: string;
  submissionId: string;
  verificationId: string | null;
  phase: 'INITIAL_RETRY' | 'FINAL_CHECK';
  xPostId: string;
  outcome:
    | 'RETRY'
    | 'INITIAL_VERIFIED'
    | 'INVALIDATED'
    | 'REVIEW_REQUIRED'
    | 'FINAL_VERIFIED';
  reason: string;
}) {
  await rpcRecord(
    'record_reward_x_promotion_verification_attempt_v1',
    {
      p_invite_code: input.inviteCode,
      p_submission_id: input.submissionId,
      p_verification_id: input.verificationId,
      p_phase: input.phase,
      p_x_post_id: input.xPostId,
      p_outcome: input.outcome,
      p_reason: input.reason,
      p_details: {},
    },
  );
}

async function invalidatePending(
  candidate: PendingCandidate,
  reason:
    | 'POST_NOT_FOUND'
    | 'SHARE_TOKEN_MISSING'
    | 'POST_NOT_ORIGINAL'
    | 'POST_CREATED_OUTSIDE_WINDOW'
    | 'WALLET_AUTHOR_MISMATCH'
    | 'AUTHOR_ALREADY_BOUND'
    | 'POST_IDENTITY_MISMATCH',
) {
  await rpcRecord(
    'invalidate_reward_x_promotion_post_submission_v1',
    {
      p_invite_code: candidate.inviteCode,
      p_x_post_id: candidate.xPostId,
      p_reason: reason,
    },
  );

  await recordAttempt({
    inviteCode: candidate.inviteCode,
    submissionId: candidate.submissionId,
    verificationId: null,
    phase: 'INITIAL_RETRY',
    xPostId: candidate.xPostId,
    outcome: 'INVALIDATED',
    reason,
  });
}

async function processPendingCandidate(
  candidate: PendingCandidate,
): Promise<'VERIFIED' | 'INVALIDATED' | 'RETRY'> {
  const lookup =
    await lookupXPromotionPost(candidate.xPostId);

  if (lookup.status === 'RETRY') {
    await recordAttempt({
      inviteCode: candidate.inviteCode,
      submissionId: candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason: lookup.reason,
    });
    return 'RETRY';
  }

  if (lookup.status === 'NOT_FOUND') {
    await invalidatePending(
      candidate,
      'POST_NOT_FOUND',
    );
    return 'INVALIDATED';
  }

  if (!lookup.isOriginalPost) {
    await invalidatePending(
      candidate,
      'POST_NOT_ORIGINAL',
    );
    return 'INVALIDATED';
  }

  const matchedUrl =
    findVeInvitePromotionUrl(
      lookup.expandedUrls,
      candidate.shareToken,
    );

  if (!matchedUrl) {
    await invalidatePending(
      candidate,
      'SHARE_TOKEN_MISSING',
    );
    return 'INVALIDATED';
  }

  const { error } = await supabaseAdmin.rpc(
    'record_reward_x_promotion_initial_post_verification_v1',
    {
      p_invite_code: candidate.inviteCode,
      p_x_post_id: lookup.postId,
      p_x_author_id: lookup.authorId,
      p_x_post_created_at: lookup.createdAt,
      p_matched_expanded_url: matchedUrl,
    },
  );

  if (error) {
    const message = error.message;
    const reason:
      | 'POST_CREATED_OUTSIDE_WINDOW'
      | 'WALLET_AUTHOR_MISMATCH'
      | 'AUTHOR_ALREADY_BOUND'
      | 'POST_IDENTITY_MISMATCH'
      | null =
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

    if (reason) {
      await invalidatePending(candidate, reason);
      return 'INVALIDATED';
    }

    await recordAttempt({
      inviteCode: candidate.inviteCode,
      submissionId: candidate.submissionId,
      verificationId: null,
      phase: 'INITIAL_RETRY',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason: 'INITIAL_VERIFICATION_RETRY_REQUIRED',
    });
    return 'RETRY';
  }

  await recordAttempt({
    inviteCode: candidate.inviteCode,
    submissionId: candidate.submissionId,
    verificationId: null,
    phase: 'INITIAL_RETRY',
    xPostId: candidate.xPostId,
    outcome: 'INITIAL_VERIFIED',
    reason: 'INITIAL_VERIFIED',
  });

  return 'VERIFIED';
}

async function invalidateFinal(
  candidate: FinalCandidate,
  reason:
    | 'POST_NOT_FOUND'
    | 'SHARE_TOKEN_MISSING'
    | 'POST_NOT_ORIGINAL'
    | 'POST_IDENTITY_MISMATCH'
    | 'POST_AUTHOR_MISMATCH',
) {
  await rpcRecord(
    'invalidate_reward_x_promotion_post_verification_v1',
    {
      p_invite_code: candidate.inviteCode,
      p_reason: reason,
    },
  );

  await recordAttempt({
    inviteCode: candidate.inviteCode,
    submissionId: candidate.submissionId,
    verificationId: candidate.verificationId,
    phase: 'FINAL_CHECK',
    xPostId: candidate.xPostId,
    outcome: 'INVALIDATED',
    reason,
  });
}

async function processFinalCandidate(
  candidate: FinalCandidate,
): Promise<
  'VERIFIED' | 'INVALIDATED' | 'REVIEW_REQUIRED' | 'RETRY'
> {
  const lookup =
    await lookupXPromotionPost(candidate.xPostId);

  if (lookup.status === 'RETRY') {
    await recordAttempt({
      inviteCode: candidate.inviteCode,
      submissionId: candidate.submissionId,
      verificationId: candidate.verificationId,
      phase: 'FINAL_CHECK',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason: lookup.reason,
    });
    return 'RETRY';
  }

  if (lookup.status === 'NOT_FOUND') {
    await invalidateFinal(
      candidate,
      'POST_NOT_FOUND',
    );
    return 'INVALIDATED';
  }

  if (!lookup.isOriginalPost) {
    await invalidateFinal(
      candidate,
      'POST_NOT_ORIGINAL',
    );
    return 'INVALIDATED';
  }

  if (lookup.authorId !== candidate.xAuthorId) {
    await invalidateFinal(
      candidate,
      'POST_AUTHOR_MISMATCH',
    );
    return 'INVALIDATED';
  }

  const matchedUrl =
    findVeInvitePromotionUrl(
      lookup.expandedUrls,
      candidate.shareToken,
    );

  if (!matchedUrl) {
    await invalidateFinal(
      candidate,
      'SHARE_TOKEN_MISSING',
    );
    return 'INVALIDATED';
  }

  const { error } = await supabaseAdmin.rpc(
    'finalize_reward_x_promotion_post_verification_v1',
    {
      p_invite_code: candidate.inviteCode,
      p_x_post_id: lookup.postId,
      p_x_author_id: lookup.authorId,
      p_matched_expanded_url: matchedUrl,
    },
  );

  if (error) {
    if (
      error.message.includes(
        'REWARD_X_PROMOTION_POST_SECURITY_NOT_CLEAR',
      )
    ) {
      await rpcRecord(
        'mark_reward_x_promotion_post_review_required_v1',
        {
          p_invite_code: candidate.inviteCode,
          p_reason: 'SECURITY_NOT_CLEAR',
        },
      );

      await recordAttempt({
        inviteCode: candidate.inviteCode,
        submissionId: candidate.submissionId,
        verificationId: candidate.verificationId,
        phase: 'FINAL_CHECK',
        xPostId: candidate.xPostId,
        outcome: 'REVIEW_REQUIRED',
        reason: 'SECURITY_NOT_CLEAR',
      });
      return 'REVIEW_REQUIRED';
    }

    if (
      error.message.includes(
        'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH',
      )
    ) {
      await invalidateFinal(
        candidate,
        'POST_IDENTITY_MISMATCH',
      );
      return 'INVALIDATED';
    }

    await recordAttempt({
      inviteCode: candidate.inviteCode,
      submissionId: candidate.submissionId,
      verificationId: candidate.verificationId,
      phase: 'FINAL_CHECK',
      xPostId: candidate.xPostId,
      outcome: 'RETRY',
      reason: 'FINAL_VERIFICATION_RETRY_REQUIRED',
    });
    return 'RETRY';
  }

  await recordAttempt({
    inviteCode: candidate.inviteCode,
    submissionId: candidate.submissionId,
    verificationId: candidate.verificationId,
    phase: 'FINAL_CHECK',
    xPostId: candidate.xPostId,
    outcome: 'FINAL_VERIFIED',
    reason: 'FINAL_VERIFIED',
  });

  return 'VERIFIED';
}

export async function runRewardXPromotionMaintenance():
Promise<RewardXPromotionMaintenanceResult> {
  const { network } =
    getVeBetterNetworkConfig();

  if (!(await liveEnabled())) {
    return {
      enabled: false,
      network,
      counts: { ...ZERO_COUNTS },
    };
  }

  const counts: MaintenanceCounts = {
    ...ZERO_COUNTS,
  };

  const security = await rpcRecord(
    'release_terminal_reward_x_promotion_security_v1',
    {
      p_network: network,
      p_limit: 25,
    },
  );
  counts.securityReleased = countValue(
    security.releasedCount,
    'security released count',
  );

  const opportunities = await rpcRecord(
    'sync_reward_x_promotion_opportunities_v1',
    {
      p_network: network,
      p_limit: 25,
    },
  );
  counts.opportunityCreated = countValue(
    opportunities.createdCount,
    'opportunity created count',
  );

  const expiration = await rpcRecord(
    'expire_reward_x_promotion_opportunities_v1',
    {
      p_network: network,
      p_limit: 25,
    },
  );
  counts.opportunityExpired = countValue(
    expiration.releasedCount,
    'opportunity expired count',
  );

  const pending = readPendingCandidates(
    await rpcRecord(
      'read_reward_x_promotion_pending_post_candidates_v1',
      {
        p_network: network,
        p_limit: 10,
      },
    ),
    network,
  );

  for (const candidate of pending) {
    try {
      counts.pendingProcessed += 1;
      const outcome =
        await processPendingCandidate(candidate);
      if (outcome === 'VERIFIED') {
        counts.pendingVerified += 1;
      } else if (outcome === 'INVALIDATED') {
        counts.pendingInvalidated += 1;
      } else {
        counts.pendingRetry += 1;
      }
    } catch (error) {
      counts.pendingRetry += 1;
      console.warn(
        'X promotion pending verification candidate failed:',
        {
          inviteCode: candidate.inviteCode,
          postId: candidate.xPostId,
          error,
        },
      );
    }
  }

  const finalCandidates = readFinalCandidates(
    await rpcRecord(
      'read_reward_x_promotion_final_post_candidates_v1',
      {
        p_network: network,
        p_limit: 10,
      },
    ),
    network,
  );

  for (const candidate of finalCandidates) {
    try {
      counts.finalProcessed += 1;
      const outcome =
        await processFinalCandidate(candidate);

      if (outcome === 'VERIFIED') {
        counts.finalVerified += 1;
      } else if (outcome === 'INVALIDATED') {
        counts.finalInvalidated += 1;
      } else if (outcome === 'REVIEW_REQUIRED') {
        counts.finalReviewRequired += 1;
      } else {
        counts.finalRetry += 1;
      }
    } catch (error) {
      counts.finalRetry += 1;
      console.warn(
        'X promotion final verification candidate failed:',
        {
          inviteCode: candidate.inviteCode,
          postId: candidate.xPostId,
          error,
        },
      );
    }
  }

  return {
    enabled: true,
    network,
    counts,
  };
}
