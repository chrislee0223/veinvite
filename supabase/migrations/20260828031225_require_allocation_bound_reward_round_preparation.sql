begin;

revoke execute on function public.prepare_reward_round(text, text, numeric)
  from service_role;

commit;
