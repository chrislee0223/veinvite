-- The immutable sponsor ledger previously allowed only v1/legacy provenance.
-- Permanent referral activations use a distinct source kind so future Infinity
-- Canvas and reward audits can tell which onboarding contract produced an edge.

alter table public.referral_relationships
  drop constraint if exists referral_relationships_source_kind_check;

alter table public.referral_relationships
  add constraint referral_relationships_source_kind_check
  check (source_kind in (
    'legacy_backfill_v1',
    'legacy_completed_v0',
    'live_v1',
    'live_v2_permanent_link',
    'manual_recovery'
  ));
