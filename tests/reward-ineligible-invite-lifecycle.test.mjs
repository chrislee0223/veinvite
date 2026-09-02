import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260902152000_close_ineligible_invites_and_record_outcome.sql',
    import.meta.url,
  ),
  'utf8',
);
const notificationRoute = readFileSync(
  new URL(
    '../src/app/api/notifications/ineligible/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const ineligibleNotification = readFileSync(
  new URL(
    '../src/components/IneligibleInviteNotification.tsx',
    import.meta.url,
  ),
  'utf8',
);
const claimRoute = readFileSync(
  new URL(
    '../src/app/api/invites/[code]/claim/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const inviteRoute = readFileSync(
  new URL(
    '../src/app/api/invites/[code]/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const inviteeClient = readFileSync(
  new URL(
    '../src/components/InviteeClient.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('only verified ACTIVE_EXISTING entry checks close an unconsumed pending invitation', () => {
  assert.match(migration, /new\.outcome\s*=\s*'EXISTING_VEBETTER_USER'/u);
  assert.match(migration, /new\.entry_class\s*=\s*'ACTIVE_EXISTING'/u);
  assert.match(migration, /i\.status\s*=\s*'PENDING_ACCEPTANCE'/u);
  assert.match(migration, /i\.invitee_wallet\s+is\s+null/iu);
  assert.match(migration, /status\s*=\s*'CANCELLED'/u);
  assert.match(migration, /ineligibility_check_id\s*=\s*new\.id/u);
  assert.match(migration, /ineligible_at\s*=\s*new\.created_at/u);
});

test('operator funnel keeps rejection and pending buckets mutually exclusive', () => {
  assert.match(migration, /then\s+'INELIGIBLE'/u);
  assert.match(migration, /then\s+'PENDING_ACCEPTANCE'/u);
  assert.match(migration, /as\s+ineligible_rejections/u);
  assert.match(migration, /as\s+pending_acceptance/u);
});

test('ineligible notification endpoint is wallet-authenticated and only reads explicit rejection evidence', () => {
  assert.match(notificationRoute, /requireWalletSession/u);
  assert.match(notificationRoute, /\.eq\('inviter_wallet',\s*wallet\)/u);
  assert.match(notificationRoute, /\.not\('ineligibility_check_id',\s*'is',\s*null\)/u);
  assert.match(notificationRoute, /acknowledge_invite_notification/u);
});

test('ineligible notification polling is limited to the Home surface', () => {
  assert.match(ineligibleNotification, /usePathname/u);
  assert.equal(
    ineligibleNotification.includes("pathname === '/'"),
    true,
  );
  assert.match(ineligibleNotification, /const REFRESH_MS = 60_000/u);
  assert.match(ineligibleNotification, /!wallet \|\| !isHomeSurface/u);
});

test('a confirmed ACTIVE_EXISTING result is not reported as terminal unless its audit outcome persists', () => {
  assert.match(claimRoute, /Promise<boolean>/u);
  assert.match(claimRoute, /return false;/u);
  assert.match(claimRoute, /eligibility_record_failed/u);
  assert.match(claimRoute, /status: 503/u);
  assert.match(claimRoute, /Retry-After': '10'/u);
});

test('new terminal ineligible links reopen as neutral ended links rather than claiming the next visitor is ineligible', () => {
  assert.match(inviteRoute, /ineligibility_check_id/u);
  assert.match(inviteRoute, /outcome:\s*'ineligible_invite_closed'/u);
  assert.match(inviteRoute, /status: 410/u);
  assert.match(inviteeClient, /status === 404 \|\| status === 410/u);
});

test('verified legacy ACTIVE_EXISTING invitations still show their historical participation result and never enter mission reconciliation', () => {
  assert.match(inviteRoute, /legacy_entry_classification_backfill/u);
  assert.match(inviteRoute, /outcome:\s*'active_existing_user'/u);
  assert.match(inviteeClient, /readonly outcome:\s*string \| undefined/u);
  assert.match(inviteeClient, /outcome === 'active_existing_user'/u);
  assert.match(inviteeClient, /\? 'existing'/u);
});
