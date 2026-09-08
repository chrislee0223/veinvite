do $$
begin
  if not exists (
    select 1
    from public.reward_payouts
    where invite_code = 'EALXSC8'
      and status = 'PAID'
      and tx_id is not null
      and paid_at is not null
  ) or not exists (
    select 1
    from public.reward_payouts
    where invite_code = 'QNU8TDF'
      and status = 'PAID'
      and tx_id is not null
      and paid_at is not null
  ) then
    raise exception 'CLAIMED_REWARD_RECOVERY_NOT_SETTLED';
  end if;
end
$$;

drop function if exists public.verify_two_claimed_reward_recovery_exactly();
