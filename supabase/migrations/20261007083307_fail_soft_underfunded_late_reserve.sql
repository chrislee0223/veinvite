do $body$
declare
  v_def text;
  v_hash text;
begin
  select pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid))
  into v_def,v_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='commit_reward_reservation_with_late_reserve'
    and p.prokind='f'
  limit 1;

  if v_def is null then
    raise exception 'LATE_RESERVE_WRAPPER_MISSING';
  end if;

  if v_hash<>'501ea6b9cefa06f60d02be3aa5d11a8d' then
    raise exception 'LATE_RESERVE_WRAPPER_DEFINITION_DRIFT:%',v_hash;
  end if;

  v_def:=replace(
    v_def,
    $old$
      if v_message='LATE_RESERVE_ROLLBACK' then
        return v_failure;
      end if;
      raise;
$old$,
    $new$
      if v_message='LATE_RESERVE_ROLLBACK' then
        return v_failure;
      end if;
      if v_message='REWARD_BOOST_RESERVE_BALANCE_EXCEEDED' then
        return jsonb_build_object(
          'reserved',false,
          'reason','RESERVE_UNDERFUNDED',
          'requiredReserveTopUpWei',v_required_release::text,
          'protectedRewardWei',
            v_protection.late_reward_wei::text
        );
      end if;
      raise;
$new$
  );

  if position('RESERVE_UNDERFUNDED' in v_def)=0 then
    raise exception 'LATE_RESERVE_UNDERFUNDED_PATCH_TARGET_MISSING';
  end if;

  execute v_def;
end
$body$;
