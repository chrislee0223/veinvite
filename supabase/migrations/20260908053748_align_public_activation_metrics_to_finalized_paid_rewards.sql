create or replace function public.get_operator_public_new_user_growth(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 52
)
returns table(
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
set search_path to 'public'
as $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(1::bigint, p_current_round_id) as current_round_id,
      greatest(1, least(coalesce(p_limit, 52), 260)) as history_limit,
      c.reporting_start_at,
      c.reporting_baseline_round_id
    from public.operator_reporting_config c
    where c.id = 1
      and c.reporting_start_at is not null
      and c.reporting_network = lower(btrim(p_network))
  ),
  bound_entries as (
    select
      (e.details ->> 'currentRoundId')::bigint as entry_round_id,
      e.wallet_address,
      e.entry_class,
      e.created_at,
      i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged,
      exists (
        select 1
        from public.reward_receipts rr
        join public.reward_payout_transaction_settlements rs
          on rs.id = rr.settlement_id
        where rr.invite_code = i.invite_code
          and lower(btrim(rr.recipient_wallet)) = lower(btrim(i.inviter_wallet))
          and lower(btrim(rr.network)) = p.network
          and lower(btrim(rs.network)) = p.network
          and rr.amount_wei > 0
      ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = p.network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW', 'RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
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
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'EXISTING_VEBETTER_USER'
      and e.entry_class = 'ACTIVE_EXISTING'
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
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
      count(*) filter (where n.is_activated)::bigint as activated_new_users,
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
      count(*) filter (where r.is_activated)::bigint as activated_returning_users,
      min(r.first_entry_at) as first_entry_at,
      max(r.latest_entry_at) as latest_entry_at
    from safe_returning_wallets r
    group by r.cohort_round_id
  ),
  rejection_by_round as (
    select
      r.rejection_round_id as round_id,
      count(distinct r.wallet_address)::bigint as active_existing_rejected_users,
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
      coalesce(n.verified_new_users, 0::bigint) as verified_new_users,
      coalesce(n.activated_new_users, 0::bigint) as activated_new_users,
      coalesce(f.flagged_new_users, 0::bigint) as flagged_new_users,
      coalesce(r.verified_returning_users, 0::bigint) as verified_returning_users,
      coalesce(r.activated_returning_users, 0::bigint) as activated_returning_users,
      coalesce(x.active_existing_rejected_users, 0::bigint) as active_existing_rejected_users,
      coalesce(x.active_existing_rejection_attempts, 0::bigint) as active_existing_rejection_attempts,
      sum(coalesce(n.verified_new_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_verified_new_users,
      sum(coalesce(n.activated_new_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_activated_new_users,
      sum(coalesce(f.flagged_new_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_flagged_new_users,
      sum(coalesce(r.verified_returning_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_verified_returning_users,
      sum(coalesce(r.activated_returning_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_activated_returning_users,
      sum(coalesce(fr.first_rejected_users, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_active_existing_rejected_users,
      sum(coalesce(x.active_existing_rejection_attempts, 0::bigint)) over (order by ids.round_id)::bigint as cumulative_active_existing_rejection_attempts,
      least(n.first_entry_at, r.first_entry_at) as first_verified_entry_at,
      greatest(n.latest_entry_at, r.latest_entry_at) as latest_verified_entry_at
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
    and t.round_id >= p.reporting_baseline_round_id
  order by t.round_id desc;
$function$;

create or replace function public.get_public_country_leaderboard(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
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
      i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged,
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
  safe_entries as (
    select
      b.*,
      min(b.entry_round_id) over (
        partition by b.wallet_address, b.entry_class
      ) as cohort_round_id
    from bound_entries b
    where b.is_flagged is false
  ),
  activated_candidates as (
    select
      s.*,
      row_number() over (
        partition by s.wallet_address, s.entry_class
        order by s.created_at, s.invitation_id
      ) as row_number
    from safe_entries s
    where s.is_activated is true
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
        when lower(l.language_code) = 'tr' then 'TR'
        when lower(l.language_code) = 'ko' then 'KR'
        when lower(l.language_code) = 'ja' then 'JP'
        when lower(l.language_code) = 'vi' then 'VN'
        when lower(l.language_code) = 'id' then 'ID'
        when lower(l.language_code) = 'zh-tw' then 'TW'
        when lower(l.language_code) = 'pcm' then 'NG'
        when lower(l.language_code) = 'arz' then 'EG'
        else null
      end as country_code
    from activated_candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
    left join public.referral_activation_language_facts l
      on l.source_invitation_id = c.invitation_id
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
$function$;
