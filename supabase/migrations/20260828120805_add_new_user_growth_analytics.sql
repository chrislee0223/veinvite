-- Round-cohort growth analytics for defensible VeInvite impact reporting.
--
-- A "verified new entry" is a NEW eligibility proof bound to the invitation
-- that consumed it. REVIEW/BLOCKED cohorts are excluded and reported
-- separately. An "activated new user" additionally completed every mission
-- checkpoint and has a CLEAR Sybil decision. This prevents a link click or an
-- unfinished invitation from being promoted as a fully activated user.

begin;

create index if not exists eligibility_check_events_growth_idx
  on public.eligibility_check_events (
    network,
    (details ->> 'currentRoundId'),
    entry_class,
    outcome,
    wallet_address,
    id
  )
  where details ? 'currentRoundId';

create or replace function public.get_operator_new_user_growth(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 52
)
returns table (
  round_id bigint,
  verified_new_users bigint,
  activated_new_users bigint,
  flagged_new_users bigint,
  verified_returning_users bigint,
  activated_returning_users bigint,
  active_existing_rejected_users bigint,
  active_existing_rejection_attempts bigint,
  cumulative_verified_new_users bigint,
  cumulative_activated_new_users bigint,
  cumulative_flagged_new_users bigint,
  cumulative_verified_returning_users bigint,
  cumulative_activated_returning_users bigint,
  cumulative_active_existing_rejected_users bigint,
  cumulative_active_existing_rejection_attempts bigint,
  first_verified_entry_at timestamptz,
  latest_verified_entry_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  with recursive parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(1::bigint, p_current_round_id) as current_round_id,
      greatest(1, least(coalesce(p_limit, 52), 260)) as history_limit
  ),
  bound_entries as (
    select
      (e.details ->> 'currentRoundId')::bigint as entry_round_id,
      e.wallet_address,
      e.entry_class,
      e.created_at,
      i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged,
      (
        i.status = 'COMPLETED'
        and i.apps_completed >= 3
        and i.apps_completed_block is not null
        and i.vot3_converted is true
        and i.vot3_converted_block is not null
        and i.vote_completed is true
        and i.vote_completed_block is not null
        and i.sybil_status = 'CLEAR'
      ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = p.network
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW', 'RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        <= p.current_round_id::numeric
  ),
  safe_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'NEW'
      and b.is_flagged is false
    group by b.wallet_address
  ),
  flagged_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id
    from bound_entries b
    where b.entry_class = 'NEW'
      and b.is_flagged is true
      and not exists (
        select 1
        from safe_new_wallets n
        where n.wallet_address = b.wallet_address
      )
    group by b.wallet_address
  ),
  safe_returning_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'RETURNING'
      and b.is_flagged is false
    group by b.wallet_address
  ),
  rejection_events as (
    select
      (e.details ->> 'currentRoundId')::bigint as rejection_round_id,
      e.wallet_address,
      e.created_at
    from public.eligibility_check_events e
    cross join parameters p
    where e.network = p.network
      and e.outcome = 'EXISTING_VEBETTER_USER'
      and e.entry_class = 'ACTIVE_EXISTING'
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        <= p.current_round_id::numeric
  ),
  first_rejection_by_wallet as (
    select
      r.wallet_address,
      min(r.rejection_round_id) as first_rejection_round_id
    from rejection_events r
    group by r.wallet_address
  ),
  new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as verified_new_users,
      count(*) filter (where n.is_activated)::bigint
        as activated_new_users,
      min(n.first_entry_at) as first_entry_at,
      max(n.latest_entry_at) as latest_entry_at
    from safe_new_wallets n
    group by n.cohort_round_id
  ),
  flagged_new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as flagged_new_users
    from flagged_new_wallets n
    group by n.cohort_round_id
  ),
  returning_by_round as (
    select
      r.cohort_round_id as round_id,
      count(*)::bigint as verified_returning_users,
      count(*) filter (where r.is_activated)::bigint
        as activated_returning_users,
      min(r.first_entry_at) as first_entry_at,
      max(r.latest_entry_at) as latest_entry_at
    from safe_returning_wallets r
    group by r.cohort_round_id
  ),
  rejection_by_round as (
    select
      r.rejection_round_id as round_id,
      count(distinct r.wallet_address)::bigint
        as active_existing_rejected_users,
      count(*)::bigint as active_existing_rejection_attempts
    from rejection_events r
    group by r.rejection_round_id
  ),
  first_rejection_by_round as (
    select
      r.first_rejection_round_id as round_id,
      count(*)::bigint as first_rejected_users
    from first_rejection_by_wallet r
    group by r.first_rejection_round_id
  ),
  round_ids as (
    select generate_series(
      1::bigint,
      (select current_round_id from parameters)
    ) as round_id
  ),
  full_trend as (
    select
      ids.round_id,
      coalesce(n.verified_new_users, 0::bigint)
        as verified_new_users,
      coalesce(n.activated_new_users, 0::bigint)
        as activated_new_users,
      coalesce(f.flagged_new_users, 0::bigint)
        as flagged_new_users,
      coalesce(r.verified_returning_users, 0::bigint)
        as verified_returning_users,
      coalesce(r.activated_returning_users, 0::bigint)
        as activated_returning_users,
      coalesce(x.active_existing_rejected_users, 0::bigint)
        as active_existing_rejected_users,
      coalesce(x.active_existing_rejection_attempts, 0::bigint)
        as active_existing_rejection_attempts,
      sum(coalesce(n.verified_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_verified_new_users,
      sum(coalesce(n.activated_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_activated_new_users,
      sum(coalesce(f.flagged_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_flagged_new_users,
      sum(coalesce(r.verified_returning_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_verified_returning_users,
      sum(coalesce(r.activated_returning_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_activated_returning_users,
      sum(coalesce(fr.first_rejected_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_active_existing_rejected_users,
      sum(coalesce(x.active_existing_rejection_attempts, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_active_existing_rejection_attempts,
      least(n.first_entry_at, r.first_entry_at) as first_verified_entry_at,
      greatest(n.latest_entry_at, r.latest_entry_at)
        as latest_verified_entry_at
    from round_ids ids
    left join new_by_round n using (round_id)
    left join flagged_new_by_round f using (round_id)
    left join returning_by_round r using (round_id)
    left join rejection_by_round x using (round_id)
    left join first_rejection_by_round fr using (round_id)
  )
  select
    t.round_id,
    t.verified_new_users,
    t.activated_new_users,
    t.flagged_new_users,
    t.verified_returning_users,
    t.activated_returning_users,
    t.active_existing_rejected_users,
    t.active_existing_rejection_attempts,
    t.cumulative_verified_new_users,
    t.cumulative_activated_new_users,
    t.cumulative_flagged_new_users,
    t.cumulative_verified_returning_users,
    t.cumulative_activated_returning_users,
    t.cumulative_active_existing_rejected_users,
    t.cumulative_active_existing_rejection_attempts,
    t.first_verified_entry_at,
    t.latest_verified_entry_at
  from full_trend t
  cross join parameters p
  where t.round_id > p.current_round_id - p.history_limit
  order by t.round_id desc;
$function$;

comment on function public.get_operator_new_user_growth(text, bigint, integer)
is 'Round cohort and cumulative growth metrics from bound immutable eligibility proofs. NEW entry and CLEAR full activation are deliberately separate.';

revoke all on function public.get_operator_new_user_growth(
  text, bigint, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_operator_new_user_growth(
  text, bigint, integer
) to service_role;

commit;
