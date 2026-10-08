import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008141000_block_x_promotion_paid_without_proof_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion PAID stays fail-closed until payout proof exists', () => {
  assert.match(
    migration,
    /if new\.financial_state='PAID' then[\s\S]*REWARD_X_PROMOTION_PAID_PROOF_NOT_READY/,
  );
  assert.doesNotMatch(
    migration,
    /old\.financial_state='HELD' and new\.financial_state in \('RELEASED','PAID'\)/,
  );
  assert.match(
    migration,
    /old\.financial_state='HELD' and new\.financial_state='RELEASED'/,
  );
});

test('existing valid pre-payment transitions remain available', () => {
  assert.match(
    migration,
    /old\.financial_state='RESERVED' and new\.financial_state in \('HELD','RELEASED'\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_DELETE_FORBIDDEN/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OBLIGATION_IDENTITY_IMMUTABLE/,
  );
});

test('transition guard is not callable by API roles', () => {
  assert.match(
    migration,
    /revoke all on function public\.guard_reward_x_promotion_obligation_mutation\(\)[\s\S]*from public,anon,authenticated,service_role/,
  );
});
