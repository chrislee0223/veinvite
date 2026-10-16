import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  staleSybilHoldCodes,
  isReliabilityDegraded,
} from '../src/lib/monitoring/reliabilityWatchPolicy.ts';

const migration = await readFile(
  'supabase/migrations/20261017070000_read_sybil_early_hold_liveness_for_reliability.sql',
  'utf8',
);
const watcher = await readFile(
  'src/app/api/cron/reliability-health/route.ts',
  'utf8',
);
const config = await readFile('vercel.json', 'utf8');

const empty = {
  openHolds: 0,
  incompleteCoreHolds: 0,
  stalledOver1h: 0,
  stalledOver24h: 0,
};

test('HOLD with no age threshold is not treated as a stale review', () => {
  assert.deepEqual(staleSybilHoldCodes(empty), []);
  assert.deepEqual(staleSybilHoldCodes({ ...empty, openHolds: 1, incompleteCoreHolds: 1 }), []);
});

test('15-minute watcher escalates 1-hour and 24-hour operator reviews', () => {
  assert.deepEqual(
    staleSybilHoldCodes({ openHolds: 1, incompleteCoreHolds: 1, stalledOver1h: 1, stalledOver24h: 0 }),
    ['SYBIL_EARLY_HOLD_STALLED:1H'],
  );
  assert.deepEqual(
    staleSybilHoldCodes({ openHolds: 2, incompleteCoreHolds: 0, stalledOver1h: 1, stalledOver24h: 1 }),
    ['SYBIL_EARLY_HOLD_STALLED:24H'],
  );
  assert.match(config, /"path": "\/api\/cron\/reliability-health"[\s\S]*"schedule": "7,22,37,52 \* \* \* \*"/u);
  assert.match(watcher, /\.rpc\(\s*'read_sybil_v2_early_hold_liveness'/u);
  assert.match(watcher, /staleSybilHoldCodes\(sybilHolds\)/u);
});

test('one-hour pending operator review does not misreport application outage', () => {
  assert.equal(isReliabilityDegraded([]), false);
  assert.equal(isReliabilityDegraded(['SYBIL_EARLY_HOLD_STALLED:1H']), false);
  assert.equal(isReliabilityDegraded(['SYBIL_EARLY_HOLD_STALLED:24H']), true);
  assert.equal(isReliabilityDegraded(['SYBIL_EARLY_HOLD_STALLED:1H', 'CRON_STALE:vote-reconcile']), true);
  assert.match(watcher, /const degraded = isReliabilityDegraded\(current\)/u);
  assert.match(watcher, /status: degraded \? 503 : 200/u);
});

test('invalid and inconsistent HOLD counts fail closed instead of suppressing alerts', () => {
  assert.throws(() => staleSybilHoldCodes({ ...empty, openHolds: -1 }), /Invalid Sybil HOLD/u);
  assert.throws(() => staleSybilHoldCodes({ ...empty, openHolds: 1, stalledOver1h: 2 }), /Invalid Sybil HOLD/u);
  assert.throws(() => staleSybilHoldCodes({ ...empty, openHolds: 1, stalledOver1h: 1, stalledOver24h: 2 }), /Invalid Sybil HOLD/u);
  assert.throws(() => staleSybilHoldCodes({ ...empty, openHolds: 1, incompleteCoreHolds: 2 }), /Invalid Sybil HOLD/u);
});

test('first HOLD is derived from an active episode, surviving repeated SYSTEM reassessments', () => {
  assert.match(migration, /min\(h\.created_at\)/u);
  assert.match(migration, /h\.state = 'HOLD'/u);
  assert.match(migration, /previous\.state <> 'HOLD'/u);
  assert.match(migration, /h\.revision > coalesce/u);
  assert.match(migration, /interval '1 hour'/u);
  assert.match(migration, /interval '24 hours'/u);
  assert.match(migration, /required_checks[\s\S]*- 'CHAIN_FINALITY'/u);
});

test('HOLD alert RPC is aggregate-only, service-role-only and never mutates wallets or rewards', () => {
  assert.match(migration, /returns table\(\s*open_holds bigint,[\s\S]*stalled_over_24h bigint/u);
  assert.match(migration, /revoke all on function public\.read_sybil_v2_early_hold_liveness\(text\)[\s\S]*from public, anon, authenticated/u);
  assert.match(migration, /grant execute on function public\.read_sybil_v2_early_hold_liveness\(text\)[\s\S]*to service_role/u);
  assert.doesNotMatch(migration, /\b(update|delete|insert)\s+(public\.)?(invitations|sybil_v2_wallet_restrictions|reward_queue_entries)/iu);
  assert.doesNotMatch(watcher, /resolve_sybil_v2_review|apply_sybil_v2_security_client_inviter_restriction/u);
});
