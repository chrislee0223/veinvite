do $migration$
declare
  v_name text;
  v_def text;
  v_new text;
  v_flag_old constant text := 'i.sybil_status in (''REVIEW'', ''BLOCKED'') as is_flagged,';
  v_flag_new constant text := '(i.sybil_status in (''REVIEW'', ''BLOCKED'') or not public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)) as is_flagged,';
  v_activation_old constant text := 'and rr.amount_wei > 0';
  v_activation_new text;
begin
  v_activation_new := v_activation_old || chr(10) ||
    '          and public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)';

  foreach v_name in array array[
    'get_operator_public_new_user_growth',
    'get_public_country_leaderboard'
  ] loop
    select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name
    order by p.oid
    limit 1;

    if v_def is null then
      raise exception 'required public activation function % is missing', v_name;
    end if;

    if strpos(v_def, v_flag_old) = 0
       or strpos(v_def, v_activation_old) = 0 then
      raise exception 'public activation function % no longer matches the expected prior definition', v_name;
    end if;

    v_new := replace(v_def, v_flag_old, v_flag_new);
    v_new := replace(v_new, v_activation_old, v_activation_new);

    if v_new = v_def then
      raise exception 'public activation function % was not changed', v_name;
    end if;

    execute v_new;
  end loop;
end;
$migration$;
