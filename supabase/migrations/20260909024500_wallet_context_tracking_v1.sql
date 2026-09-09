-- VeInvite wallet context tracking hardening v1

alter table public.wallet_language_usage
  drop constraint if exists wallet_language_usage_source_check;

alter table public.wallet_language_usage
  add constraint wallet_language_usage_source_check
  check (current_source = any (array[
    'browser_auto'::text,
    'local_storage'::text,
    'query_param'::text,
    'wallet_preference'::text,
    'manual_selection'::text
  ]));

create table if not exists public.entry_acceptance_context_facts (
  eligibility_check_id bigint primary key
    references public.eligibility_check_events(id) on delete cascade,
  wallet_address text not null
    check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  language_code text null
    check (
      language_code is null or
      (char_length(language_code) <= 35 and language_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$')
    ),
  language_source text null
    check (
      language_source is null or language_source = any (array[
        'browser_auto'::text,
        'local_storage'::text,
        'query_param'::text,
        'wallet_preference'::text,
        'manual_selection'::text
      ])
    ),
  language_observed_at timestamptz null,
  country_code text null
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  country_source text null
    check (
      country_source is null or country_source = any (array[
        'TRUSTED_EDGE'::text,
        'OPERATOR_VERIFIED'::text
      ])
    ),
  country_observed_at timestamptz null,
  acceptance_observed_at timestamptz not null,
  policy_version text not null default 'entry-context-v1',
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists entry_acceptance_context_language_idx
  on public.entry_acceptance_context_facts(language_code)
  where language_code is not null;
create index if not exists entry_acceptance_context_country_idx
  on public.entry_acceptance_context_facts(country_code)
  where country_code is not null;

alter table public.entry_acceptance_context_facts enable row level security;
revoke all on table public.entry_acceptance_context_facts from public, anon, authenticated;
grant select, insert, update, delete on table public.entry_acceptance_context_facts to service_role;

create or replace function public.wallet_language_source_priority(p_source text)
returns integer
language sql
immutable
strict
set search_path = pg_catalog, public
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
revoke all on function public.wallet_language_source_priority(text) from public, anon, authenticated;
grant execute on function public.wallet_language_source_priority(text) to service_role;

create or replace function public.record_wallet_language_usage_v2(
  p_wallet_address text,
  p_language text,
  p_source text,
  p_observed_at timestamptz default clock_timestamp()
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
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
    'browser_auto','local_storage','query_param','wallet_preference','manual_selection'
  ) then
    raise exception 'invalid language source';
  end if;

  insert into public.wallet_language_usage (
    wallet_address,current_language,current_source,
    first_observed_at,last_observed_at,updated_at
  ) values (
    v_wallet,v_language,v_source,v_observed_at,v_observed_at,v_observed_at
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
revoke all on function public.record_wallet_language_usage_v2(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_wallet_language_usage_v2(text,text,text,timestamptz) to service_role;

create or replace function public.capture_entry_acceptance_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_language_code text;
  v_language_source text;
  v_language_observed_at timestamptz;
  v_country_code text;
  v_country_observed_at timestamptz;
  v_wallet text := lower(btrim(new.wallet_address));
  v_usage_day date := (new.created_at at time zone 'Asia/Seoul')::date;
begin
  if new.outcome <> 'ELIGIBLE'
     or new.entry_class not in ('NEW','RETURNING') then
    return new;
  end if;

  select u.current_language,u.current_source,u.last_observed_at
    into v_language_code,v_language_source,v_language_observed_at
  from public.wallet_language_usage u
  where u.wallet_address = v_wallet
    and u.last_observed_at >= new.created_at - interval '2 minutes'
    and u.last_observed_at <= new.created_at + interval '2 minutes'
  order by u.last_observed_at desc
  limit 1;

  select s.country_code,s.country_observed_at
    into v_country_code,v_country_observed_at
  from public.wallet_auth_sessions s
  where s.wallet_address = v_wallet
    and s.country_source = 'TRUSTED_EDGE'
    and s.country_code ~ '^[A-Z]{2}$'
    and s.country_observed_at is not null
    and s.country_observed_at >= new.created_at - interval '15 minutes'
    and s.country_observed_at <= new.created_at + interval '2 minutes'
  order by s.country_observed_at desc,s.id desc
  limit 1;

  insert into public.entry_acceptance_context_facts (
    eligibility_check_id,wallet_address,
    language_code,language_source,language_observed_at,
    country_code,country_source,country_observed_at,
    acceptance_observed_at,policy_version,source_snapshot
  ) values (
    new.id,v_wallet,
    v_language_code,v_language_source,v_language_observed_at,
    v_country_code,
    case when v_country_code is not null then 'TRUSTED_EDGE' else null end,
    v_country_observed_at,
    new.created_at,'entry-context-v1',
    jsonb_build_object(
      'capture','eligibility_event',
      'languageNearAcceptance',v_language_code is not null,
      'trustedCountryNearAcceptance',v_country_code is not null,
      'rawIpStored',false,
      'languageInferenceAllowed',false
    )
  ) on conflict (eligibility_check_id) do nothing;

  if not exists (
    select 1 from public.analytics_excluded_wallets x
    where x.active and x.wallet_address = v_wallet
  ) then
    insert into public.operator_fast_wallets (
      wallet_address,first_seen_at,last_seen_at,updated_at
    ) values (v_wallet,new.created_at,new.created_at,clock_timestamp())
    on conflict (wallet_address) do update
      set first_seen_at = least(public.operator_fast_wallets.first_seen_at,excluded.first_seen_at),
          last_seen_at = greatest(public.operator_fast_wallets.last_seen_at,excluded.last_seen_at),
          updated_at = clock_timestamp();

    insert into public.operator_fast_wallet_days (
      usage_date,wallet_address,first_seen_at,last_seen_at,updated_at
    ) values (v_usage_day,v_wallet,new.created_at,new.created_at,clock_timestamp())
    on conflict (usage_date,wallet_address) do update
      set first_seen_at = least(public.operator_fast_wallet_days.first_seen_at,excluded.first_seen_at),
          last_seen_at = greatest(public.operator_fast_wallet_days.last_seen_at,excluded.last_seen_at),
          updated_at = clock_timestamp();
  end if;

  return new;
end;
$$;
revoke all on function public.capture_entry_acceptance_context() from public, anon, authenticated;

drop trigger if exists eligibility_check_events_capture_acceptance_context on public.eligibility_check_events;
create trigger eligibility_check_events_capture_acceptance_context
  after insert on public.eligibility_check_events
  for each row execute function public.capture_entry_acceptance_context();

create or replace function public.fill_entry_acceptance_language_from_usage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_check_id bigint;
  v_language_code text;
  v_language_source text;
begin
  select e.id into v_check_id
  from public.eligibility_check_events e
  where lower(btrim(e.wallet_address)) = new.wallet_address
    and e.outcome = 'ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING')
    and new.last_observed_at >= e.created_at - interval '2 minutes'
    and new.last_observed_at <= e.created_at + interval '5 minutes'
  order by e.created_at desc,e.id desc
  limit 1;

  if v_check_id is null then return new; end if;

  select c.language_code,c.language_source
    into v_language_code,v_language_source
  from public.entry_acceptance_context_facts c
  where c.eligibility_check_id = v_check_id
  for update;

  if not found then return new; end if;

  if v_language_code is null then
    update public.entry_acceptance_context_facts
      set language_code = new.current_language,
          language_source = new.current_source,
          language_observed_at = new.last_observed_at,
          updated_at = clock_timestamp(),
          source_snapshot = source_snapshot || jsonb_build_object(
            'languageLateFill','wallet_language_usage',
            'languageLateFillAt',new.last_observed_at
          )
    where eligibility_check_id = v_check_id;
  elsif v_language_code = new.current_language
        and public.wallet_language_source_priority(new.current_source)
            > public.wallet_language_source_priority(coalesce(v_language_source,'browser_auto')) then
    update public.entry_acceptance_context_facts
      set language_source = new.current_source,
          language_observed_at = greatest(coalesce(language_observed_at,new.last_observed_at),new.last_observed_at),
          updated_at = clock_timestamp(),
          source_snapshot = source_snapshot || jsonb_build_object(
            'languageSourceUpgraded',true,
            'languageSourceUpgradeAt',new.last_observed_at
          )
    where eligibility_check_id = v_check_id;
  end if;

  return new;
end;
$$;
revoke all on function public.fill_entry_acceptance_language_from_usage() from public, anon, authenticated;

drop trigger if exists wallet_language_usage_fill_acceptance_context on public.wallet_language_usage;
create trigger wallet_language_usage_fill_acceptance_context
  after insert or update of current_language,current_source,last_observed_at
  on public.wallet_language_usage
  for each row execute function public.fill_entry_acceptance_language_from_usage();

create or replace function public.fill_entry_acceptance_country_from_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_check_id bigint;
begin
  if new.country_source <> 'TRUSTED_EDGE'
     or new.country_code !~ '^[A-Z]{2}$'
     or new.country_observed_at is null then
    return new;
  end if;

  select e.id into v_check_id
  from public.eligibility_check_events e
  where lower(btrim(e.wallet_address)) = new.wallet_address
    and e.outcome = 'ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING')
    and new.country_observed_at >= e.created_at - interval '15 minutes'
    and new.country_observed_at <= e.created_at + interval '5 minutes'
  order by e.created_at desc,e.id desc
  limit 1;

  if v_check_id is null then return new; end if;

  update public.entry_acceptance_context_facts
    set country_code = new.country_code,
        country_source = 'TRUSTED_EDGE',
        country_observed_at = new.country_observed_at,
        updated_at = clock_timestamp(),
        source_snapshot = source_snapshot || jsonb_build_object(
          'countryLateFill','wallet_auth_session',
          'countryLateFillAt',new.country_observed_at,
          'rawIpStored',false
        )
  where eligibility_check_id = v_check_id
    and country_code is null;

  return new;
end;
$$;
revoke all on function public.fill_entry_acceptance_country_from_session() from public, anon, authenticated;

drop trigger if exists wallet_auth_sessions_fill_acceptance_context on public.wallet_auth_sessions;
create trigger wallet_auth_sessions_fill_acceptance_context
  after insert or update of country_code,country_source,country_observed_at
  on public.wallet_auth_sessions
  for each row execute function public.fill_entry_acceptance_country_from_session();

insert into public.entry_acceptance_context_facts (
  eligibility_check_id,wallet_address,acceptance_observed_at,policy_version,source_snapshot
)
select e.id,lower(btrim(e.wallet_address)),e.created_at,'historical-fact-backfill-v1',
       jsonb_build_object('capture','historical_shell','rawIpStored',false,'languageInferenceAllowed',false)
from public.eligibility_check_events e
where e.outcome = 'ELIGIBLE' and e.entry_class in ('NEW','RETURNING')
on conflict (eligibility_check_id) do nothing;

do $$
begin
  if to_regclass('public.referral_activation_language_facts') is not null then
    execute $sql$
      update public.entry_acceptance_context_facts c
      set language_code = l.language_code,
          language_source = case l.language_source
            when 'MANUAL_SELECTION' then 'manual_selection'
            when 'WALLET_PREFERENCE' then 'wallet_preference'
            when 'LOCAL_STORAGE' then 'local_storage'
            when 'BROWSER_AUTO' then 'browser_auto'
            else null
          end,
          language_observed_at = l.observed_at,
          updated_at = clock_timestamp(),
          source_snapshot = c.source_snapshot || jsonb_build_object(
            'languageBackfill','referral_activation_language_facts'
          )
      from public.invitations i
      join public.referral_activation_language_facts l
        on l.source_invitation_id = i.id
      where i.eligibility_check_id = c.eligibility_check_id
        and c.language_code is null
        and l.language_code is not null
    $sql$;
  end if;
end;
$$;

update public.entry_acceptance_context_facts c
set country_code = f.country_code,
    country_source = f.country_source,
    country_observed_at = f.observed_at,
    updated_at = clock_timestamp(),
    source_snapshot = c.source_snapshot || jsonb_build_object(
      'countryBackfill','referral_activation_country_facts','rawIpStored',false
    )
from public.invitations i
join public.referral_activation_country_facts f on f.source_invitation_id = i.id
where i.eligibility_check_id = c.eligibility_check_id
  and c.country_code is null
  and f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
  and f.country_code ~ '^[A-Z]{2}$';

update public.entry_acceptance_context_facts c
set country_code = f.country_code,
    country_source = f.country_source,
    country_observed_at = f.observed_at,
    updated_at = clock_timestamp(),
    source_snapshot = c.source_snapshot || jsonb_build_object(
      'countryBackfill','referral_acquisition_country_facts','rawIpStored',false
    )
from public.invitations i
join public.referral_acquisition_country_facts f on f.source_invitation_id = i.id
where i.eligibility_check_id = c.eligibility_check_id
  and c.country_code is null
  and f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
  and f.country_code ~ '^[A-Z]{2}$';

create or replace view public.operator_accepted_wallet_languages as
with latest_legacy as (
  select distinct on (legacy_entry_classification_backfill.invitation_id)
    legacy_entry_classification_backfill.invitation_id,
    legacy_entry_classification_backfill.entry_class,
    legacy_entry_classification_backfill.outcome
  from public.legacy_entry_classification_backfill
  where legacy_entry_classification_backfill.classification_status = 'VERIFIED'
  order by legacy_entry_classification_backfill.invitation_id,
           legacy_entry_classification_backfill.recorded_at desc,
           legacy_entry_classification_backfill.id desc
), accepted as (
  select i.id as invitation_id,
         lower(btrim(i.invitee_wallet)) as wallet_address,
         coalesce(e.entry_class,l.entry_class) as entry_class,
         e.id as eligibility_check_id,
         case
           when i.eligibility_check_id is not null
             and e.outcome = 'ELIGIBLE'
             and e.entry_class = any(array['NEW'::text,'RETURNING'::text])
             then 'MODERN'::text
           when i.eligibility_check_id is null
             and i.invitee_wallet is not null
             and l.outcome = 'ELIGIBLE'
             and l.entry_class = any(array['NEW'::text,'RETURNING'::text])
             then 'LEGACY'::text
           else null::text
         end as acceptance_kind
  from public.invitations i
  left join public.eligibility_check_events e on e.id = i.eligibility_check_id
  left join latest_legacy l on l.invitation_id = i.id
  where i.invitee_wallet is not null
    and not exists (
      select 1 from public.analytics_excluded_wallets x
      where x.active and (
        x.wallet_address = lower(btrim(i.inviter_wallet)) or
        x.wallet_address = lower(btrim(i.invitee_wallet))
      )
    )
)
select a.invitation_id,
       a.wallet_address,
       a.entry_class,
       a.acceptance_kind,
       coalesce(c.language_code,u.current_language,p.language) as display_language,
       coalesce(
         c.language_source,
         u.current_source,
         case when p.language is not null then 'wallet_preference'::text else null::text end
       ) as display_language_source,
       p.language as saved_preference_language,
       p.language is not null as has_saved_preference,
       coalesce(c.language_observed_at,u.first_observed_at) as first_observed_at,
       coalesce(c.language_observed_at,u.last_observed_at) as last_observed_at,
       p.updated_at as preference_updated_at
from accepted a
left join public.entry_acceptance_context_facts c on c.eligibility_check_id = a.eligibility_check_id
left join public.wallet_language_usage u on u.wallet_address = a.wallet_address
left join public.wallet_preferences p on p.wallet_address = a.wallet_address
where a.acceptance_kind is not null;

create or replace function public.get_public_country_leaderboard(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
  v_result jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_current_round_id is null or p_current_round_id < 1 then
    raise exception 'invalid current round';
  end if;

  with parameters as (
    select c.reporting_start_at,c.reporting_baseline_round_id
    from public.operator_reporting_config c
    where c.id = 1
      and c.reporting_start_at is not null
      and c.reporting_network = v_network
  ), bound_entries as (
    select (e.details ->> 'currentRoundId')::bigint as entry_round_id,
           lower(e.wallet_address) as wallet_address,
           e.entry_class,e.created_at,e.id as eligibility_check_id,
           i.id as invitation_id,
           exists (
             select 1
             from public.reward_receipts rr
             join public.reward_payout_transaction_settlements rs on rs.id = rr.settlement_id
             where rr.invite_code = i.invite_code
               and lower(btrim(rr.recipient_wallet)) = lower(btrim(i.inviter_wallet))
               and lower(btrim(rr.network)) = v_network
               and lower(btrim(rs.network)) = v_network
               and rr.amount_wei > 0
           ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = v_network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW','RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric and p_current_round_id::numeric
  ), activated_entries as (
    select b.*,
           min(b.entry_round_id) over (partition by b.wallet_address,b.entry_class) as cohort_round_id
    from bound_entries b where b.is_activated is true
  ), activated_candidates as (
    select a.*,
           row_number() over (
             partition by a.wallet_address,a.entry_class
             order by a.created_at,a.invitation_id
           ) as row_number
    from activated_entries a
  ), qualified as (
    select c.wallet_address,c.entry_class,c.cohort_round_id,
           case
             when f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
               and f.country_code ~ '^[A-Z]{2}$' then f.country_code
             when a.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
               and a.country_code ~ '^[A-Z]{2}$' then a.country_code
             when x.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
               and x.country_code ~ '^[A-Z]{2}$' then x.country_code
             else null
           end as country_code
    from activated_candidates c
    left join public.referral_activation_country_facts f on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a on a.source_invitation_id = c.invitation_id
    left join public.entry_acceptance_context_facts x on x.eligibility_check_id = c.eligibility_check_id
    where c.row_number = 1
  ), country_totals as (
    select q.country_code,
           count(*)::bigint as completed_referrals,
           count(*) filter (where q.entry_class='NEW')::bigint as new_users,
           count(*) filter (where q.entry_class='RETURNING')::bigint as returning_users,
           count(*) filter (where q.cohort_round_id=p_current_round_id)::bigint as current_round_completed
    from qualified q where q.country_code is not null
    group by q.country_code
  ), ranked as (
    select rank() over (order by c.completed_referrals desc) as rank_position,
           c.country_code,c.completed_referrals,c.new_users,c.returning_users,c.current_round_completed
    from country_totals c
  ), limited as (
    select * from ranked order by rank_position,country_code limit v_limit
  )
  select jsonb_build_object(
    'knownCompleted',(select count(*) from qualified where country_code is not null),
    'unknownCompleted',(select count(*) from qualified where country_code is null),
    'leaders',coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank',l.rank_position,
        'countryCode',l.country_code,
        'completedReferrals',l.completed_referrals,
        'newUsers',l.new_users,
        'returningUsers',l.returning_users,
        'currentRoundCompleted',l.current_round_completed
      ) order by l.rank_position,l.country_code)
      from limited l
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace view public.operator_wallet_context_health
with (security_invoker = true)
as
with excluded as (
  select wallet_address from public.analytics_excluded_wallets where active
), wallets as (
  select w.wallet_address
  from public.operator_fast_wallets w
  where not exists (select 1 from excluded x where x.wallet_address = w.wallet_address)
), accepted as (
  select e.id,lower(btrim(e.wallet_address)) as wallet_address
  from public.eligibility_check_events e
  where e.outcome='ELIGIBLE' and e.entry_class in ('NEW','RETURNING')
    and not exists (select 1 from excluded x where x.wallet_address=lower(btrim(e.wallet_address)))
)
select (select count(*) from wallets)::bigint as observed_wallets,
       (select count(*) from wallets w join public.wallet_language_usage u on u.wallet_address=w.wallet_address)::bigint as language_recorded_wallets,
       (select count(*) from wallets w left join public.wallet_language_usage u on u.wallet_address=w.wallet_address where u.wallet_address is null)::bigint as language_missing_wallets,
       (select count(*) from accepted)::bigint as accepted_modern,
       (select count(*) from accepted a join public.entry_acceptance_context_facts c on c.eligibility_check_id=a.id)::bigint as accepted_context_rows,
       (select count(*) from accepted a join public.entry_acceptance_context_facts c on c.eligibility_check_id=a.id where c.language_code is not null)::bigint as accepted_language_known,
       (select count(*) from accepted a join public.entry_acceptance_context_facts c on c.eligibility_check_id=a.id where c.country_code is not null and c.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED'))::bigint as accepted_country_known,
       clock_timestamp() as generated_at;
