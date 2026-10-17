import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  staleSybilScanFailureCodes,
  isReliabilityDegraded,
} from '../src/lib/monitoring/reliabilityWatchPolicy.ts';

const migration = await readFile(
  'supabase/migrations/20261017091839_sybil_fresh_evidence_and_scan_failure_watch.sql',
  'utf8',
);
const watcher = await readFile(
  'src/app/api/cron/reliability-health/route.ts',
  'utf8',
);
const pipeline = await readFile('src/lib/sybil/v2/pipeline.ts', 'utf8');

test('same-code new evidence reopens a SYSTEM HOLD without changing operator decisions or payout exclusions', () => {
  assert.match(migration, /create or replace view public\.operator_sybil_v2_hold_new_evidence_candidates/u);
  assert.match(migration, /e\.created_at > a\.updated_at/u);
  assert.match(migration, /e\.subject_wallet = lower\(i\.invitee_wallet\)/u);
  assert.match(migration, /e\.strength in \('MEDIUM', 'HIGH'\)/u);
  assert.match(migration, /e\.score > 0/u);
  assert.doesNotMatch(migration, /reason_codes\s*\??\s*e\.signal_code/u);
  assert.match(migration, /a\.state = 'HOLD'/u);
  assert.match(migration, /a\.source = 'SYSTEM'/u);
  assert.match(migration, /i\.reward_status not in \('PAID', 'FORFEITED'\)/u);
  assert.match(migration, /q\.status = 'ASSIGNED'/u);
  assert.match(migration, /with \(security_invoker = true\)/u);
  assert.match(migration, /revoke all on public\.operator_sybil_v2_hold_new_evidence_candidates/u);
  assert.match(pipeline, /operator_sybil_v2_hold_new_evidence_candidates/u);
});

test('first scan failure timestamp survives the retry-in-progress and repeat-failure writes', () => {
  assert.match(migration, /add column if not exists first_failed_at timestamptz/u);
  assert.match(migration, /before insert or update on public\.sybil_v2_scan_checkpoints/u);
  assert.match(migration, /old\.first_failed_at, new\.first_failed_at, transaction_timestamp\(\)/u);
  assert.match(migration, /new\.first_failed_at := old\.first_failed_at/u);
  assert.match(migration, /new\.first_failed_at := null/u);
  assert.match(migration, /new\.historical_chain_status = 'COMPLETE'[\s\S]*new\.funding_chain_status = 'COMPLETE'/u);
  assert.match(migration, /security invoker/u);
});

test('scan failure liveness is independent of HOLD and only counts active unpaid cases', () => {
  assert.match(migration, /create or replace function public\.read_sybil_v2_failed_scan_liveness/u);
  assert.match(migration, /failed_scans bigint,\s*failed_over_1h bigint,\s*failed_over_24h bigint/u);
  assert.match(migration, /s\.attempt_count >= 3/u);
  assert.match(migration, /s\.first_failed_at <= now\(\) - interval '1 hour'/u);
  assert.match(migration, /s\.first_failed_at <= now\(\) - interval '24 hours'/u);
  assert.match(migration, /s\.last_error is not null/u);
  assert.match(migration, /i\.reward_status not in \('PAID', 'FORFEITED'\)/u);
  assert.match(migration, /a\.state is distinct from 'RESTRICTED'/u);
  assert.doesNotMatch(migration, /join public\.operator_sybil_v2_operator_action_candidates/u);
  assert.match(migration, /revoke all on function public\.read_sybil_v2_failed_scan_liveness\(text\)/u);
  assert.match(migration, /grant execute on function public\.read_sybil_v2_failed_scan_liveness\(text\)\s*to service_role/u);
  assert.match(watcher, /read_sybil_v2_failed_scan_liveness/u);
  assert.match(watcher, /staleSybilScanFailureCodes\(sybilScanFailures\)/u);
  assert.match(watcher, /AbortSignal\.timeout\(HEALTH_READ_TIMEOUT_MS\)/u);
});

test('first-hour scan failure is an operator warning, not a site outage', () => {
  const oneHour = { failedScans: 2, failedOver1h: 1, failedOver24h: 0 };
  assert.deepEqual(staleSybilScanFailureCodes({ failedScans: 0, failedOver1h: 0, failedOver24h: 0 }), []);
  assert.deepEqual(staleSybilScanFailureCodes({ failedScans: 1, failedOver1h: 0, failedOver24h: 0 }), []);
  assert.deepEqual(staleSybilScanFailureCodes(oneHour), ['SYBIL_SCAN_FAILED:1H']);
  assert.equal(isReliabilityDegraded(staleSybilScanFailureCodes(oneHour)), false);
  assert.deepEqual(staleSybilScanFailureCodes({ ...oneHour, failedOver24h: 1 }), ['SYBIL_SCAN_FAILED:24H']);
  assert.equal(isReliabilityDegraded(staleSybilScanFailureCodes({ ...oneHour, failedOver24h: 1 })), true);
});

test('invalid scan counters fail closed rather than hiding a persistent error', () => {
  const baseline = { failedScans: 2, failedOver1h: 1, failedOver24h: 0 };
  assert.throws(() => staleSybilScanFailureCodes({ ...baseline, failedScans: -1 }), /Invalid Sybil scan/u);
  assert.throws(() => staleSybilScanFailureCodes({ ...baseline, failedOver1h: 3 }), /Invalid Sybil scan/u);
  assert.throws(() => staleSybilScanFailureCodes({ ...baseline, failedOver24h: 2 }), /Invalid Sybil scan/u);
  assert.throws(() => staleSybilScanFailureCodes({ ...baseline, failedOver24h: NaN }), /Invalid Sybil scan/u);
});

test('no wallet, reward, assessment or claim mutation is introduced', () => {
  assert.doesNotMatch(migration, /\b(update|delete from|insert into)\s+public\.(invitations|reward_queue_entries|sybil_v2_referral_assessments|sybil_v2_wallet_restrictions)/iu);
  assert.doesNotMatch(watcher, /issue_sybil_v2_reward_clearance|record_sybil_v2_assessment|reserve_reward|apply_sybil_v2_security_client_inviter_restriction/u);
});
