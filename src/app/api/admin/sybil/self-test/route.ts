import { NextResponse } from 'next/server';

import {
  evaluatePostVoteSybilRisk,
} from '@/lib/sybil/risk';

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
          'Sybil self-test is disabled in Production.',
      },
      { status: 403 },
    );
  }

  const results: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }> = [];

  const test = (
    name: string,
    run: () => void,
  ) => {
    try {
      run();
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

  test(
    'clean referral passes baseline post-vote gate',
    () => {
      const result =
        evaluatePostVoteSybilRisk({
          currentStatus: 'NOT_CHECKED',
          inviteStatus: 'ACTIVATING',
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
      expectEqual(
        result.riskScore,
        0,
        'riskScore',
      );
    },
  );

  test(
    'existing review is preserved after mission completion',
    () => {
      const result =
        evaluatePostVoteSybilRisk({
          currentStatus: 'REVIEW',
          inviteStatus: 'UNDER_REVIEW',
          currentRiskLevel: 'MEDIUM',
          currentReason: 'Needs review.',
          currentSource: 'SYSTEM',
        });

      expectEqual(
        result.status,
        'REVIEW',
        'status',
      );
      expectEqual(
        result.reason,
        'Needs review.',
        'reason',
      );
    },
  );

  test(
    'legacy under-review invite cannot silently become clear',
    () => {
      const result =
        evaluatePostVoteSybilRisk({
          currentStatus: 'NOT_CHECKED',
          inviteStatus: 'UNDER_REVIEW',
        });

      expectEqual(
        result.status,
        'REVIEW',
        'status',
      );
      expectEqual(
        result.riskLevel,
        'MEDIUM',
        'riskLevel',
      );
    },
  );

  test(
    'confirmed abuse remains blocked',
    () => {
      const result =
        evaluatePostVoteSybilRisk({
          currentStatus: 'BLOCKED',
          inviteStatus: 'UNDER_REVIEW',
          currentRiskLevel: 'HIGH',
          currentReason: 'Confirmed abuse.',
          currentSource: 'OPERATOR',
        });

      expectEqual(
        result.status,
        'BLOCKED',
        'status',
      );
      expectEqual(
        result.riskLevel,
        'HIGH',
        'riskLevel',
      );
      expectEqual(
        result.source,
        'OPERATOR',
        'source',
      );
    },
  );

  const failed = results.filter(
    (result) => !result.passed,
  );

  return NextResponse.json(
    {
      mode: 'PREVIEW_SYBIL_SELF_TEST',
      writesPerformed: false,
      transfersPerformed: false,
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
      },
    },
  );
}
