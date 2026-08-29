import { createHash } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';

type RateLimitRpcRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
  reset_at: string;
};

export type RateLimitCheck = {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

function hashSubject(
  scope: string,
  subject: string,
): string {
  return createHash('sha256')
    .update(
      `veinvite-rate-limit-v1\n${scope}\n${subject}`,
      'utf8',
    )
    .digest('hex');
}

export function getClientIpSubject(
  request: NextRequest,
): string | null {
  const forwardedFor =
    request.headers.get('x-forwarded-for');
  const forwardedIp =
    forwardedFor
      ?.split(',')[0]
      ?.trim();
  const realIp =
    request.headers
      .get('x-real-ip')
      ?.trim();
  const candidate =
    forwardedIp || realIp;

  if (!candidate) {
    return null;
  }

  // Never persist the raw address. The database receives only a one-way hash.
  return candidate.slice(0, 200);
}

async function consumeRateLimit(
  check: RateLimitCheck,
): Promise<RateLimitRpcRow> {
  const {
    data,
    error,
  } = await supabaseAdmin.rpc(
    'consume_api_rate_limit',
    {
      p_scope: check.scope,
      p_subject_hash: hashSubject(
        check.scope,
        check.subject,
      ),
      p_limit: check.limit,
      p_window_seconds:
        check.windowSeconds,
    },
  );

  if (error) {
    throw new Error(
      `Rate limiter failed for ${check.scope}: ${error.message}`,
    );
  }

  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.allowed !== 'boolean' ||
    typeof row.remaining !== 'number' ||
    typeof row.retry_after_seconds !==
      'number' ||
    typeof row.reset_at !== 'string'
  ) {
    throw new Error(
      `Rate limiter returned malformed data for ${check.scope}.`,
    );
  }

  return row as RateLimitRpcRow;
}

function limitedResponse(
  check: RateLimitCheck,
  row: RateLimitRpcRow,
) {
  const retryAfter = Math.max(
    1,
    row.retry_after_seconds,
  );

  return NextResponse.json(
    {
      error:
        'Too many requests. Please wait and try again.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After':
          String(retryAfter),
        'X-RateLimit-Limit':
          String(check.limit),
        'X-RateLimit-Remaining':
          String(
            Math.max(0, row.remaining),
          ),
        'X-RateLimit-Reset':
          row.reset_at,
      },
    },
  );
}

/**
 * Applies server-side fixed-window throttles in sequence.
 *
 * The limiter fails closed: if the shared database check is unavailable, a
 * sensitive mutation/authentication endpoint returns 503 rather than running
 * without its abuse guard. Raw client IP addresses are never stored.
 */
export async function enforceRateLimits(
  checks: Array<
    RateLimitCheck | null | undefined
  >,
): Promise<NextResponse | null> {
  try {
    for (const check of checks) {
      if (!check) {
        continue;
      }

      const result =
        await consumeRateLimit(check);

      if (!result.allowed) {
        return limitedResponse(
          check,
          result,
        );
      }
    }

    return null;
  } catch (error) {
    console.error(
      'VeInvite rate limiter unavailable:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Request protection is temporarily unavailable. Please try again shortly.',
        code:
          'RATE_LIMIT_UNAVAILABLE',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '10',
        },
      },
    );
  }
}
