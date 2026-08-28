-- Immutable, revisioned VeBetterDAO-round growth reports.
--
-- Public NEW/RETURNING impact is deliberately separate from the operator's
-- live funnel. A public user is counted only after every mission is complete
-- and the invitation has a CLEAR Sybil decision. The reporting baseline is a
-- one-way launch gate: once locked, it cannot be moved to include or exclude
-- historical activity. Completed-round snapshots are append-only; corrected
-- data creates a new version with an explicit reason.

begin;

alter table public.operator_reporting_config
  add column if not exists reporting_baseline_round_id bigint,
  add column if not exists reporting_baseline_locked_at timestamptz,
  add column if not exists reporting_baseline_set_by_wallet text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operator_reporting_config_baseline_round_check'
      and conrelid = 'public.operator_reporting_config'::regclass
  ) then
    alter table public.operator_reporting_config
      add constraint operator_reporting_config_baseline_round_check
      check (
        reporting_baseline_round_id is null
        or reporting_baseline_round_id > 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'operator_reporting_config_baseline_wallet_check'
      and conrelid = 'public.operator_reporting_config'::regclass
  ) then
    alter table public.operator_reporting_config
      add constraint operator_reporting_config_baseline_wallet_check
      check (
        reporting_baseline_set_by_wallet is null
        or reporting_baseline_set_by_wallet ~ '^0x[0-9a-f]{40}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'operator_reporting_config_baseline_consistency_check'
      and conrelid = 'public.operator_reporting_config'::regclass
  ) then
    alter table public.operator_reporting_config
      add constraint operator_reporting_config_baseline_consistency_check
      check (
        (
          reporting_start_at is null
          and reporting_baseline_round_id is null
          and reporting_baseline_locked_at is null
          and reporting_baseline_set_by_wallet is null
        )
        or
        (
          reporting_start_at is not null
          and reporting_baseline_round_id is not null
          and reporting_baseline_locked_at is not null
          and reporting_baseline_set_by_wallet is not null
          and reporting_start_at <= reporting_baseline_locked_at
        )
      );
  end if;
end;
$$;

create or replace function public.enforce_operator_reporting_baseline_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if old.reporting_start_at is not null and (
    new.reporting_start_at is distinct from old.reporting_start_at
    or new.reporting_network is distinct from old.reporting_network
    or new.reporting_baseline_round_id is distinct from old.reporting_baseline_round_id
    or new.reporting_baseline_locked_at is distinct from old.reporting_baseline_locked_at
    or new.reporting_baseline_set_by_wallet is distinct from old.reporting_baseline_set_by_wallet
  ) then
    raise exception 'REPORTING_BASELINE_IS_IMMUTABLE';
  end if;

  return new;
end;
$function$;

drop trigger if exists operator_reporting_config_baseline_lock
  on public.operator_reporting_config;
create trigger operator_reporting_config_baseline_lock
before update on public.operator_reporting_config
for each row execute function public.enforce_operator_reporting_baseline_lock();

