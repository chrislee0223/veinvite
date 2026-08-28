-- Retire the superseded UTC-calendar-week reporting stack.
--
-- VeInvite's official reporting unit is now the VeBetterDAO round. The
-- round-scoped functions and immutable round snapshots are intentionally
-- preserved by this migration.
--
-- Safety rules:
-- - refuse to remove a weekly snapshot table that contains any row;
-- - do not use CASCADE, so any unexpected dependency aborts the migration;
-- - use short lock/statement timeouts so a busy database is not blocked.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
declare
  v_has_rows boolean := false;
begin
  if to_regclass('public.operator_weekly_report_snapshots') is not null then
    execute
      'select exists (' ||
      'select 1 from public.operator_weekly_report_snapshots' ||
      ')'
    into v_has_rows;

    if v_has_rows then
      raise exception 'LEGACY_WEEKLY_SNAPSHOT_TABLE_NOT_EMPTY';
    end if;
  end if;
end
$$;

drop view if exists public.operator_latest_weekly_report_snapshots;
drop function if exists public.finalize_weekly_impact_report(
  text,
  timestamptz,
  text
);
drop view if exists public.operator_public_weekly_impact;
drop view if exists public.operator_weekly_data_quality;
drop view if exists public.operator_weekly_impact;
drop table if exists public.operator_weekly_report_snapshots;
drop function if exists public.veinvite_utc_week_start(timestamptz);

commit;
