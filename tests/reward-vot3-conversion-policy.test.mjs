import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [scannerSource, migrationSource] = await Promise.all([
  readFile('src/lib/vebetter/vot3Conversion.ts', 'utf8'),
  readFile(
    'supabase/migrations/20260904213000_allow_any_positive_vot3_conversion.sql',
    'utf8',
  ),
]);

test('VOT3 mission accepts any real positive conversion amount', () => {
  assert.match(
    scannerSource,
    /export const MIN_VOT3_CONVERSION_WEI = 1n;/u,
  );
  assert.doesNotMatch(
    scannerSource,
    /1_000_000_000_000_000_000n/u,
  );
  assert.match(
    scannerSource,
    /A qualifying conversion may be any positive amount/u,
  );
});

test('database proof and reward eligibility use positive amount instead of one B3TR', () => {
  assert.match(
    migrationSource,
    /vot3_conversion_amount_wei::numeric > 0/u,
  );
  assert.match(
    migrationSource,
    /vot3_conversion_amount_wei::numeric <= 0/u,
  );
  assert.match(
    migrationSource,
    /c\.amount_wei::numeric > 0/u,
  );
  assert.match(
    migrationSource,
    /amount_wei::numeric > 0[\s\S]*as first_minimum_conversion_block/u,
  );
  assert.doesNotMatch(
    migrationSource,
    /CONVERSION_AMOUNT_TOO_LOW/u,
  );
  assert.doesNotMatch(
    migrationSource,
    /1000000000000000000/u,
  );
});

test('allocation vote remains a separate required mission after conversion', () => {
  assert.match(
    migrationSource,
    /and v_has_conversion_event[\s\S]*and v_has_vote_event/u,
  );
  assert.match(
    migrationSource,
    /and coalesce\(new\.vote_completed, false\) = true/u,
  );
  assert.match(
    migrationSource,
    /and new\.vote_completed_block >= new\.vot3_converted_block/u,
  );
});
