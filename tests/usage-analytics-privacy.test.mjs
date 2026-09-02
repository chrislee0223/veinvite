import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  migration,
  tracker,
  ingestion,
  operatorReport,
  layout,
  bottomNav,
  privacyCopy,
  legalPage,
] = await Promise.all([
  read('supabase/migrations/20260903010000_add_privacy_safe_usage_analytics.sql'),
  read('src/components/UsageAnalyticsTracker.tsx'),
  read('src/app/api/analytics/session/route.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
  read('src/app/layout.tsx'),
  read('src/components/AppBottomNavigation.tsx'),
  read('src/lib/i18n/privacyUsageAnalyticsCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
]);

const LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar',
  'bn', 'pt', 'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz',
  'mr', 'te', 'sw', 'ha',
];

test('usage analytics tables are private service-role surfaces', () => {
  assert.match(migration, /alter table public\.app_usage_visitors enable row level security;/);
  assert.match(migration, /alter table public\.app_usage_sessions enable row level security;/);
  assert.match(migration, /alter table public\.app_usage_daily_view_counts enable row level security;/);
  assert.match(migration, /revoke all on table public\.app_usage_sessions from public, anon, authenticated;/);
  assert.match(migration, /grant select, insert, update, delete on table public\.app_usage_sessions to service_role;/);
  assert.doesNotMatch(migration, /\bwallet_key\b/);
  assert.doesNotMatch(migration, /\bwallet_address\s+text\b/i);
  assert.doesNotMatch(migration, /\bip_address\s+text\b/i);
  assert.doesNotMatch(migration, /\buser_agent\s+text\b/i);
  assert.doesNotMatch(migration, /\binvite_code\s+text\b/i);
});

test('public ingestion is production-only, same-origin, bounded and non-authoritative', () => {
  assert.match(ingestion, /process\.env\.VERCEL_ENV !== 'production'/);
  assert.match(ingestion, /requestHasSameOrigin/);
  assert.match(ingestion, /BOT_USER_AGENT_PATTERN/);
  assert.match(ingestion, /visitorKey\(rawVisitorId\)/);
  assert.match(ingestion, /usage-analytics-visitor/);
  assert.match(ingestion, /activeDeltaSeconds > 90/);
  assert.doesNotMatch(ingestion, /@\/lib\/rewards\//);
  assert.doesNotMatch(ingestion, /walletAddress/);
  assert.doesNotMatch(ingestion, /inviteCode/);
  assert.doesNotMatch(ingestion, /searchParams/);
});

test('tracker records canonical views without leaking invite codes or query strings', () => {
  assert.match(tracker, /pathname\.startsWith\('\/i\/'\)\) return 'invite_landing'/);
  assert.match(tracker, /pathname\.startsWith\('\/admin\/'\)/);
  assert.match(tracker, /pathname\.startsWith\('\/ui-test\/'\)/);
  assert.match(tracker, /const HEARTBEAT_MS = 30_000/);
  assert.match(tracker, /const SESSION_IDLE_MS = 30 \* 60_000/);
  assert.match(tracker, /document\.visibilityState === 'visible' && document\.hasFocus\(\)/);
  assert.doesNotMatch(tracker, /location\.search/);
  assert.doesNotMatch(tracker, /inviteCode/);
  assert.doesNotMatch(tracker, /userAgent/);
});

test('internal app tabs and production layout are wired to the tracker', () => {
  assert.match(bottomNav, /veinvite-analytics-view/);
  assert.match(bottomNav, /reportAnalyticsView\(tab\)/);
  assert.match(layout, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(layout, /<UsageAnalyticsTracker \/>/);
});

test('operator report is wallet-authenticated and read-only', () => {
  assert.match(operatorReport, /requireWalletSession/);
  assert.match(operatorReport, /canOperateVeInviteRewards/);
  assert.match(operatorReport, /MAX_DAYS = 180/);
  assert.match(operatorReport, /writesPerformed: false/);
  assert.match(operatorReport, /walletAddressStored: false/);
});

test('privacy disclosure covers all 27 supported locales', () => {
  for (const locale of LOCALES) {
    const marker = locale === 'zh-tw' ? "  'zh-tw': {" : `  ${locale}: {`;
    assert.ok(privacyCopy.includes(marker), `missing privacy analytics copy for ${locale}`);
  }
  assert.match(privacyCopy, /raw IP/i);
  assert.match(privacyCopy, /reward decisions/i);
  assert.match(legalPage, /PRIVACY_USAGE_ANALYTICS_COPY/);
  assert.match(legalPage, /usageAnalyticsCopy\?\.updated/);
});
