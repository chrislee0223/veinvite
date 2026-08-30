-- Correct the production reporting baseline to the official start of
-- VeBetterDAO Round 113. Preview/testnet environments are intentionally
-- left unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_config public.operator_reporting_config%rowtype;
  v_snapshot_count bigint;
  v_trigger_enabled "char";
begin
  lock table public.operator_reporting_config in access exclusive mode;

  select *
    into strict v_config
    from public.operator_reporting_config
   where id = 1;

  if v_config.reporting_network = 'testnet' then
    raise notice 'Round 113 production baseline correction is a no-op on testnet.';
    return;
  end if;

  if v_config.reporting_network <> 'mainnet' then
    raise exception 'Unexpected reporting network: %', v_config.reporting_network;
  end if;

  if v_config.reporting_start_at = timestamptz '2026-08-24 07:13:10+00'
     and v_config.reporting_baseline_round_id = 113
     and lower(v_config.reporting_baseline_set_by_wallet) =
       '0x52b4546c45267f33ca79b47abc1863d853bf8917' then
    raise notice 'Round 113 production baseline is already corrected.';
    return;
  end if;

  if v_config.reporting_start_at <> timestamptz '2026-08-28 15:54:00.049977+00'
     or v_config.reporting_baseline_round_id <> 113
     or v_config.reporting_baseline_locked_at <>
       timestamptz '2026-08-28 15:54:00.049977+00'
     or lower(v_config.reporting_baseline_set_by_wallet) <>
       '0x52b4546c45267f33ca79b47abc1863d853bf8917' then
    raise exception 'Production reporting baseline does not match the reviewed pre-correction state.';
  end if;

  lock table public.operator_round_growth_report_snapshots in share mode;

  select count(*)
    into v_snapshot_count
    from public.operator_round_growth_report_snapshots;

  if v_snapshot_count <> 0 then
    raise exception 'Cannot correct reporting baseline after snapshots exist (count=%).',
      v_snapshot_count;
  end if;

  select t.tgenabled
    into strict v_trigger_enabled
    from pg_trigger t
   where t.tgrelid = 'public.operator_reporting_config'::regclass
     and t.tgname = 'operator_reporting_config_baseline_lock'
     and not t.tgisinternal;

  if v_trigger_enabled <> 'O' then
    raise exception 'Baseline lock trigger is not enabled before correction.';
  end if;

  execute 'alter table public.operator_reporting_config disable trigger operator_reporting_config_baseline_lock';

  update public.operator_reporting_config
     set reporting_start_at = timestamptz '2026-08-24 07:13:10+00',
         note = 'Official VeInvite reporting begins at the exact on-chain start of VeBetterDAO Round 113 (2026-08-24T07:13:10Z). Corrected once after operator clarification; the original lock timestamp remains in reporting_baseline_locked_at for audit.',
         updated_at = clock_timestamp()
   where id = 1;

  if not found then
    raise exception 'Production reporting baseline row disappeared during correction.';
  end if;

  execute 'alter table public.operator_reporting_config enable trigger operator_reporting_config_baseline_lock';

  select t.tgenabled
    into strict v_trigger_enabled
    from pg_trigger t
   where t.tgrelid = 'public.operator_reporting_config'::regclass
     and t.tgname = 'operator_reporting_config_baseline_lock'
     and not t.tgisinternal;

  if v_trigger_enabled <> 'O' then
    raise exception 'Baseline lock trigger was not re-enabled after correction.';
  end if;
end
$$;

do $$
declare
  v_config public.operator_reporting_config%rowtype;
begin
  select *
    into strict v_config
    from public.operator_reporting_config
   where id = 1;

  if v_config.reporting_network = 'mainnet'
     and (
       v_config.reporting_start_at <> timestamptz '2026-08-24 07:13:10+00'
       or v_config.reporting_baseline_round_id <> 113
       or lower(v_config.reporting_baseline_set_by_wallet) <>
         '0x52b4546c45267f33ca79b47abc1863d853bf8917'
     ) then
    raise exception 'Round 113 production baseline correction postcondition failed.';
  end if;
end
$$;

commit;
