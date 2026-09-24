import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924150000_align_sybil_v2_authority.sql';

test('Security Client remains evidence-only while Sybil v2 enforcement is active', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const start = sql.indexOf(
    'create or replace function public.enforce_security_client_identity_gate',
  );
  const end = sql.indexOf(
    'create or replace function public.enforce_invitation_identity_reward_gate',
    start,
  );

  assert.ok(start >= 0 && end > start);
  const fn = sql.slice(start, end);

  assert.match(
    fn,
    /and not public\.sybil_v2_enforcement_enabled\(\) then/u,
  );
  assert.match(fn, /new\.identity_link_status := v_status/u);
  assert.match(fn, /new\.sybil_status := 'REVIEW'/u);
});

test('v2 accepts a fresh REVIEW identity observation as evidence, not automatic failure', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const helperStart = sql.indexOf(
    'create or replace function public.security_identity_v2_observation_complete',
  );
  const helperEnd = sql.indexOf(
    'create or replace function public.enforce_security_client_identity_gate',
    helperStart,
  );
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = sql.slice(helperStart, helperEnd);

  assert.match(helper, /'REVIEW'/u);
  assert.match(helper, /'LINKED_EXISTING'/u);
  assert.match(helper, /p_checked_at >= p_vote_completed_at/u);
  assert.match(helper, /observedClientCount/u);

  const clearanceStart = sql.indexOf(
    'create or replace function public.issue_sybil_v2_reward_clearance',
  );
  const holdViewStart = sql.indexOf(
    'create or replace view public.operator_sybil_v2_temporary_participation_holds',
    clearanceStart,
  );
  assert.ok(clearanceStart >= 0 && holdViewStart > clearanceStart);
  const clearance = sql.slice(clearanceStart, holdViewStart);

  assert.match(
    clearance,
    /security_identity_v2_observation_complete/u,
  );
  assert.doesNotMatch(
    clearance,
    /security_identity_reward_gate_passes/u,
  );
});

test('pre-claim HOLD pauses only the invitee, not the inviter', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const viewStart = sql.indexOf(
    'create or replace view public.operator_sybil_v2_temporary_participation_holds',
  );
  const resolverStart = sql.indexOf(
    'create or replace function public.resolve_sybil_v2_review',
    viewStart,
  );

  assert.ok(viewStart >= 0 && resolverStart > viewStart);
  const viewSql = sql.slice(viewStart, resolverStart);

  assert.match(viewSql, /:invitee/u);
  assert.match(viewSql, /lower\(i\.invitee_wallet\)/u);
  assert.doesNotMatch(viewSql, /:inviter/u);
  assert.doesNotMatch(viewSql, /lower\(i\.inviter_wallet\)/u);
});

test('pre-claim BLACKLIST restricts only the abusive invitee and preserves inviter access', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const resolverStart = sql.indexOf(
    'create or replace function public.resolve_sybil_v2_review',
  );
  assert.ok(resolverStart >= 0);
  const resolver = sql.slice(resolverStart);

  assert.match(
    resolver,
    /'restrictionScope', 'INVITEE_ONLY'/u,
  );
  assert.match(
    resolver,
    /'inviterRestricted', false/u,
  );

  const restrictionInsertStart = resolver.indexOf(
    'insert into public.sybil_v2_wallet_restrictions',
  );
  const assessmentStart = resolver.indexOf(
    'v_record := public.record_sybil_v2_assessment',
    restrictionInsertStart,
  );
  assert.ok(
    restrictionInsertStart >= 0 && assessmentStart > restrictionInsertStart,
  );
  const restrictionInsert =
    resolver.slice(restrictionInsertStart, assessmentStart);

  assert.match(
    restrictionInsert,
    /lower\(v_invitation\.invitee_wallet\)/u,
  );
  assert.doesNotMatch(
    restrictionInsert,
    /lower\(v_invitation\.inviter_wallet\)/u,
  );
});

test('existing blocked-referral slot release remains untouched by authority alignment', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(
    sql,
    /create or replace function public\.release_blocked_invitation_slot/u,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function public\.prevent_released_v2_blocked_slot_reactivation/u,
  );
});

test('post-payout review authority is not changed by pre-claim alignment', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(
    sql,
    /create or replace function public\.resolve_sybil_v2_post_payout_review/u,
  );
});