create or replace function public.lock_operator_reporting_baseline(
  p_network text,
  p_reporting_start_at timestamptz,
  p_reporting_round_id bigint,
  p_operator_wallet text,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_operator_wallet text := lower(btrim(p_operator_wallet));
  v_config public.operator_reporting_config%rowtype;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'UNSUPPORTED_REPORTING_NETWORK';
  end if;

  if p_reporting_start_at is null or p_reporting_start_at > now() then
    raise exception 'INVALID_REPORTING_START_AT';
  end if;

  if p_reporting_round_id is null or p_reporting_round_id < 1 then
    raise exception 'INVALID_REPORTING_BASELINE_ROUND';
  end if;

  if v_operator_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_REPORTING_OPERATOR_WALLET';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite:operator-reporting-baseline', 0)
  );

  select *
  into v_config
  from public.operator_reporting_config
  where id = 1
  for update;

  if not found then
    raise exception 'REPORTING_CONFIG_NOT_FOUND';
  end if;

  if v_config.reporting_start_at is not null then
    if v_config.reporting_network = v_network
      and v_config.reporting_start_at = p_reporting_start_at
      and v_config.reporting_baseline_round_id = p_reporting_round_id
    then
      return jsonb_build_object(
        'network', v_config.reporting_network,
        'reportingStartAt', v_config.reporting_start_at,
        'reportingRoundId', v_config.reporting_baseline_round_id,
        'lockedAt', v_config.reporting_baseline_locked_at,
        'setByWallet', v_config.reporting_baseline_set_by_wallet,
        'alreadyLocked', true
      );
    end if;

    raise exception 'REPORTING_BASELINE_ALREADY_LOCKED';
  end if;

  update public.operator_reporting_config
  set
    reporting_network = v_network,
    reporting_start_at = p_reporting_start_at,
    reporting_baseline_round_id = p_reporting_round_id,
    reporting_baseline_locked_at = now(),
    reporting_baseline_set_by_wallet = v_operator_wallet,
    note = coalesce(
      nullif(btrim(coalesce(p_note, '')), ''),
      'Official VeInvite reporting baseline locked to a VeBetterDAO round.'
    ),
    updated_at = now()
  where id = 1
  returning * into v_config;

  return jsonb_build_object(
    'network', v_config.reporting_network,
    'reportingStartAt', v_config.reporting_start_at,
    'reportingRoundId', v_config.reporting_baseline_round_id,
    'lockedAt', v_config.reporting_baseline_locked_at,
    'setByWallet', v_config.reporting_baseline_set_by_wallet,
    'alreadyLocked', false
  );
end;
$function$;

