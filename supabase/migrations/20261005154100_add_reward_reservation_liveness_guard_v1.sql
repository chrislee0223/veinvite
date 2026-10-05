create or replace function public.read_stale_reward_reservation_liveness(
  p_network text,
  p_stale_minutes integer default 15
)
returns table(
  missing_count bigint,
  oldest_reward_eligible_at timestamptz,
  invite_codes text[]
)
language sql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(5, least(coalesce(p_stale_minutes, 15), 1440)) as stale_minutes
  ),
  missing as (
    select
      i.invite_code,
      i.reward_eligible_at
    from public.invitations i
    cross join parameters p
    join public.sybil_v2_referral_assessments a
      on a.invite_code = i.invite_code
     and a.network = p.network
     and a.state = 'CLEAR'
    join public.sybil_v2_reward_clearances c
      on c.invite_code = i.invite_code
     and c.network = p.network
     and c.verdict = 'CLEAR'
     and c.assessment_revision = a.revision
    where i.activation_network = p.network
      and i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and i.reward_eligible_at is not null
      and i.reward_eligible_at <=
        clock_timestamp() - make_interval(mins => p.stale_minutes)
      and i.sybil_status = 'CLEAR'
      and i.sybil_checked_at is not null
      and i.impact_sync_complete_at is not null
      and i.eligibility_check_id is not null
      and i.reward_cohort_round_id is not null
      and i.reward_funding_allocation_receipt_id is not null
      and not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network = p.network
          and r.status = 'ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
      and not exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = i.invite_code
      )
      and not exists (
        select 1
        from public.reward_recovery_settlements s
        where s.invite_code = i.invite_code
      )
      and not exists (
        select 1
        from public.reward_reservation_legacy_exclusions x
        where x.invite_code = i.invite_code
      )
  )
  select
    count(*)::bigint,
    min(m.reward_eligible_at),
    coalesce(
      (
        select array_agg(
          s.invite_code
          order by s.reward_eligible_at, s.invite_code
        )
        from (
          select invite_code, reward_eligible_at
          from missing
          order by reward_eligible_at, invite_code
          limit 25
        ) s
      ),
      array[]::text[]
    )
  from missing m;
$function$;

revoke all on function public.read_stale_reward_reservation_liveness(text, integer)
  from public, anon, authenticated;
grant execute on function public.read_stale_reward_reservation_liveness(text, integer)
  to service_role;

comment on function public.read_stale_reward_reservation_liveness(text, integer)
is 'Service-only liveness guard for completed CLEAR referrals that remain unreserved after the allowed recovery window.';
