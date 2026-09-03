import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260903160000_prepare_two_invite_slot_foundation.sql',
    import.meta.url,
  ),
  'utf8',
);

test('invitation concurrency slot is explicit, bounded, and defaults to current slot 1', () => {
  assert.match(
    migration,
    /add column invite_slot smallint not null default 1/i,
  );
  assert.match(
    migration,
    /check \(invite_slot in \(1, 2\)\)/i,
  );
});

test('future per-slot race guard exists without disabling the current one-active-invite invariant', () => {
  assert.match(
    migration,
    /create unique index invitations_one_active_per_inviter_slot[\s\S]*lower\(inviter_wallet\), invite_slot/i,
  );
  assert.match(
    migration,
    /eligibility_check_id is not null[\s\S]*activation_network is not null/i,
  );
  assert.doesNotMatch(
    migration,
    /drop index(?: if exists)? public\.invitations_one_active_per_inviter/i,
  );
  assert.match(
    migration,
    /legacy invitations_one_active_per_inviter index intentionally remains in force/i,
  );
});

test('invite slot becomes immutable referral provenance', () => {
  assert.match(
    migration,
    /new\.invite_slot is distinct from old\.invite_slot/i,
  );
  assert.match(
    migration,
    /before update of inviter_wallet, invitee_wallet, invite_code, invite_slot,/i,
  );
  assert.match(
    migration,
    /'invitation_slot', new\.invite_slot/i,
  );
});

test('future graph keeps invitation concurrency separate from network placement', () => {
  assert.match(
    migration,
    /create or replace view public\.qualified_referral_network_edges/i,
  );
  assert.match(
    migration,
    /i\.invite_slot as invitation_slot/i,
  );
  assert.match(
    migration,
    /a\.slot as placement_slot/i,
  );
  assert.match(
    migration,
    /left join public\.referral_slot_assignments a/i,
  );
  assert.doesNotMatch(
    migration,
    /update public\.referral_relationships/i,
  );
});

test('future graph read model remains server-only', () => {
  assert.match(
    migration,
    /revoke all on table public\.qualified_referral_network_edges from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select on table public\.qualified_referral_network_edges to service_role/i,
  );
});
