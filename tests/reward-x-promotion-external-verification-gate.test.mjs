import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261012004500_add_x_promotion_external_verification_gate_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const route = await readFile(
  new URL(
    '../src/app/api/rewards/x-promotion/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('external X verification gate is disabled by default', () => {
  assert.match(
    migration,
    /reward_x_promotion_external_verification_ready boolean not null default false/,
  );
});

test('new live splits are skipped until external verification is ready', () => {
  assert.match(
    migration,
    /if not v_cfg\.reward_x_promotion_external_verification_ready then\s+return new;/,
  );
  assert.match(
    migration,
    /new\.reserved_at<v_cfg\.reward_x_promotion_external_verification_started_at/,
  );
});

test('unsplit reservations keep the original full payout while the external gate is off', () => {
  assert.match(
    migration,
    /if not v_cfg\.reward_x_promotion_external_verification_ready then\s+return v_queue\.reserved_amount_wei;/,
  );
});

test('existing LIVE split remains authoritative across external readiness pauses', () => {
  const splitLookup = migration.indexOf("where s.invite_code=v_code");
  const externalGate = migration.indexOf(
    "if not v_cfg.reward_x_promotion_external_verification_ready then\n    return v_queue.reserved_amount_wei;",
  );
  assert.ok(splitLookup >= 0);
  assert.ok(externalGate > splitLookup);
});

test('external readiness activation must use a fresh boundary and LIVE must already be enabled', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_LIVE/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXTERNAL_READY_START_NOT_FRESH/,
  );
});

test('runtime audit records external readiness transitions', () => {
  assert.match(migration, /previous_external_verification_ready/);
  assert.match(migration, /external_verification_started_at/);
});

test('user-facing newOffersEnabled requires the external verification gate', () => {
  assert.match(
    route,
    /reward_x_promotion_external_verification_ready === true/,
  );
  assert.match(
    route,
    /reward_x_promotion_external_verification_started_at/,
  );
});
