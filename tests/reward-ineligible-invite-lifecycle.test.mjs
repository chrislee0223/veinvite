import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260902152000_close_ineligible_invites_and_record_outcome.sql',
    import.meta.url,
  ),
  'utf8',
);
const notificationMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260902161500_unify_ineligible_notification_stage.sql',
    import.meta.url,
  ),
  'utf8',
);
const notificationRoute = readFileSync(
  new URL(
    '../src/app/api/notifications/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const notificationState = readFileSync(
  new URL(
    '../src/lib/notifications/inviteNotificationState.ts',
    import.meta.url,
  ),
  'utf8',
);
const notificationSurface = readFileSync(
  new URL(
    '../src/components/InviteNotificationSurface.tsx',
    import.meta.url,
  ),
  'utf8',
);
const inAppNotifications = readFileSync(
  new URL(
    '../src/components/InAppInviteNotifications.tsx',
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

test('live ineligible rejection is serialized with the invitation row lock and one RPC transaction', () => {
  assert.match(migration, /reject_invitation_with_entry_proof/u);
  assert.match(migration, /for update;/u);
  assert.match(migration, /'EXISTING_VEBETTER_USER'/u);
  assert.match(migration, /'ACTIVE_EXISTING'/u);
  assert.match(migration, /'result', 'REJECTED'/u);
  assert.match(claimRoute, /reject_invitation_with_entry_proof/u);
  assert.match(claimRoute, /rejectionResult\.result !== 'REJECTED'/u);
});

test('operator funnel keeps rejection and pending buckets mutually exclusive', () => {
  assert.match(migration, /then\s+'INELIGIBLE'/u);
  assert.match(migration, /then\s+'PENDING_ACCEPTANCE'/u);
  assert.match(migration, /as\s+ineligible_rejections/u);
  assert.match(migration, /as\s+pending_acceptance/u);
});

test('ineligible alerts reuse the authenticated existing notification API and bell surface', () => {
  assert.match(notificationRoute, /requireWalletSession/u);
  assert.match(notificationRoute, /ineligibility_check_id/u);
  assert.match(notificationRoute, /ineligible_at/u);
  assert.match(notificationRoute, /INVITE_NOTIFICATION_STAGE\.ineligible/u);
  assert.match(notificationState, /INVITE_INELIGIBLE/u);
  assert.match(notificationState, /ineligibility_check_id !== null/u);
  assert.match(notificationSurface, /INVITE_INELIGIBLE/u);
  assert.match(notificationSurface, /INELIGIBLE_INVITER_COPY/u);
  assert.equal(
    existsSync(
      new URL(
        '../src/app/api/notifications/ineligible/route.ts',
        import.meta.url,
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      new URL(
        '../src/components/IneligibleInviteNotification.tsx',
        import.meta.url,
      ),
    ),
    false,
  );
});

test('notification acknowledgement expands both the function and table constraint to stage 6', () => {
  assert.match(notificationMigration, /highest_stage between 1 and 6/u);
  assert.match(notificationMigration, /p_stage not between 1 and 6/u);
  assert.match(notificationMigration, /validate constraint invite_notification_state_stage_check/u);
  assert.match(notificationMigration, /security definer/iu);
  assert.match(notificationMigration, /grant execute[\s\S]*service_role/iu);
});

test('terminal rejection acknowledgement refreshes stale Home invite state exactly once', () => {
  assert.match(inAppNotifications, /notification\.kind === 'INVITE_INELIGIBLE'/u);
  assert.match(inAppNotifications, /window\.location\.reload\(\)/u);
  assert.match(inAppNotifications, /if \(terminalInviteReleased\)/u);
});

test('notification reward evidence is skipped for non-paid pending and rejected invitations', () => {
  assert.match(notificationRoute, /invitation\.reward_status === 'PAID'/u);
  assert.match(notificationRoute, /loadPaidRewards\(paidInviteCodes\)/u);
});

test('a confirmed ACTIVE_EXISTING result is not reported as terminal unless its atomic transition persists', () => {
  assert.match(claimRoute, /Promise<RejectRpcResult \| null>/u);
  assert.match(claimRoute, /return null;/u);
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
