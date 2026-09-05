import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

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

  const authorization = request.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  if (!authorization || !secureEquals(authorization, expected)) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

/**
 * Daily long-term analytics maintenance.
 *
 * This job is deliberately non-destructive. It refreshes permanent,
 * identifier-free daily rollups from retained raw analytics and reports
 * long-term data health. Raw analytics cleanup is NOT performed here.
 *
 * The database-level cleanup functions are fail-closed and require a VERIFIED
 * archive manifest for every candidate date. Until a real archive destination
 * is configured, copied, checksummed and verified, this route cannot delete raw
 * session or product-event history.
 */
export async function GET(request: NextRequest) {
  const authorization = authorizeCron(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const { data: finalization, error: finalizationError } =
      await supabaseAdmin.rpc('finalize_long_term_analytics');

    if (finalizationError) {
      throw new Error(
        `finalize_long_term_analytics failed: ${finalizationError.message}`,
      );
    }

    const { data: health, error: healthError } = await supabaseAdmin
      .from('operator_long_term_data_health')
      .select('*')
      .single();

    if (healthError) {
      throw new Error(
        `operator_long_term_data_health failed: ${healthError.message}`,
      );
    }

    const hasArchiveWarning =
      Number(health?.overdue_usage_days_without_verified_archive ?? 0) > 0 ||
      Number(health?.overdue_product_days_without_verified_archive ?? 0) > 0 ||
      Number(health?.failed_archive_manifests ?? 0) > 0;

    return NextResponse.json(
      {
        trigger: 'VERCEL_CRON',
        mode: 'NON_DESTRUCTIVE',
        finalization,
        health,
        archiveWarning: hasArchiveWarning,
        rawRowsDeleted: 0,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled long-term analytics maintenance failed:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Long-term analytics maintenance failed.',
        mode: 'NON_DESTRUCTIVE',
        rawRowsDeleted: 0,
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
