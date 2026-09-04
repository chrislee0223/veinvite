import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260904203000_lock_fixed_reward_reservations.sql',
    import.meta.url,
  ),
  'utf8',
);

test('fixed reward amount cannot be rewritten after reservation', () => {
  assert.match(
    migration,
    /old\.reserved_amount_wei is not null/,
  );
  assert.match(
    migration,
    /new\.reserved_amount_wei is distinct from old\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /new\.reserved_at is distinct from old\.reserved_at/,
  );
  assert.match(
    migration,
    /fixed reward reservation is immutable/,
  );
});

test('reservation provenance is locked with the fixed amount', () => {
  for (const field of [
    'reservation_algorithm_version',
    'reservation_completion_block',
    'reservation_completion_tx_index',
    'reservation_completion_clause_index',
    'reservation_basis',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `new\\.${field} is distinct from old\\.${field}`,
      ),
    );
  }
});

test('database trigger enforces the lock before reward queue updates', () => {
  assert.match(
    migration,
    /create trigger reward_queue_entries_reservation_immutability[\s\S]*before update of[\s\S]*on public\.reward_queue_entries/,
  );
  assert.match(
    migration,
    /execute function public\.prevent_reward_reservation_mutation\(\)/,
  );
});

test('reservation lock helper is not exposed as a browser RPC', () => {
  assert.match(
    migration,
    /revoke all on function public\.prevent_reward_reservation_mutation\(\)[\s\S]*from public, anon, authenticated/,
  );
});
