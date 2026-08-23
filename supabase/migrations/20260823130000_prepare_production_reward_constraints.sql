-- Production-compatibility preflight for VeInvite reward tables.
--
-- The original Production schema created payout uniqueness as table
-- constraints, while Preview had equivalent standalone indexes. Later audit
-- migrations intentionally remove these uniqueness assumptions so one
-- on-chain batch transaction can settle multiple per-invite payout rows.
-- Production currently has zero reward rounds and zero reward payouts, so
-- removing these constraints cannot affect historical settlements.

begin;

alter table public.reward_payouts
  drop constraint if exists reward_payouts_invite_once;

alter table public.reward_payouts
  drop constraint if exists reward_payouts_tx_unique;

-- Harmless if a previous schema used standalone indexes instead.
drop index if exists public.reward_payouts_invite_once;
drop index if exists public.reward_payouts_tx_unique;
drop index if exists public.reward_payouts_tx_id_uidx;

commit;
