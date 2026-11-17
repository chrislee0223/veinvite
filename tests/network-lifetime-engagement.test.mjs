import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261117161507_network_lifetime_wallet_engagement_v1.sql');
const eventApi = read('src/app/api/analytics/event/route.ts');
const admin = read('src/app/api/admin/usage-analytics/route.ts');
const telemetry = read('src/lib/networkUsageTelemetry.ts');
const legal = read('src/components/LocalizedLegalPage.tsx');
const privacy = read('src/lib/i18n/privacyNetworkEngagementCopy.ts');
const consent = read('src/lib/usageAnalyticsPreference.ts');

test('server-only pseudonyms are derived from authenticated wallets, not supplied by browsers', () => {
  assert.match(eventApi, /createHmac\('sha256', pepper\)/);
  assert.match(eventApi, /getWalletSession\(request\)/);
  assert.match(eventApi, /excludeAdminVisitor/);
  assert.match(eventApi, /VEINVITE_NETWORK_ANALYTICS_PEPPER/);
  assert.match(eventApi, /networkVerifiedWallet/);
  assert.match(eventApi, /record_app_network_wallet_engagement/);
  assert.doesNotMatch(sql, /wallet_address|raw_wallet|visitor_key/i);
  assert.doesNotMatch(telemetry, /wallet_key|p_wallet_key|createHmac/i);
});

test('one wallet is one lifetime user even with both actions and many same-day edits', () => {
  assert.match(sql, /wallet_key text primary key/);
  assert.match(sql, /on conflict \(wallet_key\) do update/);
  assert.match(sql, /when excluded\.last_usage_date > app_network_engaged_wallets\.last_usage_date then 1 else 0/);
  assert.match(sql, /app_network_engaged_wallets\.node_mover or excluded\.node_mover/);
  assert.match(sql, /app_network_engaged_wallets\.group_editor or excluded\.group_editor/);
  assert.match(sql, /active_days >= 2/);
  assert.match(sql, /now\(\) at time zone 'Asia\/Seoul'/);
  assert.match(admin, /returningRatePercent/);
  assert.match(admin, /crossDeviceSameWalletSupported: true/);
  assert.match(admin, /multipleWalletsPerHumanCannotBeMerged: true/);
  assert.match(admin, /anonymousOnlyEventsNotIncluded: true/);
  assert.match(admin, /lifetimeAvailable \? lifetimeUsers : null/);
  assert.match(admin, /Network lifetime analytics temporarily unavailable/);
  const states = new Map();
  for (const [wallet, day, action] of [
    ['alpha', 1, 'move'], ['alpha', 1, 'group'], ['alpha', 1, 'move'],
    ['beta', 1, 'move'], ['alpha', 2, 'move'], ['alpha', 3, 'group'],
  ]) {
    const existing = states.get(wallet);
    if (!existing) states.set(wallet, { days: new Set([day]), moved: action==='move', edited: action==='group' });
    else { existing.days.add(day); existing.moved ||= action==='move'; existing.edited ||= action==='group'; }
  }
  assert.equal(states.size, 2);
  assert.equal([...states.values()].filter(x => x.days.size >= 2).length, 1);
  assert.equal(states.get('alpha').days.size, 3);
  assert.equal(states.get('alpha').moved, true);
  assert.equal(states.get('alpha').edited, true);
});

test('daily privacy, midnight reset, operator access and reward isolation', () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.read_app_network_lifetime_engagement\(\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.read_app_network_lifetime_engagement\(\)[\s\S]*to service_role/);
  assert.match(telemetry, /if \(day !== recordedDay\)/);
  assert.match(telemetry, /emitted\.clear\(\)/);
  assert.match(telemetry, /readUsageAnalyticsEnabled/);
  assert.match(consent, /USAGE_ANALYTICS_ENABLED_STORAGE_KEY/);
  assert.match(eventApi, /requestHasSameOrigin/);
  assert.match(admin, /requireWalletSession/);
  assert.match(admin, /canOperateVeInviteRewards/);
  assert.doesNotMatch(sql, /reward_receipts|reward_payout|invitations|sybil/i);
});

test('Network privacy notice is shown in every supported locale', () => {
  for (const locale of [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar',
    'bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha',
  ]) {
    const marker = locale === 'zh-tw' ? "'zh-tw':" : new RegExp('\\b'+locale+':');
    assert.ok(typeof marker === 'string' ? privacy.includes(marker) : marker.test(privacy), locale);
  }
  assert.match(legal, /PRIVACY_NETWORK_ENGAGEMENT_COPY/);
  assert.match(legal, /network-engagement-privacy/);
  assert.match(privacy, /2026|November 18, 2026/);
});
