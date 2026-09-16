create or replace function public.verify_first_reward_recovery_token_hash(p_token_hash text)
returns boolean
language sql
set search_path to 'public'
as $function$
  select false;
$function$;
