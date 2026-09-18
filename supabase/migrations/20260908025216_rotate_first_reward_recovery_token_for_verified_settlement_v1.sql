create or replace function public.verify_first_reward_recovery_token_hash(p_token_hash text)
returns boolean
language sql
set search_path to 'public'
as $function$
  select p_token_hash = '11952a9359a4d8bd16820ba4218ed6b77dfd4d1eacdb50d818a55b48497ddd40';
$function$;
