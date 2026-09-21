import assert from 'node:assert/strict';
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = join(
  root,
  'supabase/migrations',
);

const countryLeaderboardMigrations =
  readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .map((file) => ({
      file,
      sql: readFileSync(
        join(migrationsDir, file),
        'utf8',
      ),
    }))
    .filter(({ sql }) =>
      /create or replace function public\.get_public_country_leaderboard/.test(
        sql,
      ),
    )
    .sort((a, b) => a.file.localeCompare(b.file));

const latestCountryMigration =
  countryLeaderboardMigrations.at(-1);

if (!latestCountryMigration) {
  throw new Error(
    'Country leaderboard migration was not found.',
  );
}

const migration = latestCountryMigration.sql;
const route = readFileSync(
  join(root, 'src/app/api/leaderboard/country/route.ts'),
  'utf8',
);
const countryFlag = readFileSync(
  join(root, 'src/components/CountryFlag.tsx'),
  'utf8',
);

test('latest country leaderboard migration preserves display-language fallback', () => {
  assert.ok(
    latestCountryMigration.file >
      '20260921105223_restore_trusted_country_only_after_reward_liveness_merge.sql',
  );
  assert.match(
    migration,
    /left join public\.referral_activation_language_facts l[\s\S]*l\.source_invitation_id = c\.invitation_id/,
  );
  assert.match(
    migration,
    /lower\(l\.language_code\) = 'tr' then 'TR'/,
  );
  assert.doesNotMatch(
    migration,
    /Display language is never used to infer country/i,
  );
});

test('trusted country evidence stays ahead of display-language fallback', () => {
  const trustedActivation = migration.indexOf(
    "f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')",
  );
  const trustedAcquisition = migration.indexOf(
    "a.country_source = 'TRUSTED_EDGE'",
  );
  const languageFallback = migration.indexOf(
    "lower(l.language_code) = 'tr' then 'TR'",
  );

  assert.ok(trustedActivation >= 0);
  assert.ok(trustedAcquisition > trustedActivation);
  assert.ok(languageFallback > trustedAcquisition);
});

test('VeInvite display languages map to the same representative countries as the language picker', () => {
  const expectedMappings = [
    ['en', 'US'],
    ['ko', 'KR'],
    ['zh', 'CN'],
    ['hi', 'IN'],
    ['es', 'ES'],
    ['ja', 'JP'],
    ['it', 'IT'],
    ['tr', 'TR'],
    ['nl', 'NL'],
    ['de', 'DE'],
    ['fr', 'FR'],
    ['ar', 'AE'],
    ['bn', 'BD'],
    ['pt', 'BR'],
    ['ru', 'RU'],
    ['id', 'ID'],
    ['vi', 'VN'],
    ['zh-tw', 'TW'],
    ['sv', 'SE'],
    ['ro', 'RO'],
    ['ur', 'PK'],
    ['pcm', 'NG'],
    ['arz', 'EG'],
    ['mr', 'IN'],
    ['te', 'IN'],
    ['sw', 'KE'],
    ['ha', 'NG'],
    ['el', 'GR'],
  ];

  for (const [language, country] of expectedMappings) {
    assert.match(
      migration,
      new RegExp(
        `lower\\(l\\.language_code\\) = '${language}' then '${country}'`,
      ),
    );
  }
});

test('unknown users keep a NEW RETURNING breakdown instead of disappearing from the UI', () => {
  assert.match(migration, /'unknownNewUsers'/);
  assert.match(migration, /'unknownReturningUsers'/);
  assert.match(migration, /'unknownCurrentRoundCompleted'/);
  assert.match(route, /if \(unknownCompleted > 0\)/);
  assert.match(
    route,
    /countryCode: UNKNOWN_COUNTRY_CODE/,
  );
  assert.match(
    route,
    /unknownNewUsers \+ unknownReturningUsers !== unknownCompleted/,
  );
});

test('unknown country uses the CLDR ZZ label and a neutral globe icon', () => {
  assert.match(
    route,
    /const UNKNOWN_COUNTRY_CODE = 'ZZ';/,
  );
  assert.match(countryFlag, /normalized === 'ZZ'/);
  assert.match(countryFlag, /return '🌐'/);
});
