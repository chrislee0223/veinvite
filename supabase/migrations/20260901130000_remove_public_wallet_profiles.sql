begin;

-- VeInvite should not maintain a second wallet-profile system. VeWorld's
-- account alias and locally selected profile image belong to the wallet app
-- and are not exposed to dApps as portable public profile data.
--
-- The profile feature was retired before any Production or Preview profile
-- rows or avatar objects were created, so these objects can be removed without
-- deleting user-created profile data.

delete from storage.objects
where bucket_id = 'profile-avatars';

delete from storage.buckets
where id = 'profile-avatars';

drop table if exists public.public_wallet_profiles;

commit;
