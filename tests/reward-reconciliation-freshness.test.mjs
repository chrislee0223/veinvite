import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260903123000_align_reconciliation_freshness_with_daily_cron.sql',
    import.meta.url,
  ),
  'utf8',
);
const vercelConfig = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('reconciliation freshness matches the daily recovery cron', () => {
  const reconciliationCron = vercelConfig.crons?.find(
    (cron) => cron.path === '/api/cron/reconcile',
  );

  assert.ok(reconciliationCron, 'reconciliation cron must remain configured');
  assert.equal(
    reconciliationCron.schedule,
    '17 0 * * *',
    'this guard must be reviewed if the recovery cadence changes',
  );
  assert.match(
    migration,
    /now\(\)\s*-\s*interval\s+'26 hours'/i,
  );
  assert.doesNotMatch(
    migration,
    /now\(\)\s*-\s*interval\s+'1 hour'/i,
  );
});

test('freshness repair changes monitoring semantics only', () => {
  assert.match(
    migration,
    /create or replace view public\.operator_data_quality/i,
  );
  assert.match(
    migration,
    /grant select on table public\.operator_data_quality\s+to service_role/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.operator_data_quality\s+from public, anon, authenticated, service_role/i,
  );

  for (const table of [
    'invitations',
    'invite_impact_events',
    'reward_payouts',
    'reward_rounds',
    'referral_relationships',
    'reward_queue_entries',
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(
        `(?:update|delete\\s+from|truncate(?:\\s+table)?)\\s+public\\.${table}`,
        'i',
      ),
      `${table} raw/business data must not be mutated by a monitoring repair`,
    );
  }
});
