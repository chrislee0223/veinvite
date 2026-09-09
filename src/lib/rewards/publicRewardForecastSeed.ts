export type PublicRewardForecastSeed = {
  generatedAt: string;
  modelVersion: string;
  status: 'ready';
  estimatedRewardWei: string;
  stale: boolean;
};