create or replace function public.get_operator_public_new_user_growth(
  p_network text,
  p_current_round_id bigint,
  p_limit integer default 52
)
returns table (
  round_id bigint,
  verified_new_users bigint,
  activated_new_users bigint,
  flagged_new_users bigint,
  verified_returning_users bigint,
  activated_returning_users bigint,
  active_existing_rejected_users bigint,
  active_existing_rejection_attempts bigint,
  cumulative_verified_new_users bigint,
  cumulative_activated_new_users bigint,
  cumulative_flagged_new_users bigint,
  cumulative_verified_returning_users bigint,
  cumulative_activated_returning_users bigint,
  cumulative_active_existing_rejected_users bigint,
  cumulative_active_existing_rejection_attempts bigint,
  first_verified_entry_at timestamptz,
  latest_verified_entry_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(1::bigint, p_current_round_id) as current_round_id,
      greatest(1, least(coalesce(p_limit, 52), 260)) as history_limit,
      c.reporting_start_at,
      c.reporting_baseline_round_id
    from public.operator_reporting_config c
    where c.id = 1
      and c.reporting_start_at is not null
      and c.reporting_network = lower(btrim(p_network))
  ),
  bound_entries as (
    select
      (e.details ->> 'currentRoundId')::bigint as entry_round_id,
      e.wallet_address,
      e.entry_class,
      e.created_at,
      i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged,
      (
        i.status = 'COMPLETED'
        and i.apps_completed >= 3
        and i.apps_completed_block is not null
        and i.vot3_converted is true
        and i.vot3_converted_block is not null
        and i.vote_completed is true
        and i.vote_completed_block is not null
        and i.sybil_status = 'CLEAR'
      ) as is_activated
    from public.eligibility_check_events e
    join public.invitations i
      on i.eligibility_check_id = e.id
    cross join parameters p
    where e.network = p.network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW', 'RETURNING')
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
  ),
  safe_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'NEW'
      and b.is_flagged is false
    group by b.wallet_address
  ),
  flagged_new_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id
    from bound_entries b
    where b.entry_class = 'NEW'
      and b.is_flagged is true
      and not exists (
        select 1
        from safe_new_wallets n
        where n.wallet_address = b.wallet_address
      )
    group by b.wallet_address
  ),
  safe_returning_wallets as (
    select
      b.wallet_address,
      min(b.entry_round_id) as cohort_round_id,
      bool_or(b.is_activated) as is_activated,
      min(b.created_at) as first_entry_at,
      max(b.created_at) as latest_entry_at
    from bound_entries b
    where b.entry_class = 'RETURNING'
      and b.is_flagged is false
    group by b.wallet_address
  ),
  rejection_events as (
    select
      (e.details ->> 'currentRoundId')::bigint as rejection_round_id,
      e.wallet_address,
      e.created_at
    from public.eligibility_check_events e
    cross join parameters p
    where e.network = p.network
      and e.created_at >= p.reporting_start_at
      and e.outcome = 'EXISTING_VEBETTER_USER'
      and e.entry_class = 'ACTIVE_EXISTING'
      and e.details ? 'currentRoundId'
      and e.details ->> 'currentRoundId' ~ '^[1-9][0-9]*$'
      and (e.details ->> 'currentRoundId')::numeric
        between p.reporting_baseline_round_id::numeric
        and p.current_round_id::numeric
  ),
  first_rejection_by_wallet as (
    select
      r.wallet_address,
      min(r.rejection_round_id) as first_rejection_round_id
    from rejection_events r
    group by r.wallet_address
  ),
  new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as verified_new_users,
      count(*) filter (where n.is_activated)::bigint
        as activated_new_users,
      min(n.first_entry_at) as first_entry_at,
      max(n.latest_entry_at) as latest_entry_at
    from safe_new_wallets n
    group by n.cohort_round_id
  ),
  flagged_new_by_round as (
    select
      n.cohort_round_id as round_id,
      count(*)::bigint as flagged_new_users
    from flagged_new_wallets n
    group by n.cohort_round_id
  ),
  returning_by_round as (
    select
      r.cohort_round_id as round_id,
      count(*)::bigint as verified_returning_users,
      count(*) filter (where r.is_activated)::bigint
        as activated_returning_users,
      min(r.first_entry_at) as first_entry_at,
      max(r.latest_entry_at) as latest_entry_at
    from safe_returning_wallets r
    group by r.cohort_round_id
  ),
  rejection_by_round as (
    select
      r.rejection_round_id as round_id,
      count(distinct r.wallet_address)::bigint
        as active_existing_rejected_users,
      count(*)::bigint as active_existing_rejection_attempts
    from rejection_events r
    group by r.rejection_round_id
  ),
  first_rejection_by_round as (
    select
      r.first_rejection_round_id as round_id,
      count(*)::bigint as first_rejected_users
    from first_rejection_by_wallet r
    group by r.first_rejection_round_id
  ),
  round_ids as (
    select generate_series(
      1::bigint,
      (select current_round_id from parameters)
    ) as round_id
  ),
  full_trend as (
    select
      ids.round_id,
      coalesce(n.verified_new_users, 0::bigint)
        as verified_new_users,
      coalesce(n.activated_new_users, 0::bigint)
        as activated_new_users,
      coalesce(f.flagged_new_users, 0::bigint)
        as flagged_new_users,
      coalesce(r.verified_returning_users, 0::bigint)
        as verified_returning_users,
      coalesce(r.activated_returning_users, 0::bigint)
        as activated_returning_users,
      coalesce(x.active_existing_rejected_users, 0::bigint)
        as active_existing_rejected_users,
      coalesce(x.active_existing_rejection_attempts, 0::bigint)
        as active_existing_rejection_attempts,
      sum(coalesce(n.verified_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_verified_new_users,
      sum(coalesce(n.activated_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_activated_new_users,
      sum(coalesce(f.flagged_new_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_flagged_new_users,
      sum(coalesce(r.verified_returning_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_verified_returning_users,
      sum(coalesce(r.activated_returning_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_activated_returning_users,
      sum(coalesce(fr.first_rejected_users, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_active_existing_rejected_users,
      sum(coalesce(x.active_existing_rejection_attempts, 0::bigint)) over (
        order by ids.round_id
      )::bigint as cumulative_active_existing_rejection_attempts,
      least(n.first_entry_at, r.first_entry_at) as first_verified_entry_at,
      greatest(n.latest_entry_at, r.latest_entry_at)
        as latest_verified_entry_at
    from round_ids ids
    left join new_by_round n using (round_id)
    left join flagged_new_by_round f using (round_id)
    left join returning_by_round r using (round_id)
    left join rejection_by_round x using (round_id)
    left join first_rejection_by_round fr using (round_id)
  )
  select
    t.round_id,
    t.verified_new_users,
    t.activated_new_users,
    t.flagged_new_users,
    t.verified_returning_users,
    t.activated_returning_users,
    t.active_existing_rejected_users,
    t.active_existing_rejection_attempts,
    t.cumulative_verified_new_users,
    t.cumulative_activated_new_users,
    t.cumulative_flagged_new_users,
    t.cumulative_verified_returning_users,
    t.cumulative_activated_returning_users,
    t.cumulative_active_existing_rejected_users,
    t.cumulative_active_existing_rejection_attempts,
    t.first_verified_entry_at,
    t.latest_verified_entry_at
  from full_trend t
  cross join parameters p
  where t.round_id > p.current_round_id - p.history_limit
    and t.round_id >= p.reporting_baseline_round_id
  order by t.round_id desc;
$function$;

create table if not exists public.operator_round_growth_report_snapshots (
  id bigint generated by default as identity primary key,
  network text not null
    check (network in ('mainnet', 'testnet', 'testnet-staging')),
  round_id bigint not null check (round_id > 0),
  round_start_at timestamptz not null,
  round_end_at timestamptz not null,
  round_start_block bigint not null check (round_start_block >= 0),
  round_end_block bigint not null check (round_end_block >= round_start_block),
  version integer not null check (version >= 1),
  reporting_start_at timestamptz not null,
  activated_new_users bigint not null check (activated_new_users >= 0),
  activated_returning_users bigint not null check (activated_returning_users >= 0),
  cumulative_activated_new_users bigint not null
    check (cumulative_activated_new_users >= 0),
  cumulative_activated_returning_users bigint not null
    check (cumulative_activated_returning_users >= 0),
  verified_new_users bigint not null check (verified_new_users >= 0),
  verified_returning_users bigint not null check (verified_returning_users >= 0),
  flagged_new_users bigint not null check (flagged_new_users >= 0),
  active_existing_rejected_users bigint not null
    check (active_existing_rejected_users >= 0),
  active_existing_rejection_attempts bigint not null
    check (active_existing_rejection_attempts >= 0),
  source_checked_through_block bigint not null,
  metrics_hash text not null check (metrics_hash ~ '^[0-9a-f]{32}$'),
  metric_version text not null default 'veinvite-round-growth-v1',
  revision_reason text,
  finalized_by text not null check (finalized_by in ('CRON', 'OPERATOR')),
  operator_wallet text,
  created_at timestamptz not null default now(),
  unique (network, round_id, version),
  check (round_end_at > round_start_at),
  check (source_checked_through_block >= round_end_block),
  check (
    version = 1
    or (
      revision_reason is not null
      and length(btrim(revision_reason)) > 0
    )
  ),
  check (
    (finalized_by = 'CRON' and operator_wallet is null)
    or (
      finalized_by = 'OPERATOR'
      and operator_wallet ~ '^0x[0-9a-f]{40}$'
    )
  )
);

alter table public.operator_round_growth_report_snapshots
  enable row level security;

create index if not exists operator_round_growth_snapshots_latest_idx
  on public.operator_round_growth_report_snapshots (
    network,
    round_id,
    version desc
  );

drop trigger if exists operator_round_growth_snapshots_append_only
  on public.operator_round_growth_report_snapshots;
create trigger operator_round_growth_snapshots_append_only
before update or delete on public.operator_round_growth_report_snapshots
for each row execute function public.prevent_operator_ledger_mutation();

create or replace view public.operator_latest_round_growth_report_snapshots
with (security_invoker = true)
as
select distinct on (network, round_id)
  id,
  network,
  round_id,
  round_start_at,
  round_end_at,
  round_start_block,
  round_end_block,
  version,
  reporting_start_at,
  activated_new_users,
  activated_returning_users,
  cumulative_activated_new_users,
  cumulative_activated_returning_users,
  verified_new_users,
  verified_returning_users,
  flagged_new_users,
  active_existing_rejected_users,
  active_existing_rejection_attempts,
  source_checked_through_block,
  metrics_hash,
  metric_version,
  revision_reason,
  finalized_by,
  operator_wallet,
  created_at
from public.operator_round_growth_report_snapshots
order by network, round_id, version desc;

create or replace function public.finalize_operator_round_growth_report(
  p_network text,
  p_round_id bigint,
  p_round_start_at timestamptz,
  p_round_end_at timestamptz,
  p_round_start_block bigint,
  p_round_end_block bigint,
  p_checked_through_block bigint,
  p_revision_reason text default null,
  p_operator_wallet text default null
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = public
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_operator_wallet text := nullif(lower(btrim(coalesce(p_operator_wallet, ''))), '');
  v_config public.operator_reporting_config%rowtype;
  v_metrics record;
  v_metrics_json jsonb;
  v_metrics_hash text;
  v_latest_id bigint;
  v_latest_version integer;
  v_latest_hash text;
  v_version integer;
  v_snapshot_id bigint;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'UNSUPPORTED_REPORTING_NETWORK';
  end if;

  if p_round_id is null or p_round_id < 1 then
    raise exception 'INVALID_REPORTING_ROUND';
  end if;

  if p_round_start_at is null
    or p_round_end_at is null
    or p_round_end_at <= p_round_start_at
    or p_round_end_at > now()
  then
    raise exception 'REPORTING_ROUND_NOT_COMPLETED';
  end if;

  if p_round_start_block is null
    or p_round_end_block is null
    or p_checked_through_block is null
    or p_round_start_block < 0
    or p_round_end_block < p_round_start_block
    or p_checked_through_block < p_round_end_block
  then
    raise exception 'INVALID_REPORTING_ROUND_BLOCKS';
  end if;

  if v_operator_wallet is not null
    and v_operator_wallet !~ '^0x[0-9a-f]{40}$'
  then
    raise exception 'INVALID_REPORTING_OPERATOR_WALLET';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite:round-growth:' || v_network || ':' || p_round_id::text,
      0
    )
  );

  select *
  into v_config
  from public.operator_reporting_config
  where id = 1;

  if not found or v_config.reporting_start_at is null then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  if v_config.reporting_network <> v_network then
    raise exception 'REPORTING_NETWORK_MISMATCH';
  end if;

  if p_round_id < v_config.reporting_baseline_round_id
    or p_round_end_at <= v_config.reporting_start_at
  then
    raise exception 'ROUND_PREDATES_REPORTING_BASELINE';
  end if;

  select *
  into v_metrics
  from public.get_operator_public_new_user_growth(
    v_network,
    p_round_id,
    1
  ) g
  where g.round_id = p_round_id;

  if not found then
    raise exception 'PUBLIC_GROWTH_METRICS_UNAVAILABLE';
  end if;

  v_metrics_json := jsonb_build_object(
    'roundId', p_round_id,
    'activatedNewUsers', v_metrics.activated_new_users,
    'activatedReturningUsers', v_metrics.activated_returning_users,
    'cumulativeActivatedNewUsers', v_metrics.cumulative_activated_new_users,
    'cumulativeActivatedReturningUsers', v_metrics.cumulative_activated_returning_users,
    'verifiedNewUsers', v_metrics.verified_new_users,
    'verifiedReturningUsers', v_metrics.verified_returning_users,
    'flaggedNewUsers', v_metrics.flagged_new_users,
    'activeExistingRejectedUsers', v_metrics.active_existing_rejected_users,
    'activeExistingRejectionAttempts', v_metrics.active_existing_rejection_attempts
  );
  v_metrics_hash := md5(v_metrics_json::text);

  select s.id, s.version, s.metrics_hash
  into v_latest_id, v_latest_version, v_latest_hash
  from public.operator_round_growth_report_snapshots s
  where s.network = v_network
    and s.round_id = p_round_id
  order by s.version desc
  limit 1;

  if found and v_latest_hash = v_metrics_hash then
    return v_latest_id;
  end if;

  v_version := coalesce(v_latest_version, 0) + 1;

  if v_version > 1
    and nullif(btrim(coalesce(p_revision_reason, '')), '') is null
  then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;

  insert into public.operator_round_growth_report_snapshots (
    network,
    round_id,
    round_start_at,
    round_end_at,
    round_start_block,
    round_end_block,
    version,
    reporting_start_at,
    activated_new_users,
    activated_returning_users,
    cumulative_activated_new_users,
    cumulative_activated_returning_users,
    verified_new_users,
    verified_returning_users,
    flagged_new_users,
    active_existing_rejected_users,
    active_existing_rejection_attempts,
    source_checked_through_block,
    metrics_hash,
    revision_reason,
    finalized_by,
    operator_wallet
  ) values (
    v_network,
    p_round_id,
    p_round_start_at,
    p_round_end_at,
    p_round_start_block,
    p_round_end_block,
    v_version,
    v_config.reporting_start_at,
    v_metrics.activated_new_users,
    v_metrics.activated_returning_users,
    v_metrics.cumulative_activated_new_users,
    v_metrics.cumulative_activated_returning_users,
    v_metrics.verified_new_users,
    v_metrics.verified_returning_users,
    v_metrics.flagged_new_users,
    v_metrics.active_existing_rejected_users,
    v_metrics.active_existing_rejection_attempts,
    p_checked_through_block,
    v_metrics_hash,
    nullif(btrim(coalesce(p_revision_reason, '')), ''),
    case when v_operator_wallet is null then 'CRON' else 'OPERATOR' end,
    v_operator_wallet
  )
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$function$;

create or replace function public.refresh_operator_round_growth_reports(
  p_network text,
  p_checked_through_block bigint,
  p_revision_reason text default 'AUTOMATED_CHAIN_RECONCILIATION'
)
returns table (
  round_id bigint,
  snapshot_id bigint,
  version integer,
  changed boolean
)
language plpgsql
volatile
security invoker
set search_path = public
as $function$
declare
  v_network text := lower(btrim(p_network));
  v_existing record;
  v_snapshot_id bigint;
  v_version integer;
begin
  if nullif(btrim(coalesce(p_revision_reason, '')), '') is null then
    raise exception 'REVISION_REASON_REQUIRED';
  end if;

  for v_existing in
    select s.*
    from public.operator_latest_round_growth_report_snapshots s
    where s.network = v_network
    order by s.round_id
  loop
    v_snapshot_id := public.finalize_operator_round_growth_report(
      v_existing.network,
      v_existing.round_id,
      v_existing.round_start_at,
      v_existing.round_end_at,
      v_existing.round_start_block,
      v_existing.round_end_block,
      greatest(p_checked_through_block, v_existing.round_end_block),
      p_revision_reason,
      null
    );

    select s.version
    into v_version
    from public.operator_round_growth_report_snapshots s
    where s.id = v_snapshot_id;

    round_id := v_existing.round_id;
    snapshot_id := v_snapshot_id;
    version := v_version;
    changed := v_snapshot_id <> v_existing.id;
    return next;
  end loop;
end;
$function$;

comment on function public.lock_operator_reporting_baseline(
  text, timestamptz, bigint, text, text
) is 'One-way operator gate that locks public reporting to the exact start of a reviewed VeBetterDAO round.';

comment on function public.get_operator_public_new_user_growth(
  text, bigint, integer
) is 'Baseline-scoped public round cohorts. Official NEW/RETURNING impact requires full mission completion and Sybil CLEAR; verified entries remain funnel-only.';

comment on table public.operator_round_growth_report_snapshots
is 'Append-only, revisioned public growth reports attributed to each wallet first VeInvite entry round.';

revoke all on function public.enforce_operator_reporting_baseline_lock()
  from public, anon, authenticated, service_role;
revoke all on function public.lock_operator_reporting_baseline(
  text, timestamptz, bigint, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_operator_public_new_user_growth(
  text, bigint, integer
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_operator_round_growth_report(
  text, bigint, timestamptz, timestamptz, bigint, bigint, bigint, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.refresh_operator_round_growth_reports(
  text, bigint, text
) from public, anon, authenticated, service_role;

revoke all on table public.operator_round_growth_report_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.operator_latest_round_growth_report_snapshots
  from public, anon, authenticated, service_role;

grant execute on function public.lock_operator_reporting_baseline(
  text, timestamptz, bigint, text, text
) to service_role;
grant execute on function public.get_operator_public_new_user_growth(
  text, bigint, integer
) to service_role;
grant execute on function public.finalize_operator_round_growth_report(
  text, bigint, timestamptz, timestamptz, bigint, bigint, bigint, text, text
) to service_role;
grant execute on function public.refresh_operator_round_growth_reports(
  text, bigint, text
) to service_role;

grant select, insert on table public.operator_round_growth_report_snapshots
  to service_role;
grant usage, select on sequence
  public.operator_round_growth_report_snapshots_id_seq
  to service_role;
grant select on table public.operator_latest_round_growth_report_snapshots
  to service_role;

commit;
