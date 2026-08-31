begin;

do $$
declare
  v_total numeric(78,0);
  v_team numeric(78,0);
  v_rewards numeric(78,0);
  v_emergency_paused boolean;
begin
  select
    total_amount_wei,
    team_allocation_amount_wei,
    rewards_allocation_amount_wei
  into
    v_total,
    v_team,
    v_rewards
  from public.vebetter_round_allocations
  where network = 'mainnet'
    and app_id = '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
    and vebetter_round_id = 113
  order by claim_block_timestamp desc
  limit 1;

  if not found then
    raise exception 'Round 113 VeInvite mainnet allocation evidence is missing';
  end if;

  if v_total <= 0
     or v_team * 100 <> v_total * 20
     or v_rewards * 100 <> v_total * 80
     or v_total <> v_team + v_rewards then
    raise exception 'Round 113 allocation does not satisfy the reviewed 20/80 policy';
  end if;

  select emergency_rewards_paused
  into v_emergency_paused
  from public.reward_runtime_config
  where id = 1
  for update;

  if not found then
    raise exception 'VeInvite reward runtime configuration is missing';
  end if;

  if v_emergency_paused then
    raise exception 'Emergency reward pause is active';
  end if;

  update public.reward_runtime_config
  set
    mainnet_funded_rewards_enabled = true,
    note = 'Mainnet funded rewards enabled after first allocation (VeBetter round 113). Fresh read-only mainnet audit passed 2026-08-31: 20/80 policy, reward distributor, reward-pool mode and pause state verified.',
    updated_at = now()
  where id = 1
    and mainnet_funded_rewards_enabled = false;
end
$$;

commit;
