import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile('supabase/migrations/20261017171000_create_sybil_appeal_operator_disposition.sql','utf8');
const route = await readFile('src/app/api/admin/sybil/appeals/route.ts','utf8');
const reviewApi = await readFile('src/app/api/admin/sybil/review/route.ts','utf8');
const page = await readFile('src/app/admin/sybil-review/page.tsx','utf8');

test('operator-only route requires real reward-operator wallet, same-origin and explicit intent', () => {
  assert.match(route, /requireWalletSession\(\{ request \}\)/u);
  assert.match(route, /canOperateVeInviteRewards\(session\.walletAddress, pool\)/u);
  assert.match(route, /origin !== request\.nextUrl\.origin/u);
  assert.match(route, /CLOSE_SYBIL_APPEAL/u);
  assert.match(route, /sybil_appeal_operator_close/u);
  assert.match(route, /p_operator_wallet: session\.walletAddress/u);
});

test('database closure is CAS-guarded, audited, and independent from verdict changes', () => {
  assert.match(sql, /for update;/u);
  assert.match(sql, /for share;/u);
  assert.match(sql, /v_appeal\.assessment_revision<>p_expected_revision/u);
  assert.match(sql, /SYBIL_APPEAL_ALREADY_RESOLVED/u);
  assert.match(sql, /SYBIL_APPEAL_VERDICT_NOT_CHANGED/u);
  // A stale RESTRICTED assessment alone cannot uphold a wallet whose
  // actual blacklist restriction was already REINSTATED.
  assert.match(sql, /v_active_blacklist_id uuid/u);
  assert.match(sql, /r\.wallet_address=v_appeal\.wallet_address/u);
  assert.match(sql, /r\.related_invite_code=v_appeal\.invite_code/u);
  assert.match(sql, /r\.status='ACTIVE'/u);
  assert.match(sql, /if v_active_blacklist_id is null then/u);
  assert.match(sql, /v_assessment\.state='RESTRICTED'/u);
  assert.match(sql, /v_assessment\.state='HOLD'/u);
  assert.match(sql, /update public\.sybil_v2_appeal_requests/u);
  assert.match(sql, /insert into public\.sybil_v2_appeal_review_events/u);
  assert.doesNotMatch(sql, /\bupdate public\.(?:invitations|sybil_v2_referral_assessments|sybil_v2_wallet_restrictions|reward)/iu);
  assert.doesNotMatch(sql, /\b(insert into|delete from) public\.(?:invitations|sybil_v2_referral_assessments|sybil_v2_wallet_restrictions|reward)/iu);
});

test('anonymous users cannot manipulate appeal status or operator audit', () => {
  assert.match(sql, /enable row level security/u);
  assert.match(sql, /revoke all on public\.sybil_v2_appeal_review_events/u);
  assert.match(sql, /revoke all on function public\.close_sybil_v2_owner_appeal[\s\S]*from public,anon,authenticated/u);
  assert.match(sql, /grant execute on function public\.close_sybil_v2_owner_appeal[\s\S]*to service_role/u);
});

test('operator UI separates appeal closure from the underlying Sybil decision controls', () => {
  assert.match(reviewApi, /resolution_outcome,resolution_reason,resolved_at,resolved_by_wallet/u);
  assert.match(page, /async function closeOwnerAppeal\(/u);
  assert.match(page, /intent: 'CLOSE_SYBIL_APPEAL'/u);
  assert.match(page, /재검토 기록 종결/u);
  assert.match(page, /result\.verdictUnchanged/u);
  assert.match(page, /result\.rewardUnchanged/u);
  assert.match(page, /result\.restrictionUnchanged/u);
});
