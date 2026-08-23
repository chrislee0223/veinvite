import { NextResponse } from 'next/server';

import {
  getRewardPoolSnapshot,
} from '@/lib/vebetter/rewardPool';

const ZERO_APP_ID =
  `0x${'0'.repeat(64)}`;

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'Rewards pool probe is disabled in Production.',
      },
      { status: 403 },
    );
  }

  const configuredAppId =
    process.env.VEBETTER_APP_ID?.trim();

  const appId =
    configuredAppId || ZERO_APP_ID;

  try {
    const snapshot =
      await getRewardPoolSnapshot(appId);

    return NextResponse.json(
      {
        mode: 'READ_ONLY_POOL_PROBE',
        configuredAppId:
          Boolean(configuredAppId),
        contractProbeOnly:
          !configuredAppId,
        writesPerformed: false,
        transfersPerformed: false,
        ...snapshot,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Rewards pool probe failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Rewards pool probe failed.',
        configuredAppId:
          Boolean(configuredAppId),
        writesPerformed: false,
        transfersPerformed: false,
      },
      { status: 500 },
    );
  }
}
