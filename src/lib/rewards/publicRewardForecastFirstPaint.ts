import { unstable_cache } from 'next/cache';
import { PUBLIC_ACTIVE_FORECAST_MODEL_VERSION } from '@/lib/rewards/activeSharedPoolForecast';
import { readElasticPublicPreview, type ElasticPublicPreview } from '@/lib/rewards/publicElasticForecastReader';
import { forecastSnapshotAgeMs, isRewardForecastStale } from '@/lib/rewards/rewardForecastCacheGuards';
import { REWARD_POOL_OBSERVATION_MODEL_VERSION } from '@/lib/rewards/rewardPoolObservation';
import { readLatestRewardPoolObservation } from '@/lib/rewards/rewardPoolObservation';
import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

// Public display-only hint. It is never used to authorize or price rewards.
export type FirstPaintPublicRewardForecast = {
  status: 'ready';
  generatedAt: string;
  modelVersion: string;
  estimatedRewardWei: string;
  elasticEstimate: Extract<ElasticPublicPreview, { mode: 'ELASTIC_SCENARIOS' }>;
  stale: boolean;
};

// Cache the same approved, participation-aware reader used by the public API.
// This bounds extra Supabase reads on repeat visits; client updates remain live.
const readCachedFirstPaintForecast = unstable_cache(
  async (network: string): Promise<FirstPaintPublicRewardForecast | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_200);
    try {
      const [snapshot, elastic] = await Promise.all([
        readLatestRewardPoolObservation({
          network, appId: VEINVITE_APP_ID, signal: controller.signal,
        }),
        readElasticPublicPreview(network, controller.signal),
      ]);
      if (!snapshot ||
          snapshot.modelVersion !== REWARD_POOL_OBSERVATION_MODEL_VERSION ||
          forecastSnapshotAgeMs(snapshot.generatedAt, Date.now()) === null ||
          elastic?.mode !== 'ELASTIC_SCENARIOS' ||
          elastic.displayEstimateWei !==
            elastic.displayEstimateWei.trim()) {
        return null;
      }
      return {
        status: 'ready',
        generatedAt: snapshot.generatedAt,
        modelVersion: PUBLIC_ACTIVE_FORECAST_MODEL_VERSION,
        estimatedRewardWei: elastic.displayEstimateWei,
        elasticEstimate: elastic,
        stale: isRewardForecastStale({
          generatedAt: snapshot.generatedAt,
          nowMs: Date.now(),
        }),
      };
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('First-paint reward forecast unavailable:', error);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
  ['public-current-shared-pool-first-paint-v1'],
  { revalidate: 30 },
);

/** Best-effort SSR prefill: no wallet data, no writes, no on-chain RPC. */
export async function readPublicSharedPoolFirstPaintForecast():
  Promise<FirstPaintPublicRewardForecast | null> {
  if (process.env.VEINVITE_ELASTIC_COHORT_ENABLED !== 'true') return null;
  const { network } = getVeBetterNetworkConfig();
  // The existing wallet bootstrap is capped at 3.5 seconds. Do not allow
  // this optional display-only read to make Home's first response slower.
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 1_250);
    });
    const seed = await Promise.race([
      readCachedFirstPaintForecast(network), timeout,
    ]);
    return seed && forecastSnapshotAgeMs(seed.generatedAt, Date.now()) !== null
      ? { ...seed, stale: isRewardForecastStale({
          generatedAt: seed.generatedAt, nowMs: Date.now(), stale: seed.stale,
        }) }
      : null;
  } catch (error) {
    console.warn('First-paint reward forecast seed failed:', error);
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
