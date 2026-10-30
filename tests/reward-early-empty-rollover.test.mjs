import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../supabase/migrations/20261030170000_reward_early_empty_cohort_rollover.sql', import.meta.url),
  'utf8',
);
const B3TR = 10n ** 18n;
const section = (name) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  const end = sql.indexOf('$function$\n;', start);
  assert.ok(start >= 0 && end > start, 'missing '+name);
  return sql.slice(start, end + 12);
};

function shadow(input) {
  const { enabled, priorInvitations, priorCommitted, sourceSweepWei, validLedger,
    currentInvitations, currentCommitted, currentPipeline, freshWei, bankWei,
    stressWei, physicalHeadroomWei, adaptiveBps } = input;
  const eligible = enabled && priorInvitations === 0 && priorCommitted === 0n &&
    currentInvitations === 0 && currentCommitted === 0n && currentPipeline === 0 &&
    validLedger;
  const early = eligible ? sourceSweepWei : 0n;
  const normal = freshWei * BigInt(adaptiveBps) / 10_000n;
  const ceiling = early > normal ? early : normal;
  const bankAvailable = bankWei > stressWei ? bankWei - stressWei : 0n;
  return [ceiling, bankAvailable, physicalHeadroomWei].reduce(
    (min, x) => x < min ? x : min
  );
}
const scenario = (overrides = {}) => ({
  enabled: true, priorInvitations: 0, priorCommitted: 0n, sourceSweepWei: 1930n * B3TR,
  validLedger: true, currentInvitations: 0, currentCommitted: 0n,
  currentPipeline: 0, freshWei: 638n * B3TR, bankWei: 2200n * B3TR,
  stressWei: 232n * B3TR, physicalHeadroomWei: 5000n * B3TR,
  adaptiveBps: 15000, ...overrides,
});

test('new policy is default-OFF and does not activate itself', () => {
  assert.match(sql, /reward_boost_early_empty_rollover_enabled boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /UPDATE\s+public\.reward_runtime_config/i);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
});

test('only immediately prior, absolutely invitation-free, uncommitted source can be swept early', () => {
  const candidate = section('read_reward_boost_reserve_source_candidate');
  const sources = section('read_reward_boost_reserve_unprotected_sources');
  for (const part of [candidate, sources]) {
    assert.match(part, /reward_boost_early_empty_rollover_enabled|v_early_empty_enabled/);
    assert.match(part, /read_reward_cohort_committed_wei/);
    assert.match(part, /not exists \([\s\S]*?from public\.invitations i/);
    assert.match(part, /v_current_cohort-1/);
  }
  assert.match(candidate, /REWARD_BOOST_RESERVE_SOURCE_NOT_MATURE/);
  assert.match(sources, /reward_boost_reserve_source_protections/);
});

test('destination requires auditable swept source, no destination participants and no committed claims', () => {
  const dest = section('seal_and_release_reward_boost_destination');
  for (const term of [
    'v_cfg.reward_boost_early_empty_rollover_enabled',
    'v_cfg.reward_boost_reserve_adaptive_v2_enabled',
    'v_adaptive_recipient_count=0',
    'v_committed=0',
    "l.entry_kind='SOURCE_SWEEP'",
    'l.amount_wei=p.max_sweepable_wei',
    'p.baseline_committed_wei=0',
    'p.queued_eligible_count=0',
    'p.long_incomplete_count=0',
    'p.late_weighted_liability_wei=0',
    'v_bank_available',
    'v_physical_headroom',
    'v_recent_protected',
    'v_source_retained',
    'v_reserved_existing',
    'pg_advisory_xact_lock',
  ]) assert.ok(dest.includes(term), term);
  assert.match(dest, /greatest\(\s*trunc\(v_current_pricing\*v_boost_factor_bps\/10000\),\s*v_early_empty_rollover/);
});

test('existing immutable destination plan is returned before new release logic', () => {
  const dest = section('seal_and_release_reward_boost_destination');
  const existing = dest.indexOf('select * into v_existing');
  const oldPlanReturn = dest.indexOf("'changed',false,", existing);
  const novel = dest.indexOf('v_early_empty_rollover');
  const decision = dest.indexOf('if v_cfg.reward_boost_early_empty_rollover_enabled');
  assert.ok(existing >= 0 && oldPlanReturn > existing && decision > oldPlanReturn && novel >= 0);
  assert.doesNotMatch(dest, /update public\.(reward_queue_entries|reward_payouts|reward_boost_reserve_destination_plans)/i);
});

test('migration does not change payout, Claim or X promotion functions', () => {
  const fn = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([^(]+)\(/g)].map(x=>x[1]);
  assert.deepEqual(fn.sort(),[
    'read_reward_boost_reserve_source_candidate',
    'read_reward_boost_reserve_unprotected_sources',
    'seal_and_release_reward_boost_destination'
  ].sort());
  for (const name of fn) assert.match(sql,
    new RegExp('REVOKE ALL ON FUNCTION public\\.' + name));
});

test('happy path: prior verified empty funding can be carried into next round', () => {
  const q = scenario();
  const release = shadow(q);
  assert.equal(release, 1930n * B3TR);
  const nextReward = (q.freshWei + release) / 3n;
  assert.ok(nextReward > 643n * B3TR);
  assert.equal(nextReward / B3TR, 856n);
});

test('any unfinished/invalid proof or current demand falls back to normal ceiling', () => {
  for (const override of [
    {enabled:false}, {priorInvitations:1}, {priorCommitted:1n},
    {validLedger:false}, {currentInvitations:1}, {currentCommitted:1n},
    {currentPipeline:1}
  ]) {
    const q=scenario(override);
    assert.equal(shadow(q), q.freshWei*BigInt(q.adaptiveBps)/10000n);
  }
});

test('10,000 varying liquidity and bank scenarios never exceed hard caps', () => {
  for (let i=0;i<10_000;i++) {
    const q=scenario({
      sourceSweepWei: BigInt((i*193+17)%4000)*B3TR,
      freshWei: BigInt((i*61+34)%1500)*B3TR,
      bankWei: BigInt((i*103+11)%6000)*B3TR,
      stressWei: BigInt((i*101+41)%2000)*B3TR,
      physicalHeadroomWei: BigInt((i*97+27)%6000)*B3TR,
      adaptiveBps: [10000,12500,15000][i%3],
    });
    const result=shadow(q);
    const cash=q.bankWei>q.stressWei ? q.bankWei-q.stressWei:0n;
    assert.ok(result>=0n && result<=cash && result<=q.physicalHeadroomWei);
    const oldCeiling=q.freshWei*BigInt(q.adaptiveBps)/10000n;
    assert.ok(result<= (q.sourceSweepWei>oldCeiling?q.sourceSweepWei:oldCeiling));
  }
});
