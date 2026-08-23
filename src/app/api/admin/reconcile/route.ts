import { timingSafeEqual } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  DEFAULT_RECONCILIATION_BATCH_SIZE,
  MAX_RECONCILIATION_BATCH_SIZE,
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

function authorize(request: NextRequest) {
  const configured =
    process.env.VEINVITE_RECONCILE_SECRET;

  if (!configured) {
    return {
      ok: false as const,
      status: 503,
      error:
        'Reconciliation secret is not configured.',
    };
  }

  const provided =
    request.headers.get('x-veinvite-admin-secret');

  if (
    !provided ||
    !secureEquals(provided, configured)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

function readBatchSize(body: unknown): number {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('limit' in body) ||
    body.limit === undefined
  ) {
    return DEFAULT_RECONCILIATION_BATCH_SIZE;
  }

  if (
    typeof body.limit !== 'number' ||
    !Number.isSafeInteger(body.limit) ||
    body.limit < 1 ||
    body.limit > MAX_RECONCILIATION_BATCH_SIZE
  ) {
    throw new Error(
      `limit must be an integer from 1 to ${MAX_RECONCILIATION_BATCH_SIZE}.`,
    );
  }

  return body.limit;
}

/**
 * Manual/operator reconciliation endpoint.
 * It can record verified chain evidence and derived invitation state only.
 * It cannot prepare reward rounds or transfer B3TR.
 */
export async function POST(
  request: NextRequest,
) {
  const authorization = authorize(request);

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

  let body: unknown = {};

  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let limit: number;

  try {
    limit = readBatchSize(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid reconciliation limit.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const summary =
      await runReconciliationBatch(limit);

    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(
      'Failed to run reconciliation batch:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to run reconciliation batch.',
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
