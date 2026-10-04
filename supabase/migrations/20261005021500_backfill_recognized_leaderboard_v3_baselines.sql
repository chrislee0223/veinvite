begin;

-- Preserve every immutable v2 snapshot, but use its reviewed round boundary to
-- publish a fresh v3 baseline under the current recognized-referral policy.
-- This intentionally re-applies authoritative referral invalidations that may
-- have been decided after the historical v2 snapshot was published.
do $$
declare
  v_source public.leaderboard_round_snapshots%rowtype;
  v_target public.leaderboard_round_snapshots%rowtype;
  v_expected_count integer;
  v_expected_hash text;
  v_actual_count integer;
  v_actual_hash text;
begin
  for v_source in
    select *
    from public.leaderboard_round_snapshots s
    where s.ranking_algorithm_version='paid_referrals_v2'
    order by s.network,s.round_id
  loop
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
    into v_expected_count,v_expected_hash
    from public.get_lifetime_recognized_referral_ranking_v3_internal(
      v_source.network,
      v_source.round_end_block
    );

    select * into v_target
    from public.leaderboard_round_snapshots s
    where s.network=v_source.network
      and s.round_id=v_source.round_id
      and s.ranking_algorithm_version='recognized_referrals_v3'
    limit 1;

    if not found then
      insert into public.leaderboard_round_snapshots(
        network,
        round_id,
        round_end_block,
        source_checked_through_block,
        ranking_algorithm_version,
        row_count,
        content_sha256
      ) values (
        v_source.network,
        v_source.round_id,
        v_source.round_end_block,
        v_source.source_checked_through_block,
        'recognized_referrals_v3',
        v_expected_count,
        v_expected_hash
      )
      returning * into v_target;

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
        v_target.id,
        wallet_address,
        rank_position,
        completed_referrals,
        total_reward_wei,
        reached_count_block,
        reached_count_tx_id,
        reached_count_tx_index,
        reached_count_clause_index
      from public.get_lifetime_recognized_referral_ranking_v3_internal(
        v_source.network,
        v_source.round_end_block
      );
    else
      if v_target.round_end_block<>v_source.round_end_block
         or v_target.row_count<>v_expected_count
         or v_target.content_sha256<>v_expected_hash then
        raise exception
          'LEADERBOARD_V3_EXISTING_BASELINE_MISMATCH network=% round=%',
          v_source.network,
          v_source.round_id;
      end if;
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
    into v_actual_count,v_actual_hash
    from public.leaderboard_round_snapshot_rows
    where snapshot_id=v_target.id;

    if v_actual_count<>v_expected_count
       or v_actual_hash<>v_expected_hash then
      raise exception
        'LEADERBOARD_V3_BASELINE_VALIDATION_FAILED network=% round=%',
        v_source.network,
        v_source.round_id;
    end if;
  end loop;
end;
$$;

commit;
