import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009025000_add_x_promotion_opportunity_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('opportunity is an immutable 24 hour window', () => {
  assert.match(migration, /offer_window_seconds integer not null/);
  assert.match(migration, /v_window_seconds constant integer := 86400/);
  assert.match(
    migration,
    /post_deadline_at =\s*opened_at \+ make_interval\(secs => offer_window_seconds\)/,
  );
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_opportunities/,
  );
});

test('opportunity requires a HELD obligation and exact LIVE split', () => {
  assert.match(
    migration,
    /v_obligation\.financial_state<>'HELD'/,
  );
  assert.match(migration, /s\.mode='LIVE'/);
  assert.match(
    migration,
    /v_split\.promotion_amount_wei<>v_obligation\.promotion_amount_wei/,
  );
});

test('base payout and receipt are both required before opportunity creation', () => {
  assert.match(migration, /p\.status='PAID'/);
  assert.match(
    migration,
    /v_payout\.amount_wei<>v_split\.base_amount_wei/,
  );
  assert.match(migration, /from public\.reward_receipts r/);
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING/,
  );
});

test('reconciliation is isolated from core payout and retries safely', () => {
  assert.match(
    migration,
    /exception when others then[\s\S]*v_failed:=v_failed\+1/,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*reward_x_promotion_opportunities/,
  );
  assert.doesNotMatch(
    migration,
    /trigger[\s\S]*reward_receipts/i,
  );
  assert.doesNotMatch(
    migration,
    /trigger[\s\S]*reward_payouts/i,
  );
});

test('foundation does not enable LIVE or create a promotion payout path', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.reward_payouts/i,
  );
});

test('opportunity table remains server-only', () => {
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_opportunities enable row level security/,
  );
  assert.match(
    migration,
    /grant select,insert on table public\.reward_x_promotion_opportunities\s+to service_role/,
  );
});

test('direct opportunity inserts are guarded by DB invariants and security', () => {
  assert.match(
    migration,
    /before insert on public\.reward_x_promotion_opportunities/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OPPORTUNITY_OBLIGATION_MISMATCH/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OPPORTUNITY_SECURITY_NOT_CLEAR/,
  );
  assert.match(
    migration,
    /public\.is_sybil_v2_referral_invalidated/,
  );
});
