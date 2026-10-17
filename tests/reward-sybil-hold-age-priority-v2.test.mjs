import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prioritizeFreshHoldCandidates } from '../src/lib/sybil/v2/freshHoldCandidatePriority.ts';

const sql = await readFile(
  'supabase/migrations/20261017080151_sybil_hold_actionable_age_v2.sql',
  'utf8',
);
const pipeline = await readFile('src/lib/sybil/v2/pipeline.ts', 'utf8');

const rows = (...codes) => codes.map((invite_code) => ({ invite_code }));
const codes = (entries) => entries.map((entry) => entry.invite_code);

test('saturated ordinary batch with duplicate fresh rows still reserves two genuinely new HOLDs', () => {
  const result = prioritizeFreshHoldCandidates(
    rows('BASE1', 'BASE2', 'BASE3'),
    rows('BASE1', 'BASE2', 'NEW1', 'NEW2', 'NEW3'),
    3,
  );
  assert.deepEqual(codes(result), ['NEW1', 'NEW2', 'BASE1']);
});

test('no truly new evidence never displaces existing candidate work', () => {
  const ordinary = Object.freeze(rows('BASE1', 'BASE2', 'BASE3'));
  const fresh = Object.freeze(rows('BASE1', 'BASE2'));
  assert.deepEqual(
    codes(prioritizeFreshHoldCandidates(ordinary, fresh, 3)),
    ['BASE1', 'BASE2', 'BASE3'],
  );
  assert.deepEqual(codes(ordinary), ['BASE1', 'BASE2', 'BASE3']);
});

test('one spare slot cannot overflow the bounded batch', () => {
  assert.deepEqual(
    codes(prioritizeFreshHoldCandidates(rows('BASE1'), rows('BASE1', 'NEW1', 'NEW2'), 1)),
    ['NEW1'],
  );
});

test('fresh view and ordinary duplicates are skipped without duplicate jobs or changed ordering', () => {
  assert.deepEqual(
    codes(prioritizeFreshHoldCandidates(
      rows('BASE1', 'BASE2', 'BASE3', 'BASE4'),
      rows('BASE1', 'BASE1', 'NEW1', 'NEW1', 'BASE3', 'NEW2'),
      4,
    )),
    ['NEW1', 'NEW2', 'BASE1', 'BASE2'],
  );
});

test('partial or empty priority supply remains idempotent and preserves ordinary candidates', () => {
  assert.deepEqual(
    codes(prioritizeFreshHoldCandidates(rows('BASE1', 'BASE2'), rows('NEW1'), 2)),
    ['NEW1', 'BASE1'],
  );
  assert.deepEqual(codes(prioritizeFreshHoldCandidates(rows('BASE1', 'BASE2'), [], 2)), ['BASE1', 'BASE2']);
  assert.deepEqual(codes(prioritizeFreshHoldCandidates([], rows('NEW1', 'NEW2'), 2)), ['NEW1', 'NEW2']);
});

test('fail-closed batch bounds are validated', () => {
  assert.throws(() => prioritizeFreshHoldCandidates([], [], 0), /Invalid Sybil assessment batch size/);
  assert.throws(() => prioritizeFreshHoldCandidates([], [], Number.NaN), /Invalid Sybil assessment batch size/);
  assert.throws(() => prioritizeFreshHoldCandidates([], [], 2.5), /Invalid Sybil assessment batch size/);
});

test('SQL timestamps alert age only once work became actionable, not at original early HOLD', () => {
  assert.match(sql, /least\(/u);
  assert.match(sql, /as actionable_since/u);
  assert.match(sql, /where actionable_since <= now\(\) - interval '1 hour'/u);
  assert.match(sql, /where actionable_since <= now\(\) - interval '24 hours'/u);
  assert.doesNotMatch(sql, /where needs_action and first_held_at <= now\(\)/u);
  assert.match(sql, /fresh_evidence\.priority_at/u);
  assert.match(sql, /scan_fail\.checked_at/u);
  assert.match(sql, /core_completed\.first_completed_at/u);
  assert.match(sql, /i\.apps_completed_at/u);
  assert.match(sql, /i\.vot3_converted_at/u);
  assert.match(sql, /i\.vote_completed_at/u);
  assert.match(sql, /Evidence delivered now must not instantly inherit a pre-existing/su);
});

test('exact same service-only RPC shape and fail-closed mission/finality conditions are preserved', () => {
  assert.match(sql, /returns table\(\s*open_holds bigint,\s*incomplete_core_holds bigint,\s*stalled_over_1h bigint,\s*stalled_over_24h bigint/u);
  assert.match(sql, /i\.apps_completed, 0\) >= 3/u);
  assert.match(sql, /i\.rewards_received, 0\) >= 3/u);
  assert.match(sql, /i\.vot3_converted is true/u);
  assert.match(sql, /i\.vote_completed is true/u);
  assert.match(sql, /i\.apps_completed_block is not null/u);
  assert.match(sql, /i\.vot3_converted_block is not null/u);
  assert.match(sql, /i\.vote_completed_block is not null/u);
  assert.match(sql, /a\.source = 'OPERATOR'/u);
  assert.match(sql, /s\.attempt_count >= 3/u);
  assert.match(sql, /s\.last_error is not null/u);
  assert.match(sql, /from public, anon, authenticated/u);
  assert.match(sql, /to service_role/u);
  assert.doesNotMatch(sql, /\b(update|insert into|delete from)\s+public\.(?:invitations|reward_queue_entries|sybil_v2_wallet_restrictions|sybil_v2_referral_assessments)/iu);
});

test('prioritized fetch includes enough extra rows to skip a full batch of duplicates', () => {
  assert.match(pipeline, /const reservedFreshSlots = Math\.min\(2, bounded\)/u);
  assert.match(pipeline, /\.limit\(bounded \+ reservedFreshSlots\)/u);
  assert.match(pipeline, /prioritizeFreshHoldCandidates\(\s*data \?\? \[\],\s*newEvidenceHolds \?\? \[\],\s*bounded/u);
});
