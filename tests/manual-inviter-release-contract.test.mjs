import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261105033000_inviter_release_incomplete_referral.sql',
  'utf8',
);
const route = readFileSync('src/app/api/invites/[code]/release/route.ts', 'utf8');
const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
const i18n = readFileSync('src/lib/i18n/manualReleaseCopy.ts', 'utf8');

test('manual release is wallet-session authenticated before DB mutation', () => {
  const auth = route.indexOf('await requireWalletSession');
  const rpc = route.indexOf(".rpc(");
  assert.ok(auth >= 0 && rpc > auth);
  assert.match(route, /expectedWallet:\s*inviterAddress/);
  assert.match(route, /release_incomplete_referral_by_inviter/);
  assert.match(route, /ALREADY_RELEASED/);
  assert.match(route, /REWARD_LOCKED/);
  assert.match(route, /try_acquire_operator_lock/);
  assert.match(route, /syncInvitationEvidence/);
  assert.ok(route.indexOf('await syncInvitationEvidence') > route.indexOf('await requireWalletSession'));
  assert.ok(route.indexOf('release_incomplete_referral_by_inviter') > route.indexOf('await syncInvitationEvidence'));
});

test('DB function serializes with permanent claim and fails closed on rewards', () => {
  assert.match(migration, /pg_advisory_xact_lock\(\s*hashtextextended\('veinvite_referral_inviter_'/);
  assert.match(migration, /FOR UPDATE;/);
  assert.match(migration, /v_inv\.status <> 'ACTIVATING'/);
  assert.match(migration, /v_inv\.sybil_status IN \('REVIEW', 'BLOCKED'\)/);
  assert.match(migration, /v_inv\.reward_status NOT IN \('NONE', 'PENDING'\)/);
  assert.match(migration, /v_inv\.apps_completed >= 3[\s\S]*v_inv\.vot3_converted[\s\S]*v_inv\.vote_completed/);
  assert.match(migration, /e\.event_type = 'ALLOCATION_VOTE'/);
  assert.match(migration, /FROM public\.reward_queue_entries/);
  assert.match(migration, /FROM public\.reward_payouts/);
  assert.match(migration, /RETURN 'REWARD_LOCKED'/);
});

test('release is terminal and keeps separate Sybil and referral histories', () => {
  assert.match(migration, /inviter_released_at/);
  assert.match(migration, /protect_inviter_released_invitation/);
  assert.match(migration, /new\.status <> 'CANCELLED'/);
  assert.match(migration, /SET status = 'CANCELLED'/);
  assert.match(migration, /slot_released_at = clock_timestamp\(\)/);
  assert.match(migration, /i\.reward_status = 'FORFEITED'/);
  assert.doesNotMatch(migration, /UPDATE public\.referral_relationships|DELETE FROM public\.referral_relationships/);
  assert.doesNotMatch(migration, /SET sybil_status = 'BLOCKED'/);
  assert.match(migration, /new\.sybil_status = 'BLOCKED'/);
});

test('manual release RPC is not executable directly by visitors', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.release_incomplete_referral_by_inviter\(text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.release_incomplete_referral_by_inviter\(text, text\)[\s\S]*TO service_role/);
});

test('slot x only appears before all mission milestones are complete', () => {
  assert.match(home, /const allMissions = missionFlags\(invite\)\.every\(Boolean\)/);
  assert.match(home, /const showRelease = !allMissions/);
  assert.match(home, /invite\.status === 'ACTIVATING'/);
  assert.match(home, /invite\.rewardEligibility === 'PENDING'/);
  assert.match(home, /!invite\.rewardQueueStatus/);
  assert.match(home, /invite\.sybilStatus !== 'REVIEW'/);
  assert.match(home, /className="slotReleaseButton"/);
  assert.match(home, /disabled=\{demoOnly\}/);
  assert.match(home, /releaseAcceptedInvite\(\)/);
  assert.match(home, /className="inviteeWalletLabel" dir="ltr" title=\{invite\.inviteeAddress\}/);
});

test('all supported languages receive release warnings', () => {
  const locales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn',
    'pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw',
    'ha','el','cs',
  ];
  for (const locale of locales) {
    assert.match(i18n, new RegExp(`"${locale}": \\{ title: `));
  }
  assert.match(i18n, /Record<SupportedLocale, ManualReleaseCopy>/);
});
