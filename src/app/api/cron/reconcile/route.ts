import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  DEFAULT_RECONCILIATION_BATCH_SIZE,
  runReconciliationBatch,
} from '@/lib/impact/reconcileBatch';

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
 * Vercel Cron entrypoint.
 *
 * This worker only reconciles immutable/derived onboarding evidence. It never
 * prepares a reward round and cannot transfer B3TR. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
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
      await runReconciliationBatch(
        DEFAULT_RECONCILIATION_BATCH_SIZE,
      );

    return NextResponse.json(
      {
        ...summary,
        trigger: 'VERCEL_CRON',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled reconciliation failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Scheduled reconciliation failed.',
        rewardRoundsPrepared: false,
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
