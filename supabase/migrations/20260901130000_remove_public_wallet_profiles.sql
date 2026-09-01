begin;

-- VeInvite should not maintain a second wallet-profile system. VeWorld's
-- account alias and locally selected profile image belong to the wallet app
-- and are not exposed to dApps as portable public profile data.
--
-- No Production or Preview profile rows or avatar objects were created before
-- this feature was retired. Supabase intentionally blocks direct SQL deletion
-- of Storage buckets, so the now-unused empty bucket is made private here and
-- the app-owned profile table is removed. The profile API/UI are removed in
-- the same release, leaving no VeInvite upload or profile-management surface.

update storage.buckets
set public = false
where id = 'profile-avatars';

drop table if exists public.public_wallet_profiles;

commit;
