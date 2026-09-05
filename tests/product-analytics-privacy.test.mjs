import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  migration,
  tracker,
  contract,
  ingestion,
  housekeeping,
  operatorReport,
  permanentReferral,
  legacyInvite,
  walletControl,
  walletAuth,
  privacyCopy,
  privacyControlCopy,
  legalPage,
] = await Promise.all([
  read(
    'supabase/migrations/20260905181000_add_privacy_safe_product_analytics.sql',
  ),
  read('src/components/UsageAnalyticsTracker.tsx'),
  read('src/lib/productAnalytics.ts'),
  read('src/app/api/analytics/event/route.ts'),
  read('src/lib/housekeeping/ephemeralCleanup.ts'),
  read('src/app/api/admin/usage-analytics/route.ts'),
  read('src/components/PermanentReferralClient.tsx'),
  read('src/components/InviteeClient.tsx'),
  read('src/components/WalletControl.tsx'),
  read('src/hooks/useWalletAuthentication.ts'),
  read('src/lib/i18n/privacyProductAnalyticsCopy.ts'),
  read('src/lib/i18n/privacyUsageAnalyticsControlCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
]);

const LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it',
  'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur',
  'pcm', 'arz', 'mr', 'te', 'sw', 'ha',
];

test(
  'raw product analytics has a strict private non-authoritative schema',
  () => {
    assert.match(
      migration,
      /create table if not exists public\.app_product_events/,
    );
    assert.match(
      migration,
      /alter table public\.app_product_events enable row level security/,
    );
    assert.match(
      migration,
      /revoke all on table public\.app_product_events from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant select, insert, update, delete on table public\.app_product_events to service_role/,
    );
    assert.match(migration, /Anonymous analytics only/);
    assert.match(migration, /never reward, referral, eligibility, mission, Sybil or payout authority/);
    assert.doesNotMatch(migration, /\bwallet_address\s+text\b/i);
    assert.doesNotMatch(migration, /\bip_address\s+text\b/i);
    assert.doesNotMatch(migration, /\buser_agent\s+text\b/i);
    assert.doesNotMatch(migration, /\binvite_code\s+text\b/i);
    assert.doesNotMatch(migration, /\breferral_code\s+text\b/i);
    assert.doesNotMatch(migration, /\bquery_string\s+text\b/i);
    assert.doesNotMatch(migration, /\bmetadata\s+jsonb\b/i);
  },
);

test(
  'product event ingestion is production-only, same-origin and allowlisted',
  () => {
    assert.match(ingestion, /process\.env\.VERCEL_ENV !== 'production'/);
    assert.match(ingestion, /requestHasSameOrigin/);
    assert.match(ingestion, /BOT_USER_AGENT_PATTERN/);
    assert.match(ingestion, /product-analytics-visitor/);
    assert.match(ingestion, /product-analytics-ip/);
    assert.match(ingestion, /VERCEL_GIT_COMMIT_SHA/);
    assert.match(ingestion, /record_app_product_event/);
    assert.match(ingestion, /p_schema_version: 1/);
    assert.doesNotMatch(ingestion, /record\.walletAddress/);
    assert.doesNotMatch(ingestion, /record\.inviteCode/);
    assert.doesNotMatch(ingestion, /record\.referralKey/);
    assert.doesNotMatch(ingestion, /record\.url/);
    assert.doesNotMatch(ingestion, /record\.query/);
    assert.doesNotMatch(ingestion, /record\.metadata/);
  },
);

test(
  'product events reuse opt-in daily anonymous identity and idempotent session ordering',
  () => {
    assert.match(tracker, /PRODUCT_ANALYTICS_EVENT/);
    assert.match(tracker, /USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY/);
    assert.match(tracker, /productEventSequence/);
    assert.match(tracker, /eventId: createUuid\(\)/);
    assert.match(tracker, /eventSequence:/);
    assert.match(tracker, /'\/api\/analytics\/event'/);
    assert.match(contract, /reportProductAnalyticsEvent/);
    assert.match(contract, /strict, non-identifying product analytics event/);
    assert.doesNotMatch(tracker, /VERCEL_GIT_COMMIT_SHA/);
    assert.match(migration, /unique \(session_id, event_sequence\)/);
    assert.match(migration, /on conflict do nothing/);
  },
);

