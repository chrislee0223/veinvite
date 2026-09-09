import { unstable_cache } from 'next/cache';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import type { PublicRewardForecastSeed } from '@/lib/rewards/publicRewardForecastSeed';
import { REWARD_FORECAST_MODEL_VERSION } from '@/lib/rewards/rewardForecastPolicy';
import { readLatestRewardForecastSnapshot } from '@/lib/rewards/rewardForecastSnapshot';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const FORECAST_SEED_CACHE_SECONDS = 5 * 60;
const FORECAST_SEED_STALE_MS = 60 * 60_000;
const FORECAST_SEED_MAX_AGE_MS = 24 * 60 * 60_000;

const readCachedPublicRewardForecastSeed = unstable_cache(
  async (
    network: string,
    appId: string,
  ): Promise<PublicRewardForecastSeed | null> => {
    const snapshot = await readLatestRewardForecastSnapshot({
      network,
      appId,
    });
    if (!snapshot) return null;
    if (snapshot.modelVersion !== REWARD_FORECAST_MODEL_VERSION) {
      return null;
    }

    const generatedAtMs = Date.parse(snapshot.generatedAt);
    if (Number.isNaN(generatedAtMs)) return null;

    const ageMs = Date.now() - generatedAtMs;
    if (ageMs < 0 || ageMs > FORECAST_SEED_MAX_AGE_MS) {
      return null;
    }

    return {
      generatedAt: snapshot.generatedAt,
      modelVersion: snapshot.modelVersion,
      status: 'ready',
      estimatedRewardWei: snapshot.estimatedRewardWei,
      stale: ageMs > FORECAST_SEED_STALE_MS,
    };
  },
  ['public-reward-forecast-seed-v1'],
  { revalidate: FORECAST_SEED_CACHE_SECONDS },
);

export async function readPublicRewardForecastSeed(): Promise<PublicRewardForecastSeed | null> {
  const { network } = getVeBetterNetworkConfig();

  try {
    return await readCachedPublicRewardForecastSeed(
      network,
      VEINVITE_APP_ID,
    );
  } catch (error) {
    // Forecast is a public convenience surface. A cache/database failure must
    // never block Home or wallet-session bootstrap.
    console.warn('Public reward forecast seed could not be loaded:', error);
    return null;
  }
}
