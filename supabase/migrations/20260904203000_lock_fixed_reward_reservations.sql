-- Enforce the fixed-reward invariant at the database boundary.
--
-- A reward reservation is created only after a referral is fully verified and
-- finalized. Once reserved_amount_wei has been written, the amount and its
-- economic provenance must remain immutable. Claiming, queue assignment,
-- retries, and payout settlement may change transfer state, but must never
-- reprice or rewrite the already-promised reward.
--
-- Existing legacy rows with no reservation remain untouched and can still be
-- handled by explicit future recovery tooling. The lock begins only after a
-- reservation exists.

create or replace function public.prevent_reward_reservation_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if old.reserved_amount_wei is not null
     and (
       new.reserved_amount_wei is distinct from old.reserved_amount_wei
       or new.reserved_at is distinct from old.reserved_at
       or new.reservation_algorithm_version is distinct from old.reservation_algorithm_version
       or new.reservation_completion_block is distinct from old.reservation_completion_block
       or new.reservation_completion_tx_index is distinct from old.reservation_completion_tx_index
       or new.reservation_completion_clause_index is distinct from old.reservation_completion_clause_index
       or new.reservation_basis is distinct from old.reservation_basis
     ) then
    raise exception 'fixed reward reservation is immutable for invite %', old.invite_code;
  end if;

  return new;
end;
$$;

drop trigger if exists reward_queue_entries_reservation_immutability
  on public.reward_queue_entries;

create trigger reward_queue_entries_reservation_immutability
before update of
  reserved_amount_wei,
  reserved_at,
  reservation_algorithm_version,
  reservation_completion_block,
  reservation_completion_tx_index,
  reservation_completion_clause_index,
  reservation_basis
on public.reward_queue_entries
for each row
execute function public.prevent_reward_reservation_mutation();

-- Trigger-only helper. Keep it out of the browser RPC surface.
revoke all on function public.prevent_reward_reservation_mutation()
from public, anon, authenticated;
