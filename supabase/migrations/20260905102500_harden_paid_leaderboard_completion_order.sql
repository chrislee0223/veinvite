-- Paid leaderboard v2 hardening.
-- Eligibility for the leaderboard still requires a finalized B3TR payout.
-- Equal referral counts are ordered by immutable referral-completion provenance,
-- not by claim request time or payout batching order.

alter table public.leaderboard_round_snapshot_rows
  add column if not exists reached_count_tx_index integer;

alter table public.leaderboard_round_snapshot_rows
  drop constraint if exists leaderboard_snapshot_rows_tx_index_check;

alter table public.leaderboard_round_snapshot_rows
  add constraint leaderboard_snapshot_rows_tx_index_check
  check (reached_count_tx_index is null or reached_count_tx_index >= 0);

insert into public.leaderboard_snapshot_activation(
  network,
  ranking_algorithm_version,
  activated_at
)
values
  ('mainnet', 'paid_referrals_v2', now()),
  ('testnet', 'paid_referrals_v2', now()),
  ('testnet-staging', 'paid_referrals_v2', now())
on conflict (network, ranking_algorithm_version) do nothing;

create or replace function public.get_lifetime_paid_referral_ranking_v2_internal(
  p_network text,
  p_max_block bigint default null
)
returns table(
  rank_position bigint,
  wallet_address text,
  completed_referrals bigint,
  total_reward_wei numeric,
  reached_count_block bigint,
  reached_count_tx_index integer,
  reached_count_clause_index integer,
  reached_count_tx_id text
)
language sql
stable
set search_path = public
as $$
  with parameters as (
    select lower(btrim(p_network)) as network
  ), paid_referrals as (
    select
      lower(btrim(r.recipient_wallet)) as wallet_address,
      r.invite_code,
      r.amount_wei::numeric as amount_wei,
      q.reservation_completion_block as completion_block,
      q.reservation_completion_tx_index as completion_tx_index,
      q.reservation_completion_clause_index as completion_clause_index,
      s.block_number as payout_block,
      lower(btrim(s.tx_id)) as payout_tx_id
    from public.reward_receipts r
    join public.reward_payout_transaction_settlements s
      on s.id = r.settlement_id
    join public.reward_queue_entries q
      on q.invite_code = r.invite_code
     and lower(btrim(q.recipient_wallet)) = lower(btrim(r.recipient_wallet))
    cross join parameters p
    where lower(btrim(r.network)) = p.network
      and lower(btrim(s.network)) = p.network
      and lower(btrim(q.network)) = p.network
      and r.amount_wei > 0
      and q.reservation_completion_block is not null
      and q.reservation_completion_tx_index is not null
      and q.reservation_completion_clause_index is not null
      and (
        p_max_block is null
        or (
          s.block_number <= p_max_block
          and q.reservation_completion_block <= p_max_block
        )
      )
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
  ), deduped as (
    select distinct on (wallet_address, invite_code)
      wallet_address,
      invite_code,
      amount_wei,
      completion_block,
      completion_tx_index,
      completion_clause_index,
      payout_block,
      payout_tx_id
    from paid_referrals
    order by
      wallet_address,
      invite_code,
      completion_block asc,
      completion_tx_index asc,
      completion_clause_index asc,
      payout_block asc,
      payout_tx_id asc
  ), totals as (
    select
      wallet_address,
      count(*)::bigint as completed_referrals,
      sum(amount_wei)::numeric as total_reward_wei
    from deduped
    group by wallet_address
  ), reached as (
    select distinct on (wallet_address)
      wallet_address,
      completion_block as reached_count_block,
      completion_tx_index as reached_count_tx_index,
      completion_clause_index as reached_count_clause_index,
      payout_tx_id as reached_count_tx_id
    from deduped
    order by
      wallet_address,
      completion_block desc,
      completion_tx_index desc,
      completion_clause_index desc,
      invite_code desc
  ), ranked as (
    select
      row_number() over (
        order by
          t.completed_referrals desc,
          r.reached_count_block asc,
          r.reached_count_tx_index asc,
          r.reached_count_clause_index asc,
          t.wallet_address asc
      )::bigint as rank_position,
      t.wallet_address,
      t.completed_referrals,
      t.total_reward_wei,
      r.reached_count_block,
      r.reached_count_tx_index,
      r.reached_count_clause_index,
      r.reached_count_tx_id
    from totals t
    join reached r using (wallet_address)
  )
  select * from ranked order by rank_position;
$$;

revoke all on function public.get_lifetime_paid_referral_ranking_v2_internal(text,bigint)
  from public, anon, authenticated;
grant execute on function public.get_lifetime_paid_referral_ranking_v2_internal(text,bigint)
  to service_role;

