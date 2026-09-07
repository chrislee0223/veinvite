begin;

insert into public.referral_activation_country_facts (
  relationship_id,
  source_invitation_id,
  country_code,
  country_source,
  observed_at,
  geo_policy_version,
  source_snapshot
)
select
  r.id,
  r.source_invitation_id,
  'UNKNOWN',
  'UNKNOWN',
  r.relationship_effective_at,
  'historical-backfill-v1',
  jsonb_build_object(
    'capture','historical_backfill',
    'reason','trusted activation-country evidence was not retained before live capture was enabled',
    'localeInferenceUsed',false,
    'rawIpStored',false
  )
from public.referral_relationships r
where not exists (
  select 1
  from public.referral_activation_country_facts c
  where c.source_invitation_id = r.source_invitation_id
)
on conflict (source_invitation_id) do nothing;

insert into public.referral_activation_language_facts (
  relationship_id,
  source_invitation_id,
  language_code,
  language_source,
  observed_at,
  language_policy_version,
  source_snapshot
)
select
  r.id,
  r.source_invitation_id,
  u.current_language,
  case u.current_source
    when 'manual_selection' then 'MANUAL_SELECTION'
    when 'wallet_preference' then 'WALLET_PREFERENCE'
    when 'local_storage' then 'LOCAL_STORAGE'
    when 'browser_auto' then 'BROWSER_AUTO'
  end,
  greatest(r.relationship_effective_at, u.first_observed_at),
  'historical-near-activation-v1',
  jsonb_build_object(
    'capture','historical_near_activation_backfill',
    'firstObservedAt',u.first_observed_at,
    'lastObservedAt',u.last_observed_at,
    'windowMinutes',15
  )
from public.referral_relationships r
join public.wallet_language_usage u
  on u.wallet_address = r.child_wallet
where u.current_source in ('manual_selection','wallet_preference','local_storage','browser_auto')
  and u.first_observed_at <= r.relationship_effective_at + interval '15 minutes'
  and u.last_observed_at >= r.relationship_effective_at - interval '15 minutes'
  and not exists (
    select 1
    from public.referral_activation_language_facts l
    where l.source_invitation_id = r.source_invitation_id
  )
on conflict (source_invitation_id) do nothing;

commit;
