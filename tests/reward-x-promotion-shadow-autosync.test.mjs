import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);

test('X promotion shadow sync runs after reward reservation recovery', () => {
  const rewardIndex = source.indexOf('await runRewardReservationRecovery()');
  const shadowIndex = source.indexOf('await runRewardXPromotionShadowSync(');
  const auditIndex = source.indexOf('await runRewardXPromotionShadowAudit()');

  assert.ok(rewardIndex >= 0);
  assert.ok(shadowIndex > rewardIndex);
  assert.ok(auditIndex > shadowIndex);
});

test('X promotion shadow failures remain warnings and never poison reward recovery', () => {
  const start = source.indexOf(
    'try {\n      xPromotionShadowSync =',
  );
  const end = source.indexOf(
    '    try {\n      b3trRecipientObservation =',
    start,
  );
  const block = source.slice(start, end);

  assert.match(block, /X_PROMOTION_SHADOW_SYNC_FAILED/);
  assert.match(block, /X_PROMOTION_SHADOW_AUDIT_VIOLATION/);
  assert.match(
    block,
    /Shadow accounting is deliberately non-authoritative/,
  );
  assert.doesNotMatch(block, /errors\.push/);
  assert.doesNotMatch(block, /recoveryFailure\s*(?:\?\?=|=)/);
});

test('X promotion shadow state is surfaced separately in cron diagnostics', () => {
  assert.match(source, /xPromotionShadowSync,/);
  assert.match(source, /xPromotionShadowAudit,/);
});
