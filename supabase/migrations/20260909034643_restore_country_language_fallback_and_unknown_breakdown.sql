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
        when lower(l.language_code) = 'en' then 'US'
        when lower(l.language_code) = 'ko' then 'KR'
        when lower(l.language_code) = 'zh' then 'CN'
        when lower(l.language_code) = 'hi' then 'IN'
        when lower(l.language_code) = 'es' then 'ES'
        when lower(l.language_code) = 'ja' then 'JP'
        when lower(l.language_code) = 'it' then 'IT'
        when lower(l.language_code) = 'tr' then 'TR'
        when lower(l.language_code) = 'nl' then 'NL'
        when lower(l.language_code) = 'de' then 'DE'
        when lower(l.language_code) = 'fr' then 'FR'
        when lower(l.language_code) = 'ar' then 'AE'
        when lower(l.language_code) = 'bn' then 'BD'
        when lower(l.language_code) = 'pt' then 'BR'
        when lower(l.language_code) = 'ru' then 'RU'
        when lower(l.language_code) = 'id' then 'ID'
        when lower(l.language_code) = 'vi' then 'VN'
        when lower(l.language_code) = 'zh-tw' then 'TW'
        when lower(l.language_code) = 'sv' then 'SE'
        when lower(l.language_code) = 'ro' then 'RO'
        when lower(l.language_code) = 'ur' then 'PK'
        when lower(l.language_code) = 'pcm' then 'NG'
        when lower(l.language_code) = 'arz' then 'EG'
        when lower(l.language_code) = 'mr' then 'IN'
        when lower(l.language_code) = 'te' then 'IN'
        when lower(l.language_code) = 'sw' then 'KE'
        when lower(l.language_code) = 'ha' then 'NG'
        when lower(l.language_code) = 'el' then 'GR'
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
    'unknownNewUsers', (
      select count(*) from qualified
      where country_code is null and entry_class = 'NEW'
    ),
    'unknownReturningUsers', (
      select count(*) from qualified
      where country_code is null and entry_class = 'RETURNING'
    ),
    'unknownCurrentRoundCompleted', (
      select count(*) from qualified
      where country_code is null and cohort_round_id = p_current_round_id
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
is 'Public country arrival leaderboard. Trusted activation/acquisition country evidence wins. When trusted country evidence is absent, the selected VeInvite display language maps to the same representative country flag used by the app. This language fallback is display/reporting-only and never affects eligibility, rewards, identity, or Sybil decisions. Truly unmapped users remain UNKNOWN and are returned with NEW/RETURNING breakdown fields.';

revoke execute on function public.get_public_country_leaderboard(text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text, bigint, integer)
  to service_role;
