-- VeInvite policy: the VOT3 conversion mission proves that the invitee made
-- one real B3TR -> VOT3 conversion after their first qualifying dApp reward.
-- VeInvite does not impose a 1 B3TR conversion minimum; any positive amount
-- qualifies. VeBetterDAO independently enforces the voting-power threshold
-- when the invitee later casts the required allocation-round vote.

begin;

alter table public.invitations
  drop constraint if exists invitations_vot3_conversion_shape_check;

alter table public.invitations
  add constraint invitations_vot3_conversion_shape_check
  check (
    (
      vot3_converted = false
      and vot3_converted_at is null
      and vot3_converted_block is null
      and vot3_conversion_tx_id is null
      and vot3_conversion_amount_wei is null
    )
    or
    (
      vot3_converted = true
      and vot3_converted_at is not null
      and vot3_converted_block is not null
      and vot3_converted_block >= 0
      and activation_block is not null
      and vot3_converted_block >= activation_block
      and vot3_conversion_tx_id ~ '^0x[0-9a-f]{64}$'
      and vot3_conversion_amount_wei ~ '^[0-9]+$'
      and vot3_conversion_amount_wei::numeric > 0
    )
  );

create or replace function public.sync_invitation_reward_eligibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_has_paid_payout boolean := false;
  v_has_eligible_entry_check boolean := false;
  v_has_three_reward_events boolean := false;
  v_has_third_app_checkpoint boolean := false;
  v_has_conversion_event boolean := false;
  v_has_vote_event boolean := false;
begin
  select exists(
    select 1
    from public.reward_payouts rp
    where rp.invite_code = new.invite_code
      and rp.status = 'PAID'
      and rp.tx_id is not null
      and rp.paid_at is not null
  ) into v_has_paid_payout;

  if v_has_paid_payout then
    new.reward_status := 'PAID';
    if new.reward_paid_at is null then
      select rp.paid_at
      into new.reward_paid_at
      from public.reward_payouts rp
      where rp.invite_code = new.invite_code
        and rp.status = 'PAID'
      order by rp.paid_at desc
      limit 1;
    end if;
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' or new.sybil_status = 'BLOCKED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or coalesce(new.apps_completed, 0) < 3
     or new.apps_completed_at is null
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
  end if;

  if coalesce(new.vot3_converted, false) = false
     or new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or new.vot3_converted_at is null
     or new.vot3_converted_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_conversion_amount_wei is null
     or new.vot3_converted_block < new.activation_block
     or new.vot3_conversion_tx_id !~ '^0x[0-9a-f]{64}$'
     or new.vot3_conversion_amount_wei !~ '^[0-9]+$'
     or new.vot3_conversion_amount_wei::numeric <= 0 then
    new.vot3_converted := false;
    new.vot3_converted_at := null;
    new.vot3_converted_block := null;
    new.vot3_conversion_tx_id := null;
    new.vot3_conversion_amount_wei := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    if coalesce(new.vote_completed, false) = false
       or new.vote_completed_at is null
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.vot3_converted_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.eligibility_check_id is not null
     and new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null then
    select exists(
      select 1
      from public.eligibility_check_events e
      where e.id = new.eligibility_check_id
        and e.invite_code = new.invite_code
        and e.wallet_address = lower(new.invitee_wallet)
        and e.network = new.activation_network
        and e.outcome = 'ELIGIBLE'
        and e.entry_class in ('NEW', 'RETURNING')
        and e.checked_block <= new.activation_block
    ) into v_has_eligible_entry_check;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null then
    select count(distinct e.app_id) >= 3
    into v_has_three_reward_events
    from public.invite_impact_events e
    where e.invite_code = new.invite_code
      and e.network = new.activation_network
      and e.wallet_address = lower(new.invitee_wallet)
      and e.event_type = 'DAPP_REWARD'
      and e.block_number >= new.activation_block
      and e.block_number <= new.apps_completed_block;

    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'DAPP_REWARD'
        and e.block_number = new.apps_completed_block
        and e.block_timestamp = new.apps_completed_at
    ) into v_has_third_app_checkpoint;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null then
    select exists(
      select 1
      from public.invite_impact_events c
      where c.invite_code = new.invite_code
        and c.network = new.activation_network
        and c.wallet_address = lower(new.invitee_wallet)
        and c.event_type = 'VOT3_CONVERSION'
        and c.tx_id = new.vot3_conversion_tx_id
        and c.block_number = new.vot3_converted_block
        and c.block_timestamp = new.vot3_converted_at
        and c.amount_wei = new.vot3_conversion_amount_wei
        and c.amount_wei ~ '^[0-9]+$'
        and c.amount_wei::numeric > 0
        and exists(
          select 1
          from public.invite_impact_events r
          where r.invite_code = new.invite_code
            and r.network = new.activation_network
            and r.wallet_address = lower(new.invitee_wallet)
            and r.event_type = 'DAPP_REWARD'
            and r.block_number >= new.activation_block
            and r.block_number <= c.block_number
        )
    ) into v_has_conversion_event;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.vot3_converted_block is not null
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null then
    select exists(
      select 1
      from public.invite_impact_events e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number = new.vote_completed_block
        and e.block_timestamp = new.vote_completed_at
        and e.vote_round_id = new.vote_round_id
        and e.block_number >= new.vot3_converted_block
    ) into v_has_vote_event;
  end if;

  if new.status = 'COMPLETED'
     and v_has_eligible_entry_check
     and v_has_three_reward_events
     and v_has_third_app_checkpoint
     and v_has_conversion_event
     and v_has_vote_event
     and new.impact_sync_complete_at is not null
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and new.activation_network is not null
     and coalesce(new.apps_completed, 0) >= 3
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_converted_block >= new.activation_block
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null
     and new.vot3_conversion_amount_wei::numeric > 0
     and coalesce(new.vote_completed, false) = true
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.vot3_converted_block
     and new.sybil_status = 'CLEAR'
     and new.sybil_checked_at is not null
     and new.sybil_checked_at >= new.vote_completed_at then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(new.reward_eligible_at, new.impact_sync_complete_at, new.sybil_checked_at, new.vote_completed_at, now());
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$$;

