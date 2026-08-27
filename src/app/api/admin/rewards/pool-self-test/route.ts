import { NextResponse } from 'next/server';

import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'Reward pool self-test is disabled in Production.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const status =
      await readVeInviteRewardPoolStatus();

    const effectiveMatchesActivePool =
      status.effectiveRewardPoolWei ===
      (
        status.rewardsPoolEnabled
          ? status.rewardsPoolBalanceWei
          : status.availableFundsWei
      );

    if (!effectiveMatchesActivePool) {
      throw new Error(
        'Effective reward pool does not match the active on-chain pool.',
      );
    }

    return NextResponse.json(
      {
        mode: 'PREVIEW_SELF_TEST',
        passed: true,
        status,
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Reward pool self-test failed:',
      error,
    );

    return NextResponse.json(
      {
        mode: 'PREVIEW_SELF_TEST',
        passed: false,
        error:
          'Reward pool self-test failed.',
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
