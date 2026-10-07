import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const monitoring = await readFile(
  new URL('../src/lib/rewards/operationsMonitoring.ts', import.meta.url),
  'utf8',
);

test('operations monitor reads one reserve audit authority', () => {
  assert.match(
    monitoring,
    /read_reward_boost_reserve_audit_snapshot/,
  );
  assert.match(
    monitoring,
    /bankBalanceWei/,
  );
  assert.match(
    monitoring,
    /bankStressReserveWei/,
  );
  assert.match(
    monitoring,
    /sourceRetainedProtectionWei/,
  );
  assert.match(
    monitoring,
    /recentCohortProtectedWei/,
  );
});

test('reserve accounting failures are critical only when reserve is enabled', () => {
  const enabledGate = monitoring.indexOf(
    'if (reserveEnabled)',
  );
  const conservation = monitoring.indexOf(
    'REWARD_BOOST_RESERVE_CONSERVATION_MISMATCH',
  );
  const stress = monitoring.indexOf(
    'REWARD_BOOST_RESERVE_STRESS_UNDERFUNDED',
  );
  const sourceOverrun = monitoring.indexOf(
    'REWARD_BOOST_RESERVE_SOURCE_OVERRUN',
  );
  const destinationOverrun = monitoring.indexOf(
    'REWARD_BOOST_RESERVE_DESTINATION_OVERRUN',
  );

  assert.ok(enabledGate >= 0);
  assert.ok(conservation > enabledGate);
  assert.ok(stress > enabledGate);
  assert.ok(sourceOverrun > enabledGate);
  assert.ok(destinationOverrun > enabledGate);
});

test('pending mature sources and stale public forecast are visible warnings', () => {
  assert.match(
    monitoring,
    /REWARD_BOOST_RESERVE_SOURCE_PENDING[\s\S]*'WARNING'/,
  );
  assert.match(
    monitoring,
    /REWARD_BOOST_RESERVE_FORECAST_STALE[\s\S]*'WARNING'/,
  );
  assert.match(
    monitoring,
    /snapshotReserveNetFlow/,
  );
  assert.match(
    monitoring,
    /planning\.reserveNetFlowWei ===[\s\S]*snapshotReserveNetFlow/,
  );
  assert.doesNotMatch(
    monitoring,
    /pricingBasisWei ===[\s\S]*projectedAllocationWei/,
  );
});

test('reserve health is returned without replacing legacy reward health fields', () => {
  assert.match(monitoring, /reserve: \{/);
  assert.match(monitoring, /distributor: \{/);
  assert.match(monitoring, /runtime: \{/);
  assert.match(monitoring, /pool: \{/);
  assert.match(monitoring, /queue: \{/);
  assert.match(monitoring, /payoutPipeline: \{/);
});
