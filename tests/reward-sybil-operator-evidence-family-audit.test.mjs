import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { auditOperatorEvidence } from '../src/lib/sybil/v2/operatorEvidenceAudit.ts';

const api = await readFile('src/app/api/admin/sybil/review/route.ts', 'utf8');
const page = await readFile('src/app/admin/sybil-review/page.tsx', 'utf8');

const signal = (id, family, strength, score, code) => ({
  id,
  evidence_family: family,
  strength,
  score,
  signal_code: code,
  observed_block: null,
  observed_at: null,
});

test('same-family HIGH signals are not independent corroboration', () => {
  const audit = auditOperatorEvidence([
    signal(1, 'SECURITY_IDENTITY', 'HIGH', 100, 'SECURITY_CLIENT_INVITER_IMMEDIATE_SWITCH'),
    signal(2, 'SECURITY_IDENTITY', 'HIGH', 95, 'SECURITY_CLIENT_INVITER_LINK'),
    signal(3, 'ECOSYSTEM_REPUTATION', 'INFO', 0, 'VEPASSPORT_SNAPSHOT'),
  ]);
  assert.equal(audit.storedSignals, 3);
  assert.equal(audit.highSignals, 2);
  assert.deepEqual(audit.highFamilies, ['SECURITY_IDENTITY']);
  assert.equal(audit.highFamilyCount, 1);
  assert.equal(audit.signalsShareHighFamily, true);
  assert.equal(audit.independentHighCorroborationShown, false);
  assert.equal(audit.decisionAuthorized, false);
  assert.equal(audit.requiresManualEvidenceReview, true);
  assert.ok(audit.cautionCodes.includes('HIGH_SIGNALS_ONE_FAMILY'));
});

test('independent families are candidates, not automatic proof or verdicts', () => {
  const audit = auditOperatorEvidence([
    signal(1, 'SECURITY_IDENTITY', 'HIGH', 92, 'LINK'),
    signal(2, 'FUNDING_CHAIN', 'HIGH', 70, 'FUNDER'),
  ]);
  assert.equal(audit.highFamilyCount, 2);
  assert.equal(audit.independentHighCorroborationShown, true);
  assert.equal(audit.decisionAuthorized, false);
  assert.equal(audit.requiresManualEvidenceReview, true);
});

test('missing and truncated evidence fail visibly, not silently', () => {
  const empty = auditOperatorEvidence([]);
  assert.deepEqual(empty.highFamilies, []);
  assert.ok(empty.cautionCodes.includes('NO_STRUCTURED_EVIDENCE'));
  assert.equal(empty.decisionAuthorized, false);

  const full = auditOperatorEvidence(
    Array.from({ length: 100 }, (_, i) =>
      signal(i, 'SECURITY_IDENTITY', 'HIGH', 60, 'EVIDENCE'),
    ),
  );
  assert.equal(full.evidencePageMayBeTruncated, true);
  assert.ok(full.cautionCodes.includes('EVIDENCE_PAGE_LIMIT_REACHED'));
});

test('audit remains server-authenticated and read-only, including after a restriction', () => {
  assert.match(api, /auditOperatorEvidence\(v2Evidence\)/u);
  assert.match(api, /const operator = await loadVerifiedOperator\(request\)/u);
  assert.match(page, /selected\.v2_state === 'RESTRICTED'/u);
  assert.match(page, /detail\?\.evidenceAudit/u);
  assert.match(page, /independent corroboration/u);
  assert.match(page, /이 요약은 판정 승인 조건이 아니며/u);
  assert.doesNotMatch(api, /evidenceAudit\.decisionAuthorized \?\?/u);
});
