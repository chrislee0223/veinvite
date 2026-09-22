-- Cleanup follows the default-public reader rollout.
-- At this point no runtime code or database reader depends on this legacy
-- per-wallet visibility table.

drop table if exists public.network_public_profiles;
