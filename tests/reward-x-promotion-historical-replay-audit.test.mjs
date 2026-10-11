import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011165000_add_x_promotion_historical_replay_audit_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('historical replay audit is read-only and stable', () => {
  assert.match(
    migration,
    /returns jsonb\s+language plpgsql\s+stable/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(insert into|update public|delete from)\b/i,
  );
  assert.match(
    migration,
    /It never creates splits, obligations, opportunities, payouts, or changes LIVE readiness/,
  );
});

test('historical replay uses the authoritative split calculator', () => {
  assert.match(
    migration,
    /public\.calculate_reward_x_promotion_split_v1/,
  );
  assert.match(
    migration,
    /base_amount_wei\+promotion_amount_wei-reserved_amount_wei/,
  );
});

test('historical replay never weakens live or payout gates', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_(enabled|payout_enabled)/i,
  );
  assert.doesNotMatch(
    migration,
    /read_reward_x_promotion_offer_readiness_v1\s*\(/i,
  );
});

test('historical replay checks source binding and policy constants', () => {
  assert.match(migration, /reward_funding_allocation_receipt_id is null/);
  assert.match(migration, /promotion_rate_bps<>1000/);
  assert.match(
    migration,
    /promotion_cap_wei<>10000000000000000000::numeric/,
  );
});

test('historical replay is server-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_historical_replay_audit_v1\(text,integer\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_historical_replay_audit_v1\(text,integer\)[\s\S]*to service_role/,
  );
});
