begin;

-- Operator usage reports follow the exact VeBetterDAO voting-round window.
-- The API resolves the round boundaries from the reviewed on-chain contract
-- and passes them into these service-role-only reporting functions.

create index if not exists invitations_created_at_idx
  on public.invitations (created_at desc);

create index if not exists invitations_eligibility_check_id_idx
  on public.invitations (eligibility_check_id)
  where eligibility_check_id is not null;

create index if not exists eligibility_check_events_round_idx
  on public.eligibility_check_events (
    network,
    (details ->> 'currentRoundId'),
    outcome,
    created_at desc
  )
  where details ? 'currentRoundId';

create index if not exists invite_impact_events_network_block_idx
  on public.invite_impact_events (network, block_number, id);

create index if not exists reward_receipts_vebetter_round_idx
  on public.reward_receipts (network, vebetter_round_id, id);

create or replace function public.get_operator_round_overview(
  p_network text,
  p_vebetter_round_id bigint,
  p_round_start_at timestamptz,
  p_round_end_at timestamptz,
  p_round_start_block bigint,
  p_round_end_block bigint
)
returns table (
  invitations_created bigint,
  unique_inviters bigint,
  claimed_invitations bigint,
  verified_new_invitees bigint,
  verified_returning_invitees bigint,
  active_existing_rejections bigint,
  legacy_unclassified_claims bigint,
  completed_referrals bigint,
  currently_eligible_referrals bigint,
  paid_referrals bigint,
  total_veinvite_reward_wei numeric,
  qualifying_dapp_reward_events bigint,
  total_qualifying_dapp_reward_wei numeric,
  flagged_referrals bigint,
  latest_recorded_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  with round_invitations as (
    select i.*
    from public.invitations i
    where i.created_at >= p_round_start_at
      and i.created_at <= p_round_end_at
  ),
  round_entry_checks as (
    select e.*
    from public.eligibility_check_events e
    where e.network = p_network
      and e.details ->> 'currentRoundId' = p_vebetter_round_id::text
  ),
  eligible_round_claims as (
    select i.*, e.entry_class, e.created_at as entry_checked_at
    from round_entry_checks e
    join public.invitations i
      on i.eligibility_check_id = e.id
    where e.outcome = 'ELIGIBLE'
  ),
  round_impact as (
    select e.*
    from public.invite_impact_events e
    where e.network = p_network
      and e.block_number between p_round_start_block and p_round_end_block
  ),
  round_receipts as (
    select r.*
    from public.reward_receipts r
    where r.network = p_network
      and r.vebetter_round_id = p_vebetter_round_id
  )
  select
    (select count(*)::bigint from round_invitations),
    (
      select count(distinct lower(btrim(i.inviter_wallet)))::bigint
      from round_invitations i
      where lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'
    ),
    (select count(*)::bigint from eligible_round_claims),
    (
      select count(*)::bigint
      from eligible_round_claims c
      where c.entry_class = 'NEW'
    ),
    (
      select count(*)::bigint
      from eligible_round_claims c
      where c.entry_class = 'RETURNING'
    ),
    (
      select count(*)::bigint
      from round_entry_checks e
      where e.outcome = 'EXISTING_VEBETTER_USER'
        and e.entry_class = 'ACTIVE_EXISTING'
    ),
    (
      select count(*)::bigint
      from public.invitations i
      where i.activated_at >= p_round_start_at
        and i.activated_at <= p_round_end_at
        and i.eligibility_check_id is null
    ),
    (
      select count(*)::bigint
      from public.invitations i
      where i.eligibility_check_id is not null
        and i.status = 'COMPLETED'
        and i.apps_completed >= 3
        and i.vot3_converted is true
        and i.vote_completed is true
        and greatest(
          i.apps_completed_block,
          i.vot3_converted_block,
          i.vote_completed_block
        ) between p_round_start_block and p_round_end_block
    ),
    (
      select count(*)::bigint
      from eligible_round_claims c
      where c.reward_status = 'ELIGIBLE'
    ),
    (
      select count(distinct r.invite_code)::bigint
      from round_receipts r
    ),
    (
      select coalesce(sum(r.amount_wei), 0::numeric)
      from round_receipts r
    ),
    (
      select count(*)::bigint
      from round_impact e
      where e.event_type = 'DAPP_REWARD'
    ),
    (
      select coalesce(sum(e.amount_wei::numeric), 0::numeric)
      from round_impact e
      where e.event_type = 'DAPP_REWARD'
    ),
    (
      select count(*)::bigint
      from eligible_round_claims c
      where c.sybil_status in ('REVIEW', 'BLOCKED')
    ),
    greatest(
      (select max(i.updated_at) from round_invitations i),
      (select max(e.created_at) from round_entry_checks e),
      (select max(e.detected_at) from round_impact e),
      (select max(r.created_at) from round_receipts r)
    );
$function$;

comment on function public.get_operator_round_overview(
  text, bigint, timestamptz, timestamptz, bigint, bigint
) is
  'VeBetterDAO-round-scoped operator funnel. Entry classes use immutable eligibility proofs; on-chain impacts use exact round blocks.';

create or replace function public.get_operator_round_inviter_analytics(
  p_network text,
  p_vebetter_round_id bigint,
  p_round_start_at timestamptz,
  p_round_end_at timestamptz,
  p_round_start_block bigint,
  p_round_end_block bigint,
  p_limit integer default 100
)
returns table (
  wallet_address text,
  invitations_created bigint,
  claimed_invitations bigint,
  unique_invitees bigint,
  verified_new_invitees bigint,
  verified_returning_invitees bigint,
  completed_referrals bigint,
  currently_eligible_referrals bigint,
  paid_referrals bigint,
  reward_receipt_count bigint,
  total_veinvite_reward_wei numeric,
  flagged_referrals bigint,
  first_invite_at timestamptz,
  last_activity_at timestamptz,
  last_reward_paid_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  with created_stats as (
    select
      lower(btrim(i.inviter_wallet)) as wallet_address,
      count(*)::bigint as invitations_created,
      min(i.created_at) as first_invite_at,
      max(i.created_at) as last_invite_at
    from public.invitations i
    where i.created_at >= p_round_start_at
      and i.created_at <= p_round_end_at
      and lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'
    group by lower(btrim(i.inviter_wallet))
  ),
  claim_rows as (
    select
      lower(btrim(i.inviter_wallet)) as wallet_address,
      lower(btrim(e.wallet_address)) as invitee_wallet,
      e.entry_class,
      e.created_at as entry_checked_at,
      i.reward_status,
      i.sybil_status
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    where e.network = p_network
      and e.details ->> 'currentRoundId' = p_vebetter_round_id::text
      and e.outcome = 'ELIGIBLE'
  ),
  claim_stats as (
    select
      c.wallet_address,
      count(*)::bigint as claimed_invitations,
      count(distinct c.invitee_wallet)::bigint as unique_invitees,
      count(*) filter (where c.entry_class = 'NEW')::bigint
        as verified_new_invitees,
      count(*) filter (where c.entry_class = 'RETURNING')::bigint
        as verified_returning_invitees,
      count(*) filter (where c.reward_status = 'ELIGIBLE')::bigint
        as currently_eligible_referrals,
      count(*) filter (
        where c.sybil_status in ('REVIEW', 'BLOCKED')
      )::bigint as flagged_referrals,
      max(c.entry_checked_at) as last_claim_at
    from claim_rows c
    group by c.wallet_address
  ),
  completion_stats as (
    select
      lower(btrim(i.inviter_wallet)) as wallet_address,
      count(*)::bigint as completed_referrals,
      max(greatest(
        i.apps_completed_at,
        i.vot3_converted_at,
        i.vote_completed_at
      )) as last_completion_at
    from public.invitations i
    where i.eligibility_check_id is not null
      and i.status = 'COMPLETED'
      and i.apps_completed >= 3
      and i.vot3_converted is true
      and i.vote_completed is true
      and greatest(
        i.apps_completed_block,
        i.vot3_converted_block,
        i.vote_completed_block
      ) between p_round_start_block and p_round_end_block
    group by lower(btrim(i.inviter_wallet))
  ),
  reward_stats as (
    select
      lower(btrim(r.recipient_wallet)) as wallet_address,
      count(*)::bigint as reward_receipt_count,
      count(distinct r.invite_code)::bigint as paid_referrals,
      sum(r.amount_wei) as total_veinvite_reward_wei,
      max(r.paid_at) as last_reward_paid_at
    from public.reward_receipts r
    where r.network = p_network
      and r.vebetter_round_id = p_vebetter_round_id
    group by lower(btrim(r.recipient_wallet))
  ),
  wallets as (
    select c.wallet_address from created_stats c
    union
    select c.wallet_address from claim_stats c
    union
    select c.wallet_address from completion_stats c
    union
    select r.wallet_address from reward_stats r
  )
  select
    w.wallet_address,
    coalesce(c.invitations_created, 0::bigint),
    coalesce(q.claimed_invitations, 0::bigint),
    coalesce(q.unique_invitees, 0::bigint),
    coalesce(q.verified_new_invitees, 0::bigint),
    coalesce(q.verified_returning_invitees, 0::bigint),
    coalesce(x.completed_referrals, 0::bigint),
    coalesce(q.currently_eligible_referrals, 0::bigint),
    coalesce(r.paid_referrals, 0::bigint),
    coalesce(r.reward_receipt_count, 0::bigint),
    coalesce(r.total_veinvite_reward_wei, 0::numeric),
    coalesce(q.flagged_referrals, 0::bigint),
    c.first_invite_at,
    greatest(
      c.last_invite_at,
      q.last_claim_at,
      x.last_completion_at,
      r.last_reward_paid_at
    ),
    r.last_reward_paid_at
  from wallets w
  left join created_stats c using (wallet_address)
  left join claim_stats q using (wallet_address)
  left join completion_stats x using (wallet_address)
  left join reward_stats r using (wallet_address)
  order by
    coalesce(c.invitations_created, 0::bigint) desc,
    coalesce(q.claimed_invitations, 0::bigint) desc,
    w.wallet_address asc
  limit greatest(1, least(p_limit, 100));
$function$;

comment on function public.get_operator_round_inviter_analytics(
  text, bigint, timestamptz, timestamptz, bigint, bigint, integer
) is
  'Inviter funnel for one exact VeBetterDAO round; link creation and proven claims are reported separately.';

create or replace function public.get_operator_round_reward_recipients(
  p_network text,
  p_vebetter_round_id bigint,
  p_limit integer default 100
)
returns table (
  network text,
  vebetter_round_id bigint,
  wallet_address text,
  reward_receipt_count bigint,
  paid_referral_count bigint,
  total_reward_wei numeric,
  first_paid_at timestamptz,
  last_paid_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    r.network,
    r.vebetter_round_id,
    lower(btrim(r.recipient_wallet)) as wallet_address,
    count(*)::bigint as reward_receipt_count,
    count(distinct r.invite_code)::bigint as paid_referral_count,
    sum(r.amount_wei) as total_reward_wei,
    min(r.paid_at) as first_paid_at,
    max(r.paid_at) as last_paid_at
  from public.reward_receipts r
  where r.network = p_network
    and r.vebetter_round_id = p_vebetter_round_id
  group by
    r.network,
    r.vebetter_round_id,
    lower(btrim(r.recipient_wallet))
  order by
    sum(r.amount_wei) desc,
    count(*) desc,
    lower(btrim(r.recipient_wallet)) asc
  limit greatest(1, least(p_limit, 100));
$function$;

comment on function public.get_operator_round_reward_recipients(
  text, bigint, integer
) is
  'Immutable VeInvite referral reward receipts for one VeBetterDAO round.';

create or replace function public.get_operator_round_dapp_rewards(
  p_network text,
  p_vebetter_round_id bigint,
  p_round_start_block bigint,
  p_round_end_block bigint,
  p_limit integer default 100
)
returns table (
  network text,
  vebetter_round_id bigint,
  wallet_address text,
  qualifying_reward_event_count bigint,
  invite_count bigint,
  distinct_dapp_count bigint,
  total_qualifying_reward_wei numeric,
  first_reward_at timestamptz,
  last_reward_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    e.network,
    p_vebetter_round_id,
    lower(btrim(e.wallet_address)) as wallet_address,
    count(*)::bigint as qualifying_reward_event_count,
    count(distinct e.invite_code)::bigint as invite_count,
    count(distinct e.app_id)::bigint as distinct_dapp_count,
    sum(e.amount_wei::numeric) as total_qualifying_reward_wei,
    min(e.block_timestamp) as first_reward_at,
    max(e.block_timestamp) as last_reward_at
  from public.invite_impact_events e
  where e.network = p_network
    and e.event_type = 'DAPP_REWARD'
    and e.block_number between p_round_start_block and p_round_end_block
  group by
    e.network,
    lower(btrim(e.wallet_address))
  order by
    sum(e.amount_wei::numeric) desc,
    count(*) desc,
    lower(btrim(e.wallet_address)) asc
  limit greatest(1, least(p_limit, 100));
$function$;

comment on function public.get_operator_round_dapp_rewards(
  text, bigint, bigint, bigint, integer
) is
  'Verified VeInvite dApp mission rewards whose on-chain block is inside one VeBetterDAO round.';

revoke all on function public.get_operator_round_overview(
  text, bigint, timestamptz, timestamptz, bigint, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.get_operator_round_inviter_analytics(
  text, bigint, timestamptz, timestamptz, bigint, bigint, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_operator_round_reward_recipients(
  text, bigint, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_operator_round_dapp_rewards(
  text, bigint, bigint, bigint, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_operator_round_overview(
  text, bigint, timestamptz, timestamptz, bigint, bigint
) to service_role;
grant execute on function public.get_operator_round_inviter_analytics(
  text, bigint, timestamptz, timestamptz, bigint, bigint, integer
) to service_role;
grant execute on function public.get_operator_round_reward_recipients(
  text, bigint, integer
) to service_role;
grant execute on function public.get_operator_round_dapp_rewards(
  text, bigint, bigint, bigint, integer
) to service_role;

commit;
