create or replace function public.verify_two_claimed_reward_recovery_exactly()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient constant text := '0x69d3e60f17f101cc188b4120a4a64593228b4efa';
  v_target_count integer;
  v_bad_count integer;
begin
  select count(*) into v_target_count
  from public.reward_queue_entries q
  where q.network = 'mainnet'
    and q.invite_code in ('EALXSC8','QNU8TDF')
    and lower(q.recipient_wallet) = v_recipient
    and q.status in ('QUEUED','ASSIGNED')
    and q.claim_requested_at is not null
    and lower(q.claim_requested_by_wallet) = v_recipient
    and (
      (q.invite_code = 'EALXSC8' and q.reserved_amount_wei = 191252137695939519768::numeric)
      or
      (q.invite_code = 'QNU8TDF' and q.reserved_amount_wei = 191252137695939519742::numeric)
    );

  if v_target_count <> 2 then
    raise exception 'TARGET_CLAIMED_QUEUE_MISMATCH';
  end if;

  select count(*) into v_bad_count
  from public.reward_queue_entries q
  where q.network = 'mainnet'
    and q.status = 'QUEUED'
    and not (
      q.invite_code in ('EALXSC8','QNU8TDF')
      and lower(q.recipient_wallet) = v_recipient
    );

  if v_bad_count <> 0 then
    raise exception 'OTHER_QUEUED_REWARD_PRESENT';
  end if;

  select count(*) into v_target_count
  from public.invitations i
  where i.invite_code in ('EALXSC8','QNU8TDF')
    and lower(i.inviter_wallet) = v_recipient
    and i.status = 'COMPLETED'
    and i.reward_status in ('ELIGIBLE','PAID')
    and i.sybil_status = 'CLEAR'
    and i.identity_link_status in ('NO_KNOWN_LINK','OPERATOR_CLEARED');

  if v_target_count <> 2 then
    raise exception 'TARGET_INVITATION_SAFETY_MISMATCH';
  end if;

  select count(*) into v_bad_count
  from public.reward_payouts p
  where p.invite_code in ('EALXSC8','QNU8TDF')
    and (
      lower(p.recipient_wallet) <> v_recipient
      or not (
        (p.invite_code = 'EALXSC8' and p.amount_wei = 191252137695939519768::numeric)
        or
        (p.invite_code = 'QNU8TDF' and p.amount_wei = 191252137695939519742::numeric)
      )
    );

  if v_bad_count <> 0 then
    raise exception 'TARGET_PAYOUT_MISMATCH';
  end if;

  return true;
end;
$$;

revoke all on function public.verify_two_claimed_reward_recovery_exactly() from public;
grant execute on function public.verify_two_claimed_reward_recovery_exactly() to service_role;
comment on function public.verify_two_claimed_reward_recovery_exactly() is 'Temporary exact-numeric preflight for the two explicitly claimed Production rewards EALXSC8 and QNU8TDF. Remove after confirmed settlement.';
