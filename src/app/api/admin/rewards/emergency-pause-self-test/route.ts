import { NextResponse } from 'next/server';

import {
  readVeInviteRewardPoolStatus,
  type VeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readRewardRuntimeSafety,
  type RewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'Emergency pause self-test is disabled in Production.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag':
            'noindex, nofollow, noarchive',
        },
      },
    );
  }

  const results: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }> = [];
  let runtime: RewardRuntimeSafety | null = null;
  let pool: VeInviteRewardPoolStatus | null = null;

  try {
    runtime = await readRewardRuntimeSafety();
    results.push({
      name:
        'runtime safety configuration is readable',
      passed: true,
    });
  } catch (error) {
    results.push({
      name:
        'runtime safety configuration is readable',
      passed: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown test failure',
    });
  }

  try {
    pool = await readVeInviteRewardPoolStatus();
    results.push({
      name:
        'reward pool and pause state are readable',
      passed: true,
    });
  } catch (error) {
    results.push({
      name:
        'reward pool and pause state are readable',
      passed: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown test failure',
    });
  }

  if (runtime && pool) {
    try {
      expectEqual(
        pool.distributionPaused,
        runtime.emergencyRewardsPaused ||
          pool.onChainDistributionPaused,
        'distributionPaused',
      );
      results.push({
        name:
          'effective pause is the OR of local and on-chain controls',
        passed: true,
      });
    } catch (error) {
      results.push({
        name:
          'effective pause is the OR of local and on-chain controls',
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown test failure',
      });
    }

    const reasonValid =
      !runtime.emergencyRewardsPaused ||
      Boolean(runtime.emergencyPauseReason);

    results.push({
      name:
        'active local pause always has an operator reason',
      passed: reasonValid,
      ...(reasonValid
        ? {}
        : {
            error:
              'Emergency pause is active without a reason.',
          }),
    });
  } else {
    results.push(
      {
        name:
          'effective pause is the OR of local and on-chain controls',
        passed: false,
        error:
          'Pause state dependencies were not loaded.',
      },
      {
        name:
          'active local pause always has an operator reason',
        passed: false,
        error:
          'Runtime safety state was not loaded.',
      },
    );
  }

  const failed = results.filter(
    (result) => !result.passed,
  );

  return NextResponse.json(
    {
      mode:
        'PREVIEW_EMERGENCY_PAUSE_SELF_TEST',
      writesPerformed: false,
      transfersPerformed: false,
      runtime,
      pool: pool
        ? {
            network: pool.network,
            onChainDistributionPaused:
              pool.onChainDistributionPaused,
            emergencyRewardsPaused:
              pool.emergencyRewardsPaused,
            distributionPaused:
              pool.distributionPaused,
          }
        : null,
      total: results.length,
      passed:
        results.length - failed.length,
      failed: failed.length,
      results,
    },
    {
      status:
        failed.length === 0
          ? 200
          : 500,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag':
          'noindex, nofollow, noarchive',
      },
    },
  );
}
