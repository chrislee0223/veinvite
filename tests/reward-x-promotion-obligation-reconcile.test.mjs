import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008133000_reconcile_x_promotion_obligation_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('obligations remain derived only from LIVE splits', () => {
  assert.match(
    migration,
    /if new\.mode='LIVE' and new\.promotion_amount_wei>0 then/,
  );
  assert.match(
    migration,
    /v_split\.mode<>'LIVE'/,
  );
});

test('obligation identity and financial amount stay immutable', () => {
  assert.match(migration, /REWARD_X_PROMOTION_OBLIGATION_IDENTITY_IMMUTABLE/);
  assert.match(migration, /old\.promotion_amount_wei is distinct from new\.promotion_amount_wei/);
});

test('financial state transitions are explicit and terminal-safe', () => {
  assert.match(
    migration,
    /old\.financial_state='RESERVED' and new\.financial_state in \('HELD','RELEASED'\)/,
  );
  assert.match(
    migration,
    /old\.financial_state='HELD' and new\.financial_state in \('RELEASED','PAID'\)/,
  );
  assert.doesNotMatch(
    migration,
    /old\.financial_state='RELEASED' and new\.financial_state=/,
  );
  assert.doesNotMatch(
    migration,
    /old\.financial_state='PAID' and new\.financial_state=/,
  );
});

test('promotion can only enter HELD after the exact base payout and receipt exist', () => {
  assert.match(migration, /v_payout\.amount_wei<>v_split\.base_amount_wei/);
  assert.match(migration, /REWARD_X_PROMOTION_BASE_RECEIPT_MISSING/);
  assert.match(migration, /REWARD_X_PROMOTION_SECURITY_NOT_CLEAR/);
});

test('released and held money have separate accounting readers', () => {
  assert.match(
    migration,
    /o\.financial_state='HELD'/,
  );
  assert.match(
    migration,
    /o\.financial_state='RELEASED'/,
  );
});

test('server-only tables and privileged RPCs are not exposed to clients', () => {
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_obligations enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_obligations[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_obligations to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.activate_reward_x_promotion_obligation_v1\(text\)[\s\S]*to service_role/,
  );
});

test('PAID transition is auditable', () => {
  assert.match(migration, /when new\.financial_state='PAID' then 'PROMOTION_PAID'/);
});
