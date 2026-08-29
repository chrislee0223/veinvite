import { NextResponse } from 'next/server';

import {
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  readRewardRuntimeSafety,
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

  const test = async (
    name: string,
    run: () => void | Promise<void>,
  ) => {
    try {
      await run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({
        name,
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown test failure',
      });
    }
  };

  let runtime:
    Awaited<
      ReturnType<
        typeof readRewardRuntimeSafety
      >
    > | null = null;
  let pool:
    Awaited<
      ReturnType<
        typeof readVeInviteRewardPoolStatus
      >
    > | null = null;

  await test(
    'runtime safety configuration is readable',
    async () => {
      runtime =
        await readRewardRuntimeSafety();
    },
  );

  await test(
    'reward pool and pause state are readable',
    async () => {
      pool =
        await readVeInviteRewardPoolStatus();
    },
  );

  await test(
    'effective pause is the OR of local and on-chain controls',
    () => {
      if (!runtime || !pool) {
        throw new Error(
          'Pause state dependencies were not loaded.',
        );
      }

      expectEqual(
        pool.distributionPaused,
        runtime.emergencyRewardsPaused ||
          pool.onChainDistributionPaused,
        'distributionPaused',
      );
    },
  );

  await test(
    'active local pause always has an operator reason',
    () => {
      if (!runtime) {
        throw new Error(
          'Runtime safety state was not loaded.',
        );
      }

      if (
        runtime.emergencyRewardsPaused &&
        !runtime.emergencyPauseReason
      ) {
        throw new Error(
          'Emergency pause is active without a reason.',
        );
      }
    },
  );

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
