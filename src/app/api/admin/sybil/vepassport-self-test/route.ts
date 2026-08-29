import { NextResponse } from 'next/server';

import {
  evaluateVePassportSignalRisk,
  readVePassportSignalSnapshot,
} from '@/lib/sybil/vePassportSignals';

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
          'VePassport self-test is disabled in Production.',
      },
      { status: 403 },
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
      results.push({
        name,
        passed: true,
      });
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

  await test(
    'zero signals pass the VeInvite gate',
    () => {
      const result =
        evaluateVePassportSignalRisk({
          signalCount: 0,
          veInviteReviewThreshold: 2,
          blacklisted: false,
        });

      expectEqual(
        result.status,
        'CLEAR',
        'status',
      );
      expectEqual(
        result.riskLevel,
        'NONE',
        'riskLevel',
      );
    },
  );

  await test(
    'one signal stays clear below threshold',
    () => {
      const result =
        evaluateVePassportSignalRisk({
          signalCount: 1,
          veInviteReviewThreshold: 2,
          blacklisted: false,
        });

      expectEqual(
        result.status,
        'CLEAR',
        'status',
      );
      expectEqual(
        result.riskLevel,
        'LOW',
        'riskLevel',
      );
    },
  );

  await test(
    'signal threshold moves referral to review',
    () => {
      const result =
        evaluateVePassportSignalRisk({
          signalCount: 2,
          veInviteReviewThreshold: 2,
          blacklisted: false,
        });

      expectEqual(
        result.status,
        'REVIEW',
        'status',
      );
      expectEqual(
        result.riskLevel,
        'HIGH',
        'riskLevel',
      );
    },
  );

  await test(
    'blacklisted wallet is blocked',
    () => {
      const result =
        evaluateVePassportSignalRisk({
          signalCount: 0,
          veInviteReviewThreshold: 2,
          blacklisted: true,
        });

      expectEqual(
        result.status,
        'BLOCKED',
        'status',
      );
      expectEqual(
        result.riskScore,
        100,
        'riskScore',
      );
    },
  );

  let liveSnapshot:
    Awaited<
      ReturnType<
        typeof readVePassportSignalSnapshot
      >
    > | null = null;

  await test(
    'reviewed VePassport contract is readable',
    async () => {
      liveSnapshot =
        await readVePassportSignalSnapshot(
          '0x0000000000000000000000000000000000000000',
        );
    },
  );

  const failed = results.filter(
    (result) => !result.passed,
  );

  return NextResponse.json(
    {
      mode:
        'PREVIEW_VEPASSPORT_SELF_TEST',
      writesPerformed: false,
      transfersPerformed: false,
      total: results.length,
      passed:
        results.length - failed.length,
      failed: failed.length,
      liveSnapshot,
      results,
    },
    {
      status:
        failed.length === 0
          ? 200
          : 500,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