create or replace view public.operator_invitee_mission_diagnostics
with (security_invoker = true)
as
with impact_summary as (
  select
    invite_code,
    min(block_number) filter (where event_type = 'DAPP_REWARD') as first_dapp_reward_block,
    count(distinct app_id) filter (where event_type = 'DAPP_REWARD') as distinct_dapp_reward_count,
    count(*) filter (where event_type = 'VOT3_CONVERSION') as conversion_event_count,
    max(amount_wei::numeric) filter (where event_type = 'VOT3_CONVERSION' and amount_wei ~ '^[0-9]+$') as max_conversion_amount_wei,
    min(block_number) filter (where event_type = 'VOT3_CONVERSION' and amount_wei ~ '^[0-9]+$' and amount_wei::numeric > 0) as first_minimum_conversion_block
  from public.invite_impact_events
  group by invite_code
)
select
  i.invite_code, i.inviter_wallet, i.invitee_wallet, i.activation_network, i.activation_block,
  ec.entry_class, i.status, i.reward_status, i.apps_completed, i.rewards_received,
  s.first_dapp_reward_block, coalesce(s.distinct_dapp_reward_count, 0) as distinct_dapp_reward_count,
  i.vot3_converted, i.vot3_converted_at, i.vot3_converted_block, i.vot3_conversion_tx_id,
  i.vot3_conversion_amount_wei, coalesce(s.conversion_event_count, 0) as conversion_event_count,
  s.max_conversion_amount_wei::text as max_conversion_amount_wei,
  i.vote_completed, i.vote_completed_at, i.vote_completed_block, i.vote_round_id,
  i.sybil_status, i.sybil_risk_level, i.sybil_reason, i.impact_sync_complete_at,
  case
    when i.invitee_wallet is null then 'NOT_CLAIMED'
    when i.status = 'CANCELLED' or i.reward_status = 'FORFEITED' then 'FORFEITED_OR_CANCELLED'
    when coalesce(i.apps_completed, 0) = 0 then 'NEED_FIRST_DAPP_REWARD'
    when coalesce(i.vot3_converted, false) = false and s.first_minimum_conversion_block is not null and s.first_dapp_reward_block is not null and s.first_minimum_conversion_block < s.first_dapp_reward_block then 'VOT3_CONVERSION_BEFORE_FIRST_DAPP'
    when coalesce(i.vot3_converted, false) = false then 'NEED_VOT3_CONVERSION'
    when coalesce(i.vote_completed, false) = false then 'NEED_VOTE_AFTER_CONVERSION'
    when coalesce(i.apps_completed, 0) < 3 then 'NEED_MORE_DAPP_REWARDS'
    when i.sybil_status = 'BLOCKED' then 'SYBIL_BLOCKED'
    when i.sybil_status = 'REVIEW' or i.status = 'UNDER_REVIEW' then 'SYBIL_REVIEW'
    when i.reward_status = 'PAID' then 'PAID'
    when i.reward_status = 'ELIGIBLE' then 'ELIGIBLE'
    when i.status = 'COMPLETED' then 'PENDING_REWARD_SETTLEMENT'
    else 'PENDING_RECONCILIATION'
  end as mission_reason_code
from public.invitations i
left join public.eligibility_check_events ec on ec.id = i.eligibility_check_id
left join impact_summary s on s.invite_code = i.invite_code;

commit;