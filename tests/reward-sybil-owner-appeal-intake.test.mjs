import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  'supabase/migrations/20261017170000_create_sybil_owner_appeal_intake.sql',
  'utf8',
);
const route = await readFile('src/app/api/sybil/appeal/route.ts','utf8');
const admin = await readFile('src/app/api/admin/sybil/review/route.ts','utf8');
const page = await readFile('src/app/admin/sybil-review/page.tsx','utf8');

test('appeal input is bound to a verified wallet, never a client-selected referral', () => {
  assert.match(route, /getWalletSession\(request\)/u);
  assert.match(route, /expectedWallet !== session\.walletAddress/u);
  assert.match(route, /get\('x-veinvite-session-wallet'\)/u);
  assert.match(route, /sameOriginWithExplicitIntent\(request\)/u);
  assert.match(route, /x-veinvite-appeal-intent/u);
  assert.match(route, /loadActiveSybilV2Restriction/u);
  assert.match(route, /const code = restriction\.related_invite_code/u);
  assert.match(route, /p_wallet_address: session\.walletAddress/u);
  assert.match(route, /p_invite_code: code/u);
  assert.match(route, /sybil_appeal_ip/u);
  assert.match(route, /sybil_appeal_wallet/u);
});

test('DB revalidates live restriction, invitee ownership and exact revision atomically', () => {
  assert.match(sql, /from public\.invitations i[\s\S]*for share;/u);
  assert.match(sql, /from public\.sybil_v2_referral_assessments a[\s\S]*for share;/u);
  assert.match(sql, /lower\(v_invitation\.invitee_wallet\) <> v_wallet/u);
  assert.match(sql, /v_assessment\.revision <> p_expected_revision/u);
  assert.match(sql, /r\.status='ACTIVE'/u);
  assert.match(sql, /r\.related_invite_code=p_invite_code/u);
  assert.match(sql, /h\.restriction_kind='PRE_CLAIM_HOLD'/u);
  assert.match(sql, /v_assessment\.state='RESTRICTED'/u);
  assert.match(sql, /v_assessment\.state='HOLD'/u);
});

test('one submission per assessment revision and role-only privileges', () => {
  assert.match(sql, /sybil_v2_appeal_requests_once_per_revision/u);
  assert.match(sql, /on conflict on constraint sybil_v2_appeal_requests_once_per_revision/u);
  assert.match(sql, /do nothing/u);
  assert.match(sql, /enable row level security/u);
  assert.match(sql, /revoke all on table public\.sybil_v2_appeal_requests from public,anon,authenticated/u);
  assert.match(sql, /revoke all on function public\.submit_sybil_v2_appeal[\s\S]*from public,anon,authenticated/u);
  assert.match(sql, /grant execute on function public\.submit_sybil_v2_appeal[\s\S]*to service_role/u);
  assert.match(sql, /grant select,insert on table public\.sybil_v2_appeal_requests to service_role/u);
});

test('appeal is a non-rewarding, non-verdict pending note, even for blacklisted users', () => {
  assert.match(sql, /status text not null default 'PENDING'/u);
  assert.match(route, /restrictionUnchanged: true/u);
  assert.match(route, /rewardUnchanged: true/u);
  assert.match(route, /reviewOnly: true/u);
  assert.doesNotMatch(route, /resolve_sybil_v2_review|reinstate_sybil|enqueueReward|\.update\(|\.delete\(/iu);
  assert.doesNotMatch(sql, /\b(update|delete from)\s+public\.(invitations|sybil_v2_wallet_restrictions|sybil_v2_referral_assessments|reward)/iu);
});

test('operator UI shows appeals separately from evidence and verdict controls', () => {
  assert.match(admin, /async function loadOwnerAppeals\(/u);
  assert.match(admin, /ownerAppeals,/u);
  assert.match(admin, /loadVerifiedOperator\(request\)/u);
  assert.match(page, /OWNER APPEALS/u);
  assert.match(page, /detail\.ownerAppeals\.map/u);
  assert.match(page, /승인이나 제한 해제를 의미하지 않습니다/u);
});
