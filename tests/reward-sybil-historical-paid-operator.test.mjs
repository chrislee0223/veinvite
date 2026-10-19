import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = 'src/app/api/admin/sybil/historical-paid/route.ts';
const ui = 'src/app/admin/sybil-historical/page.tsx';
const migration = 'supabase/migrations/20260926040000_add_historical_sybil_referral_invalidation.sql';
const recoveryMigration = 'supabase/migrations/20261005003050_harden_reward_recovery_reversals.sql';

async function sources() {
  const [route, page, sql, recovery] = await Promise.all([
    readFile(api, 'utf8'),
    readFile(ui, 'utf8'),
    readFile(migration, 'utf8'),
    readFile(recoveryMigration, 'utf8'),
  ]);
  return { route, page, sql, recovery };
}

test('PAID CLEAR invalidation is operator-only, same-origin, and requires exact manual confirmation', async () => {
  const { route, page } = await sources();
  assert.match(route, /requireWalletSession/u);
  assert.match(route, /canOperateVeInviteRewards/u);
  assert.match(route, /sameOrigin\(request\)/u);
  assert.match(route, /INVALIDATE_HISTORICAL_PAID_SYBIL/u);
  assert.match(route, /input\.confirmation !== code/u);
  assert.match(route, /input\.decision !== 'BLACKLIST'/u);
  assert.match(route, /Number\.isSafeInteger\(input\.expectedRevision\)/u);
  assert.match(route, /before\.invitation\.reward_paid_at !== input\.expectedPaidAt/u);
  assert.match(route, /before\.assessment\?\.state !== 'CLEAR'/u);
  assert.match(route, /before\.invalidation\?\.status === 'ACTIVE'/u);
  assert.match(route, /!before\.canBlacklist/u);
  assert.match(page, /window\.confirm/u);
  assert.match(page, /reason\.trim\(\)\.length >= 24/u);
  assert.match(page, /confirmation\.trim\(\)\.toUpperCase\(\) === info\.invitation\.invite_code/u);
});

test('retroactive action requires same inviter, restricted sibling, wallet switch AND VTHO funding', async () => {
  const { route } = await sources();
  for (const item of [
    'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
    'FIRST_VTHO_FUNDER',
    'RECENT_PREACTIVATION_VTHO_FUNDER',
    'sybil_v2_wallet_restrictions',
    "eq('status', 'ACTIVE')",
    'peer.inviter_wallet.toLowerCase() !== inviter.toLowerCase()',
    'item.wallet_address.toLowerCase()',
    'peer.invitee_wallet.toLowerCase()',
  ]) assert.ok(route.includes(item), item);
  assert.match(route, /item\.wallet_address\.toLowerCase\(\) ===\s*peer\.invitee_wallet\.toLowerCase\(\)/u);
});

test('old rewards are preserved and the existing historical invalidation mints recovery debt', async () => {
  const { route, sql, recovery } = await sources();
  assert.match(route, /resolve_sybil_v2_historical_referral/u);
  assert.match(route, /p_decision: 'BLACKLIST'/u);
  assert.match(route, /reward_recovery_obligations/u);
  assert.match(route, /operator_referral_leaderboard/u);
  assert.match(route, /after\.obligation\.amount_wei === before\.receipt\.amount_wei/u);
  assert.match(route, /payoutReceiptPreserved/u);
  assert.match(sql, /'pastRewardChanged', false/u);
  assert.doesNotMatch(sql, /update public\.reward_receipts/u);
  assert.match(recovery, /create or replace function public\.upsert_reward_recovery_obligation_for_invalidation/u);
  assert.match(recovery, /create trigger sybil_v2_reward_recovery_sync/u);
});

const DEBT = 29_832_233_666_285_303_335n;
function apply(gross, balance) {
  const withheld = gross < balance ? gross : balance;
  return { withheld, paid: gross - withheld, remaining: balance - withheld };
}

test('precise original-wallet B3TR debt supports full, partial and carry-forward recovery', () => {
  const first = apply(20n * 10n ** 18n, DEBT);
  assert.deepEqual(first, {
    withheld: 20n * 10n ** 18n,
    paid: 0n,
    remaining: 9_832_233_666_285_303_335n,
  });
  const second = apply(100n * 10n ** 18n, first.remaining);
  assert.equal(second.remaining, 0n);
  assert.equal(second.paid, 90_167_766_333_714_696_665n);
  assert.deepEqual(apply(DEBT, DEBT), {
    withheld: DEBT, paid: 0n, remaining: 0n,
  });
  for (const [gross, balance] of [
    [DEBT, DEBT], [20n * 10n ** 18n, DEBT], [100n * 10n ** 18n, DEBT],
  ]) {
    const result = apply(gross, balance);
    assert.equal(gross, result.withheld + result.paid);
    assert.equal(balance, result.withheld + result.remaining);
  }
});


test('read-only historical reverse discovery stays behind operator auth and does not touch reward state', async () => {
  const { route, page } = await sources();
  const reverse = route.split('async function readHistoricalCandidates(')[1]?.split('async function authorize(')[0] ?? '';
  assert.ok(reverse.length > 100, 'reverse discovery defined in existing route');
  assert.match(route, /request\.nextUrl\.searchParams\.get\('candidates'\) === '1'/u);
  assert.match(route, /const authority = await authorize\(request\)/u);
  assert.match(reverse, /SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH/u);
  assert.match(reverse, /\.eq\('strength', 'HIGH'\)/u);
  assert.match(reverse, /\.eq\('evidence_family', 'SECURITY_IDENTITY'\)/u);
  assert.match(reverse, /\.eq\('evidence_family', 'FUNDING'\)/u);
  assert.match(reverse, /FIRST_VTHO_FUNDER/u);
  assert.match(reverse, /RECENT_PREACTIVATION_VTHO_FUNDER/u);
  assert.match(reverse, /readHistoricalCase\(code, network\)/u);
  assert.match(reverse, /review\?\.canBlacklist/u);
  assert.match(reverse, /review\.invalidation\?\.status !== 'ACTIVE'/u);
  assert.match(reverse, /exceeded safe review batch/u);
  for (const forbidden of ['.insert(', '.update(', '.delete(', 'resolve_sybil_v2_historical_referral']) {
    assert.ok(!reverse.includes(forbidden), 'reverse candidate lookup must not mutate: ' + forbidden);
  }
  assert.match(page, /\?candidates=1/u);
  assert.match(page, /useEffect/u);
  assert.match(page, /기존 지급: /u);
  assert.match(page, /onClick=\{\(\) => void load\(candidate.inviteCode\)\}/u);
  assert.match(page, /setRefresh\(\(value\) => value \+ 1\)/u);
  assert.doesNotMatch(page, /useState\('M89HCCW'\)/u);
});

test('historical blacklist requires truly HIGH same-client signal from SECURITY_IDENTITY and separate FUNDING family', async () => {
  const { route } = await sources();
  const restrictedPeer = route.split('async function corroboratedRestrictedPeer(')[1]?.split('async function readHistoricalCase(')[0] ?? '';
  assert.match(restrictedPeer, /row\.strength === 'HIGH'/u);
  assert.match(restrictedPeer, /row\.evidence_family === 'SECURITY_IDENTITY'/u);
  assert.match(restrictedPeer, /row\.evidence_family === 'FUNDING'/u);
  assert.match(restrictedPeer, /if \(!isStrongSwitch && !isOnchainFunder\) continue;/u);
  assert.match(restrictedPeer, /Sybil evidence lookup exceeded the safe limit/u);
});