test(
  'raw product events compact after 30 days before anonymous usage identities are removed',
  () => {
    assert.match(
      migration,
      /create or replace function public\.compact_app_product_analytics/,
    );
    assert.match(
      migration,
      /create table if not exists public\.app_product_event_daily_rollups/,
    );
    assert.match(
      migration,
      /create table if not exists public\.app_product_event_daily_dimension_rollups/,
    );
    assert.match(
      migration,
      /delete from public\.app_product_events\s+where usage_date = v_usage_date/,
    );
    assert.match(
      migration,
      /delete from public\.app_product_events\s+where visitor_key = p_visitor_key/,
    );
    assert.match(housekeeping, /compact_app_product_analytics/);
    assert.match(housekeeping, /compact_app_usage_analytics/);
    assert.ok(
      housekeeping.indexOf('compact_app_product_analytics') <
        housekeeping.indexOf('compact_app_usage_analytics'),
      'product events must compact before usage visitor/exclusion hashes can be removed',
    );
  },
);

test(
  'core onboarding funnel emits only coarse product events',
  () => {
    assert.match(walletControl, /wallet_connect_started/);
    assert.match(walletAuth, /wallet_auth_succeeded/);
    assert.match(walletAuth, /wallet_auth_failed/);

    assert.match(permanentReferral, /invite_accept_started/);
    assert.match(permanentReferral, /invite_accept_succeeded/);
    assert.match(permanentReferral, /invite_accept_failed/);
    assert.match(permanentReferral, /flowKey: 'permanent_referral'/);

    assert.match(legacyInvite, /invite_accept_started/);
    assert.match(legacyInvite, /invite_accept_review/);
    assert.match(legacyInvite, /invite_accept_succeeded/);
    assert.match(legacyInvite, /invite_accept_failed/);
    assert.match(legacyInvite, /mission_action_opened/);
    assert.match(legacyInvite, /missionKey: analyticsMissionKey/);
    assert.match(legacyInvite, /flowKey: 'legacy_invite'/);
  },
);

test(
  'operator report exposes product analytics as observational data only',
  () => {
    assert.match(operatorReport, /read_app_product_event_summary/);
    assert.match(operatorReport, /read_app_product_event_daily_summary/);
    assert.match(
      operatorReport,
      /read_app_product_event_dimension_breakdown/,
    );
    assert.match(operatorReport, /productAnalytics:/);
    assert.match(operatorReport, /authoritative: false/);
    assert.match(operatorReport, /strictAllowlist: true/);
    assert.match(operatorReport, /rawProductEventRetentionDays: 30/);
    assert.match(operatorReport, /freeFormMetadataStored: false/);
  },
);

test(
  'product analytics disclosure covers all supported locales and the privacy page',
  () => {
    for (const locale of LOCALES) {
      const marker = locale === 'zh-tw'
        ? "  'zh-tw': {"
        : `  ${locale}: {`;
      assert.ok(
        privacyCopy.includes(marker),
        `missing product analytics privacy copy for ${locale}`,
      );
      assert.ok(
        privacyControlCopy.includes(marker),
        `missing analytics control copy for ${locale}`,
      );
    }
    assert.match(privacyCopy, /30 days/i);
    assert.match(privacyCopy, /wallet addresses/i);
    assert.match(privacyCopy, /invite or referral codes/i);
    assert.match(legalPage, /PRIVACY_PRODUCT_ANALYTICS_COPY/);
    assert.match(legalPage, /productAnalyticsCopy\?\.updated/);
  },
);
