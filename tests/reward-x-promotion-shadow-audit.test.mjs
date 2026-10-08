import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008123000_add_x_promotion_shadow_audit_v1.sql',
    import.meta.url,
  ),
  'utf8',
);
const hardeningMigration = await readFile(
  new URL(
    '../supabase/migrations/20261008130500_harden_x_promotion_shadow_completeness_v1.sql',
    import.meta.url,
  ),
  'utf8',
);
const moduleSource = await readFile(
  new URL('../src/lib/rewards/rewardXPromotionShadow.ts', import.meta.url),
  'utf8',
);
const scheduler = await readFile(
  new URL('../src/lib/rewards/rewardBoostReserveScheduler.ts', import.meta.url),
  'utf8',
);

test('shadow audit checks all financial and provenance invariants read-only', () => {
  assert.match(
    migration,
    /create or replace function public\.read_reward_x_promotion_shadow_audit/,
  );
  assert.match(migration, /reservation_amount_wei<>base_amount_wei\+promotion_amount_wei/);
  assert.match(migration, /expected_base_amount_wei/);
  assert.match(migration, /queue_reserved_amount_wei<>reservation_amount_wei/);
  assert.match(migration, /invitation_cohort_round_id<>source_reward_cohort_round_id/);
  assert.match(migration, /activationWindow/);
  assert.match(migration, /policyVersion/);
  assert.match(
    migration,
    /It never mutates reward, payout, liability, cohort, or transfer state/,
  );
  assert.doesNotMatch(migration, /insert into|update public|delete from/i);
});

test('shadow audit is service-only and validates its response shape', () => {
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_shadow_audit\(text\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_shadow_audit\(text\)[\s\S]*to service_role/,
  );
  assert.match(moduleSource, /runRewardXPromotionShadowAudit/);
  assert.match(moduleSource, /X promotion shadow audit identity is invalid/);
  assert.match(moduleSource, /conservation violation count/);
  assert.match(moduleSource, /activation window violation count/);
});

test('scheduled audit remains observability-only and fail-soft', () => {
  assert.match(scheduler, /runRewardXPromotionShadowAudit/);
  assert.match(
    scheduler,
    /if \(!audit\.ok\)[\s\S]*X promotion shadow invariant audit detected a mismatch/,
  );
  assert.match(
    scheduler,
    /X promotion shadow maintenance failed/,
  );
  assert.doesNotMatch(
    scheduler,
    /errors\.push\([\s\S]{0,240}X promotion shadow/,
  );
});


test('shadow audit fails closed when a required projection is missing', () => {
  assert.match(hardeningMigration, /v_missing_projection integer := 0/);
  assert.match(
    hardeningMigration,
    /not exists \([\s\S]*public\.reward_x_promotion_splits/,
  );
  assert.match(
    hardeningMigration,
    /and v_missing_projection=0/,
  );
  assert.match(
    hardeningMigration,
    /'missingProjection',v_missing_projection/,
  );
  assert.match(
    moduleSource,
    /missingProjection: nonNegativeInteger/,
  );
});

test('a live start permanently closes the original shadow window', () => {
  assert.match(
    hardeningMigration,
    /v_cfg\.reward_x_promotion_live_started_at is not null[\s\S]*v_queue\.reserved_at >= v_cfg\.reward_x_promotion_live_started_at/,
  );
  assert.match(
    hardeningMigration,
    /v_cfg\.reward_x_promotion_live_started_at is null[\s\S]*q\.reserved_at<v_cfg\.reward_x_promotion_live_started_at/,
  );
  assert.doesNotMatch(
    hardeningMigration,
    /not v_cfg\.reward_x_promotion_enabled[\s\S]{0,160}q\.reserved_at<v_cfg\.reward_x_promotion_live_started_at/,
  );
});
