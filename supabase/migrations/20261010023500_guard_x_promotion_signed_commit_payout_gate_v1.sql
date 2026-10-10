create or replace function public.guard_reward_x_promotion_signed_commit_runtime_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found
     or not v_cfg.reward_x_promotion_enabled
     or not v_cfg.reward_x_promotion_payout_enabled
     or v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_SIGNING_RUNTIME_DISABLED';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_reward_x_promotion_signed_commit_runtime_v1()
  from public,anon,authenticated,service_role;

drop trigger if exists reward_x_promotion_signed_commit_runtime_guard
  on public.reward_x_promotion_payout_signed_transactions;

create trigger reward_x_promotion_signed_commit_runtime_guard
before insert on public.reward_x_promotion_payout_signed_transactions
for each row execute function public.guard_reward_x_promotion_signed_commit_runtime_v1();

comment on function public.guard_reward_x_promotion_signed_commit_runtime_v1() is
  'Final database commitment gate for NEW X promotion signed transactions. LIVE and the independent payout switch must still be enabled at INSERT time. Existing committed signed transactions remain recoverable after either switch is disabled.';
