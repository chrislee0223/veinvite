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
 * Daily long-term analytics and privacy-retention maintenance.
 *
 * Analytics handling here remains deliberately non-destructive: the job
 * refreshes permanent, identifier-free daily rollups from retained raw
 * analytics and reports long-term data health. Raw analytics cleanup is NOT
 * performed here.
 *
 * Separately, the job expires pseudonymous Security Client -> wallet technical
 * relationship evidence after its dedicated 365-day retention window. An open
 * Security Client review is deferred until the review is resolved, while final
 * eligibility, security-decision, reward and append-only audit records are not
 * deleted by that retention function.
 *
 * The database-level analytics cleanup functions are fail-closed and require a
 * VERIFIED archive manifest for every candidate date. Until a real archive
 * destination is configured, copied, checksummed and restore-verified,
 * destructive analytics cleanup remains disabled even when the normal
 * retention window eventually expires.
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

    const {
      data: securityClientRetention,
      error: securityClientRetentionError,
    } = await supabaseAdmin.rpc(
      'cleanup_security_client_identity_data',
      {
        p_trigger_source: 'VERCEL_CRON',
        p_retention_days: 365,
        p_batch_limit: 1000,
      },
    );

    if (securityClientRetentionError) {
      throw new Error(
        `cleanup_security_client_identity_data failed: ${securityClientRetentionError.message}`,
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
      Number(health?.failed_archive_manifests ?? 0) > 0 ||
      Number(health?.purged_analytics_dates_without_valid_archive ?? 0) > 0;

    // Physical archive storage/export/restore verification is intentionally a
    // later phase. Keep readiness explicit so a clean runtime health report is
    // never mistaken for permission to delete historical raw analytics.
    const archiveReadiness = {
      storageConfigured: false,
      restoreVerified: false,
      destructiveCleanupEnabled: false,
      longTermReady: false,
    } as const;

    return NextResponse.json(
      {
        trigger: 'VERCEL_CRON',
        mode: 'MIXED_MAINTENANCE',
        analyticsMode: 'NON_DESTRUCTIVE',
        securityClientRetentionMode: 'TIME_BOUNDED_DELETION',
        finalization,
        securityClientRetention,
        health,
        archiveWarning: hasArchiveWarning,
        archiveReadiness,
        rawRowsDeleted: 0,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error(
      'Scheduled long-term analytics/security retention maintenance failed:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Long-term analytics/security retention maintenance failed.',
        mode: 'MIXED_MAINTENANCE',
        analyticsMode: 'NON_DESTRUCTIVE',
        securityClientRetentionMode: 'TIME_BOUNDED_DELETION',
        archiveReadiness: {
          storageConfigured: false,
          restoreVerified: false,
          destructiveCleanupEnabled: false,
          longTermReady: false,
        },
        rawRowsDeleted: 0,
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
