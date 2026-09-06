import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(
    new URL(`../${path}`, import.meta.url),
    'utf8',
  );

const [
  migration,
  privacyRetentionMigration,
  adminExclusionMigration,
  longTermFoundation,
  archiveHardening,
  tracker,
  preference,
  ingestion,
  operatorReport,
  housekeeping,
  analyticsMaintenance,
  layout,
  bottomNav,
  privacyCopy,
  legalPage,
] = await Promise.all([
  read(
    'supabase/migrations/20260903010000_add_privacy_safe_usage_analytics.sql',
  ),
  read(
    'supabase/migrations/20260903013000_harden_usage_analytics_privacy_retention.sql',
  ),
  read(
    'supabase/migrations/20260903164000_exclude_admin_wallets_from_usage_analytics.sql',
  ),
  read(
    'supabase/migrations/20260905222000_add_long_term_data_foundation.sql',
  ),
  read(
    'supabase/migrations/20260905233845_harden_archive_cleanup_integrity.sql',
  ),
  read('src/components/UsageAnalyticsTracker.tsx'),
  read('src/lib/usageAnalyticsPreference.ts'),
  read('src/app/api/analytics/session/route.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
  read('src/lib/housekeeping/ephemeralCleanup.ts'),
  read('src/app/api/cron/analytics-maintenance/route.ts'),
  read('src/app/layout.tsx'),
  read('src/components/AppBottomNavigation.tsx'),
  read('src/lib/i18n/privacyUsageAnalyticsCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
]);

const LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it',
  'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur',
  'pcm', 'arz', 'mr', 'te', 'sw', 'ha',
];

test(
  'usage analytics tables are private service-role surfaces',
  () => {
    assert.match(
      migration,
      /alter table public\.app_usage_visitors enable row level security;/,
    );
    assert.match(
      migration,
      /alter table public\.app_usage_sessions enable row level security;/,
    );
    assert.match(
      migration,
      /alter table public\.app_usage_daily_view_counts enable row level security;/,
    );
    assert.match(
      privacyRetentionMigration,
      /alter table public\.app_usage_daily_rollups enable row level security;/,
    );
    assert.match(
      privacyRetentionMigration,
      /alter table public\.app_usage_daily_dimension_rollups enable row level security;/,
    );
    assert.match(
      adminExclusionMigration,
      /alter table public\.app_usage_excluded_visitors enable row level security;/,
    );
    assert.match(
      adminExclusionMigration,
      /alter table public\.app_usage_session_view_counts enable row level security;/,
    );
    assert.match(
      migration,
      /revoke all on table public\.app_usage_sessions from public, anon, authenticated;/,
    );
    assert.match(
      migration,
      /grant select, insert, update, delete on table public\.app_usage_sessions to service_role;/,
    );
    assert.doesNotMatch(migration, /\bwallet_key\b/);
    assert.doesNotMatch(
      migration,
      /\bwallet_address\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\bip_address\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\buser_agent\s+text\b/i,
    );
    assert.doesNotMatch(
      migration,
      /\binvite_code\s+text\b/i,
    );
  },
);

test(
  'public ingestion is production-only, same-origin, bounded and non-authoritative',
  () => {
    assert.match(
      ingestion,
      /process\.env\.VERCEL_ENV !== 'production'/,
    );
    assert.match(ingestion, /requestHasSameOrigin/);
    assert.match(ingestion, /BOT_USER_AGENT_PATTERN/);
    assert.match(
      ingestion,
      /visitorKey\(\s*rawVisitorId/,
    );
    assert.match(
      ingestion,
      /usage-analytics-visitor/,
    );
    assert.match(
      ingestion,
      /activeDeltaSeconds > 90/,
    );
    assert.match(
      ingestion,
      /p_returning_visitor/,
    );
    assert.match(
      ingestion,
      /analytics_excluded_wallets/,
    );
    assert.match(
      ingestion,
      /exclude_app_usage_visitor/,
    );
    assert.doesNotMatch(
      ingestion,
      /p_wallet_address/,
    );
    assert.doesNotMatch(
      ingestion,
      /@\/lib\/rewards\//,
    );
    assert.doesNotMatch(ingestion, /inviteCode/);
    assert.doesNotMatch(ingestion, /searchParams/);
  },
);

test(
  'admin exclusion resolves only the anonymous daily visitor and never stores wallet identity in usage rows',
  () => {
    assert.match(
      adminExclusionMigration,
      /create table if not exists public\.analytics_excluded_wallets/,
    );
    assert.match(
      adminExclusionMigration,
      /create table if not exists public\.app_usage_excluded_visitors/,
    );
    assert.match(
      adminExclusionMigration,
      /No wallet address or wallet hash is stored here/,
    );
    assert.match(
      adminExclusionMigration,
      /create or replace function public\.exclude_app_usage_visitor/,
    );
    assert.match(
      adminExclusionMigration,
      /returning_visitor/,
    );
    assert.match(
      tracker,
      /USAGE_ANALYTICS_WALLET_AUTH_EVENT/,
    );
    assert.match(
      tracker,
      /'wallet_authenticated'/,
    );
  },
);

test(
  'tracker rotates anonymous identity daily without leaking invite data',
  () => {
    assert.match(
      tracker,
      /timeZone: 'Asia\/Seoul'/,
    );
    assert.match(
      tracker,
      /USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY/,
    );
    assert.match(
      tracker,
      /USAGE_ANALYTICS_SEEN_STORAGE_KEY/,
    );
    assert.match(
      tracker,
      /returningVisitor:/,
    );
    assert.match(
      tracker,
      /pathname\.startsWith\('\/i\/'\)\s*\)/,
    );
    assert.match(
      tracker,
      /return 'invite_landing'/,
    );
    assert.match(
      tracker,
      /pathname\.startsWith\('\/admin\/'\)/,
    );
    assert.match(
      tracker,
      /pathname\.startsWith\('\/ui-test\/'\)/,
    );
    assert.match(
      tracker,
      /const HEARTBEAT_MS = 30_000/,
    );
    assert.match(
      tracker,
      /const SESSION_IDLE_MS = 30 \* 60_000/,
    );
    assert.match(
      tracker,
      /document\.visibilityState === 'visible'/,
    );
    assert.match(
      tracker,
      /document\.hasFocus\(\)/,
    );
    assert.doesNotMatch(tracker, /location\.search/);
    assert.doesNotMatch(tracker, /inviteCode/);
    assert.doesNotMatch(tracker, /userAgent/);
  },
);

test(
  'stored analytics preference remains respected while no privacy toggle is mounted',
  () => {
    assert.match(
      preference,
      /USAGE_ANALYTICS_ENABLED_STORAGE_KEY/,
    );
    assert.match(
      preference,
      /removeItem\(\s*USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY/,
    );
    assert.match(
      preference,
      /removeItem\(\s*USAGE_ANALYTICS_SEEN_STORAGE_KEY/,
    );
    assert.match(
      tracker,
      /readUsageAnalyticsEnabled\(\)/,
    );
    assert.doesNotMatch(
      layout,
      /UsageAnalyticsPreferenceControl/,
    );
  },
);

test(
  'raw analytics use 365-day archive-first retention and non-destructive daily maintenance',
  () => {
    assert.match(
      privacyRetentionMigration,
      /create table if not exists public\.app_usage_daily_rollups/,
    );
    assert.match(
      privacyRetentionMigration,
      /create table if not exists public\.app_usage_daily_dimension_rollups/,
    );
    assert.match(
      adminExclusionMigration,
      /not exists \(select 1 from public\.app_usage_excluded_visitors/,
    );
    assert.match(longTermFoundation, /hot365_archive_required_v1/);
    assert.match(longTermFoundation, /365,/);
    assert.match(longTermFoundation, /delete_requires_verified_archive/);
    assert.match(longTermFoundation, /veinvite_archive_manifests/);
    assert.match(archiveHardening, /archive manifest lifecycle must start with PREPARED/);
    assert.match(archiveHardening, /artifactChecksumVerified/);
    assert.match(archiveHardening, /sourceRowCountVerified/);
    assert.match(archiveHardening, /active policy minimum/);
    assert.match(archiveHardening, /lock table public\.app_usage_sessions in share row exclusive mode/);
    assert.match(archiveHardening, /archive is stale or unverified/);
    assert.doesNotMatch(housekeeping, /USAGE_ANALYTICS_RETENTION_DAYS/);
    assert.doesNotMatch(housekeeping, /compact_app_usage_analytics/);
    assert.doesNotMatch(housekeeping, /compact_app_product_analytics/);
    assert.match(analyticsMaintenance, /finalize_long_term_analytics/);
    assert.match(analyticsMaintenance, /NON_DESTRUCTIVE/);
    assert.match(analyticsMaintenance, /rawRowsDeleted: 0/);
    assert.doesNotMatch(analyticsMaintenance, /compact_app_usage_analytics/);
    assert.doesNotMatch(analyticsMaintenance, /compact_app_product_analytics/);
  },
);

test(
  'internal app tabs and production layout are wired to the tracker',
  () => {
    assert.match(
      bottomNav,
      /veinvite-analytics-view/,
    );
    assert.match(
      bottomNav,
      /reportAnalyticsView\(tab\)/,
    );
    assert.match(
      layout,
      /process\.env\.VERCEL_ENV === 'production'/,
    );
    assert.match(
      layout,
      /<UsageAnalyticsTracker \/>/,
    );
  },
);

test(
  'operator report is wallet-authenticated, read-only and long-term rollup aware',
  () => {
    assert.match(
      operatorReport,
      /requireWalletSession/,
    );
    assert.match(
      operatorReport,
      /canOperateVeInviteRewards/,
    );
    assert.match(
      operatorReport,
      /MAX_DAYS = 3650/,
    );
    assert.match(
      operatorReport,
      /rawSessionRetentionDays: 365/,
    );
    assert.match(
      operatorReport,
      /rawArchiveRequiredBeforeCleanup: true/,
    );
    assert.match(
      operatorReport,
      /permanentAggregateHistory: true/,
    );
    assert.match(
      operatorReport,
      /crossDayIdentityLinking: false/,
    );
    assert.match(
      operatorReport,
      /userCanOptOut: true/,
    );
    assert.match(
      operatorReport,
      /writesPerformed: false/,
    );
    assert.match(
      operatorReport,
      /walletAddressStored: false/,
    );
  },
);

test(
  'privacy disclosure covers all 27 supported locales',
  () => {
    for (const locale of LOCALES) {
      const marker =
        locale === 'zh-tw'
          ? "  'zh-tw': {"
          : `  ${locale}: {`;
      assert.ok(
        privacyCopy.includes(marker),
        `missing privacy analytics copy for ${locale}`,
      );
    }
    assert.match(privacyCopy, /raw IP/i);
    assert.match(
      privacyCopy,
      /reward decisions/i,
    );
    assert.match(
      legalPage,
      /PRIVACY_USAGE_ANALYTICS_COPY/,
    );
    assert.match(
      legalPage,
      /usageAnalyticsCopy\?\.updated/,
    );
  },
);
