import type { ElasticRewardPreview } from './rewardForecastDisplay';

export type PublicRewardForecastSeed = {
  generatedAt: string;
  modelVersion: string;
  status: 'ready';
  estimatedRewardWei: string;
  recipientLow?: number;
  elasticEstimate?: ElasticRewardPreview;
  stale: boolean;
};
