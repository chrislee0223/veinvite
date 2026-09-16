import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260916070000_invalidate_stale_security_identity_on_participant_change.sql',
    import.meta.url,
  ),
  'utf8',
);

function sliceFunction(functionName, nextMarker) {
  const start = migration.indexOf(
    `create or replace function public.${functionName}`,
  );
  assert.ok(start >= 0, `${functionName} must exist`);

  const end = nextMarker
    ? migration.indexOf(nextMarker, start + 1)
    : migration.length;
  assert.ok(end > start, `${functionName} must have a valid boundary`);
  return migration.slice(start, end);
}

const identityGate = sliceFunction(
  'enforce_security_client_identity_gate',
  'create or replace function public.invalidate_security_identity_on_related_participant_change',
);
const relatedInvalidation = sliceFunction(
  'invalidate_security_identity_on_related_participant_change',
  'revoke all on function public.invalidate_security_identity_on_related_participant_change',
);

test('related participant state changes are treated as fresh security evidence', () => {
  assert.match(
    identityGate,
    /RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED/,
  );
  assert.match(
    identityGate,
    /v_forced_new_evidence[\s\S]*NEW_SECURITY_CLIENT_WALLET_MAPPING[\s\S]*RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED/,
  );
  assert.match(
    identityGate,
    /old\.identity_link_status = 'OPERATOR_CLEARED'[\s\S]*and not v_forced_new_evidence/,
  );
});

test('a wallet becomes relevant only when it enters the same participant states used by the identity gate', () => {
  assert.match(relatedInvalidation, /new\.status = 'COMPLETED'/);
  assert.match(
    relatedInvalidation,
    /new\.reward_status in \('ELIGIBLE','PAID'\)/,
  );
  assert.match(
    relatedInvalidation,
    /new\.eligibility_check_id is not null[\s\S]*new\.ineligibility_check_id is null[\s\S]*new\.status in \('ACTIVATING','UNDER_REVIEW','COMPLETED'\)/,
  );
  assert.match(
    relatedInvalidation,
    /if not v_new_relevant then[\s\S]*return new;/,
  );
});

test('entering a shared-client participant state invalidates other unsettled CLEAR invitations', () => {
  assert.match(relatedInvalidation, /identity_link_status = 'UNKNOWN'/);
  assert.match(
    relatedInvalidation,
    /staleBecause', 'RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED'/,
  );
  assert.match(relatedInvalidation, /sybil_status = i\.sybil_status/);
  assert.match(
    relatedInvalidation,
    /changed_observation\.client_id = existing_observation\.client_id/,
  );
  assert.match(
    relatedInvalidation,
    /i\.invite_code <> new\.invite_code/,
  );
});

test('historical paid or round-assigned rewards stay immutable', () => {
  assert.match(relatedInvalidation, /i\.reward_status <> 'PAID'/);
  assert.match(relatedInvalidation, /q\.status = 'ASSIGNED'/);
  assert.match(
    relatedInvalidation,
    /q\.assigned_round_id is not null/,
  );
});

test('cross invalidation is transition-based and recursion-safe', () => {
  assert.match(relatedInvalidation, /v_old_relevant/);
  assert.match(
    relatedInvalidation,
    /if v_old_relevant[\s\S]*lower\(btrim\(old\.invitee_wallet\)\) = v_wallet then[\s\S]*return new;/,
  );
  assert.match(
    migration,
    /create trigger invitations_invalidate_related_security_identity[\s\S]*after insert or update on public\.invitations/,
  );
  assert.match(
    migration,
    /security definer[\s\S]*set search_path to 'pg_catalog', 'public'/,
  );
  assert.match(
    migration,
    /revoke all on function public\.invalidate_security_identity_on_related_participant_change\(\)[\s\S]*from public, anon, authenticated/,
  );
});

test('migration backfills pre-existing stale CLEAR rows without reopening settled rewards', () => {
  const backfill = migration.slice(
    migration.indexOf('-- Close any race between the last pre-migration assessment'),
  );

  assert.match(backfill, /update public\.invitations i/);
  assert.match(backfill, /identity_link_status = 'UNKNOWN'/);
  assert.match(
    backfill,
    /RELATED_SECURITY_CLIENT_PARTICIPANT_CHANGED/,
  );
  assert.match(backfill, /i\.sybil_status = 'CLEAR'/);
  assert.match(backfill, /i\.reward_status <> 'PAID'/);
  assert.match(
    backfill,
    /related_invitation\.status = 'COMPLETED'[\s\S]*related_invitation\.reward_status in \('ELIGIBLE','PAID'\)[\s\S]*related_invitation\.status in \('ACTIVATING','UNDER_REVIEW','COMPLETED'\)/,
  );
  assert.match(backfill, /q\.status = 'ASSIGNED'/);
  assert.match(backfill, /q\.assigned_round_id is not null/);
});
