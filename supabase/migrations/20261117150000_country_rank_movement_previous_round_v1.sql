-- Read-only previous-round country ranking for the country movement UI.
-- The immutable recognized-referral leaderboard snapshot supplies the exact
-- chain cutoff; no current-round settlements may backfill a previous rank.
create or replace function public.get_public_country_previous_round_ranks(
  p_network text,
  p_previous_round_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
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
        else null
      end as country_code
    from candidates c
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = c.invitation_id
    left join public.referral_acquisition_country_facts a
      on a.source_invitation_id = c.invitation_id
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

-- A public leaderboard is still served through the rate-limited application
-- API. Browser roles may not directly invoke this definer function.
revoke all on function public.get_public_country_previous_round_ranks(text, bigint) from public;
revoke all on function public.get_public_country_previous_round_ranks(text, bigint) from anon;
revoke all on function public.get_public_country_previous_round_ranks(text, bigint) from authenticated;
grant execute on function public.get_public_country_previous_round_ranks(text, bigint) to service_role;
