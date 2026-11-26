-- Preserve immutable activation and first-seven-day acquisition facts.
-- Late authenticated observations are a separate, lower-priority fallback.
-- No mission, invitation, payout, or sybil records are mutated.
create table public.referral_country_recovery_facts (
  relationship_id uuid primary key references public.referral_relationships(id) on delete restrict,
  source_invitation_id uuid not null unique references public.invitations(id) on delete restrict,
  country_code text not null check (country_code in ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')),
  country_source text not null default 'TRUSTED_EDGE' check (country_source = 'TRUSTED_EDGE'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  check (observed_at <= recorded_at)
);
alter table public.referral_country_recovery_facts enable row level security;
revoke all on public.referral_country_recovery_facts from public, anon, authenticated, service_role;
grant select, insert on public.referral_country_recovery_facts to service_role;
create trigger referral_country_recovery_facts_append_only
  before update or delete on public.referral_country_recovery_facts
  for each row execute function public.prevent_long_term_history_mutation();

-- The existing authenticated preference endpoint writes only verified
-- wallet sessions and trusted Vercel country headers. The trigger never
-- runs on ordinary session renewal, login insertion, or revocation.
create or replace function public.capture_referral_country_recovery_v1()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.country_source is distinct from 'TRUSTED_EDGE'
     or new.country_code is null or new.country_code not in ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')
     or new.country_observed_at is null
     or new.country_observed_at is not distinct from old.country_observed_at
     or new.revoked_at is not null
     or new.expires_at <= clock_timestamp()
     or new.country_observed_at < new.created_at
     or new.country_observed_at > clock_timestamp() then
    return new;
  end if;
  insert into public.referral_country_recovery_facts
    (relationship_id, source_invitation_id, country_code, observed_at)
  select r.id, r.source_invitation_id, new.country_code, new.country_observed_at
  from public.referral_relationships r
  join public.referral_activation_country_facts f on f.relationship_id = r.id
    and f.source_invitation_id = r.source_invitation_id
    and f.country_source = 'UNKNOWN' and f.country_code = 'UNKNOWN'
  where r.child_wallet = new.wallet_address
    and new.country_observed_at > r.relationship_effective_at + interval '7 days'
    and not exists (select 1 from public.referral_acquisition_country_facts a
      where a.source_invitation_id = r.source_invitation_id)
    and not exists (select 1 from public.referral_country_recovery_facts b
      where b.source_invitation_id = r.source_invitation_id)
  on conflict (source_invitation_id) do nothing;
  return new;
end;
$function$;
revoke all on function public.capture_referral_country_recovery_v1() from public, anon, authenticated;
grant execute on function public.capture_referral_country_recovery_v1() to postgres, service_role;
create trigger wallet_auth_sessions_capture_referral_recovery_country
  after update of country_code, country_source, country_observed_at on public.wallet_auth_sessions
  for each row execute function public.capture_referral_country_recovery_v1();

-- Backfill only retained trusted session evidence. The recorded_at is
-- the actual recovery time, never the historical referral time.
insert into public.referral_country_recovery_facts
  (relationship_id, source_invitation_id, country_code, observed_at)
select r.id, r.source_invitation_id, s.country_code, s.country_observed_at
from public.referral_relationships r
join public.referral_activation_country_facts f on f.relationship_id = r.id
  and f.source_invitation_id = r.source_invitation_id
  and f.country_source = 'UNKNOWN' and f.country_code = 'UNKNOWN'
join lateral (
  select ws.country_code, ws.country_observed_at
  from public.wallet_auth_sessions ws
  where ws.wallet_address = r.child_wallet
    and ws.country_source = 'TRUSTED_EDGE'
    and ws.country_code in ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')
    and ws.country_observed_at > r.relationship_effective_at + interval '7 days'
    and ws.country_observed_at >= ws.created_at
    and ws.country_observed_at <= ws.expires_at
    and ws.country_observed_at <= clock_timestamp()
    and (ws.revoked_at is null or ws.country_observed_at <= ws.revoked_at)
  order by ws.country_observed_at, ws.id limit 1
) s on true
where not exists (select 1 from public.referral_acquisition_country_facts a
  where a.source_invitation_id = r.source_invitation_id)
on conflict (source_invitation_id) do nothing;

create or replace function public.get_public_country_leaderboard(p_network text, p_current_round_id bigint, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
  v_result jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
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
          and lower(btrim(rr.recipient_wallet))
            = lower(btrim(i.inviter_wallet))
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
      and e.entry_class in ('NEW','RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p_current_round_id::numeric
      and not public.is_sybil_v2_referral_invalidated(
        i.invite_code,
        v_network
      )
  ),
  activated_entries as (
    select
      b.*,
      min(b.entry_round_id) over (
        partition by b.wallet_address,b.entry_class
      ) as cohort_round_id
    from bound_entries b
    where b.is_activated is true
  ),
  activated_candidates as (
    select
      a.*,
      row_number() over (
        partition by a.wallet_address,a.entry_class
        order by a.created_at,a.invitation_id
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
        when b.country_source = 'TRUSTED_EDGE' then b.country_code
        else null
      end as country_code
    from activated_candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
    left join public.referral_country_recovery_facts b
      on b.source_invitation_id = c.invitation_id
    where c.row_number = 1
  ),
  country_totals as (
    select
      q.country_code,
      count(*)::bigint as completed_referrals,
      count(*) filter(where q.entry_class='NEW')::bigint as new_users,
      count(*) filter(where q.entry_class='RETURNING')::bigint
        as returning_users,
      count(*) filter(where q.cohort_round_id=p_current_round_id)::bigint
        as current_round_completed
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select
      rank() over(order by c.completed_referrals desc) as rank_position,
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
    order by rank_position,country_code
    limit v_limit
  )
  select jsonb_build_object(
    'knownCompleted',
      (select count(*) from qualified where country_code is not null),
    'unknownCompleted',
      (select count(*) from qualified where country_code is null),
    'unknownNewUsers',
      (select count(*) from qualified
       where country_code is null and entry_class='NEW'),
    'unknownReturningUsers',
      (select count(*) from qualified
       where country_code is null and entry_class='RETURNING'),
    'unknownCurrentRoundCompleted',
      (select count(*) from qualified
       where country_code is null
         and cohort_round_id=p_current_round_id),
    'leaders',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rank',l.rank_position,
            'countryCode',l.country_code,
            'completedReferrals',l.completed_referrals,
            'newUsers',l.new_users,
            'returningUsers',l.returning_users,
            'currentRoundCompleted',l.current_round_completed
          )
          order by l.rank_position,l.country_code
        )
        from limited l
      ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_public_country_previous_round_ranks(p_network text, p_previous_round_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_result jsonb;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging')
     or p_previous_round_id is null or p_previous_round_id < 1 then
    raise exception 'invalid country leaderboard comparison parameters';
  end if;

  if not exists (
    select 1
    from public.leaderboard_round_snapshots s
    where s.network = v_network
      and s.round_id = p_previous_round_id
      and s.ranking_algorithm_version = 'recognized_referrals_v3'
  ) then
    return jsonb_build_object(
      'available', false,
      'roundId', p_previous_round_id,
      'ranks', '[]'::jsonb
    );
  end if;

  with parameters as (
    select s.round_end_block, c.reporting_start_at,
           c.reporting_baseline_round_id
    from public.leaderboard_round_snapshots s
    join public.operator_reporting_config c
      on c.id = 1
     and c.reporting_network = v_network
     and c.reporting_start_at is not null
    where s.network = v_network
      and s.round_id = p_previous_round_id
      and s.ranking_algorithm_version = 'recognized_referrals_v3'
  ),
  bound_entries as (
    select
      lower(e.wallet_address) as wallet_address,
      e.entry_class,
      e.created_at,
      i.id as invitation_id
    from public.eligibility_check_events e
    join public.invitations i on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = v_network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW', 'RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
          between p.reporting_baseline_round_id::numeric
              and p_previous_round_id::numeric
      and not public.is_sybil_v2_referral_invalidated(i.invite_code, v_network)
      and exists (
        select 1
        from public.reward_receipts rr
        join public.reward_payout_transaction_settlements rs
          on rs.id = rr.settlement_id
        where rr.invite_code = i.invite_code
          and lower(btrim(rr.recipient_wallet))
              = lower(btrim(i.inviter_wallet))
          and lower(btrim(rr.network)) = v_network
          and lower(btrim(rs.network)) = v_network
          and rr.amount_wei > 0
          and rs.block_number <= p.round_end_block
      )
  ),
  candidates as (
    select b.*,
           row_number() over (
             partition by b.wallet_address, b.entry_class
             order by b.created_at, b.invitation_id
           ) as row_number
    from bound_entries b
  ),
  qualified as (
    select
      case
        when f.country_source in ('TRUSTED_EDGE', 'OPERATOR_VERIFIED')
          and f.country_code ~ '^[A-Z]{2}$' then f.country_code
        when a.country_source = 'TRUSTED_EDGE'
          and a.country_code ~ '^[A-Z]{2}$' then a.country_code
        when b.country_source = 'TRUSTED_EDGE' then b.country_code
        else null
      end as country_code
    from candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
    left join public.referral_country_recovery_facts b
      on b.source_invitation_id = c.invitation_id
      and b.recorded_at <= (
        select min(g.round_end_at)
        from public.operator_latest_round_growth_report_snapshots g
        join public.leaderboard_round_snapshots s
          on s.network=g.network and s.round_id=g.round_id
          and s.round_end_block=g.round_end_block
          and s.ranking_algorithm_version='recognized_referrals_v3'
        where g.network=v_network and g.round_id=p_previous_round_id
      )
    where c.row_number = 1
  ),
  country_totals as (
    select q.country_code, count(*)::bigint as completed_referrals
    from qualified q
    where q.country_code is not null
    group by q.country_code
  ),
  ranked as (
    select country_code,
           rank() over (order by completed_referrals desc)::bigint
             as previous_rank
    from country_totals
  )
  select jsonb_build_object(
    'available', true,
    'roundId', p_previous_round_id,
    'ranks', coalesce(
      (select jsonb_agg(
        jsonb_build_object('countryCode', r.country_code,
                           'rank', r.previous_rank)
        order by r.previous_rank, r.country_code
      ) from ranked r),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$function$;

comment on function public.get_public_country_leaderboard(text,bigint,integer)
is 'Country is attributed only from trusted activation or acquisition country evidence, or a separately recorded later trusted session when both are missing. Display language is never used to infer country. Recovery is not historical activation evidence.';
revoke all on function public.get_public_country_leaderboard(text,bigint,integer) from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer) to service_role;
revoke all on function public.get_public_country_previous_round_ranks(text,bigint) from public, anon, authenticated;
grant execute on function public.get_public_country_previous_round_ranks(text,bigint) to service_role;
