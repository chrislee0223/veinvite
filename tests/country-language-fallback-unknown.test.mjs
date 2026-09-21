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

test('latest country leaderboard migration requires trusted country evidence', () => {
  assert.ok(
    latestCountryMigration.file >
      '20260921130939_restore_country_language_fallback_after_reward_liveness_merge.sql',
  );
  assert.match(
    migration,
    /Country is attributed only from trusted activation or acquisition country evidence/i,
  );
  assert.match(
    migration,
    /Display language is never used to infer country/i,
  );
  assert.doesNotMatch(
    migration,
    /left join public\.referral_activation_language_facts l/,
  );
  assert.doesNotMatch(
    migration,
    /lower\(l\.language_code\)/,
  );
});

test('trusted activation and acquisition evidence are the only country sources', () => {
  const trustedActivation = migration.indexOf(
    "f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')",
  );
  const trustedAcquisition = migration.indexOf(
    "a.country_source = 'TRUSTED_EDGE'",
  );

  assert.ok(trustedActivation >= 0);
  assert.ok(trustedAcquisition > trustedActivation);
  assert.match(
    migration,
    /when a\.country_source = 'TRUSTED_EDGE'[\s\S]*then a\.country_code[\s\S]*else null/,
  );
});

test('display language can never be converted into a country code', () => {
  const forbiddenMappings = [
    "then 'US'",
    "then 'KR'",
    "then 'TR'",
    "then 'AE'",
    "then 'BR'",
  ];

  for (const mapping of forbiddenMappings) {
    assert.doesNotMatch(migration, new RegExp(mapping));
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
