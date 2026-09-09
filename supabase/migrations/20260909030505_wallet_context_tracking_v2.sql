-- Production migration replay for wallet_context_tracking_v2.
-- This file mirrors the schema change already applied to Production as
-- Supabase migration 20260909030505 wallet_context_tracking_v2.

alter table public.wallet_language_usage
  drop constraint if exists wallet_language_usage_source_check;

alter table public.wallet_language_usage
  add constraint wallet_language_usage_source_check
  check (
    current_source = any (
      array[
        'browser_auto'::text,
        'local_storage'::text,
        'query_param'::text,
        'wallet_preference'::text,
        'manual_selection'::text
      ]
    )
  );

create or replace function public.wallet_language_source_priority(p_source text)
returns integer
language sql
immutable strict
set search_path to 'pg_catalog', 'public'
as $$
  select case p_source
    when 'manual_selection' then 50
    when 'wallet_preference' then 40
    when 'query_param' then 30
    when 'local_storage' then 20
    when 'browser_auto' then 10
    else 0
  end;
$$;

revoke all on function public.wallet_language_source_priority(text)
  from public, anon, authenticated;
grant execute on function public.wallet_language_source_priority(text)
  to service_role;

create or replace function public.record_wallet_language_usage_v2(
  p_wallet_address text,
  p_language text,
  p_source text,
  p_observed_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_wallet text := lower(btrim(p_wallet_address));
  v_language text := lower(btrim(p_language));
  v_source text := lower(btrim(p_source));
  v_observed_at timestamptz := coalesce(p_observed_at, clock_timestamp());
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  if v_language !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
     or char_length(v_language) > 35 then
    raise exception 'invalid language';
  end if;

  if v_source not in (
    'browser_auto',
    'local_storage',
    'query_param',
    'wallet_preference',
    'manual_selection'
  ) then
    raise exception 'invalid language source';
  end if;

  insert into public.wallet_language_usage (
    wallet_address,
    current_language,
    current_source,
    first_observed_at,
    last_observed_at,
    updated_at
  ) values (
    v_wallet,
    v_language,
    v_source,
    v_observed_at,
    v_observed_at,
    v_observed_at
  )
  on conflict (wallet_address) do update
  set current_language = case
        when public.wallet_language_source_priority(excluded.current_source)
             >= public.wallet_language_source_priority(public.wallet_language_usage.current_source)
          then excluded.current_language
        else public.wallet_language_usage.current_language
      end,
      current_source = case
        when public.wallet_language_source_priority(excluded.current_source)
             >= public.wallet_language_source_priority(public.wallet_language_usage.current_source)
          then excluded.current_source
        else public.wallet_language_usage.current_source
      end,
      last_observed_at = greatest(
        public.wallet_language_usage.last_observed_at,
        excluded.last_observed_at
      ),
      updated_at = greatest(
        public.wallet_language_usage.updated_at,
        excluded.updated_at
      );
end;
$$;

revoke all on function public.record_wallet_language_usage_v2(text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_wallet_language_usage_v2(text,text,text,timestamptz)
  to service_role;

create or replace function public.capture_referral_activation_language_from_usage()
returns trigger
language plpgsql
set search_path to 'public'
as $$
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
    'wallet-display-near-activation-v2',
    jsonb_build_object(
      'capture','wallet_language_usage_trigger',
      'firstObservedAt',new.first_observed_at,
      'lastObservedAt',new.last_observed_at,
      'usageSource',new.current_source
    )
  ) on conflict (source_invitation_id) do nothing;

  return new;
end;
$$;

create or replace function public.capture_referral_activation_context()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_country_code text;
  v_country_observed_at timestamptz;
  v_language_code text;
  v_language_source text;
  v_language_fact_source text;
  v_language_first_observed_at timestamptz;
  v_language_last_observed_at timestamptz;
begin
  select s.country_code, s.country_observed_at
    into v_country_code, v_country_observed_at
  from public.wallet_auth_sessions s
  where s.wallet_address = new.child_wallet
    and s.country_source = 'TRUSTED_EDGE'
    and s.country_code ~ '^[A-Z]{2}$'
    and s.country_observed_at is not null
    and s.country_observed_at >= new.relationship_effective_at - interval '15 minutes'
    and s.country_observed_at <= new.relationship_effective_at + interval '15 minutes'
  order by s.country_observed_at desc, s.id desc
  limit 1;

  if v_country_code is not null then
    insert into public.referral_activation_country_facts (
      relationship_id,
      source_invitation_id,
      country_code,
      country_source,
      observed_at,
      geo_policy_version,
      source_snapshot
    ) values (
      new.id,
      new.source_invitation_id,
      v_country_code,
      'TRUSTED_EDGE',
      new.relationship_effective_at,
      'wallet-auth-edge-v2',
      jsonb_build_object(
        'capture','wallet_auth_session',
        'countryObservedAt',v_country_observed_at,
        'rawIpStored',false
      )
    ) on conflict (source_invitation_id) do nothing;
  end if;

  select u.current_language, u.current_source, u.first_observed_at, u.last_observed_at
    into v_language_code, v_language_source, v_language_first_observed_at, v_language_last_observed_at
  from public.wallet_language_usage u
  where u.wallet_address = new.child_wallet
    and u.last_observed_at >= new.relationship_effective_at - interval '15 minutes'
    and u.first_observed_at <= new.relationship_effective_at + interval '15 minutes'
  limit 1;

  v_language_fact_source := case v_language_source
    when 'manual_selection' then 'MANUAL_SELECTION'
    when 'wallet_preference' then 'WALLET_PREFERENCE'
    when 'query_param' then 'QUERY_PARAM'
    when 'local_storage' then 'LOCAL_STORAGE'
    when 'browser_auto' then 'BROWSER_AUTO'
    else null
  end;

  if v_language_code is not null and v_language_fact_source is not null then
    insert into public.referral_activation_language_facts (
      relationship_id,
      source_invitation_id,
      language_code,
      language_source,
      observed_at,
      language_policy_version,
      source_snapshot
    ) values (
      new.id,
      new.source_invitation_id,
      v_language_code,
      v_language_fact_source,
      greatest(new.relationship_effective_at, v_language_first_observed_at),
      'wallet-display-near-activation-v2',
      jsonb_build_object(
        'capture','wallet_language_usage',
        'firstObservedAt',v_language_first_observed_at,
        'lastObservedAt',v_language_last_observed_at,
        'usageSource',v_language_source
      )
    ) on conflict (source_invitation_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace view public.operator_accepted_wallet_languages
with (security_invoker = true) as
with latest_legacy as (
  select distinct on (l.invitation_id)
    l.invitation_id,
    l.entry_class,
    l.outcome
  from public.legacy_entry_classification_backfill l
  where l.classification_status = 'VERIFIED'
  order by l.invitation_id, l.recorded_at desc, l.id desc
), accepted as (
  select
    i.id as invitation_id,
    lower(btrim(i.invitee_wallet)) as wallet_address,
    coalesce(e.entry_class, l.entry_class) as entry_class,
    case
      when i.eligibility_check_id is not null
       and e.outcome = 'ELIGIBLE'
       and e.entry_class in ('NEW','RETURNING')
        then 'MODERN'::text
      when i.eligibility_check_id is null
       and i.invitee_wallet is not null
       and l.outcome = 'ELIGIBLE'
       and l.entry_class in ('NEW','RETURNING')
        then 'LEGACY'::text
      else null::text
    end as acceptance_kind
  from public.invitations i
  left join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
  left join latest_legacy l
    on l.invitation_id = i.id
  where i.invitee_wallet is not null
    and not exists (
      select 1
      from public.analytics_excluded_wallets x
      where x.active
        and (
          x.wallet_address = lower(btrim(i.inviter_wallet))
          or x.wallet_address = lower(btrim(i.invitee_wallet))
        )
    )
)
select
  a.invitation_id,
  a.wallet_address,
  a.entry_class,
  a.acceptance_kind,
  coalesce(
    case
      when f.language_source <> 'UNKNOWN'
       and f.language_code <> 'UNKNOWN'
        then lower(f.language_code)
      else null
    end,
    u.current_language,
    p.language
  ) as display_language,
  coalesce(
    case f.language_source
      when 'MANUAL_SELECTION' then 'manual_selection'
      when 'WALLET_PREFERENCE' then 'wallet_preference'
      when 'QUERY_PARAM' then 'query_param'
      when 'LOCAL_STORAGE' then 'local_storage'
      when 'BROWSER_AUTO' then 'browser_auto'
      else null
    end,
    u.current_source,
    case when p.language is not null then 'wallet_preference' else null end
  ) as display_language_source,
  p.language as saved_preference_language,
  p.language is not null as has_saved_preference,
  coalesce(f.observed_at, u.first_observed_at) as first_observed_at,
  coalesce(f.observed_at, u.last_observed_at) as last_observed_at,
  p.updated_at as preference_updated_at
from accepted a
left join public.referral_activation_language_facts f
  on f.source_invitation_id = a.invitation_id
left join public.wallet_language_usage u
  on u.wallet_address = a.wallet_address
left join public.wallet_preferences p
  on p.wallet_address = a.wallet_address
where a.acceptance_kind is not null;

revoke all on public.operator_accepted_wallet_languages
  from public, anon, authenticated;
grant select on public.operator_accepted_wallet_languages
  to service_role;

create or replace view public.operator_accepted_language_summary
with (security_invoker = true) as
select
  entry_class,
  coalesce(display_language, 'unknown'::text) as display_language,
  count(*) as participant_count,
  count(*) filter (where has_saved_preference) as saved_preference_count,
  count(*) filter (where display_language_source = 'browser_auto') as browser_auto_count,
  count(*) filter (where display_language_source = 'local_storage') as local_storage_count,
  count(*) filter (where display_language_source = 'wallet_preference') as wallet_preference_count,
  count(*) filter (where display_language_source = 'manual_selection') as manual_selection_count,
  count(*) filter (where display_language_source is null) as unknown_source_count,
  count(*) filter (where display_language_source = 'query_param') as query_param_count
from public.operator_accepted_wallet_languages
group by entry_class, coalesce(display_language, 'unknown'::text)
order by entry_class, count(*) desc, coalesce(display_language, 'unknown'::text);

revoke all on public.operator_accepted_language_summary
  from public, anon, authenticated;
grant select on public.operator_accepted_language_summary
  to service_role;

create or replace function public.get_public_country_leaderboard(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
  v_result jsonb;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_current_round_id is null or p_current_round_id < 1 then
    raise exception 'invalid current round';
  end if;

  with parameters as (
    select
      c.reporting_start_at,
      c.reporting_baseline_round_id
    from public.operator_reporting_config c
    where c.id = 1
      and c.reporting_start_at is not null
      and c.reporting_network = v_network
  ),
  bound_entries as (
    select
      (e.details ->> 'currentRoundId')::bigint as entry_round_id,
      lower(e.wallet_address) as wallet_address,
      e.entry_class,
      e.created_at,
      i.id as invitation_id,
      exists (
        select 1
        from public.reward_receipts rr
        join public.reward_payout_transaction_settlements rs
          on rs.id = rr.settlement_id
        where rr.invite_code = i.invite_code
          and lower(btrim(rr.recipient_wallet)) = lower(btrim(i.inviter_wallet))
          and lower(btrim(rr.network)) = v_network
          and lower(btrim(rs.network)) = v_network
          and rr.amount_wei > 0
      ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = v_network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW', 'RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p_current_round_id::numeric
  ),
  activated_entries as (
    select
      b.*,
      min(b.entry_round_id) over (
        partition by b.wallet_address, b.entry_class
      ) as cohort_round_id
    from bound_entries b
    where b.is_activated is true
  ),
  activated_candidates as (
    select
      a.*,
      row_number() over (
        partition by a.wallet_address, a.entry_class
        order by a.created_at, a.invitation_id
      ) as row_number
    from activated_entries a
  ),
  qualified as (
    select
      c.wallet_address,
      c.entry_class,
      c.cohort_round_id,
      case
        when f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')
          and f.country_code ~ '^[A-Z]{2}$'
          then f.country_code
        when a.country_source = 'TRUSTED_EDGE'
          and a.country_code ~ '^[A-Z]{2}$'
          then a.country_code
        else null
      end as country_code
    from activated_candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
    where c.row_number = 1
  ),
  country_totals as (
    select
      q.country_code,
      count(*)::bigint as completed_referrals,
      count(*) filter (where q.entry_class = 'NEW')::bigint as new_users,
      count(*) filter (where q.entry_class = 'RETURNING')::bigint as returning_users,
      count(*) filter (where q.cohort_round_id = p_current_round_id)::bigint as current_round_completed
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select
      rank() over (order by c.completed_referrals desc) as rank_position,
      c.country_code,
      c.completed_referrals,
      c.new_users,
      c.returning_users,
      c.current_round_completed
    from country_totals c
  ),
  limited as (
    select *
    from ranked
    order by rank_position, country_code
    limit v_limit
  )
  select jsonb_build_object(
    'knownCompleted', (
      select count(*) from qualified where country_code is not null
    ),
    'unknownCompleted', (
      select count(*) from qualified where country_code is null
    ),
    'leaders', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', l.rank_position,
            'countryCode', l.country_code,
            'completedReferrals', l.completed_referrals,
            'newUsers', l.new_users,
            'returningUsers', l.returning_users,
            'currentRoundCompleted', l.current_round_completed
          )
          order by l.rank_position, l.country_code
        )
        from limited l
      ),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_country_leaderboard(text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer)
  to service_role;
