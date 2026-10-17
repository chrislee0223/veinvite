import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  'supabase/migrations/20261017154000_sybil_hold_actionable_liveness_and_rechecks.sql',
  'utf8',
);
const pipeline = await readFile('src/lib/sybil/v2/pipeline.ts', 'utf8');
const watcher = await readFile('src/app/api/cron/reliability-health/route.ts', 'utf8');
const recovery = await readFile('src/app/api/cron/vote-reconcile/route.ts', 'utf8');

test('a pre-mission early HOLD is visible but is not automatically a stalled analyzer', () => {
  assert.match(sql, /count\(\*\) filter \(where incomplete_core\)/u);
  assert.match(sql, /where needs_action and first_held_at <= now\(\) - interval '1 hour'/u);
  assert.match(sql, /where needs_action and first_held_at <= now\(\) - interval '24 hours'/u);
  assert.match(sql, /coalesce\(i\.apps_completed, 0\) >= 3/u);
  assert.match(sql, /coalesce\(i\.rewards_received, 0\) >= 3/u);
  assert.match(sql, /i\.vot3_converted is true/u);
  assert.match(sql, /i\.vote_completed is true/u);
  assert.match(sql, /i\.apps_completed_block is not null/u);
  assert.match(sql, /i\.vot3_converted_block is not null/u);
  assert.match(sql, /i\.vote_completed_block is not null/u);
  assert.match(sql, /a\.first_held_at/u);
});

test('new independent evidence and exhausted chain scans remain actionable', () => {
  assert.match(sql, /s\.attempt_count >= 3/u);
  assert.match(sql, /s\.last_error is not null/u);
  assert.match(sql, /e\.created_at > a\.updated_at/u);
  assert.match(sql, /e\.strength in \('MEDIUM', 'HIGH'\)/u);
  assert.match(sql, /not \(coalesce\(a\.reason_codes, '\[\]'::jsonb\) \? e\.signal_code\)/u);
  assert.match(sql, /a\.state = 'HOLD'/u);
  assert.match(sql, /a\.source = 'SYSTEM'/u);
  assert.match(sql, /i\.reward_status not in \('PAID', 'FORFEITED'\)/u);
  assert.match(sql, /q\.status = 'ASSIGNED'/u);
  assert.match(pipeline, /operator_sybil_v2_hold_new_evidence_candidates/u);
  assert.match(pipeline, /newEvidenceHolds/u);
  assert.match(pipeline, /\.limit\(Math\.min\(2, bounded\)\)/u);
  assert.match(pipeline, /candidates\.pop\(\)/u);
  assert.match(pipeline, /candidates\.unshift\(\{ invite_code: inviteCode \}\)/u);
  assert.match(pipeline, /if \(seen\.has\(inviteCode\)\) continue;/u);
  assert.match(recovery, /runSybilV2AssessmentBatch/u);
});

test('same-device signals never advertise automatic blacklisting without independent HIGH evidence', () => {
  assert.match(pipeline, /securityClientInviterIndependentHighEvidence:/u);
  assert.match(pipeline, /signal\.strength === 'HIGH'/u);
  assert.match(pipeline, /clientInviterIndependentHighEvidence/u);
  assert.match(pipeline, /\(securityClientInviterImmediateSwitch &&\s+clientInviterIndependentHighEvidence\)/u);
  assert.doesNotMatch(pipeline, /restrictedSiblingReentry \|\|\s+securityClientInviterImmediateSwitch \|\|/u);
});

test('both alert sources reuse the same service-only read path; no new payment or verdict authority', () => {
  assert.match(sql, /create or replace function public\.read_sybil_v2_early_hold_liveness/u);
  assert.match(sql, /create or replace function public\.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness/u);
  assert.match(sql, /from public\.read_sybil_v2_early_hold_liveness\(new\.network\)/u);
  assert.match(sql, /with \(security_invoker = true\)/u);
  assert.match(sql, /revoke all on public\.operator_sybil_v2_hold_new_evidence_candidates\s+from public, anon, authenticated/u);
  assert.match(sql, /grant select on public\.operator_sybil_v2_hold_new_evidence_candidates\s+to service_role/u);
  assert.match(sql, /revoke all on function public\.read_sybil_v2_early_hold_liveness\(text\)/u);
  assert.doesNotMatch(sql, /\b(update|delete from|insert into)\s+public\.(?:invitations|reward_queue_entries|sybil_v2_wallet_restrictions)/iu);
  assert.match(watcher, /read_sybil_v2_early_hold_liveness/u);
});
