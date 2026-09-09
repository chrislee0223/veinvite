-- VeInvite wallet context tracking follow-up.
-- Keeps historical accepted wallets visible in the derived fast projection and
-- teaches the pre-existing activation language snapshot about query-param
-- display language without weakening any reward or eligibility authority.

insert into public.operator_fast_wallets (
  wallet_address,
  first_seen_at,
  last_seen_at,
  updated_at
)
select
  lower(btrim(e.wallet_address)) as wallet_address,
  min(e.created_at) as first_seen_at,
  max(e.created_at) as last_seen_at,
  clock_timestamp() as updated_at
from public.eligibility_check_events e
where e.outcome = 'ELIGIBLE'
  and e.entry_class in ('NEW','RETURNING')
  and not exists (
    select 1
    from public.analytics_excluded_wallets x
    where x.active
      and x.wallet_address = lower(btrim(e.wallet_address))
  )
group by lower(btrim(e.wallet_address))
on conflict (wallet_address) do update
set first_seen_at = least(
      public.operator_fast_wallets.first_seen_at,
      excluded.first_seen_at
    ),
    last_seen_at = greatest(
      public.operator_fast_wallets.last_seen_at,
      excluded.last_seen_at
    ),
    updated_at = clock_timestamp();

insert into public.operator_fast_wallet_days (
  usage_date,
  wallet_address,
  first_seen_at,
  last_seen_at,
  updated_at
)
select
  (e.created_at at time zone 'Asia/Seoul')::date as usage_date,
  lower(btrim(e.wallet_address)) as wallet_address,
  min(e.created_at) as first_seen_at,
  max(e.created_at) as last_seen_at,
  clock_timestamp() as updated_at
from public.eligibility_check_events e
where e.outcome = 'ELIGIBLE'
  and e.entry_class in ('NEW','RETURNING')
  and not exists (
    select 1
    from public.analytics_excluded_wallets x
    where x.active
      and x.wallet_address = lower(btrim(e.wallet_address))
  )
group by
  (e.created_at at time zone 'Asia/Seoul')::date,
  lower(btrim(e.wallet_address))
on conflict (usage_date, wallet_address) do update
set first_seen_at = least(
      public.operator_fast_wallet_days.first_seen_at,
      excluded.first_seen_at
    ),
    last_seen_at = greatest(
      public.operator_fast_wallet_days.last_seen_at,
      excluded.last_seen_at
    ),
    updated_at = clock_timestamp();

-- Append the new source metric at the end to preserve the existing view column
-- order for any operator consumer that reads the previous fields positionally.
create or replace view public.operator_accepted_language_summary as
select
  entry_class,
  coalesce(display_language, 'unknown'::text) as display_language,
  count(*) as participant_count,
  count(*) filter (where has_saved_preference) as saved_preference_count,
  count(*) filter (where display_language_source = 'browser_auto'::text) as browser_auto_count,
  count(*) filter (where display_language_source = 'local_storage'::text) as local_storage_count,
  count(*) filter (where display_language_source = 'wallet_preference'::text) as wallet_preference_count,
  count(*) filter (where display_language_source = 'manual_selection'::text) as manual_selection_count,
  count(*) filter (where display_language_source is null) as unknown_source_count,
  count(*) filter (where display_language_source = 'query_param'::text) as query_param_count
from public.operator_accepted_wallet_languages
group by entry_class, coalesce(display_language, 'unknown'::text)
order by
  entry_class,
  count(*) desc,
  coalesce(display_language, 'unknown'::text);

-- Production already has the frozen activation-language fact surface while an
-- older Preview schema may not. Upgrade it only when that surface exists.
do $$
begin
  if to_regclass('public.referral_activation_language_facts') is not null then
    execute $ddl$
      create or replace function public.capture_referral_activation_language_from_usage()
      returns trigger
      language plpgsql
      set search_path to 'public'
      as $body$
      declare
        v_relationship public.referral_relationships%rowtype;
        v_source text;
      begin
        select r.* into v_relationship
        from public.referral_relationships r
        where r.child_wallet = new.wallet_address
        limit 1;

        if not found then
          return new;
        end if;

        if new.first_observed_at > v_relationship.relationship_effective_at + interval '15 minutes'
           or new.last_observed_at < v_relationship.relationship_effective_at - interval '15 minutes' then
          return new;
        end if;

        v_source := case new.current_source
          when 'manual_selection' then 'MANUAL_SELECTION'
          when 'wallet_preference' then 'WALLET_PREFERENCE'
          when 'query_param' then 'QUERY_PARAM'
          when 'local_storage' then 'LOCAL_STORAGE'
          when 'browser_auto' then 'BROWSER_AUTO'
          else null
        end;

        if v_source is null then
          return new;
        end if;

        insert into public.referral_activation_language_facts (
          relationship_id,
          source_invitation_id,
          language_code,
          language_source,
          observed_at,
          language_policy_version,
          source_snapshot
        ) values (
          v_relationship.id,
          v_relationship.source_invitation_id,
          new.current_language,
          v_source,
          greatest(v_relationship.relationship_effective_at, new.first_observed_at),
          'wallet-display-near-activation-v1',
          jsonb_build_object(
            'capture','wallet_language_usage_trigger',
            'firstObservedAt',new.first_observed_at,
            'lastObservedAt',new.last_observed_at
          )
        ) on conflict (source_invitation_id) do nothing;

        return new;
      end;
      $body$;
    $ddl$;

    execute $sql$
      update public.entry_acceptance_context_facts c
      set language_code = l.language_code,
          language_source = case l.language_source
            when 'MANUAL_SELECTION' then 'manual_selection'
            when 'WALLET_PREFERENCE' then 'wallet_preference'
            when 'QUERY_PARAM' then 'query_param'
            when 'LOCAL_STORAGE' then 'local_storage'
            when 'BROWSER_AUTO' then 'browser_auto'
            else null
          end,
          language_observed_at = l.observed_at,
          updated_at = clock_timestamp(),
          source_snapshot = c.source_snapshot || jsonb_build_object(
            'languageBackfill','referral_activation_language_facts_v2'
          )
      from public.invitations i
      join public.referral_activation_language_facts l
        on l.source_invitation_id = i.id
      where i.eligibility_check_id = c.eligibility_check_id
        and c.language_code is null
        and l.language_code is not null
        and l.language_code <> 'UNKNOWN'
    $sql$;
  end if;
end;
$$;
