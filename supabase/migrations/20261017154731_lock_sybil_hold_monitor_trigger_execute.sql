-- Restrict the existing SECURITY DEFINER monitoring trigger to service-only use.
-- The trigger remains installed and fully operational; no monitoring data,
-- Sybil verdicts, wallet restrictions, payout records or reward settings change.
revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()
from public, anon, authenticated;

grant execute on function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()
to service_role;

do $verify$
begin
  if has_function_privilege('anon',
      'public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()', 'EXECUTE')
    or has_function_privilege('authenticated',
      'public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()', 'EXECUTE')
    or not has_function_privilege('service_role',
      'public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()', 'EXECUTE')
  then
    raise exception 'SYBIL_HOLD_MONITOR_TRIGGER_PRIVILEGES_UNSAFE';
  end if;
end;
$verify$;
