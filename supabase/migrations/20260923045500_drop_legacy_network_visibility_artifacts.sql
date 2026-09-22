-- Remove the retired per-wallet Public Network visibility system.
-- Production runtime no longer references these objects; referral Network
-- visibility is default-public and read-only.

drop trigger if exists audit_network_public_profile_change_trigger
  on public.network_public_profiles;

drop function if exists public.audit_network_public_profile_change();

drop table if exists public.network_public_profile_events;
drop table if exists public.network_public_profiles;
