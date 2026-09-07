begin;

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
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
  v_result jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_current_round_id is null or p_current_round_id < 1 then
    raise exception 'invalid current round';
  end if;

  with mission_completion as (
    select
      i.id as invitation_id,
      i.invite_code,
      q.resolved_entry_class as entry_class,
      case
        when f.country_source in ('TRUSTED_EDGE','OPERATOR_VERIFIED')
          and f.country_code ~ '^[A-Z]{2}$'
        then f.country_code
        else null
      end as country_code,
      dapp.dapp_completion_block,
      vot3.vot3_completion_block,
      vote.vote_completion_block,
      vote.vote_round_id,
      greatest(
        dapp.dapp_completion_block,
        vot3.vot3_completion_block,
        vote.vote_completion_block
      ) as completion_block
    from public.invitations i
    join public.qualified_referral_relationships q
      on q.source_invitation_id = i.id
    join lateral (
      select max(first_reward_block)::bigint as dapp_completion_block
      from (
        select
          e.app_id,
          min(e.block_number)::bigint as first_reward_block
        from public.invite_impact_events e
        where e.invite_code = i.invite_code
          and e.network = v_network
          and e.event_type = 'DAPP_REWARD'
          and e.app_id is not null
          and e.block_number is not null
        group by e.app_id
        order by min(e.block_number), e.app_id
        limit 3
      ) first_three_apps
      having count(*) = 3
    ) dapp on true
    join lateral (
      select min(e.block_number)::bigint as vot3_completion_block
      from public.invite_impact_events e
      where e.invite_code = i.invite_code
        and e.network = v_network
        and e.event_type = 'VOT3_CONVERSION'
        and e.block_number is not null
      having count(*) > 0
    ) vot3 on true
    join lateral (
      select
        e.block_number::bigint as vote_completion_block,
        e.vote_round_id
      from public.invite_impact_events e
      where e.invite_code = i.invite_code
        and e.network = v_network
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number is not null
      order by e.block_number, e.tx_index nulls last, e.clause_index nulls last
      limit 1
    ) vote on true
    left join public.referral_activation_country_facts f
      on f.source_invitation_id = i.id
    where i.activation_network = v_network
      and i.status = 'COMPLETED'
      and i.reward_status in ('ELIGIBLE','PAID')
      and i.reward_eligible_at is not null
      and i.sybil_status = 'CLEAR'
      and i.impact_sync_complete_at is not null
      and i.invitee_wallet is not null
      and q.resolved_network = v_network
      and q.resolved_entry_class in ('NEW','RETURNING')
      and i.identity_link_status in ('NO_KNOWN_LINK','OPERATOR_CLEARED')
      and i.identity_link_checked_at is not null
      and public.security_identity_reward_gate_passes(
        i.identity_link_status,
        i.identity_link_checked_at,
        i.vote_completed_at,
        i.identity_link_policy_version,
        i.identity_link_evidence
      )
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
          when m.completion_block = m.vote_completion_block
            and m.vote_round_id is not null
          then m.vote_round_id
          when m.completion_block > coalesce((
            select max(s2.round_end_block)
            from public.operator_round_growth_report_snapshots s2
            where s2.network = v_network
              and s2.round_end_block is not null
          ),0)
          then p_current_round_id
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
    'knownCompleted', (select count(*) from qualified where country_code is not null),
    'unknownCompleted', (select count(*) from qualified where country_code is null),
    'leaders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', l.rank_position,
          'countryCode', l.country_code,
          'completedReferrals', l.completed_referrals,
          'newUsers', l.new_users,
          'returningUsers', l.returning_users,
          'currentRoundCompleted', l.current_round_completed
        ) order by l.rank_position, l.country_code
      )
      from limited l
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_public_country_leaderboard(text,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.get_public_country_leaderboard(text,bigint,integer)
  to postgres, service_role;

comment on function public.get_public_country_leaderboard(text,bigint,integer) is
  'Aggregate country ranking for fully completed, verified NEW/RETURNING VeInvite referrals. Completion round is the first block at which the three distinct dApp rewards, VOT3 conversion, and allocation vote are all satisfied. Uses only coarse activation country and never exposes wallet-to-country mappings or raw IP data.';

commit;