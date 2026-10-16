import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20261017050000_surface_stalled_early_sybil_holds.sql',
  'utf8',
);
const operatorUi = await readFile(
  'src/app/admin/sybil-review/page.tsx',
  'utf8',
);
const operatorApi = await readFile(
  'src/app/api/admin/sybil/review/route.ts',
  'utf8',
);
const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);

test('every early HOLD remains in operator action queue, without depending on mission completion', () => {
  assert.match(migration, /operator_sybil_v2_operator_action_candidates/u);
  assert.match(operatorApi, /operator_sybil_v2_operator_action_candidates/u);
  assert.match(operatorApi, /v2CanResolve\s*=\s*v2Assessment\?\.state === 'HOLD'/u);
});

test('age escalations surface stalled incomplete HOLDs at 1h and 24h', () => {
  assert.match(migration, /interval '1 hour'/u);
  assert.match(migration, /interval '24 hours'/u);
  assert.match(migration, /SYBIL_V2_EARLY_HOLD_STALLED_OVER_1H/u);
  assert.match(migration, /SYBIL_V2_EARLY_HOLD_STALLED_OVER_24H/u);
  assert.match(migration, /'severity', 'CRITICAL'/u);
  assert.match(migration, /sybilV2HoldLiveness/u);
  assert.match(migration, /coalesce\(a\.required_checks, '\[\]'::jsonb\) - 'CHAIN_FINALITY'/u);
});

test('review escalation cannot unlock wallet, award rewards or blacklist users automatically', () => {
  assert.doesNotMatch(migration, /update\s+public\.invitations/iu);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.sybil_v2_wallet_restrictions/iu);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.sybil_v2_temporary_participation_holds/iu);
  assert.doesNotMatch(migration, /reward_queue_entries\s+set/iu);
  assert.match(operatorApi, /value !== 'CHAIN_FINALITY'/u);
  assert.match(operatorApi, /v2CanResolve && !v2CanClear[\s\S]*\['BLOCKED'\]/u);
  assert.match(operatorApi, /Core Sybil decision checks are still in progress/u);
  assert.match(pipeline, /'INDEPENDENT_EVIDENCE_REQUIRED'|applySecurityClientInviterRestriction/u);
});

test('operator can see stuck early HOLD and missing core checks before making an audited decision', () => {
  assert.match(operatorUi, /stalledHoldReviews/u);
  assert.match(operatorUi, /missingCoreChecks/u);
  assert.match(operatorUi, /조기 HOLD · 핵심 검사 미완료/u);
  assert.match(operatorUi, /CLEAR는 안전 검사가 충족될 때까지 금지/u);
  assert.match(operatorUi, /추가 증거 없이 자동 BLACK\/CLEAR하지 마세요/u);
});
