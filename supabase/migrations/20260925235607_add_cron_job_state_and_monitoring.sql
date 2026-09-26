begin;

create table if not exists public.cron_job_states (
  job_name text primary key,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  lease_until timestamptz,
  constraint cron_job_states_job_name_check
    check (job_name ~ '^[a-z0-9][a-z0-9:_-]{1,95}$'),
  constraint cron_job_states_error_length_check
    check (last_error is null or length(last_error) <= 2000)
);

alter table public.cron_job_states enable row level security;

revoke all on table public.cron_job_states
  from public, anon, authenticated, service_role;
grant select, insert, update
  on table public.cron_job_states
  to service_role;

insert into public.cron_job_states (job_name)
values
  ('vote-reconcile'),
  ('vote-reconcile:sybil-reward-recovery'),
  ('vote-reconcile:full-fallback'),
  ('daily-reconcile'),
  ('analytics-maintenance')
on conflict (job_name) do nothing;

create or replace function public.try_claim_cron_job(
  p_job_name text,
  p_min_success_interval_seconds integer,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_claimed boolean := false;
begin
  if p_job_name is null
     or p_job_name !~ '^[a-z0-9][a-z0-9:_-]{1,95}$' then
    raise exception 'Invalid cron job name.';
  end if;

  if p_min_success_interval_seconds < 0
     or p_min_success_interval_seconds > 86400 * 7 then
    raise exception 'Invalid cron success interval.';
  end if;

  if p_lease_seconds < 15 or p_lease_seconds > 900 then
    raise exception 'Invalid cron lease duration.';
  end if;

  insert into public.cron_job_states (job_name, created_at, updated_at)
  values (p_job_name, v_now, v_now)
  on conflict (job_name) do nothing;

  update public.cron_job_states s
  set
    last_started_at = v_now,
    lease_until = v_now + make_interval(secs => p_lease_seconds),
    updated_at = v_now
  where s.job_name = p_job_name
    and (
      s.last_succeeded_at is null
      or s.last_succeeded_at <=
        v_now - make_interval(secs => p_min_success_interval_seconds)
    )
    and (
      s.lease_until is null
      or s.lease_until <= v_now
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.try_claim_cron_job(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.try_claim_cron_job(text, integer, integer)
  to service_role;

create or replace function public.enrich_operator_monitor_snapshot_cron_health()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_vote public.cron_job_states%rowtype;
  v_recovery public.cron_job_states%rowtype;
  v_fallback public.cron_job_states%rowtype;
  v_daily public.cron_job_states%rowtype;
  v_analytics public.cron_job_states%rowtype;
  v_extra_alerts jsonb := '[]'::jsonb;
  v_extra_metrics jsonb := '{}'::jsonb;
  v_vote_age numeric;
  v_recovery_age numeric;
  v_fallback_age numeric;
  v_daily_age numeric;
  v_analytics_age numeric;
begin
  select * into v_vote
  from public.cron_job_states
  where job_name = 'vote-reconcile';

  select * into v_recovery
  from public.cron_job_states
  where job_name = 'vote-reconcile:sybil-reward-recovery';

  select * into v_fallback
  from public.cron_job_states
  where job_name = 'vote-reconcile:full-fallback';

  select * into v_daily
  from public.cron_job_states
  where job_name = 'daily-reconcile';

  select * into v_analytics
  from public.cron_job_states
  where job_name = 'analytics-maintenance';

  v_vote_age := extract(epoch from (
    v_now - coalesce(v_vote.last_succeeded_at, v_vote.created_at, v_now)
  ));
  v_recovery_age := extract(epoch from (
    v_now - coalesce(v_recovery.last_succeeded_at, v_recovery.created_at, v_now)
  ));
  v_fallback_age := extract(epoch from (
    v_now - coalesce(v_fallback.last_succeeded_at, v_fallback.created_at, v_now)
  ));
  v_daily_age := extract(epoch from (
    v_now - greatest(
      coalesce(v_daily.last_started_at, '-infinity'::timestamptz),
      coalesce(v_daily.last_succeeded_at, '-infinity'::timestamptz),
      coalesce(v_daily.created_at, '-infinity'::timestamptz)
    )
  ));
  v_analytics_age := extract(epoch from (
    v_now - greatest(
      coalesce(v_analytics.last_started_at, '-infinity'::timestamptz),
      coalesce(v_analytics.last_succeeded_at, '-infinity'::timestamptz),
      coalesce(v_analytics.created_at, '-infinity'::timestamptz)
    )
  ));

  v_extra_metrics := jsonb_build_object(
    'cronHealth',
    jsonb_build_object(
      'voteReconcile', jsonb_build_object(
        'lastStartedAt', v_vote.last_started_at,
        'lastSucceededAt', v_vote.last_succeeded_at,
        'lastFailedAt', v_vote.last_failed_at,
        'ageSeconds', round(v_vote_age),
        'warningAfterSeconds', 300,
        'criticalAfterSeconds', 900
      ),
      'sybilRewardRecovery', jsonb_build_object(
        'lastSucceededAt', v_recovery.last_succeeded_at,
        'lastFailedAt', v_recovery.last_failed_at,
        'ageSeconds', round(v_recovery_age),
        'warningAfterSeconds', 900,
        'criticalAfterSeconds', 1800
      ),
      'fullVoteFallback', jsonb_build_object(
        'lastSucceededAt', v_fallback.last_succeeded_at,
        'lastFailedAt', v_fallback.last_failed_at,
        'ageSeconds', round(v_fallback_age),
        'warningAfterSeconds', 3600,
        'criticalAfterSeconds', 7200
      ),
      'dailyReconcile', jsonb_build_object(
        'lastStartedAt', v_daily.last_started_at,
        'lastSucceededAt', v_daily.last_succeeded_at,
        'lastFailedAt', v_daily.last_failed_at,
        'ageSeconds', round(v_daily_age),
        'warningAfterSeconds', 108000,
        'criticalAfterSeconds', 172800
      ),
      'analyticsMaintenance', jsonb_build_object(
        'lastStartedAt', v_analytics.last_started_at,
        'lastSucceededAt', v_analytics.last_succeeded_at,
        'lastFailedAt', v_analytics.last_failed_at,
        'ageSeconds', round(v_analytics_age),
        'warningAfterSeconds', 108000,
        'criticalAfterSeconds', 172800
      )
    )
  );

  if v_vote_age > 900 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_VOTE_RECONCILE_STALE',
        'severity', 'CRITICAL',
        'observedAgeSeconds', round(v_vote_age),
        'message', 'The one-minute vote reconciliation heartbeat has been stale for over 15 minutes.'
      )
    );
  elsif v_vote_age > 300 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_VOTE_RECONCILE_DELAYED',
        'severity', 'WARNING',
        'observedAgeSeconds', round(v_vote_age),
        'message', 'The one-minute vote reconciliation heartbeat is over five minutes old.'
      )
    );
  end if;

  if v_recovery_age > 1800 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_SYBIL_REWARD_RECOVERY_STALE',
        'severity', 'CRITICAL',
        'observedAgeSeconds', round(v_recovery_age),
        'message', 'The Sybil/reward recovery safety job has not succeeded for over 30 minutes.'
      )
    );
  elsif v_recovery_age > 900 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_SYBIL_REWARD_RECOVERY_DELAYED',
        'severity', 'WARNING',
        'observedAgeSeconds', round(v_recovery_age),
        'message', 'The Sybil/reward recovery safety job has not succeeded for over 15 minutes.'
      )
    );
  end if;

  if v_fallback_age > 7200 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_VOTE_FALLBACK_STALE',
        'severity', 'CRITICAL',
        'observedAgeSeconds', round(v_fallback_age),
        'message', 'The full vote reconciliation fallback has not succeeded for over two hours.'
      )
    );
  elsif v_fallback_age > 3600 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_VOTE_FALLBACK_DELAYED',
        'severity', 'WARNING',
        'observedAgeSeconds', round(v_fallback_age),
        'message', 'The full vote reconciliation fallback has not succeeded for over one hour.'
      )
    );
  end if;

  if v_daily_age > 172800 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_DAILY_RECONCILE_STALE',
        'severity', 'CRITICAL',
        'observedAgeSeconds', round(v_daily_age),
        'message', 'The daily reconciliation cron has not started or succeeded for over 48 hours.'
      )
    );
  elsif v_daily_age > 108000 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_DAILY_RECONCILE_DELAYED',
        'severity', 'WARNING',
        'observedAgeSeconds', round(v_daily_age),
        'message', 'The daily reconciliation cron has not started or succeeded for over 30 hours.'
      )
    );
  end if;

  if v_analytics_age > 172800 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_ANALYTICS_MAINTENANCE_STALE',
        'severity', 'CRITICAL',
        'observedAgeSeconds', round(v_analytics_age),
        'message', 'Analytics/security-retention maintenance has not started or succeeded for over 48 hours.'
      )
    );
  elsif v_analytics_age > 108000 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'CRON_ANALYTICS_MAINTENANCE_DELAYED',
        'severity', 'WARNING',
        'observedAgeSeconds', round(v_analytics_age),
        'message', 'Analytics/security-retention maintenance has not started or succeeded for over 30 hours.'
      )
    );
  end if;

  new.metrics := coalesce(new.metrics, '{}'::jsonb) || v_extra_metrics;
  new.alerts := coalesce(new.alerts, '[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

revoke all on function public.enrich_operator_monitor_snapshot_cron_health()
  from public, anon, authenticated, service_role;

drop trigger if exists ad_operator_monitor_cron_health_enrichment
  on public.operator_monitor_snapshots;
create trigger ad_operator_monitor_cron_health_enrichment
before insert on public.operator_monitor_snapshots
for each row execute function public.enrich_operator_monitor_snapshot_cron_health();

comment on table public.cron_job_states is
  'Service-only liveness and cadence state for VeInvite scheduled jobs. It carries no reward, invitation, or Sybil authority.';

commit;
