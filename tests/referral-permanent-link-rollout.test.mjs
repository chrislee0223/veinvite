import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  migration,
  sourceKindMigration,
  hardeningMigration,
  blockedSlotRefinement,
  ownerApi,
  publicApi,
  claimApi,
  home,
  permanentClient,
  permanentPage,
  referralCopy,
  referralCopyFinalHardening,
  appProviders,
  guideFlow,
  receiptNotice,
  analyticsTracker,
] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260903190000_enable_permanent_referral_links_two_slots.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260903190500_allow_v2_referral_source_kind.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260903191000_harden_permanent_referral_tables.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260903191500_refine_released_v2_blocked_slot_reactivation.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/claim/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PermanentReferralClient.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/r/[key]/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/referralLinkCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/referralLinkCopyFinalHardening.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppProviders.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/i18n/guideFlowCopy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/RewardReceiptNotice.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/UsageAnalyticsTracker.tsx', import.meta.url), 'utf8'),
]);

test('permanent referral identity is separate from invitation consumption', () => {
  assert.match(migration, /create table public\.referral_links/i);
  assert.match(migration, /create unique index referral_links_one_active_per_inviter/i);
  assert.match(migration, /create table public\.referral_link_attempts/i);
  assert.match(migration, /add column referral_link_id uuid references public\.referral_links/i);
});

