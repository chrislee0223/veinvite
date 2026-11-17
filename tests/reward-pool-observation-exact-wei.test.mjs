import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseExactPoolWei } from '../src/lib/rewards/exactPoolWei.ts';

const reader = readFileSync('src/lib/rewards/rewardPoolObservation.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20261117142000_reward_pool_observation_exact_wei_reader.sql',
  'utf8',
);

test('very large VeChain Wei amounts parse without rounding', () => {
  for (const s of ['0','10','2461269237422699498008','999999999999999999999999999999999999999999999999']) {
    assert.equal(parseExactPoolWei(s), BigInt(s).toString());
  }
});
test('unsafe JSON numeric values and malformed regex inputs are rejected', () => {
  for (const value of [2461269237422699498008, '2.461e21', '01', '-1', '1.0', '', 'NaN', null, undefined, ' 123 ', '\\d']) {
    assert.throws(() => parseExactPoolWei(value), /Invalid physical pool Wei/);
  }
});
test('pool observations use a text-casting reader rather than PostgREST numeric JSON', () => {
  assert.match(reader, /rpc\('read_latest_reward_pool_observation'/);
  assert.doesNotMatch(reader, /\.select\('generated_at,basis_allocation_round_id,projected_funding_round_id,observed_pool_balance_wei'\)/);
  assert.match(migration, /observed_pool_balance_wei::text/);
  assert.match(migration, /revoke all on function public\.read_latest_reward_pool_observation/);
  assert.match(migration, /grant execute on function public\.read_latest_reward_pool_observation/);
  assert.doesNotMatch(migration, /reward_forecast_snapshots/);
});
