import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261112022000_reward_shared_pool_capacity_shadow_v1.sql', import.meta.url),
  'utf8',
);
const document = readFileSync(
  new URL('../docs/REWARD_SHARED_POOL_CUTOVER_KO.md', import.meta.url),
  'utf8',
);
const W = 10n ** 18n;
const preview = ({ pool, provisional, outstanding, x, winners }) => {
  const fixed = outstanding - provisional;
  assert.ok(fixed >= 0n);
  const headroom = pool > fixed ? pool - fixed : 0n;
  const xBudget = BigInt(winners) * x;
  return headroom > xBudget
    ? (headroom - xBudget) / BigInt(winners)
    : 0n;
};

test('shared pool capacity shadow is read only with scoped service access', () => {
  assert.match(migration, /SHADOW_ONLY/);
  assert.match(migration, /writesPerformed',false/);
  assert.match(migration, /isPayoutQuote',false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.read_reward_shared_pool_capacity_shadow_v1/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.read_reward_shared_pool_capacity_shadow_v1[\s\S]*TO service_role/);
  assert.doesNotMatch(migration, /\b(?:INSERT INTO|UPDATE\s+public\.|DELETE FROM|TRUNCATE)\b/i);
  assert.match(document, /X 보상 10 B3TR/);
});

test('exact wei capacity excludes provisional cohort only once, not confirmed X', () => {
  const pool = 7422868n * (W / 1000n);
  const provisional = 2127464n * (W / 1000n);
  const unpaidX = 10n * W;
  const outstanding = provisional + unpaidX;
  assert.equal(preview({pool, provisional, outstanding, x:10n*W,winners:1}),pool-20n*W);
  assert.equal(preview({pool, provisional, outstanding, x:10n*W,winners:2}),(pool-30n*W)/2n);
  assert.equal(preview({pool, provisional, outstanding, x:10n*W,winners:3}),(pool-40n*W)/3n);
});

test('shadow fails closed for exhausted pool and mismatched liabilities', () => {
  const zero = preview({pool:100n,provisional:50n,outstanding:100n,x:10n,winners:6});
  assert.equal(zero,0n);
  assert.throws(()=>preview({pool:100n,provisional:101n,outstanding:100n,x:10n,winners:1}));
});

test('migration does not claim actual payout authority', () => {
  assert.match(migration,/requiresAtomicWriterCutover',true/);
  assert.match(document,/원자적 공통 풀 지급 Writer/);
  assert.match(document,/enforce_reward_queue_cohort_budget/);
  assert.match(document,/validate_reward_x_promotion_split/);
});
