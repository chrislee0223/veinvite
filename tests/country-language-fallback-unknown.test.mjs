import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    'supabase/migrations/20260921105223_restore_trusted_country_only_after_reward_liveness_merge.sql',
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

test('country arrivals use only trusted country evidence', () => {
  const trustedActivation = migration.indexOf(
    "f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')",
  );
  const trustedAcquisition = migration.indexOf(
    "a.country_source = 'TRUSTED_EDGE'",
  );

  assert.ok(trustedActivation >= 0);
  assert.ok(trustedAcquisition > trustedActivation);
  assert.doesNotMatch(migration, /referral_activation_language_facts/);
  assert.doesNotMatch(migration, /language_code/);
  assert.doesNotMatch(migration, /lower\(l\./);
});

test('display language is explicitly forbidden as a country inference source', () => {
  assert.match(
    migration,
    /Display language is never used to infer country\./,
  );
  assert.match(
    migration,
    /Users without trusted country evidence remain UNKNOWN/,
  );
});

test('unknown users keep a NEW RETURNING breakdown instead of disappearing from the UI', () => {
  assert.match(migration, /'unknownNewUsers'/);
  assert.match(migration, /'unknownReturningUsers'/);
  assert.match(migration, /'unknownCurrentRoundCompleted'/);
  assert.match(route, /if \(unknownCompleted > 0\)/);
  assert.match(route, /countryCode: UNKNOWN_COUNTRY_CODE/);
  assert.match(
    route,
    /unknownNewUsers \+ unknownReturningUsers !== unknownCompleted/,
  );
});

test('unknown country uses the CLDR ZZ label and a neutral globe icon', () => {
  assert.match(route, /const UNKNOWN_COUNTRY_CODE = 'ZZ';/);
  assert.match(countryFlag, /normalized === 'ZZ'/);
  assert.match(countryFlag, /return '🌐'/);
});
