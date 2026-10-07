import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const execution = await readFile(
  new URL('../src/lib/rewards/rewardBoostReserveExecution.ts', import.meta.url),
  'utf8',
);
const route = await readFile(
  new URL('../src/app/api/admin/rewards/boost-reserve-run/route.ts', import.meta.url),
  'utf8',
);

test('reserve execution seals mature sources before destination release', () => {
  const sourceLoop = execution.indexOf('for (const source of sources)');
  const sourceRpc = execution.indexOf(
    'seal_and_sweep_reward_boost_reserve_source',
  );
  const poolReread = execution.indexOf(
    'const releasePool =',
  );
  const destinationRpc = execution.indexOf(
    'seal_and_release_reward_boost_destination',
  );

  assert.ok(sourceLoop >= 0);
  assert.ok(sourceRpc > sourceLoop);
  assert.ok(poolReread > sourceRpc);
  assert.ok(destinationRpc > poolReread);
});

test('reserve execution re-reads physical pool before boost release', () => {
  assert.match(
    execution,
    /await readVeInviteRewardPoolStatus\(\)/,
  );
  assert.match(
    execution,
    /pool changed during execution/,
  );
  assert.match(
    execution,
    /distribution became paused/,
  );
});

test('forecast refresh occurs only after a destination accounting release', () => {
  assert.match(
    execution,
    /destinationResult\.changed === true[\s\S]*refreshRewardForecastSnapshot/,
  );
});

test('disabled reserve mode performs no accounting mutations', () => {
  const disabledGate = execution.indexOf(
    'if (!(await reserveEnabled()))',
  );
  const sourceRpc = execution.indexOf(
    'read_reward_boost_reserve_unprotected_sources',
  );
  assert.ok(disabledGate >= 0 && sourceRpc > disabledGate);
  assert.match(
    execution,
    /enabled: false,[\s\S]*sourceCandidates: 0,[\s\S]*destinationResult: null/,
  );
});

test('operator execution route is same-origin and reward-operator protected', () => {
  assert.match(route, /requestHasSameOrigin/);
  assert.match(route, /requireWalletSession/);
  assert.match(route, /readVeInviteRewardPoolStatus/);
  assert.match(route, /canOperateVeInviteRewards/);
  assert.match(
    route,
    /RUN_REWARD_BOOST_RESERVE_REBALANCE/,
  );
  assert.match(
    route,
    /tokenTransfersPerformed: false/,
  );
});
