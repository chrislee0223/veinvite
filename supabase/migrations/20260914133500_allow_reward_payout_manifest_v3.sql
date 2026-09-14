begin;

alter table public.reward_payout_manifests
  drop constraint if exists reward_payout_manifests_version_check;

alter table public.reward_payout_manifests
  add constraint reward_payout_manifests_version_check
  check (
    manifest_version = any (
      array[
        'veinvite-payout-manifest-v2'::text,
        'veinvite-payout-manifest-v3'::text
      ]
    )
  );

commit;
