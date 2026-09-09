'use client';

import {
  createContext,
  type ReactNode,
  useContext,
} from 'react';

import type {
  PublicRewardForecastSeed,
} from '@/lib/rewards/publicRewardForecastSeed';

const RewardForecastSeedContext =
  createContext<PublicRewardForecastSeed | null>(null);

export function RewardForecastSeedProvider({
  initialForecast,
  children,
}: {
  initialForecast: PublicRewardForecastSeed | null;
  children: ReactNode;
}) {
  return (
    <RewardForecastSeedContext.Provider value={initialForecast}>
      {children}
    </RewardForecastSeedContext.Provider>
  );
}

export function useRewardForecastSeed(): PublicRewardForecastSeed | null {
  return useContext(RewardForecastSeedContext);
}
