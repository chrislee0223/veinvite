import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260910131500_scope_reconciliation_alerts_to_completed_missions.sql',
    import.meta.url,
  ),
  'utf8',
);

test('stale reconciliation only applies after every mission is complete', () => {
  assert.match(migration, /create or replace view public\.operator_data_quality/i);
  assert.match(migration, /create or replace view public\.operator_release_health/i);

  for (const predicate of [
    /coalesce\(i?\.?apps_completed, 0\) >= 3/i,
    /coalesce\(i?\.?rewards_received, 0\) >= 3/i,
    /coalesce\(i?\.?vot3_converted, false\)/i,
    /coalesce\(i?\.?vote_completed, false\)/i,
    /i?\.?apps_completed_block is not null/i,
    /i?\.?vot3_converted_block is not null/i,
    /i?\.?vote_completed_block is not null/i,
  ]) {
    const matches = migration.match(new RegExp(predicate.source, 'gi')) ?? [];
    assert.ok(
      matches.length >= 2,
      `${predicate} must guard both reconciliation projections`,
    );
  }

  assert.match(migration, /eligibility_check_id is not null/i);
  assert.match(migration, /activation_network = 'mainnet'/i);
  assert.match(migration, /interval '26 hours'/i);
  assert.match(migration, /interval '30 hours'/i);
});

test('monitoring repair preserves business and reward state', () => {
  for (const table of [
    'invitations',
    'invite_impact_events',
    'reward_payouts',
    'reward_rounds',
    'reward_queue_entries',
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(
        `(?:update|delete\\s+from|truncate(?:\\s+table)?)\\s+public\\.${table}`,
        'i',
      ),
      `${table} must remain read-only in this monitoring migration`,
    );
  }

  assert.match(
    migration,
    /revoke all on public\.operator_release_health from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select on public\.operator_release_health to service_role/i,
  );
});