test('two-slot activation drops only the global inviter lock and keeps atomic per-slot uniqueness', () => {
  assert.match(migration, /drop index if exists public\.invitations_one_active_per_inviter;/i);
  assert.match(migration, /create unique index invitations_one_active_per_inviter_slot[\s\S]*invite_slot/i);
  assert.match(migration, /sybil_status <> 'BLOCKED'/i);
  assert.match(migration, /from \(values \(1\),\(2\)\) as s\(slot\)/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('veinvite_referral_invitee_/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('veinvite_referral_inviter_/i);
});

test('permanent claim checks duplicates and sponsor cycles before reserving a slot', () => {
  assert.match(migration, /return jsonb_build_object\('result','ALREADY_REFERRED'\)/i);
  assert.match(migration, /with recursive descendants\(wallet\)/i);
  assert.match(migration, /return jsonb_build_object\('result','RELATIONSHIP_CYCLE'\)/i);
  assert.match(migration, /return jsonb_build_object\('result','SLOTS_FULL'\)/i);
  assert.match(migration, /public\.claim_invitation_with_entry_proof/i);
});

test('v2 sponsor provenance is explicitly allowed by the immutable referral ledger', () => {
  assert.match(migration, /v2_permanent_referral/i);
  assert.match(migration, /live_v2_permanent_link/i);
  assert.match(sourceKindMigration, /'live_v2_permanent_link'/i);
});

test('new referral tables use the same server-only RLS posture as sensitive VeInvite tables', () => {
  assert.match(hardeningMigration, /alter table public\.referral_links enable row level security/i);
  assert.match(hardeningMigration, /alter table public\.referral_link_attempts enable row level security/i);
  assert.match(hardeningMigration, /create index referral_link_attempts_invitation_idx[\s\S]*invitation_id/i);
});

test('blocked-slot corrections stay possible until an active replacement reuses that slot', () => {
  assert.match(blockedSlotRefinement, /old\.referral_link_id is not null/i);
  assert.match(blockedSlotRefinement, /old\.sybil_status = 'BLOCKED'/i);
  assert.match(blockedSlotRefinement, /new\.status in \('ACTIVATING', 'UNDER_REVIEW'\)/i);
  assert.match(blockedSlotRefinement, /i\.invite_slot = old\.invite_slot/i);
  assert.match(blockedSlotRefinement, /i\.sybil_status <> 'BLOCKED'/i);
  assert.match(blockedSlotRefinement, /has already been reused by another active invitation/i);
  assert.doesNotMatch(blockedSlotRefinement, /BLOCKED permanent-referral decision is final/i);
});

test('public referral GET is passive and never creates invitations', () => {
  assert.match(publicApi, /export async function GET/i);
  assert.doesNotMatch(publicApi, /\.insert\(/i);
  assert.doesNotMatch(publicApi, /\.update\(/i);
  assert.doesNotMatch(publicApi, /claim_permanent_referral_with_entry_proof/i);
  assert.match(publicApi, /slots_full/i);
});

test('owner API creates one permanent link idempotently behind wallet auth', () => {
  assert.match(ownerApi, /requireWalletSession/i);
  assert.match(ownerApi, /loadActiveReferralLink/i);
  assert.match(ownerApi, /referral_link_ensure_wallet/i);
  assert.match(ownerApi, /\.from\('referral_links'\)/i);
  assert.match(
    ownerApi,
    /const \[existing, slotsAvailable\][\s\S]*if \(existing\)[\s\S]*referral_link_ensure_wallet/i,
  );
});

test('claim API checks eligibility before atomically creating an invitation', () => {
  assert.match(claimApi, /checkVeBetterEntryEligibility/i);
  assert.match(claimApi, /active_existing_user/i);
  assert.match(claimApi, /claim_permanent_referral_with_entry_proof/i);
  assert.doesNotMatch(claimApi, /\.from\('invitations'\)\s*\.insert/i);
});

test('home uses one permanent link, two independently rendered slots, and an active-friend count', () => {
  assert.match(home, /\/api\/referral-links/i);
  assert.match(home, /`\/r\/\$\{referralLink\.key\}`/i);
  assert.match(home, /<FriendSlot[\s\S]*number=\{1\}/i);
  assert.match(home, /<FriendSlot[\s\S]*number=\{2\}/i);
  assert.match(home, /legacyInviteUrl/i);
  assert.match(home, /<span>\{slotInvites\.size\}\/2<\/span>/i);
  assert.doesNotMatch(home, /2\s*-\s*slotInvites\.size/i);
  assert.doesNotMatch(home, /createInvite\s*=\s*async/i);
});

test('home preserves invitation and reward history when permanent-link ensure has a transient failure', () => {
  assert.match(home, /Promise\.allSettled/i);
  assert.match(home, /setInvites\(inviteData\.invites \?\? \[\]\)/i);
  assert.match(home, /linkResult\.status === 'rejected'/i);
});

test('permanent link landing is noindex and transitions into the existing mission route after claim', () => {
  assert.match(permanentPage, /index:\s*false/i);
  assert.match(permanentPage, /follow:\s*false/i);
  assert.match(permanentClient, /\/api\/referral-links\/\$\{encodeURIComponent\(referralKey\)\}\/claim/i);
  assert.match(permanentClient, /`\/i\/\$\{claimedInviteCode\}`/i);
  assert.match(permanentClient, /slotsFullTitle/i);
});

test('all supported locales receive permanent-link and two-slot runtime copy', () => {
  const expectedLocales = [
    'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha',
  ];
  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*\{/i
      : new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'i');
    assert.match(referralCopy, pattern, `missing permanent-referral copy for ${locale}`);
    const cancelPattern = locale === 'zh-tw'
      ? /'zh-tw':\s*'/i
      : new RegExp(`\\n\\s*${locale}:\\s*'`, 'i');
    assert.match(
      referralCopyFinalHardening,
      cancelPattern,
      `missing legacy-cancel copy for ${locale}`,
    );
  }
  assert.match(referralCopy, /for \(const locale of SUPPORTED_LOCALES\)/i);
  assert.match(referralCopy, /home\.inviteAvailable = referral\.badge/i);
  assert.match(referralCopy, /flow\.inviteDescription = referral\.guideInviteDescription/i);
  assert.match(referralCopyFinalHardening, /HOME_COPY\[locale\]\.cancelDescriptionWaiting/i);
  assert.match(referralCopyFinalHardening, /REFERRAL_LINK_COPY\.ko\.slotsLabel = '진행 중인 친구'/i);
  assert.match(appProviders, /referralLinkCopyFinalHardening/i);
});

test('legacy cancel copy explains that the permanent link survives and the one slot is released', () => {
  assert.match(referralCopyFinalHardening, /old one-time link will stop working/i);
  assert.match(referralCopyFinalHardening, /permanent invite link stays valid/i);
  assert.match(referralCopyFinalHardening, /friend slot becomes available again/i);
  assert.match(referralCopyFinalHardening, /기존 1회용 링크는 더 이상 사용할 수 없어요/i);
  assert.match(referralCopyFinalHardening, /영구 초대 링크는 그대로 유지되고/i);
  assert.match(referralCopyFinalHardening, /친구 슬롯은 다시 사용할 수 있어요/i);
});

test('core guide no longer teaches the one-active-invite rule', () => {
  assert.doesNotMatch(guideFlow, /one active invite at a time/i);
  assert.doesNotMatch(guideFlow, /한 번에 초대 한 건만/i);
  assert.match(guideFlow, /two reusable friend slots/i);
  assert.match(guideFlow, /친구 슬롯 2개/i);
});

test('two payouts in one session can show consecutive unseen reward receipts', () => {
  assert.match(receiptNotice, /await loadReceipt\(\);[\s\S]*finally/i);
});

test('analytics classifies permanent links without sending raw referral paths', () => {
  assert.match(analyticsTracker, /pathname\.startsWith\('\/i\/'\)\s*\)/i);
  assert.match(analyticsTracker, /pathname\.startsWith\('\/r\/'\)\s*\)/i);
  assert.match(analyticsTracker, /return 'invite_landing'/i);
  assert.doesNotMatch(analyticsTracker, /payload[^\n]*pathname/i);
  assert.match(analyticsTracker, /const ensureSession =/i);
  assert.match(analyticsTracker, /const isEngaged =/i);
});
