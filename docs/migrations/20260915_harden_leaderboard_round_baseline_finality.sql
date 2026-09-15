-- Harden the on-demand previous-round leaderboard baseline so it cannot be
-- frozen while an already-submitted payout may still settle across the round
-- boundary. The immutable payout checkpoint is chain-native and avoids relying
-- on application wall-clock timing near VeBetterDAO round turnover.

create or replace function public.publish_leaderboard_round_snapshot_if_missing(
  p_network text,
  p_round_id bigint,
  p_round_end_block bigint,
  p_round_end_at timestamptz,
  p_ranking_algorithm_version text default 'paid_referrals_v2'
)
returns jsonb
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_activation timestamptz;
  v_existing public.leaderboard_round_snapshots%rowtype;
  v_snapshot_id bigint;
  v_published_at timestamptz;
  v_expected_count integer;
  v_actual_count integer;
  v_expected_hash text;
  v_actual_hash text;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'unsupported leaderboard network';
  end if;

  if p_ranking_algorithm_version <> 'paid_referrals_v2' then
    raise exception 'unsupported leaderboard ranking algorithm version';
  end if;

  if p_round_id is null or p_round_id < 1 then
    raise exception 'round_id must be positive';
  end if;

  if p_round_end_block is null or p_round_end_block < 0 then
    raise exception 'round_end_block must be non-negative';
  end if;

  if p_round_end_at is null then
    raise exception 'round_end_at is required';
  end if;

  select activated_at
  into v_activation
  from public.leaderboard_snapshot_activation
  where network = v_network
    and ranking_algorithm_version = p_ranking_algorithm_version;

  if v_activation is null then
    raise exception 'leaderboard snapshot activation is missing';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_leaderboard_snapshot_' || v_network || '_' || p_round_id::text,
      0
    )
  );

  select *
  into v_existing
  from public.leaderboard_round_snapshots
  where network = v_network
    and round_id = p_round_id
    and ranking_algorithm_version = p_ranking_algorithm_version
  limit 1;

  if found then
    if v_existing.round_end_block <> p_round_end_block then
      raise exception 'existing leaderboard snapshot round end block does not match the reviewed chain';
    end if;

    return jsonb_build_object(
      'network', v_network,
      'roundId', p_round_id,
      'roundEndBlock', v_existing.round_end_block,
      'rankingAlgorithmVersion', p_ranking_algorithm_version,
      'ready', true,
      'created', false,
      'snapshotId', v_existing.id,
      'rowCount', v_existing.row_count,
      'publishedAt', v_existing.published_at
    );
  end if;

  if p_round_end_at < v_activation then
    return jsonb_build_object(
      'network', v_network,
      'roundId', p_round_id,
      'roundEndBlock', p_round_end_block,
      'rankingAlgorithmVersion', p_ranking_algorithm_version,
      'ready', false,
      'created', false,
      'snapshotId', null,
      'rowCount', null,
      'publishedAt', null,
      'reason', 'ROUND_PRECEDES_SNAPSHOT_ACTIVATION'
    );
  end if;

  if exists (
    select 1
    from public.reward_payout_transaction_submissions sub
    join public.reward_payout_manifest_chain_checkpoints cp
      on cp.manifest_id = sub.manifest_id
    join public.reward_rounds rr
      on rr.id = sub.round_id
    left join public.reward_payout_transaction_settlements settled
      on settled.manifest_id = sub.manifest_id
    where lower(btrim(sub.network)) = v_network
      and lower(btrim(rr.network)) = v_network
      and rr.status in ('CREATED', 'PAYING')
      and cp.block_number <= p_round_end_block
      and settled.id is null
  ) then
    return jsonb_build_object(
      'network', v_network,
      'roundId', p_round_id,
      'roundEndBlock', p_round_end_block,
      'rankingAlgorithmVersion', p_ranking_algorithm_version,
      'ready', false,
      'created', false,
      'snapshotId', null,
      'rowCount', null,
      'publishedAt', null,
      'reason', 'AWAITING_PRE_BOUNDARY_PAYOUT_FINALITY'
    );
  end if;

  if not exists (
    select 1
    from public.reward_payout_transaction_settlements s
    where lower(btrim(s.network)) = v_network
      and s.block_number > p_round_end_block
  ) then
    return jsonb_build_object(
      'network', v_network,
      'roundId', p_round_id,
      'roundEndBlock', p_round_end_block,
      'rankingAlgorithmVersion', p_ranking_algorithm_version,
      'ready', false,
      'created', false,
      'snapshotId', null,
      'rowCount', null,
      'publishedAt', null,
      'reason', 'AWAITING_CURRENT_ROUND_PAID_ACTIVITY'
    );
  end if;

  select
    count(*)::integer,
    encode(
      extensions.digest(
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
    p_round_end_block
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
    p_round_id,
    p_round_end_block,
    p_round_end_block,
    p_ranking_algorithm_version,
    v_expected_count,
    v_expected_hash
  )
  returning id, published_at
  into v_snapshot_id, v_published_at;

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
    p_round_end_block
  );

  select
    count(*)::integer,
    encode(
      extensions.digest(
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
    raise exception 'leaderboard snapshot validation failed for round %', p_round_id;
  end if;

  return jsonb_build_object(
    'network', v_network,
    'roundId', p_round_id,
    'roundEndBlock', p_round_end_block,
    'rankingAlgorithmVersion', p_ranking_algorithm_version,
    'ready', true,
    'created', true,
    'snapshotId', v_snapshot_id,
    'rowCount', v_expected_count,
    'publishedAt', v_published_at
  );
end;
$function$;

revoke all on function public.publish_leaderboard_round_snapshot_if_missing(text, bigint, bigint, timestamptz, text) from public;
revoke all on function public.publish_leaderboard_round_snapshot_if_missing(text, bigint, bigint, timestamptz, text) from anon;
revoke all on function public.publish_leaderboard_round_snapshot_if_missing(text, bigint, bigint, timestamptz, text) from authenticated;
grant execute on function public.publish_leaderboard_round_snapshot_if_missing(text, bigint, bigint, timestamptz, text) to service_role;
