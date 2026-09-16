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
set search_path to 'public'
as $function$
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
    join public.invitations i
      on i.invite_code = r.invite_code
     and lower(btrim(i.inviter_wallet)) = lower(btrim(r.recipient_wallet))
    cross join parameters p
    where lower(btrim(r.network)) = p.network
      and lower(btrim(s.network)) = p.network
      and lower(btrim(q.network)) = p.network
      and r.amount_wei > 0
      and q.reservation_completion_block is not null
      and q.reservation_completion_tx_index is not null
      and q.reservation_completion_clause_index is not null
      and i.sybil_status = 'CLEAR'
      and public.security_identity_reward_gate_passes(
        i.identity_link_status,
        i.identity_link_checked_at,
        i.vote_completed_at,
        i.identity_link_policy_version,
        i.identity_link_evidence
      )
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
$function$;
