import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260930143000_add_sybil_invitee_restriction_reinstate.sql';

const [migration, reviewRoute, reviewPage] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile('src/app/api/admin/sybil/review/route.ts', 'utf8'),
  readFile('src/app/admin/sybil-review/page.tsx', 'utf8'),
]);

test('unpaid invitee restrictions have an audited operator reinstatement path', () => {
  assert.match(
    migration,
    /create table if not exists public\.sybil_v2_invitee_reinstatement_events/u,
  );
  assert.match(
    migration,
    /create or replace function public\.reinstate_sybil_v2_invitee_restriction/u,
  );
  assert.match(
    migration,
    /restrictionScope'\) <> 'INVITEE_ONLY'/u,
  );
  assert.match(
    migration,
    /v_row\.source not in \('OPERATOR','SYSTEM'\)/u,
  );
  assert.match(
    migration,
    /status = 'REINSTATED'/u,
  );
  assert.match(
    migration,
    /remainingActiveRestrictionCount/u,
  );
  assert.match(
    migration,
    /futureParticipationRestored/u,
  );
});

test('invitee reinstatement never resurrects the blocked referral or rewrites reward history', () => {
  const functionBody = migration.match(
    /create or replace function public\.reinstate_sybil_v2_invitee_restriction[\s\S]*?\n\$function\$;/u,
  )?.[0] ?? '';

  assert.ok(functionBody.length > 0);
  assert.doesNotMatch(
    functionBody,
    /update\s+public\.invitations/iu,
  );
  assert.doesNotMatch(
    functionBody,
    /update\s+public\.reward_/iu,
  );
  assert.doesNotMatch(
    functionBody,
    /delete\s+from\s+public\.reward_/iu,
  );
  assert.match(
    functionBody,
    /'invitationChanged', false/u,
  );
  assert.match(
    functionBody,
    /'pastRewardChanged', false/u,
  );
});

test('paid or already-assigned rewards cannot use invitee reinstatement recovery', () => {
  assert.match(
    migration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    migration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    migration,
    /p\.status in \('PENDING','SENDING','PAID'\)/u,
  );
  assert.match(
    migration,
    /INVITEE_RESTRICTION_REWARD_ALREADY_FINAL/u,
  );
});

test('invitee recovery tables and rpc remain service-only and append-only', () => {
  assert.match(
    migration,
    /alter table public\.sybil_v2_invitee_reinstatement_events[\s\S]*enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on public\.sybil_v2_invitee_reinstatement_events[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /sybil_v2_invitee_reinstatement_events_append_only/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.reinstate_sybil_v2_invitee_restriction[\s\S]*from public, anon, authenticated/u,
  );
});

test('admin review detail can reinstate a known active invitee restriction without adding it to the open-review queue', () => {
  assert.match(
    reviewRoute,
    /operator_sybil_v2_active_invitee_restrictions/u,
  );
  assert.match(
    reviewRoute,
    /reviewMode: inviteeRestrictionCanResolve[\s\S]*'INVITEE_RESTRICTION'/u,
  );
  assert.match(
    reviewRoute,
    /reinstate_sybil_v2_invitee_restriction/u,
  );
  assert.match(
    reviewRoute,
    /expectedInviteeRestrictionId/u,
  );

  const openReviewStart = reviewRoute.indexOf(
    'async function loadOpenReviews',
  );
  const openReviewEnd = reviewRoute.indexOf(
    '\\nasync function loadInvitationReview',
    openReviewStart,
  );
  assert.ok(openReviewStart >= 0);
  assert.ok(openReviewEnd > openReviewStart);
  const openReviewLoader = reviewRoute.slice(
    openReviewStart,
    openReviewEnd,
  );
  assert.doesNotMatch(
    openReviewLoader,
    /operator_sybil_v2_active_invitee_restrictions/u,
  );
});

test('admin UI exposes exceptional recovery by direct invite-code lookup', () => {
  assert.match(
    reviewPage,
    /'INVITEE_RESTRICTION'/u,
  );
  assert.match(
    reviewPage,
    /expectedInviteeRestrictionId/u,
  );
  assert.match(
    reviewPage,
    /직접 조회 \/ Lookup/u,
  );
  assert.match(
    reviewPage,
    /기존 차단 추천과 과거 보상 결과는 변경하지 않고/u,
  );
});