create or replace function public.get_public_lifetime_leaderboard(
  p_network text,
  p_wallet text default null,
  p_limit integer default 5
)
returns table(
  rank_position bigint,
  wallet_address text,
  completed_referrals bigint,
  total_reward_wei text,
  is_current_wallet boolean
)
language sql
stable
set search_path = public
as $$
  with parameters as (
    select
      lower(nullif(btrim(coalesce(p_wallet, '')), '')) as current_wallet,
      greatest(1, least(coalesce(p_limit, 5), 100)) as entry_limit
  )
  select
    r.rank_position,
    r.wallet_address,
    r.completed_referrals,
    r.total_reward_wei::text,
    r.wallet_address = p.current_wallet as is_current_wallet
  from public.get_lifetime_paid_referral_ranking_v2_internal(p_network, null) r
  cross join parameters p
  where r.rank_position <= p.entry_limit or r.wallet_address = p.current_wallet
  order by r.rank_position;
$$;

revoke all on function public.get_public_lifetime_leaderboard(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.get_public_lifetime_leaderboard(text,text,integer)
  to service_role;

create or replace function public.get_leaderboard_comparison_status(
  p_network text,
  p_round_id bigint,
  p_ranking_algorithm_version text default 'paid_referrals_v2'
)
returns table(
  comparison_available boolean,
  comparison_round_id bigint,
  comparison_end_block bigint,
  comparison_published_at timestamptz,
  comparison_row_count integer,
  ranking_algorithm_version text
)
language sql
stable
set search_path = public
as $$
  select
    s.id is not null as comparison_available,
    p_round_id as comparison_round_id,
    s.round_end_block as comparison_end_block,
    s.published_at as comparison_published_at,
    s.row_count as comparison_row_count,
    p_ranking_algorithm_version as ranking_algorithm_version
  from (select 1) seed
  left join public.leaderboard_round_snapshots s
    on lower(btrim(s.network)) = lower(btrim(p_network))
   and s.round_id = p_round_id
   and s.ranking_algorithm_version = p_ranking_algorithm_version
  limit 1;
$$;

revoke all on function public.get_leaderboard_comparison_status(text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.get_leaderboard_comparison_status(text,bigint,text)
  to service_role;

create or replace function public.get_public_lifetime_leaderboard_v2(
  p_network text,
  p_wallet text default null,
  p_limit integer default 5,
  p_comparison_round_id bigint default null,
  p_ranking_algorithm_version text default 'paid_referrals_v2'
)
returns table(
  rank_position bigint,
  wallet_address text,
  completed_referrals bigint,
  total_reward_wei text,
  is_current_wallet boolean,
  previous_rank bigint,
  rank_change bigint,
  rank_movement text
)
language sql
stable
set search_path = public
as $$
  with parameters as (
    select
      lower(nullif(btrim(coalesce(p_wallet, '')), '')) as current_wallet,
      greatest(1, least(coalesce(p_limit, 5), 100)) as entry_limit
  ), baseline as (
    select id
    from public.leaderboard_round_snapshots
    where lower(btrim(network)) = lower(btrim(p_network))
      and round_id = p_comparison_round_id
      and ranking_algorithm_version = p_ranking_algorithm_version
    limit 1
  ), current_ranked as (
    select *
    from public.get_lifetime_paid_referral_ranking_v2_internal(p_network, null)
  )
  select
    c.rank_position,
    c.wallet_address,
    c.completed_referrals,
    c.total_reward_wei::text,
    c.wallet_address = p.current_wallet as is_current_wallet,
    prev.rank_position as previous_rank,
    case
      when b.id is null or prev.rank_position is null then null
      else prev.rank_position - c.rank_position
    end as rank_change,
    case
      when b.id is null then 'UNAVAILABLE'
      when prev.rank_position is null then 'NEW'
      when prev.rank_position > c.rank_position then 'UP'
      when prev.rank_position < c.rank_position then 'DOWN'
      else 'SAME'
    end as rank_movement
  from current_ranked c
  cross join parameters p
  left join baseline b on true
  left join public.leaderboard_round_snapshot_rows prev
    on prev.snapshot_id = b.id
   and prev.wallet_address = c.wallet_address
  where c.rank_position <= p.entry_limit or c.wallet_address = p.current_wallet
  order by c.rank_position;
$$;

revoke all on function public.get_public_lifetime_leaderboard_v2(text,text,integer,bigint,text)
  from public, anon, authenticated;
grant execute on function public.get_public_lifetime_leaderboard_v2(text,text,integer,bigint,text)
  to service_role;

create or replace function public.publish_leaderboard_round_snapshots(
  p_network text,
  p_ranking_algorithm_version text default 'paid_referrals_v2'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_network text := lower(btrim(p_network));
  v_activation timestamptz;
  v_growth record;
  v_snapshot_id bigint;
  v_expected_count integer;
  v_actual_count integer;
  v_expected_hash text;
  v_actual_hash text;
  v_published integer := 0;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported leaderboard network';
  end if;
  if p_ranking_algorithm_version <> 'paid_referrals_v2' then
    raise exception 'unsupported leaderboard ranking algorithm version';
  end if;

  select activated_at into v_activation
  from public.leaderboard_snapshot_activation
  where network = v_network
    and ranking_algorithm_version = p_ranking_algorithm_version;

  if v_activation is null then
    raise exception 'leaderboard snapshot activation is missing';
  end if;

  for v_growth in
    with latest_growth as (
      select distinct on (round_id)
        round_id,
        round_end_at,
        round_end_block,
        source_checked_through_block,
        version
      from public.operator_round_growth_report_snapshots
      where lower(btrim(network)) = v_network
        and round_end_at >= v_activation
        and source_checked_through_block >= round_end_block
      order by round_id, version desc
    )
    select * from latest_growth g
    where not exists (
      select 1
      from public.leaderboard_round_snapshots s
      where s.network = v_network
        and s.round_id = g.round_id
        and s.ranking_algorithm_version = p_ranking_algorithm_version
    )
    order by round_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_leaderboard_snapshot_' || v_network || '_' || v_growth.round_id::text,
        0
      )
    );

    if exists (
      select 1
      from public.leaderboard_round_snapshots s
      where s.network = v_network
        and s.round_id = v_growth.round_id
        and s.ranking_algorithm_version = p_ranking_algorithm_version
    ) then
      continue;
    end if;

    select
      count(*)::integer,
      encode(
        digest(
          convert_to(
            coalesce(
              string_agg(
                concat_ws(
                  '|',
                  rank_position::text,
                  wallet_address,
                  completed_referrals::text,
                  total_reward_wei::text,
                  reached_count_block::text,
                  reached_count_tx_index::text,
                  reached_count_clause_index::text,
                  reached_count_tx_id
                ),
                E'\n' order by rank_position
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    into v_expected_count, v_expected_hash
    from public.get_lifetime_paid_referral_ranking_v2_internal(
      v_network,
      v_growth.round_end_block
    );

    insert into public.leaderboard_round_snapshots(
      network,
      round_id,
      round_end_block,
      source_checked_through_block,
      ranking_algorithm_version,
      row_count,
      content_sha256
    ) values (
      v_network,
      v_growth.round_id,
      v_growth.round_end_block,
      v_growth.source_checked_through_block,
      p_ranking_algorithm_version,
      v_expected_count,
      v_expected_hash
    ) returning id into v_snapshot_id;

    insert into public.leaderboard_round_snapshot_rows(
      snapshot_id,
      wallet_address,
      rank_position,
      completed_referrals,
      total_reward_wei,
      reached_count_block,
      reached_count_tx_id,
      reached_count_tx_index,
      reached_count_clause_index
    )
    select
      v_snapshot_id,
      wallet_address,
      rank_position,
      completed_referrals,
      total_reward_wei,
      reached_count_block,
      reached_count_tx_id,
      reached_count_tx_index,
      reached_count_clause_index
    from public.get_lifetime_paid_referral_ranking_v2_internal(
      v_network,
      v_growth.round_end_block
    );

    select
      count(*)::integer,
      encode(
        digest(
          convert_to(
            coalesce(
              string_agg(
                concat_ws(
                  '|',
                  rank_position::text,
                  wallet_address,
                  completed_referrals::text,
                  total_reward_wei::text,
                  reached_count_block::text,
                  reached_count_tx_index::text,
                  reached_count_clause_index::text,
                  reached_count_tx_id
                ),
                E'\n' order by rank_position
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    into v_actual_count, v_actual_hash
    from public.leaderboard_round_snapshot_rows
    where snapshot_id = v_snapshot_id;

    if v_actual_count <> v_expected_count or v_actual_hash <> v_expected_hash then
      raise exception 'leaderboard snapshot validation failed for round %', v_growth.round_id;
    end if;

    v_published := v_published + 1;
  end loop;

  return jsonb_build_object(
    'network', v_network,
    'rankingAlgorithmVersion', p_ranking_algorithm_version,
    'publishedCount', v_published
  );
end;
$$;

revoke all on function public.publish_leaderboard_round_snapshots(text,text)
  from public, anon, authenticated;
grant execute on function public.publish_leaderboard_round_snapshots(text,text)
  to service_role;
