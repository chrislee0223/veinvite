import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const live = [
  'src/lib/rewards/rewardReservation.ts',
  'src/lib/rewards/immediateClaimPayout.ts',
  'src/lib/rewards/automaticRewardPayout.ts',
  'src/lib/rewards/submittedPayoutRecovery.ts',
  'src/lib/rewards/rewardBoostReserveExecution.ts',
  'src/lib/rewards/predictivePlanning.ts',
];

test('live reservation still uses independently verified original cohort quote', () => {
  const reservation = read(live[0]);
  assert.match(reservation, /commit_reward_reservation_with_late_reserve/);
  assert.match(reservation, /readVeInviteRewardPoolStatus/);
  assert.match(reservation, /readLateRewardQuote/);
  assert.match(reservation, /rewardCohortRoundId/);
  assert.match(read('supabase/migrations/20260904203200_make_reward_cohort_binding_round_safe.sql'),
    /REWARD_COHORT_BINDING_IMMUTABLE/);
});

test('existing Claim must use fixed reward reservation and existing payout RPC', () => {
  const claim = read(live[1]);
  assert.match(claim, /prepare_predictive_reward_batch/);
  assert.match(claim, /reservedOnly: true/);
  assert.match(claim, /readVeInviteRewardPoolStatus/);
});

test('live signer protects outstanding payout liability before signing', () => {
  const payout = read(live[2]);
  assert.match(payout, /readOutstandingRewardLiability/);
  assert.match(payout, /freshPoolBalanceWei < outstandingLiability/);
  assert.match(payout, /BigInt\(manifest\.totalAmountWei\)/);
});

test('existing submitted payout settles only with canonical chain finality', () => {
  const recovery = read(live[3]);
  assert.match(recovery, /verifyFinalizedRewardTransactionOnChain/);
  assert.match(recovery, /WAITING_FINALITY/);
  assert.match(recovery, /PAID/);
});

test('source rollover and current cohort boosts remain separate financial writers', () => {
  const source = read(live[4]);
  assert.match(source, /seal_and_sweep_reward_boost_reserve_source/);
  assert.match(source, /seal_and_release_reward_boost_destination/);
  assert.match(source, /readVeInviteRewardPoolStatus/);
});

test('draft guarantee shadow must never be reachable from live reward and route code', () => {
  const names = /rewardAdmissionShadow|rewardElasticClosureShadow|rewardTreasuryAudit|rewardFundingBridgePolicy|reward_admission_lab|rewardGrossNetHandoffShadow/;
  for (const path of live) assert.doesNotMatch(read(path), names, path);
  const root = new URL('../supabase/migrations/', import.meta.url);
  const admissionMigrations = readdirSync(root).filter(name=>/reward_admission|elastic_guarantee/i.test(name));
  assert.deepEqual(admissionMigrations,
    ['20261104030000_reward_admission_staged_read_bridge.sql'],
    'Only the mechanically disabled read-only admission bridge may be staged');
  const staging = read('supabase/migrations/20261104030000_reward_admission_staged_read_bridge.sql');
  assert.match(staging, /enabled boolean NOT NULL DEFAULT false CHECK\(enabled=false\)/);
  assert.match(staging, /'canAdmit',false/);
  assert.match(staging, /'canGuarantee',false/);
  assert.match(staging, /'canSign',false/);
  assert.match(staging, /GRANT SELECT ON reward_admission_bridge\.holds TO service_role/);
  assert.doesNotMatch(staging,
    /create or replace function public\.(commit_reward_reservation|read_outstanding_reward_liability|read_reward_cohort_committed_wei|finalize_reward_x_promotion_payout_v1)/i,
    'Staging must not rewrite Production financial authority');
});

test('the new financial prototype is explicitly isolated to tests and never a payout RPC', () => {
  const lab = read('tests/sql/reward-admission-payout-handoff-lab.sql');
  assert.match(lab, /NOT a Supabase migration/);
  assert.match(lab, /reward_admission_lab\.handoff_to_fixed/);
  assert.match(lab, /reward_admission_lab\.settle_finalized/);
  assert.match(lab, /WAITING_CANONICAL_FINALITY/);
  assert.doesNotMatch(lab, /create or replace function public\./i);
});

test('X additional payout signer shares original base payout liability and lock', () => {
  const x = read('src/lib/rewards/rewardXPromotionPayoutExecutor.ts');
  assert.match(x, /read_outstanding_reward_liability/);
  assert.match(x, /readVeInviteRewardPoolStatus/);
  assert.match(x, /automatic_reward_payout:/);
  assert.match(x, /verifyFinalizedXPromotionTransactionOnChain/);
  assert.doesNotMatch(x, /rewardFundingBridgePolicy|reward_admission_lab/);
});

test('X post-base LIVE obligations already enter legacy physical liability once', () => {
  const mig = read('supabase/migrations/20261008140000_harden_x_promotion_liability_readers_v1.sql');
  assert.match(mig, /reward_x_promotion_post_base_liability_wei/);
  assert.match(mig, /RESERVED/);
  assert.match(mig, /HELD/);
});
