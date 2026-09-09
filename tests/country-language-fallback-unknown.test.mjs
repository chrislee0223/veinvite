import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    'supabase/migrations/20260909035000_restore_country_language_fallback_and_unknown_breakdown.sql',
  ),
  'utf8',
);
const route = readFileSync(
  join(root, 'src/app/api/leaderboard/country/route.ts'),
  'utf8',
);
const countryFlag = readFileSync(
  join(root, 'src/components/CountryFlag.tsx'),
  'utf8',
);

test('trusted country evidence stays ahead of display-language fallback', () => {
  const trustedActivation = migration.indexOf("f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')");
  const trustedAcquisition = migration.indexOf("a.country_source = 'TRUSTED_EDGE'");
  const languageFallback = migration.indexOf("lower(l.language_code) = 'tr' then 'TR'");

  assert.ok(trustedActivation >= 0);
  assert.ok(trustedAcquisition > trustedActivation);
  assert.ok(languageFallback > trustedAcquisition);
  assert.match(
    migration,
    /left join public\.referral_activation_language_facts l[\s\S]*l\.source_invitation_id = c\.invitation_id/,
  );
});

test('VeInvite display languages map to the same representative countries as the language picker', () => {
  const expectedMappings = [
    ["en", "US"],
    ["ko", "KR"],
    ["zh", "CN"],
    ["hi", "IN"],
    ["es", "ES"],
    ["ja", "JP"],
    ["it", "IT"],
    ["tr", "TR"],
    ["nl", "NL"],
    ["de", "DE"],
    ["fr", "FR"],
    ["ar", "AE"],
    ["bn", "BD"],
    ["pt", "BR"],
    ["ru", "RU"],
    ["id", "ID"],
    ["vi", "VN"],
    ["zh-tw", "TW"],
    ["sv", "SE"],
    ["ro", "RO"],
    ["ur", "PK"],
    ["pcm", "NG"],
    ["arz", "EG"],
    ["mr", "IN"],
    ["te", "IN"],
    ["sw", "KE"],
    ["ha", "NG"],
    ["el", "GR"],
  ];

  for (const [language, country] of expectedMappings) {
    assert.match(
      migration,
      new RegExp(`lower\\(l\\.language_code\\) = '${language}' then '${country}'`),
    );
  }
});

test('unknown users keep a NEW RETURNING breakdown instead of disappearing from the UI', () => {
  assert.match(migration, /'unknownNewUsers'/);
  assert.match(migration, /'unknownReturningUsers'/);
  assert.match(migration, /'unknownCurrentRoundCompleted'/);
  assert.match(route, /if \(unknownCompleted > 0\)/);
  assert.match(route, /countryCode: UNKNOWN_COUNTRY_CODE/);
  assert.match(route, /unknownNewUsers \+ unknownReturningUsers !== unknownCompleted/);
});

test('unknown country uses the CLDR ZZ label and a neutral globe icon', () => {
  assert.match(route, /const UNKNOWN_COUNTRY_CODE = 'ZZ';/);
  assert.match(countryFlag, /normalized === 'ZZ'/);
  assert.match(countryFlag, /return '🌐'/);
});
