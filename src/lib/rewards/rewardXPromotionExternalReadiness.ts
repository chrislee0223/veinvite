import 'server-only';

import {
  lookupXPromotionPost,
} from '@/lib/rewards/rewardXPromotionXApi';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

// Official X API Post-lookup quickstart sample Post.
// Keeping the probe on X's own documented sample avoids depending on
// a VeInvite user Post or creating a synthetic promotion opportunity.
const X_API_READINESS_POST_ID =
  '1228393702244134912';

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
      });

  if (insertError) {
    throw new Error(
      `Failed to record X promotion external runtime readiness: ${insertError.message}`,
    );
  }

  let externalVerificationPaused =
    false;

  if (status !== 'READY') {
    const { data: config, error: configError } =
      await supabaseAdmin
        .from('reward_runtime_config')
        .select(
          'reward_x_promotion_external_verification_ready',
        )
        .eq('id', 1)
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
      const { error: pauseError } =
        await supabaseAdmin
          .from('reward_runtime_config')
          .update({
            reward_x_promotion_external_verification_ready:
              false,
          })
          .eq('id', 1)
          .eq(
            'reward_x_promotion_external_verification_ready',
            true,
          );

      if (pauseError) {
        throw new Error(
          `Failed to pause X promotion external verification gate: ${pauseError.message}`,
        );
      }

      externalVerificationPaused =
        true;
    }
  }

  return {
    network,
    ready: status === 'READY',
    status,
    checkedAt,
    externalVerificationPaused,
  };
}
