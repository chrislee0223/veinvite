import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20261017234500_paid_sibling_recheck_queue.sql';
const routePath = 'src/app/api/admin/sybil/paid-siblings/route.ts';
const view = await readFile(migrationPath, 'utf8');
const route = await readFile(routePath, 'utf8');
const screen = await readFile('src/components/admin/PaidSiblingRechecks.tsx', 'utf8');
const page = await readFile('src/app/admin/sybil-review/page.tsx', 'utf8');

test('only same-inviter same-client paid CLEAR referrals with a later active blocked sibling are queued', () => {
  for (const clause of [
    "p.reward_status = 'PAID'",
    "p.sybil_status = 'CLEAR'",
    "b.sybil_status = 'BLOCKED'",
    "r.status = 'ACTIVE'",
    "r.imposed_at > p.reward_paid_at",
    "c.client_id = a.client_id",
    "lower(p.inviter_wallet) = lower(b.inviter_wallet)",
    "x.status = 'ACTIVE'",
  ]) assert.ok(view.includes(clause), clause);
});

test('operator-only case review is explicitly fail-closed, idempotent, and does not auto-BLACK', () => {
  assert.match(view, /alter table public\.sybil_v2_paid_sibling_review_decisions enable row level security/u);
  assert.match(view, /revoke all on public\.operator_sybil_v2_paid_sibling_recheck_candidates/u);
  assert.match(view, /grant select on public\.operator_sybil_v2_paid_sibling_recheck_candidates to service_role/u);
  assert.match(view, /revoke all on function public\.resolve_sybil_v2_paid_sibling_recheck/u);
  assert.match(view, /grant execute on function public\.resolve_sybil_v2_paid_sibling_recheck[\s\S]*to service_role/u);
  assert.match(view, /PAID_SIBLING_REVIEW_STALE/u);
  assert.match(view, /PAID_SIBLING_REVIEW_STATE_CHANGED/u);
  assert.match(view, /unique \(network, paid_invite_code, restriction_id\)/u);
  assert.match(view, /if v_decision = 'BLACKLIST' then/u);
  assert.doesNotMatch(view, /update public\.reward_receipts/u);
  assert.doesNotMatch(view, /update public\.reward_payouts/u);
  assert.doesNotMatch(view, /update public\.invitations/u);
});

test('historical invalidation and reward recovery use existing atomic audited pathway', () => {
  assert.match(view, /select public\.resolve_sybil_v2_historical_referral\(/u);
  assert.match(view, /PAID_SIBLING_HISTORICAL_INVALIDATION_FAILED/u);
  assert.match(view, /'pastRewardChanged',false/u);
  assert.match(view, /'rewardAlreadyPaid',true/u);
  assert.match(view, /commit;/u);
});

test('separate paid referrals linked to one blocked restriction never share selection', () => {
  assert.match(screen, /selected === \x60\$\{item\.restriction_id\}:\$\{item\.paid_invite_code\}\x60/u);
  assert.match(view, /for share/u);
});

test('authenticated operator UI requires deliberate evidence, reason and confirmation', () => {
  assert.match(route, /requireWalletSession/u);
  assert.match(route, /canOperateVeInviteRewards/u);
  assert.match(route, /sameOrigin\(request\)/u);
  assert.match(route, /reason\.length < 25/u);
  assert.match(route, /confirmation !== paidInviteCode/u);
  assert.match(route, /p_restriction_id: restrictionId/u);
  assert.match(screen, /window\.confirm/u);
  assert.match(screen, /정상적인 최초 참여 후 부정 중복 참여했을 가능성/u);
  assert.match(page, /<PaidSiblingRechecks \/>/u);
});

test('operator CLEAR shortcut is explicit and cannot trigger unattended rewards or Sybil changes', () => {
  assert.match(screen, /const DEFAULT_CLEAR_REASON =/u);
  assert.match(screen, /const isClear = decision === 'CLEAR'/u);
  assert.match(screen, /effectiveReason = reason\.trim\(\) \|\|/u);
  assert.match(screen, /effectiveConfirmation = isClear/u);
  assert.match(screen, /window\.confirm\(explanation\)/u);
  assert.match(screen, /reason: effectiveReason/u);
  assert.match(screen, /confirmation: effectiveConfirmation/u);
  assert.match(screen, /disabled=\{busy\}[\s\S]*?resolve\(item, 'CLEAR'\)/u);
  assert.match(screen, /reason\.trim\(\)\.length < MIN_REASON \|\| confirmation !== item\.paid_invite_code/u);
  assert.match(route, /confirmation !== paidInviteCode/u);
  assert.match(route, /reason\.length < 25/u);
  assert.match(route, /requireWalletSession/u);
  assert.match(view, /v_decision = 'BLACKLIST'/u);
});
