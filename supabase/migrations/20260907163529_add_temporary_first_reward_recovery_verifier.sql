create or replace function public.verify_first_reward_recovery_token_hash(p_token_hash text)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select p_token_hash = 'fdbcac052948008af50a9477d4b761ec62fa77e783dbfbc815fc9767ac5f874f';
$$;

revoke all on function public.verify_first_reward_recovery_token_hash(text) from public;
revoke all on function public.verify_first_reward_recovery_token_hash(text) from anon;
revoke all on function public.verify_first_reward_recovery_token_hash(text) from authenticated;
grant execute on function public.verify_first_reward_recovery_token_hash(text) to service_role;
