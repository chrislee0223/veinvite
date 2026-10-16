import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261015133000_harden_x_promotion_unsplit_grandfathering_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('split exemptions are immutable, queue-bound, and server-only', () => {
  assert.match(
    migration,
    /create table if not exists public\.reward_x_promotion_split_exemptions/,
  );
  assert.match(
    migration,
    /unique\(queue_entry_id\)/,
  );
  assert.match(
    migration,
    /unique\(invite_code\)/,
  );
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_split_exemptions/,
  );
  assert.match(
    migration,
    /enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_split_exemptions[\s\S]*from public,anon,authenticated,service_role/,
  );
});

test('direct exemption inserts must exactly match an untouched queue reservation', () => {
  assert.match(
    migration,
    /validate_reward_x_promotion_split_exemption_v1/,
  );
  assert.match(
    migration,
    /v_queue\.reserved_amount_wei<>new\.reservation_amount_wei/,
  );
  assert.match(
    migration,
    /v_queue\.status<>'AWAITING_CLAIM'/,
  );
  assert.match(
    migration,
    /v_queue\.assigned_round_id is not null/,
  );
  assert.match(
    migration,
    /v_queue\.claim_requested_at is not null/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXEMPTION_TOO_LATE/,
  );
});

test('runtime staleness is durably grandfathered instead of leaving an unexplained missing split', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_external_runtime_readiness_v1\([\s\S]*new\.network,[\s\S]*1200/,
  );
  assert.match(
    migration,
    /EXTERNAL_RUNTIME_NOT_READY/,
  );
  assert.match(
    migration,
    /record_reward_x_promotion_split_exemption_v1\([\s\S]*EXTERNAL_RUNTIME_NOT_READY/,
  );
});

test('dependency pauses and missing active referral link keep the full referral path', () => {
  assert.match(
    migration,
    /DEPENDENCY_GATE_NOT_READY/,
  );
  assert.match(
    migration,
    /ACTIVE_REFERRAL_LINK_MISSING/,
  );
  assert.match(
    migration,
    /from public\.referral_links r[\s\S]*r\.status='ACTIVE'/,
  );
});

test('unexpected optional split-construction errors do not roll back the core reservation', () => {
  assert.match(
    migration,
    /exception when others then[\s\S]*SPLIT_CREATION_FAILED/,
  );
  assert.match(
    migration,
    /jsonb_build_object\('sqlstate',sqlstate\)/,
  );
});

test('an exemption and LIVE split can never coexist', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXEMPTION_SPLIT_EXISTS/,
  );
  assert.match(
    migration,
    /before insert on public\.reward_x_promotion_splits[\s\S]*reject_reward_x_promotion_split_when_exempt_v1/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SPLIT_EXEMPT/,
  );
});

test('payout authority honors only an exact immutable exemption', () => {
  const splitLookup = migration.indexOf(
    'from public.reward_x_promotion_splits s',
  );
  const exemptionLookup = migration.indexOf(
    'from public.reward_x_promotion_split_exemptions e',
    splitLookup,
  );
  const missingFailure = migration.lastIndexOf(
    "raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING'",
  );

  assert.ok(splitLookup >= 0);
  assert.ok(exemptionLookup > splitLookup);
  assert.ok(missingFailure > exemptionLookup);
  assert.match(
    migration,
    /v_exemption\.reservation_amount_wei<>v_queue\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SPLIT_EXEMPTION_MISMATCH/,
  );
  assert.match(
    migration,
    /return v_queue\.reserved_amount_wei/,
  );
});

test('unexplained missing LIVE splits still fail closed', () => {
  assert.match(
    migration,
    /raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING'/,
  );
});

test('migration never enables X promotion or payout gates', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_(?:enabled|payout_enabled|external_verification_ready)\s*=\s*true/i,
  );
});
