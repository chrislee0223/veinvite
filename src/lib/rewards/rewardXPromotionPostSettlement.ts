import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

/**
 * Best-effort post-settlement bridge from the core referral payout into the
 * optional X promotion lifecycle.
 *
 * This must never become part of core payout correctness. The referral payout
 * has already been finalized before this helper is called. Any failure here is
 * logged and left for the independent 15-minute X-promotion maintenance cron
 * to retry.
 */
export async function syncRewardXPromotionOpportunitiesAfterCoreSettlement(
  network: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc(
      'sync_reward_x_promotion_opportunities_v1',
      {
        p_network: network,
        p_limit: 50,
      },
    );

    if (error) {
      console.error(
        'Post-settlement X promotion opportunity sync failed:',
        error,
      );
    }
  } catch (error) {
    console.error(
      'Post-settlement X promotion opportunity sync failed:',
      error,
    );
  }
}
