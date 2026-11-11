import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import {
  normalizeElasticRewardPreview,
  type ElasticRewardPreview,
} from '@/lib/rewards/rewardForecastDisplay';
import { supabaseAdmin } from '@/lib/supabaseServer';

/** Read-only public scenarios; never a payout or reservation authority. */
export async function readElasticPublicPreview(
  network: string,
  signal?: AbortSignal,
): Promise<ElasticRewardPreview | null> {
  if (process.env.VEINVITE_ELASTIC_COHORT_ENABLED !== 'true') return null;
  try {
    const query = supabaseAdmin.rpc(
      'read_reward_elastic_public_scenarios_v1',
      { p_network: network, p_app_id: VEINVITE_APP_ID },
    );
    const { data, error } = signal
      ? await query.abortSignal(signal)
      : await query;
    if (error) throw new Error(error.message);
    return normalizeElasticRewardPreview(data);
  } catch (error) {
    if (!signal?.aborted) {
      console.warn('Elastic reward preview unavailable:', error);
    }
    // Never fall back to an unrelated single-number forecast in elastic mode.
    return { mode: 'PENDING' };
  }
}
