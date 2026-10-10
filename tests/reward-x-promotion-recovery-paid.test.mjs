import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261010133000_include_paid_x_promotion_in_recovery_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const executor = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutExecutor.ts',
    import.meta.url,
  ),
  'utf8',
);

const recovery = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionRecovery.ts',
    import.meta.url,
  ),
  'utf8',
);

const cron = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('only finalized X promotion receipts increase recovery debt', () => {
  assert.match(
    migration,
    /from public\.reward_x_promotion_receipts r/g,
  );
  assert.doesNotMatch(
    migration,
    /promotion_amount_wei[\s\S]*v_desired/,
  );
  assert.match(
    migration,
    /coalesce\(v_promo_receipt\.amount_wei,0\)/,
  );
});

test('invalidation and restriction recovery both include paid promotion value', () => {
  const occurrences =
    migration.match(
      /coalesce\(v_promo_receipt\.amount_wei,0\)/g,
    ) ?? [];

  assert.ok(occurrences.length >= 3);
  assert.match(
    migration,
    /xPromotionPaidWei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_RECOVERY_RECEIPT_MISMATCH/,
  );
});

test('paid promotion recovery preserves invalidation authority precedence', () => {
  const reconcileStart =
    migration.indexOf(
      'reconcile_reward_recovery_after_x_promotion_v1',
    );
  const invalidation =
    migration.indexOf(
      'upsert_reward_recovery_obligation_for_invalidation',
      reconcileStart,
    );
  const restriction =
    migration.indexOf(
      'upsert_reward_recovery_obligation_for_restriction',
      invalidation,
    );

  assert.ok(reconcileStart >= 0);
  assert.ok(invalidation > reconcileStart);
  assert.ok(restriction > invalidation);
});

test('already reconciled recovery is idempotent and does not create repeated debt events', () => {
  assert.match(
    migration,
    /v_existing\.amount_wei>=v_desired/,
  );
  assert.match(
    migration,
    /'reason','ALREADY_RECONCILED'/,
  );
  assert.match(
    migration,
    /o\.status='ACTIVE'/,
  );
});

test('batch maintenance selects only missing or undercounted recovery obligations', () => {
  assert.match(
    migration,
    /reconcile_reward_x_promotion_recovery_batch_v1/,
  );
  assert.match(
    migration,
    /o\.id is null[\s\S]*o\.status<>'ACTIVE'[\s\S]*o\.amount_wei </,
  );
  assert.match(
    migration,
    /limit v_limit/,
  );
  assert.match(
    migration,
    /case when o\.status='ACTIVE' then 0 else 1 end/,
  );
});

test('finalized payout remains PAID even if recovery reconciliation later fails', () => {
  const finalizeStart =
    executor.indexOf(
      'async function finalizeIfPossible',
    );
  const finalizeRpc =
    executor.indexOf(
      'finalize_reward_x_promotion_payout_v1',
      finalizeStart,
    );
  const reconcile =
    executor.indexOf(
      'reconcileRewardXPromotionRecoveryBestEffort',
      finalizeRpc,
    );
  const paid =
    executor.indexOf(
      "return 'PAID' as const",
      reconcile,
    );

  assert.ok(finalizeStart >= 0);
  assert.ok(finalizeRpc > finalizeStart);
  assert.ok(reconcile > finalizeRpc);
  assert.ok(paid > reconcile);

  assert.match(
    recovery,
    /try \{[\s\S]*reconcile_reward_recovery_after_x_promotion_v1[\s\S]*catch \(error\)/,
  );
  assert.doesNotMatch(
    recovery,
    /throw error/,
  );
});

test('already-settled committed payouts also retry recovery reconciliation', () => {
  const committed =
    executor.indexOf(
      'async function recoverCommittedLocked',
    );
  const settled =
    executor.indexOf(
      'if (state.settlement)',
      committed,
    );
  const reconcile =
    executor.indexOf(
      'reconcileRewardXPromotionRecoveryBestEffort',
      settled,
    );
  const paid =
    executor.indexOf(
      "return result(network, 'PAID'",
      reconcile,
    );

  assert.ok(committed >= 0);
  assert.ok(settled > committed);
  assert.ok(reconcile > settled);
  assert.ok(paid > reconcile);
});

test('maintenance retries recovery after payout without coupling payout success to recovery success', () => {
  const payout =
    cron.indexOf('await runPayoutJob()');
  const recoveryJob =
    cron.indexOf('await runRecoveryJob()', payout);

  assert.ok(payout >= 0);
  assert.ok(recoveryJob > payout);
  assert.match(
    cron,
    /RECOVERY_JOB_NAME[\s\S]*x-promotion-recovery/,
  );
  assert.match(
    cron,
    /runRewardXPromotionRecoveryMaintenance/,
  );
  assert.match(
    cron,
    /Payout\/recovery-only[\s\S]*do not fail the route/i,
  );
});

test('recovery maintenance surfaces unresolved candidates while the per-payout hook stays best-effort', () => {
  assert.match(
    recovery,
    /result\.failed > 0/,
  );
  assert.match(
    recovery,
    /left .* unresolved/,
  );
  assert.match(
    recovery,
    /reconciliation failed after settlement/,
  );
});


test('recovery migration can only be installed while X LIVE and payout are disabled', () => {
  assert.match(
    migration,
    /reward_x_promotion_enabled,reward_x_promotion_payout_enabled/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_RECOVERY_MIGRATION_REQUIRES_LIVE_AND_PAYOUT_DISABLED/,
  );
});
