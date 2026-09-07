create or replace function public.get_public_country_leaderboard(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
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
  activated_candidates as (
    select
      lower(e.wallet_address) as wallet_address,
      e.entry_class,
      e.created_at,
      i.id as invitation_id,
      i.vote_round_id,
      i.vote_completed_block,
      greatest(
        i.apps_completed_block,
        i.vot3_converted_block,
        i.vote_completed_block
      )::bigint as completion_block,
      row_number() over (
        partition by lower(e.wallet_address), e.entry_class
        order by
          greatest(
            i.apps_completed_block,
            i.vot3_converted_block,
            i.vote_completed_block
          ),
          e.created_at,
          i.id
      ) as row_number
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
      and i.status = 'COMPLETED'
      and i.apps_completed >= 3
      and i.apps_completed_block is not null
      and i.vot3_converted is true
      and i.vot3_converted_block is not null
      and i.vote_completed is true
      and i.vote_completed_block is not null
      and i.sybil_status = 'CLEAR'
  ),
  mission_completion as (
    select
      c.wallet_address,
      c.invitation_id,
      c.entry_class,
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
      end as country_code,
      c.completion_block,
      c.vote_completed_block,
      c.vote_round_id
    from activated_candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
    left join public.referral_activation_language_facts l
      on l.source_invitation_id = c.invitation_id
    where c.row_number = 1
  ),
  qualified as (
    select
      m.*,
      coalesce(
        (
          select s.round_id
          from public.operator_round_growth_report_snapshots s
          where s.network = v_network
            and s.round_start_block is not null
            and s.round_end_block is not null
            and m.completion_block between s.round_start_block and s.round_end_block
          order by s.version desc, s.created_at desc
          limit 1
        ),
        case
          when m.completion_block = m.vote_completed_block
            and m.vote_round_id is not null
            then m.vote_round_id
          when m.completion_block > coalesce(
            (
              select max(s2.round_end_block)
              from public.operator_round_growth_report_snapshots s2
              where s2.network = v_network
                and s2.round_end_block is not null
            ),
            0
          ) then p_current_round_id
          else null
        end
      ) as completion_round_id
    from mission_completion m
  ),
  country_totals as (
    select
      q.country_code,
      count(*)::bigint as completed_referrals,
      count(*) filter (where q.entry_class = 'NEW')::bigint as new_users,
      count(*) filter (where q.entry_class = 'RETURNING')::bigint as returning_users,
      count(*) filter (
        where q.completion_round_id = p_current_round_id
      )::bigint as current_round_completed
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select
      rank() over (
        order by c.completed_referrals desc
      ) as rank_position,
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

comment on function public.get_public_country_leaderboard(text, bigint, integer)
is 'Public country arrival leaderboard. Counts the same activated NEW/RETURNING population as public growth reporting. Trusted country evidence wins; conservative activation-language mapping is display-only fallback and does not affect reward, eligibility, or Sybil decisions.';

revoke execute on function public.get_public_country_leaderboard(text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text, bigint, integer)
  to service_role;
