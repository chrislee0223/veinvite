import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  enqueueSybilV2PaidBackfillBatch,
} from '@/lib/sybil/v2/evidenceQueue';

function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Cron secret is not configured.',
    };
  }

  const authorization =
    request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (
    !authorization ||
    !secureEquals(authorization, expected)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

/**
 * Low-impact recovery cron for already-paid Sybil v2 evidence backfill.
 *
 * This route only publishes up to 10 PAID candidates into the existing
 * idempotent evidence queue. The consumer performs observation-only historical
 * and funding scans. It never reassesses historical reward authority, changes
 * invitation/reward state, sends HOLD notifications, or reverses a payout.
 *
 * Keeping this separate from /api/cron/reconcile lets the temporary historical
 * backlog drain quickly without repeatedly running the full reconciliation,
 * payout, reporting, and monitoring pipeline.
 */
export async function GET(
  request: NextRequest,
) {
  const authorization =
    authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const summary =
      await enqueueSybilV2PaidBackfillBatch(10);

    return NextResponse.json(
      {
        ok: true,
        ...summary,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled Sybil v2 paid backfill publisher failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown paid backfill error.',
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
