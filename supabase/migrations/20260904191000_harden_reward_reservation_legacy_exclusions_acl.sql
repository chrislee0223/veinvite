-- Harden the rollout exclusion ledger used by reward planning.
-- The table is server-only infrastructure; browser roles must never mutate or read it.

alter table public.reward_reservation_legacy_exclusions
  enable row level security;

revoke all on table public.reward_reservation_legacy_exclusions
  from public, anon, authenticated;

grant select on table public.reward_reservation_legacy_exclusions
  to service_role;

comment on table public.reward_reservation_legacy_exclusions is
  'Auditable rollout guard preventing historical pre-reservation completions from receiving retroactive automatic reservations. Server-only read access; no browser role privileges.';
