create or replace function public.guard_reward_x_promotion_obligation_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if tg_op='DELETE' then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_DELETE_FORBIDDEN';
  end if;

  if old.split_id is distinct from new.split_id
     or old.invite_code is distinct from new.invite_code
     or old.network is distinct from new.network
     or old.recipient_wallet is distinct from new.recipient_wallet
     or old.promotion_amount_wei is distinct from new.promotion_amount_wei
     or old.source_reward_cohort_round_id is distinct from new.source_reward_cohort_round_id
     or old.source_allocation_receipt_id is distinct from new.source_allocation_receipt_id
     or old.policy_version is distinct from new.policy_version
     or old.created_at is distinct from new.created_at then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_IDENTITY_IMMUTABLE';
  end if;

  if old.financial_state=new.financial_state then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_STATE_CHANGE_REQUIRED';
  end if;

  if new.financial_state='PAID' then
    raise exception 'REWARD_X_PROMOTION_PAID_PROOF_NOT_READY';
  end if;

  if not (
    (old.financial_state='RESERVED' and new.financial_state in ('HELD','RELEASED'))
    or
    (old.financial_state='HELD' and new.financial_state='RELEASED')
  ) then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_TRANSITION_INVALID';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_reward_x_promotion_obligation_mutation()
  from public,anon,authenticated,service_role;

comment on function public.guard_reward_x_promotion_obligation_mutation() is
  'Fail-closed X promotion obligation transition guard. PAID remains forbidden until an immutable on-chain promotion payout submission/settlement proof is wired into the transition.';
