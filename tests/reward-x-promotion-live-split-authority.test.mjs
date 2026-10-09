import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009023000_harden_x_promotion_live_split_payout_authority_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('batch and payout trigger share one transfer amount authority', () => {
  const calls =
    migration.match(/read_reward_batch_transfer_amount_wei_v1\(q\.invite_code\)/g) ?? [];
  assert.equal(calls.length, 2);
  assert.doesNotMatch(
    migration,
    /coalesce\(s\.base_amount_wei,q\.reserved_amount_wei\)/,
  );
});

test('an existing LIVE split remains authoritative after feature disable', () => {
  const splitLookup = migration.indexOf(
    "from public.reward_x_promotion_splits s",
  );
  const disabledCheck = migration.indexOf(
    "if not v_cfg.reward_x_promotion_enabled then",
  );
  assert.ok(splitLookup >= 0);
  assert.ok(disabledCheck > splitLookup);
  assert.match(
    migration,
    /An already-created LIVE split is an immutable promise/,
  );
});

test('existing split uses its immutable policy rather than current runtime policy', () => {
  assert.match(
    migration,
    /v_split\.policy_version<>'x-promotion-split-v1'/,
  );
  assert.doesNotMatch(
    migration,
    /v_split\.policy_version<>v_cfg\.reward_x_promotion_policy_version/,
  );
});

test('active LIVE window without a split still fails closed', () => {
  assert.match(
    migration,
    /if v_queue\.reserved_at<v_cfg\.reward_x_promotion_live_started_at then[\s\S]*REWARD_X_PROMOTION_LIVE_SPLIT_MISSING/,
  );
});

test('obligation must still match the immutable LIVE split', () => {
  assert.match(
    migration,
    /v_obligation\.policy_version<>v_split\.policy_version/,
  );
  assert.match(
    migration,
    /v_obligation\.financial_state<>'RESERVED'/,
  );
});

test('migration does not enable LIVE or remove the activation interlock', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /drop trigger[\s\S]*guard_reward_x_promotion_live_activation/i,
  );
});
