import 'server-only';

import {
  lookupXPromotionPost,
} from '@/lib/rewards/rewardXPromotionXApi';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

// Stable syntactically valid X Post lookup probe. The readiness check
// accepts either FOUND or an authenticated NOT_FOUND response as proof that
// the bearer token and X API endpoint are reachable. This avoids depending
// on the continued existence of any particular external Post.
const X_API_READINESS_POST_ID =
  '1228393702244134912';
const EXTERNAL_READINESS_DB_TIMEOUT_MS =
  8_000;

type RuntimeCheckStatus =
  | 'READY'
  | 'POST_NOT_FOUND'
  | 'X_API_NOT_CONFIGURED'
  | 'X_API_AUTH_FAILED'
  | 'X_API_RATE_LIMITED'
  | 'X_API_UNAVAILABLE'
  | 'X_API_RESPONSE_INVALID';

export type RewardXPromotionExternalReadinessResult = {
  network: string;
  ready: boolean;
  status: RuntimeCheckStatus;
  checkedAt: string;
  externalVerificationPaused: boolean;
};

export async function runRewardXPromotionExternalReadinessCheck():
Promise<RewardXPromotionExternalReadinessResult> {
  const { network } =
    getVeBetterNetworkConfig();

  const lookup =
    await lookupXPromotionPost(
      X_API_READINESS_POST_ID,
    );

  const status: RuntimeCheckStatus =
    lookup.status === 'FOUND'
      ? 'READY'
      : lookup.status === 'NOT_FOUND'
        ? 'POST_NOT_FOUND'
        : lookup.reason;

  const checkedAt =
    new Date().toISOString();

  const { error: insertError } =
    await supabaseAdmin
      .from(
        'reward_x_promotion_external_runtime_checks',
      )
      .insert({
        network,
        status,
        probe_post_id:
          X_API_READINESS_POST_ID,
        checked_at: checkedAt,
        details: {
          lookupStatus:
            lookup.status,
        },
      })
      .abortSignal(
        AbortSignal.timeout(
          EXTERNAL_READINESS_DB_TIMEOUT_MS,
        ),
      );

  if (insertError) {
    throw new Error(
      `Failed to record X promotion external runtime readiness: ${insertError.message}`,
    );
  }

  let externalVerificationPaused =
    false;

  const ready =
    status === 'READY' ||
    status === 'POST_NOT_FOUND';

  if (!ready) {
    const { data: config, error: configError } =
      await supabaseAdmin
        .from('reward_runtime_config')
        .select(
          'reward_x_promotion_external_verification_ready',
        )
        .eq('id', 1)
        .abortSignal(
          AbortSignal.timeout(
            EXTERNAL_READINESS_DB_TIMEOUT_MS,
          ),
        )
        .single();

    if (configError) {
      throw new Error(
        `Failed to read X promotion runtime gate: ${configError.message}`,
      );
    }

    if (
      config
        ?.reward_x_promotion_external_verification_ready ===
      true
    ) {
      const {
        data: pauseData,
        error: pauseError,
      } = await supabaseAdmin
        .rpc(
          'pause_reward_x_promotion_external_verification_v1',
        )
        .abortSignal(
          AbortSignal.timeout(
            EXTERNAL_READINESS_DB_TIMEOUT_MS,
          ),
        );

      if (pauseError) {
        throw new Error(
          `Failed to pause X promotion external verification gate: ${pauseError.message}`,
        );
      }

      externalVerificationPaused =
        Boolean(
          pauseData &&
          typeof pauseData === 'object' &&
          !Array.isArray(pauseData) &&
          (pauseData as Record<string, unknown>).paused === true,
        );
    }
  }

  return {
    network,
    ready,
    status,
    checkedAt,
    externalVerificationPaused,
  };
}
