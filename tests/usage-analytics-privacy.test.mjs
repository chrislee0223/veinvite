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
  tracker,
  preference,
  preferenceControl,
  ingestion,
  operatorReport,
  housekeeping,
  layout,
  bottomNav,
  privacyCopy,
  privacyControlCopy,
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
  read('src/components/UsageAnalyticsTracker.tsx'),
  read('src/lib/usageAnalyticsPreference.ts'),
  read(
    'src/components/UsageAnalyticsPreferenceControl.tsx',
  ),
  read('src/app/api/analytics/session/route.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
  read('src/lib/housekeeping/ephemeralCleanup.ts'),
  read('src/app/layout.tsx'),
  read('src/components/AppBottomNavigation.tsx'),
  read('src/lib/i18n/privacyUsageAnalyticsCopy.ts'),
  read(
    'src/lib/i18n/privacyUsageAnalyticsControlCopy.ts',
  ),
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
  'analytics preference can stop tracking and removes analytics identifiers',
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
      preferenceControl,
      /role="switch"/,
    );
    assert.match(
      preferenceControl,
      /setUsageAnalyticsEnabled\(next\)/,
    );
    assert.match(
      layout,
      /<UsageAnalyticsPreferenceControl \/>/,
    );
  },
);

test(
  'raw analytics are compacted after 30 days into identifier-free rollups',
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
      privacyRetentionMigration,
      /create or replace function public\.compact_app_usage_analytics/,
    );
    assert.match(
      adminExclusionMigration,
      /not exists \(select 1 from public\.app_usage_excluded_visitors/,
    );
    assert.match(
      privacyRetentionMigration,
      /delete from public\.app_usage_sessions/,
    );
    assert.match(
      privacyRetentionMigration,
      /delete from public\.app_usage_visitors/,
    );
    assert.match(
      housekeeping,
      /USAGE_ANALYTICS_RETENTION_DAYS = 30/,
    );
    assert.match(
      housekeeping,
      /compact_app_usage_analytics/,
    );
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
      /rawSessionRetentionDays: 30/,
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
  'privacy disclosure and preference control cover all 27 supported locales',
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
      assert.ok(
        privacyControlCopy.includes(marker),
        `missing analytics control copy for ${locale}`,
      );
    }
    assert.match(privacyCopy, /raw IP/i);
    assert.match(
      privacyCopy,
      /reward decisions/i,
    );
    assert.match(
      privacyControlCopy,
      /30 days/i,
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
