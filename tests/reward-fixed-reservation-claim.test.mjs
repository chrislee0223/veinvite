import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reservationMigration = await readFile(
  new URL('../supabase/migrations/20260904093000_fix_reward_at_completion_before_claim.sql', import.meta.url),
  'utf8',
);
const slotMigration = await readFile(
  new URL('../supabase/migrations/20260904094000_release_slot_only_after_reward_reservation.sql', import.meta.url),
  'utf8',
);
const privilegeMigration = await readFile(
  new URL('../supabase/migrations/20260904096000_harden_reward_reservation_rpc_privileges.sql', import.meta.url),
  'utf8',
);
const reservationServer = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);
const claimRoute = await readFile(
  new URL('../src/app/api/rewards/claims/route.ts', import.meta.url),
  'utf8',
);

test('completion fixes a durable reward before any explicit claim', () => {
  assert.match(reservationMigration, /reserved_amount_wei numeric\(78,0\)/);
  assert.match(reservationMigration, /'AWAITING_CLAIM'/);
  assert.match(reservationMigration, /status = 'AWAITING_CLAIM'/);
  assert.match(reservationMigration, /q\.reserved_amount_wei/);
  assert.match(
    reservationMigration,
    /Claiming only changes transfer state; it never reprices the reward\./,
  );
});

test('payout copies each invitation fixed amount instead of a round-wide price', () => {
  assert.match(
    reservationMigration,
    /q\.reserved_amount_wei,\n\s*'PENDING'/,
  );
  assert.match(
    reservationMigration,
    /amountMode', 'PER_INVITATION_FIXED_RESERVATION'/,
  );
  assert.doesNotMatch(
    reservationMigration,
    /v_epoch\.reward_per_invite_wei,\n\s*'PENDING'/,
  );
});

test('slot is released only after a durable reservation exists', () => {
  assert.match(slotMigration, /reserved_amount_wei is not null/);
  assert.match(slotMigration, /reserved_at is not null/);
  assert.match(slotMigration, /set slot_released_at = coalesce/);
  assert.match(
    slotMigration,
    /status = 'COMPLETED'[\s\S]*slot_released_at is null/,
  );
});

test('reservation and payout batches remain bounded and finalized', () => {
  assert.match(reservationServer, /MAX_RESERVATIONS_PER_SWEEP = 25/);
  assert.match(reservationServer, /getBlockCompressed\('finalized'\)/);
  assert.match(reservationMigration, /v_batch_limit constant integer := 25/);
  assert.match(
    reservationMigration,
    /completion\.block_number,\n\s*completion\.tx_index,\n\s*completion\.clause_index/,
  );
});

test('financial RPCs are server-only and explicit claim is origin protected', () => {
  assert.match(
    privilegeMigration,
    /grant execute on function public\.commit_reward_reservation[\s\S]*to service_role/,
  );
  assert.match(
    privilegeMigration,
    /revoke all on function public\.request_reward_claim[\s\S]*from public, anon, authenticated/,
  );
  assert.match(claimRoute, /if \(!sameOrigin\(request\)\)/);
  assert.match(claimRoute, /requireWalletSession/);
  assert.match(claimRoute, /request_reward_claim/);
});

test('historical completions are explicitly excluded from retroactive reservations', () => {
  assert.match(
    reservationMigration,
    /reward_reservation_legacy_exclusions/,
  );
  assert.match(
    reservationMigration,
    /pre_reservation_rollout_completed/,
  );
  assert.match(
    reservationMigration,
    /not exists \([\s\S]*reward_reservation_legacy_exclusions/,
  );
});
