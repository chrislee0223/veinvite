import { NextResponse } from 'next/server';

import {
  readAutomaticRewardDistributorReadiness,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from('invitations')
      .select('invite_code', {
        head: true,
        count: 'exact',
      });

    if (error) {
      throw error;
    }

    const [automaticRewards, pool] = await Promise.all([
      Promise.resolve(
        readAutomaticRewardDistributorReadiness(),
      ),
      readVeInviteRewardPoolStatus(),
    ]);

    const distributorRegistered = Boolean(
      automaticRewards.distributorAddress &&
      pool.rewardDistributors.includes(
        automaticRewards.distributorAddress,
      ),
    );
    const automaticRewardsReady = Boolean(
      automaticRewards.enabled &&
      automaticRewards.configured &&
      distributorRegistered &&
      !pool.distributionPaused,
    );

    return NextResponse.json(
      {
        ok: true,
        app: 'VeInvite',
        version: '0.1.0',
        database: 'ready',
        network:
          getVeBetterNetworkConfig()
            .network,
        automaticRewards: {
          enabled: automaticRewards.enabled,
          configured: automaticRewards.configured,
          distributorAddress:
            automaticRewards.distributorAddress,
          distributorRegistered,
          distributionPaused:
            pool.distributionPaused,
          ready: automaticRewardsReady,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'VeInvite readiness check failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        app: 'VeInvite',
        version: '0.1.0',
        database: 'unavailable',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
