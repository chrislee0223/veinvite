begin;

-- Long-term data foundation for VeInvite.
--
-- Principles:
-- 1. Keep detailed anonymous raw analytics hot for 365 days.
-- 2. Never retention-delete raw rows unless a verified archive manifest exists.
-- 3. Preserve identifier-free daily summaries, metric definitions and exact
--    rule snapshots for long-term historical interpretation.
-- 4. Do not introduce cross-day anonymous identity or infer country from locale.

create table if not exists public.veinvite_metric_definition_versions (
  metric_key text not null check (metric_key ~ '^[a-z0-9_]{1,100}$'),
  definition_version text not null check (definition_version ~ '^[a-z0-9_.-]{1,80}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  definition text not null check (length(btrim(definition)) between 1 and 2000),
  calculation_spec jsonb not null check (jsonb_typeof(calculation_spec) = 'object'),
  effective_from timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (metric_key, definition_version)
);

comment on table public.veinvite_metric_definition_versions is
  'Append-only long-term data dictionary. Each row preserves the meaning and calculation scope of a VeInvite metric for future historical interpretation.';

create index if not exists veinvite_metric_definition_effective_idx
  on public.veinvite_metric_definition_versions (metric_key, effective_from desc);

create table if not exists public.veinvite_retention_policy_versions (
  dataset_key text not null check (dataset_key ~ '^[a-z0-9_]{1,100}$'),
  policy_version text not null check (policy_version ~ '^[a-z0-9_.-]{1,80}$'),
  hot_retention_days integer not null check (hot_retention_days between 30 and 3650),
  archive_required boolean not null default true,
  delete_requires_verified_archive boolean not null default true,
  archive_format text not null check (archive_format ~ '^[a-z0-9._-]{1,40}$'),
  effective_from timestamptz not null,
  notes jsonb not null default '{}'::jsonb check (jsonb_typeof(notes) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (dataset_key, policy_version)
);

comment on table public.veinvite_retention_policy_versions is
  'Append-only retention policy history. Current raw analytics policy keeps 365 hot days and requires a verified archive before retention cleanup.';

create index if not exists veinvite_retention_policy_effective_idx
  on public.veinvite_retention_policy_versions (dataset_key, effective_from desc);

create table if not exists public.veinvite_rule_definition_snapshots (
  rule_domain text not null check (rule_domain ~ '^[a-z0-9_]{1,80}$'),
  version_key text not null check (version_key ~ '^[a-z0-9_]{1,100}$'),
  rule_schema_version smallint not null check (rule_schema_version between 1 and 32767),
  effective_from timestamptz not null,
  rule_snapshot jsonb not null check (jsonb_typeof(rule_snapshot) = 'object'),
  rule_checksum_sha256 text not null check (rule_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_kind text not null check (source_kind in ('LIVE_CONFIG', 'BACKFILL', 'MIGRATION_SNAPSHOT')),
  captured_at timestamptz not null default clock_timestamp(),
  primary key (rule_domain, version_key)
);

comment on table public.veinvite_rule_definition_snapshots is
  'Immutable exact rule snapshots with checksums so historic eligibility/network rules remain interpretable even after application code changes.';

create table if not exists public.veinvite_archive_manifests (
  id bigint generated always as identity primary key,
  dataset_key text not null check (dataset_key ~ '^[a-z0-9_]{1,100}$'),
  period_start date not null,
  period_end date not null,
  source_row_count bigint not null check (source_row_count >= 0),
  source_schema_version text not null check (length(btrim(source_schema_version)) between 1 and 100),
  checksum_algorithm text not null default 'sha256' check (checksum_algorithm = 'sha256'),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  archive_format text not null check (archive_format ~ '^[a-z0-9._-]{1,40}$'),
  archive_location text not null check (length(btrim(archive_location)) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  check (period_end >= period_start),
  unique (dataset_key, period_start, period_end, checksum)
);

comment on table public.veinvite_archive_manifests is
  'Immutable catalog of raw-data archive artifacts. Hot data may be retention-cleaned only after the manifest lifecycle reaches VERIFIED.';

create index if not exists veinvite_archive_manifest_dataset_period_idx
  on public.veinvite_archive_manifests (dataset_key, period_start, period_end);

create table if not exists public.veinvite_archive_manifest_events (
  id bigint generated always as identity primary key,
  manifest_id bigint not null references public.veinvite_archive_manifests(id) on delete restrict,
  status text not null check (status in ('PREPARED', 'UPLOADED', 'VERIFIED', 'FAILED', 'REVOKED')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);

comment on table public.veinvite_archive_manifest_events is
  'Append-only archive lifecycle evidence. The latest event is authoritative for whether a manifest is VERIFIED.';

create index if not exists veinvite_archive_manifest_events_latest_idx
  on public.veinvite_archive_manifest_events (manifest_id, occurred_at desc, id desc);

create table if not exists public.veinvite_daily_funnel_rollups (
  usage_date date not null,
  dimension_name text not null check (dimension_name in ('all', 'locale', 'device', 'source')),
  dimension_value text not null,
  unique_visitors bigint not null check (unique_visitors >= 0),
  wallet_connected_visitors bigint not null check (wallet_connected_visitors >= 0),
  wallet_connect_started_visitors bigint not null check (wallet_connect_started_visitors >= 0),
  wallet_auth_succeeded_visitors bigint not null check (wallet_auth_succeeded_visitors >= 0),
  invite_accept_started_visitors bigint not null check (invite_accept_started_visitors >= 0),
  invite_accept_succeeded_visitors bigint not null check (invite_accept_succeeded_visitors >= 0),
  invite_accept_review_visitors bigint not null check (invite_accept_review_visitors >= 0),
  mission_action_opened_visitors bigint not null check (mission_action_opened_visitors >= 0),
  reward_claim_started_visitors bigint not null check (reward_claim_started_visitors >= 0),
  reward_claim_succeeded_visitors bigint not null check (reward_claim_succeeded_visitors >= 0),
  metric_rule_version text not null default 'daily-anonymous-funnel-v1',
  finalized_at timestamptz not null default clock_timestamp(),
  primary key (usage_date, dimension_name, dimension_value)
);

comment on table public.veinvite_daily_funnel_rollups is
  'Identifier-free permanent daily funnel rollups. Unique visitor metrics are within one Seoul calendar day only; no cross-day identity is introduced.';

create table if not exists public.referral_activation_country_facts (
  id bigint generated always as identity primary key,
  relationship_id uuid not null references public.referral_relationships(id) on delete restrict,
  source_invitation_id uuid not null references public.invitations(id) on delete restrict,
  country_code text not null check (country_code = 'UNKNOWN' or country_code ~ '^[A-Z]{2}$'),
  country_source text not null check (country_source in ('TRUSTED_EDGE', 'UNKNOWN', 'OPERATOR_VERIFIED')),
  observed_at timestamptz not null,
  geo_policy_version text not null check (geo_policy_version ~ '^[a-z0-9_.-]{1,80}$'),
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (relationship_id),
  unique (source_invitation_id)
);

comment on table public.referral_activation_country_facts is
  'Immutable coarse activation-country fact for future global growth reporting. Never infer country from locale; UNKNOWN is a valid value. No raw IP is stored.';

create index if not exists referral_activation_country_country_idx
  on public.referral_activation_country_facts (country_code, observed_at);

alter table public.veinvite_metric_definition_versions enable row level security;
alter table public.veinvite_retention_policy_versions enable row level security;
alter table public.veinvite_rule_definition_snapshots enable row level security;
alter table public.veinvite_archive_manifests enable row level security;
alter table public.veinvite_archive_manifest_events enable row level security;
alter table public.veinvite_daily_funnel_rollups enable row level security;
alter table public.referral_activation_country_facts enable row level security;

revoke all on table
  public.veinvite_metric_definition_versions,
  public.veinvite_retention_policy_versions,
  public.veinvite_rule_definition_snapshots,
  public.veinvite_archive_manifests,
  public.veinvite_archive_manifest_events,
  public.veinvite_daily_funnel_rollups,
  public.referral_activation_country_facts
from public, anon, authenticated;

grant select, insert on table
  public.veinvite_metric_definition_versions,
  public.veinvite_retention_policy_versions,
  public.veinvite_rule_definition_snapshots,
  public.veinvite_archive_manifests,
  public.veinvite_archive_manifest_events,
  public.referral_activation_country_facts
to service_role;

grant select, insert, update, delete on table public.veinvite_daily_funnel_rollups to service_role;

grant usage, select on sequence public.veinvite_archive_manifests_id_seq to service_role;
grant usage, select on sequence public.veinvite_archive_manifest_events_id_seq to service_role;
grant usage, select on sequence public.referral_activation_country_facts_id_seq to service_role;

create or replace function public.prevent_long_term_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op;
end;
$$;

revoke all on function public.prevent_long_term_history_mutation() from public, anon, authenticated;
grant execute on function public.prevent_long_term_history_mutation() to service_role;

drop trigger if exists veinvite_metric_definition_versions_append_only on public.veinvite_metric_definition_versions;
create trigger veinvite_metric_definition_versions_append_only before update or delete on public.veinvite_metric_definition_versions for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists veinvite_retention_policy_versions_append_only on public.veinvite_retention_policy_versions;
create trigger veinvite_retention_policy_versions_append_only before update or delete on public.veinvite_retention_policy_versions for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists veinvite_rule_definition_snapshots_append_only on public.veinvite_rule_definition_snapshots;
create trigger veinvite_rule_definition_snapshots_append_only before update or delete on public.veinvite_rule_definition_snapshots for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists veinvite_archive_manifests_append_only on public.veinvite_archive_manifests;
create trigger veinvite_archive_manifests_append_only before update or delete on public.veinvite_archive_manifests for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists veinvite_archive_manifest_events_append_only on public.veinvite_archive_manifest_events;
create trigger veinvite_archive_manifest_events_append_only before update or delete on public.veinvite_archive_manifest_events for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists referral_activation_country_facts_append_only on public.referral_activation_country_facts;
create trigger referral_activation_country_facts_append_only before update or delete on public.referral_activation_country_facts for each row execute function public.prevent_long_term_history_mutation();
drop trigger if exists invitation_lifecycle_audit_log_append_only on public.invitation_lifecycle_audit_log;
create trigger invitation_lifecycle_audit_log_append_only before update or delete on public.invitation_lifecycle_audit_log for each row execute function public.prevent_long_term_history_mutation();

insert into public.veinvite_retention_policy_versions (dataset_key, policy_version, hot_retention_days, archive_required, delete_requires_verified_archive, archive_format, effective_from, notes) values
('app_usage_sessions','hot365_archive_required_v1',365,true,true,'jsonl.gz',clock_timestamp(),jsonb_build_object('purpose','Preserve one year of detailed raw usage data in hot storage','afterHotRetention','Archive raw data, verify artifact, keep permanent aggregates, then allow hot cleanup','rawIpStored',false,'crossDayIdentityLinking',false)),
('app_product_events','hot365_archive_required_v1',365,true,true,'jsonl.gz',clock_timestamp(),jsonb_build_object('purpose','Preserve one year of detailed raw product-event data in hot storage','afterHotRetention','Archive raw data, verify artifact, keep permanent aggregates, then allow hot cleanup','rawIpStored',false,'crossDayIdentityLinking',false))
on conflict (dataset_key, policy_version) do nothing;

insert into public.veinvite_metric_definition_versions (metric_key, definition_version, title, definition, calculation_spec, effective_from) values
('daily_unique_visitors','daily-anonymous-v1','Daily unique visitors','Distinct non-excluded daily anonymous visitor keys observed in VeInvite usage sessions for one Asia/Seoul calendar day. This metric does not link identity across days.',jsonb_build_object('source','app_usage_sessions','identityBoundary','ASIA_SEOUL_CALENDAR_DAY','distinctBy','visitor_key','excludes','app_usage_excluded_visitors'),timestamptz '2026-09-03 00:00:00+09'),
('daily_wallet_connected_visitors','daily-anonymous-v1','Daily wallet-connected visitors','Distinct non-excluded daily anonymous visitors whose retained usage session recorded wallet_connected=true during one Asia/Seoul calendar day.',jsonb_build_object('source','app_usage_sessions','identityBoundary','ASIA_SEOUL_CALENDAR_DAY','predicate','wallet_connected = true'),timestamptz '2026-09-03 00:00:00+09'),
('onboarding_new_users','canonical-relationship-v1','Canonical NEW onboarding users','Canonical mainnet referral relationships whose entry_class_at_activation is NEW. Legacy unclassified rows and ACTIVE_EXISTING are excluded.',jsonb_build_object('source','referral_relationships','network','mainnet','entryClass','NEW','excludeNullClassification',true),clock_timestamp()),
('onboarding_returning_users','canonical-relationship-v1','Canonical RETURNING onboarding users','Canonical mainnet referral relationships whose entry_class_at_activation is RETURNING. Legacy unclassified rows and ACTIVE_EXISTING are excluded.',jsonb_build_object('source','referral_relationships','network','mainnet','entryClass','RETURNING','excludeNullClassification',true),clock_timestamp()),
('activation_country','immutable-country-v1','Activation country','Coarse country captured at the canonical referral activation/relationship point from an approved source. Locale is never used as country; unavailable country is UNKNOWN and historical records are not guessed.',jsonb_build_object('source','referral_activation_country_facts','allowedFallback','UNKNOWN','localeInferenceAllowed',false,'rawIpStored',false),clock_timestamp())
on conflict (metric_key, definition_version) do nothing;

with rule_payload as (
  select jsonb_build_object('schemaVersion',1,'mission','VEBETTER_ONBOARDING','dappRewards',jsonb_build_object('distinctDappsRequired',3,'positiveB3trRewardsRequired',3,'creditRule','FIRST_POSITIVE_B3TR_REWARD_PER_DISTINCT_DAPP'),'vot3Conversion',jsonb_build_object('required',true),'allocationVoting',jsonb_build_object('required',true),'sourceDescription','First positive B3TR reward from each of three distinct VeBetterDAO dApps, followed by VOT3 conversion and Allocation Voting.') as payload
)
insert into public.veinvite_rule_definition_snapshots (rule_domain,version_key,rule_schema_version,effective_from,rule_snapshot,rule_checksum_sha256,source_kind)
select 'onboarding_mission','onboarding_3dapp_b3tr_vot3_vote_v1',1,coalesce((select effective_from from public.veinvite_mission_rule_versions where version_key='onboarding_3dapp_b3tr_vot3_vote_v1'),clock_timestamp()),r.payload,encode(digest(convert_to(r.payload::text,'UTF8'),'sha256'),'hex'),'MIGRATION_SNAPSHOT'
from rule_payload r on conflict (rule_domain,version_key) do nothing;

with network_rule as (
  select p.policy_version,p.created_at,jsonb_build_object('schemaVersion',1,'statusAtCapture',p.status,'qualificationRule',p.qualification_rule,'maxChildren',p.max_children,'branchStrategy',p.branch_strategy,'placementStrategy',p.placement_strategy,'tieBreaker',p.tie_breaker,'activatedAt',p.activated_at,'notes',p.notes) as payload
  from public.referral_network_policy_versions p where p.policy_version='binary_balanced_v1'
)
insert into public.veinvite_rule_definition_snapshots (rule_domain,version_key,rule_schema_version,effective_from,rule_snapshot,rule_checksum_sha256,source_kind)
select 'referral_network',n.policy_version,1,n.created_at,n.payload,encode(digest(convert_to(n.payload::text,'UTF8'),'sha256'),'hex'),'MIGRATION_SNAPSHOT'
from network_rule n on conflict (rule_domain,version_key) do nothing;

create or replace function public.is_analytics_date_verified_archived(p_dataset_key text,p_usage_date date)
returns boolean language sql stable security invoker set search_path=public as $$
  select exists (
    select 1 from public.veinvite_archive_manifests m
    join lateral (select e.status from public.veinvite_archive_manifest_events e where e.manifest_id=m.id order by e.occurred_at desc,e.id desc limit 1) latest on true
    where m.dataset_key=p_dataset_key and p_usage_date between m.period_start and m.period_end and latest.status='VERIFIED'
  );
$$;
revoke all on function public.is_analytics_date_verified_archived(text,date) from public,anon,authenticated;
grant execute on function public.is_analytics_date_verified_archived(text,date) to service_role;

create or replace function public.finalize_app_usage_analytics_day(p_usage_date date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_sessions bigint:=0;
begin
  if p_usage_date is null then raise exception 'usage date is required'; end if;
  if p_usage_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'only completed Seoul calendar days can be finalized'; end if;
  select count(*) into v_sessions from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date;
  if v_sessions=0 then return jsonb_build_object('usageDate',p_usage_date,'sessions',0,'finalized',false); end if;
  with ds as (
    select * from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=s.visitor_key)
  ), vf as (
    select visitor_key,bool_or(returning_visitor) as is_returning from ds group by visitor_key
  ), vm as (
    select count(*)::bigint as uv,count(*) filter(where not is_returning)::bigint as nv,count(*) filter(where is_returning)::bigint as rv from vf
  ), sm as (
    select count(*)::bigint as sessions,count(distinct visitor_key) filter(where wallet_connected)::bigint as connected,count(*) filter(where active_seconds>=30)::bigint as engaged,coalesce(sum(view_count),0)::bigint as views,coalesce(sum(active_seconds),0)::bigint as seconds,coalesce(round(avg(active_seconds)::numeric,1),0::numeric) as avg_seconds,coalesce(round(percentile_cont(0.5) within group(order by active_seconds)::numeric,1),0::numeric) as median_seconds from ds
  )
  insert into public.app_usage_daily_rollups (usage_date,unique_visitors,new_visitors,returning_visitors,sessions,wallet_connected_visitors,engaged_sessions,view_count,total_active_seconds,average_active_seconds,median_active_seconds,finalized_at)
  select p_usage_date,vm.uv,vm.nv,vm.rv,sm.sessions,sm.connected,sm.engaged,sm.views,sm.seconds,sm.avg_seconds,sm.median_seconds,clock_timestamp() from vm cross join sm
  on conflict(usage_date) do update set unique_visitors=excluded.unique_visitors,new_visitors=excluded.new_visitors,returning_visitors=excluded.returning_visitors,sessions=excluded.sessions,wallet_connected_visitors=excluded.wallet_connected_visitors,engaged_sessions=excluded.engaged_sessions,view_count=excluded.view_count,total_active_seconds=excluded.total_active_seconds,average_active_seconds=excluded.average_active_seconds,median_active_seconds=excluded.median_active_seconds,finalized_at=excluded.finalized_at;
  delete from public.app_usage_daily_dimension_rollups where usage_date=p_usage_date;
  insert into public.app_usage_daily_dimension_rollups (usage_date,dimension_name,dimension_value,sessions,unique_visitors,total_active_seconds,finalized_at)
  select p_usage_date,q.dimension_name,q.dimension_value,q.sessions,q.unique_visitors,q.total_active_seconds,clock_timestamp()
  from (
    select 'device'::text as dimension_name,s.device_bucket as dimension_value,count(*)::bigint as sessions,count(distinct s.visitor_key)::bigint as unique_visitors,coalesce(sum(s.active_seconds),0)::bigint as total_active_seconds from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=s.visitor_key) group by s.device_bucket
    union all
    select 'source',s.acquisition_source,count(*)::bigint,count(distinct s.visitor_key)::bigint,coalesce(sum(s.active_seconds),0)::bigint from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=s.visitor_key) group by s.acquisition_source
    union all
    select 'locale',v.locale,sum(v.sessions)::bigint,count(*)::bigint,sum(v.seconds)::bigint from (
      select s.visitor_key,count(*)::bigint as sessions,coalesce(sum(s.active_seconds),0)::bigint as seconds,(array_agg(s.current_locale order by s.last_seen_at desc,s.updated_at desc,s.session_id desc))[1] as locale
      from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=s.visitor_key) group by s.visitor_key
    ) v group by v.locale
  ) q;
  return jsonb_build_object('usageDate',p_usage_date,'sessions',v_sessions,'finalized',true);
end;
$$;
revoke all on function public.finalize_app_usage_analytics_day(date) from public,anon,authenticated;
grant execute on function public.finalize_app_usage_analytics_day(date) to service_role;

create or replace function public.finalize_app_product_analytics_day(p_usage_date date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_events bigint:=0;
begin
  if p_usage_date is null then raise exception 'usage date is required'; end if;
  if p_usage_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'only completed Seoul calendar days can be finalized'; end if;
  select count(*) into v_events from public.app_product_events e where e.usage_date=p_usage_date;
  if v_events=0 then return jsonb_build_object('usageDate',p_usage_date,'events',0,'finalized',false); end if;
  insert into public.app_product_event_daily_rollups (usage_date,event_name,outcome,failure_code,mission_key,flow_key,entry_class,build_id,event_count,finalized_at)
  select p_usage_date,e.event_name,e.outcome,e.failure_code,e.mission_key,e.flow_key,e.entry_class,e.build_id,count(*)::bigint,clock_timestamp() from public.app_product_events e
  where e.usage_date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=e.visitor_key)
  group by e.event_name,e.outcome,e.failure_code,e.mission_key,e.flow_key,e.entry_class,e.build_id
  on conflict(usage_date,event_name,outcome,failure_code,mission_key,flow_key,entry_class,build_id) do update set event_count=excluded.event_count,finalized_at=excluded.finalized_at;
  delete from public.app_product_event_daily_dimension_rollups where usage_date=p_usage_date;
  insert into public.app_product_event_daily_dimension_rollups (usage_date,event_name,dimension_name,dimension_value,event_count,finalized_at)
  select p_usage_date,e.event_name,d.dimension_name,d.dimension_value,count(*)::bigint,clock_timestamp() from public.app_product_events e
  cross join lateral(values('locale'::text,e.locale),('device'::text,e.device_bucket),('source'::text,e.acquisition_source)) d(dimension_name,dimension_value)
  where e.usage_date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=e.visitor_key)
  group by e.event_name,d.dimension_name,d.dimension_value;
  return jsonb_build_object('usageDate',p_usage_date,'events',v_events,'finalized',true);
end;
$$;
revoke all on function public.finalize_app_product_analytics_day(date) from public,anon,authenticated;
grant execute on function public.finalize_app_product_analytics_day(date) to service_role;

create or replace function public.finalize_veinvite_daily_funnel_day(p_usage_date date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_visitors bigint:=0;
begin
  if p_usage_date is null then raise exception 'usage date is required'; end if;
  if p_usage_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'only completed Seoul calendar days can be finalized'; end if;
  delete from public.veinvite_daily_funnel_rollups where usage_date=p_usage_date;
  with session_base as (
    select s.* from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=s.visitor_key)
  ), visitor_profile as (
    select s.visitor_key,bool_or(s.wallet_connected) as wallet_connected,(array_agg(s.current_locale order by s.last_seen_at desc,s.updated_at desc,s.session_id desc))[1] as locale,(array_agg(s.device_bucket order by s.last_seen_at desc,s.updated_at desc,s.session_id desc))[1] as device,(array_agg(s.acquisition_source order by s.last_seen_at desc,s.updated_at desc,s.session_id desc))[1] as source from session_base s group by s.visitor_key
  ), product_flags as (
    select e.visitor_key,bool_or(e.event_name='wallet_connect_started') as wallet_connect_started,bool_or(e.event_name='wallet_auth_succeeded') as wallet_auth_succeeded,bool_or(e.event_name='invite_accept_started') as invite_accept_started,bool_or(e.event_name='invite_accept_succeeded') as invite_accept_succeeded,bool_or(e.event_name='invite_accept_review') as invite_accept_review,bool_or(e.event_name='mission_action_opened') as mission_action_opened,bool_or(e.event_name='reward_claim_started') as reward_claim_started,bool_or(e.event_name='reward_claim_succeeded') as reward_claim_succeeded from public.app_product_events e where e.usage_date=p_usage_date and not exists(select 1 from public.app_usage_excluded_visitors x where x.visitor_key=e.visitor_key) group by e.visitor_key
  ), joined as (
    select v.*,coalesce(p.wallet_connect_started,false) as wallet_connect_started,coalesce(p.wallet_auth_succeeded,false) as wallet_auth_succeeded,coalesce(p.invite_accept_started,false) as invite_accept_started,coalesce(p.invite_accept_succeeded,false) as invite_accept_succeeded,coalesce(p.invite_accept_review,false) as invite_accept_review,coalesce(p.mission_action_opened,false) as mission_action_opened,coalesce(p.reward_claim_started,false) as reward_claim_started,coalesce(p.reward_claim_succeeded,false) as reward_claim_succeeded from visitor_profile v left join product_flags p using(visitor_key)
  ), dimensions as (
    select j.*,'all'::text as dimension_name,'all'::text as dimension_value from joined j
    union all select j.*,'locale',coalesce(j.locale,'unknown') from joined j
    union all select j.*,'device',coalesce(j.device,'unknown') from joined j
    union all select j.*,'source',coalesce(j.source,'unknown') from joined j
  )
  insert into public.veinvite_daily_funnel_rollups (usage_date,dimension_name,dimension_value,unique_visitors,wallet_connected_visitors,wallet_connect_started_visitors,wallet_auth_succeeded_visitors,invite_accept_started_visitors,invite_accept_succeeded_visitors,invite_accept_review_visitors,mission_action_opened_visitors,reward_claim_started_visitors,reward_claim_succeeded_visitors,metric_rule_version,finalized_at)
  select p_usage_date,d.dimension_name,d.dimension_value,count(*)::bigint,count(*) filter(where d.wallet_connected)::bigint,count(*) filter(where d.wallet_connect_started)::bigint,count(*) filter(where d.wallet_auth_succeeded)::bigint,count(*) filter(where d.invite_accept_started)::bigint,count(*) filter(where d.invite_accept_succeeded)::bigint,count(*) filter(where d.invite_accept_review)::bigint,count(*) filter(where d.mission_action_opened)::bigint,count(*) filter(where d.reward_claim_started)::bigint,count(*) filter(where d.reward_claim_succeeded)::bigint,'daily-anonymous-funnel-v1',clock_timestamp() from dimensions d group by d.dimension_name,d.dimension_value;
  select coalesce(max(unique_visitors),0) into v_visitors from public.veinvite_daily_funnel_rollups where usage_date=p_usage_date and dimension_name='all' and dimension_value='all';
  return jsonb_build_object('usageDate',p_usage_date,'uniqueVisitors',v_visitors,'finalized',v_visitors>0);
end;
$$;
revoke all on function public.finalize_veinvite_daily_funnel_day(date) from public,anon,authenticated;
grant execute on function public.finalize_veinvite_daily_funnel_day(date) to service_role;

create or replace function public.finalize_long_term_analytics(p_through_date date default ((clock_timestamp() at time zone 'Asia/Seoul')::date-1))
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_day date; v_usage_days integer:=0; v_product_days integer:=0; v_funnel_days integer:=0;
begin
  if p_through_date is null then raise exception 'through date is required'; end if;
  if p_through_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'through date must be a completed Seoul calendar day'; end if;
  for v_day in select distinct (s.started_at at time zone 'Asia/Seoul')::date from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date<=p_through_date order by 1 loop
    perform public.finalize_app_usage_analytics_day(v_day); perform public.finalize_veinvite_daily_funnel_day(v_day); v_usage_days:=v_usage_days+1; v_funnel_days:=v_funnel_days+1;
  end loop;
  for v_day in select distinct e.usage_date from public.app_product_events e where e.usage_date<=p_through_date order by 1 loop
    perform public.finalize_app_product_analytics_day(v_day);
    if exists(select 1 from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day) then perform public.finalize_veinvite_daily_funnel_day(v_day); end if;
    v_product_days:=v_product_days+1;
  end loop;
  return jsonb_build_object('throughDate',p_through_date,'usageDaysFinalized',v_usage_days,'productDaysFinalized',v_product_days,'funnelDaysFinalized',v_funnel_days,'rawRowsDeleted',0);
end;
$$;
revoke all on function public.finalize_long_term_analytics(date) from public,anon,authenticated;
grant execute on function public.finalize_long_term_analytics(date) to service_role;

create or replace function public.compact_app_usage_analytics(p_retention_days integer default 365)
returns table(compacted_days integer,sessions_deleted bigint,visitors_deleted bigint)
language plpgsql security invoker set search_path=public as $$
declare v_cutoff date; v_day date; v_days integer:=0; v_sessions bigint:=0; v_visitors bigint:=0; v_deleted bigint:=0; v_unarchived date;
begin
  if p_retention_days<30 or p_retention_days>3650 then raise exception 'analytics retention days must be between 30 and 3650'; end if;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-p_retention_days;
  select min(q.usage_date) into v_unarchived from (select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date<=v_cutoff) q where not public.is_analytics_date_verified_archived('app_usage_sessions',q.usage_date);
  if v_unarchived is not null then raise exception 'raw usage cleanup blocked: % does not have a VERIFIED archive manifest',v_unarchived; end if;
  for v_day in select distinct (s.started_at at time zone 'Asia/Seoul')::date from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date<=v_cutoff order by 1 loop
    perform public.finalize_app_usage_analytics_day(v_day); perform public.finalize_veinvite_daily_funnel_day(v_day);
    delete from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day; get diagnostics v_deleted=row_count; v_sessions:=v_sessions+v_deleted;
    delete from public.operator_fast_usage_visitors where usage_date=v_day; v_days:=v_days+1;
  end loop;
  delete from public.app_usage_visitors v where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=v.visitor_key); get diagnostics v_visitors=row_count;
  delete from public.app_usage_excluded_visitors x where not exists(select 1 from public.app_usage_sessions s where s.visitor_key=x.visitor_key);
  return query select v_days,v_sessions,v_visitors;
end;
$$;
revoke all on function public.compact_app_usage_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_usage_analytics(integer) to service_role;

create or replace function public.compact_app_product_analytics(p_retention_days integer default 365)
returns table(compacted_days integer,events_deleted bigint)
language plpgsql security invoker set search_path=public as $$
declare v_cutoff date; v_day date; v_days integer:=0; v_events bigint:=0; v_deleted bigint:=0; v_unarchived date;
begin
  if p_retention_days<30 or p_retention_days>3650 then raise exception 'product analytics retention days must be between 30 and 3650'; end if;
  v_cutoff:=(clock_timestamp() at time zone 'Asia/Seoul')::date-p_retention_days;
  select min(q.usage_date) into v_unarchived from (select distinct e.usage_date from public.app_product_events e where e.usage_date<=v_cutoff) q where not public.is_analytics_date_verified_archived('app_product_events',q.usage_date);
  if v_unarchived is not null then raise exception 'raw product analytics cleanup blocked: % does not have a VERIFIED archive manifest',v_unarchived; end if;
  for v_day in select distinct e.usage_date from public.app_product_events e where e.usage_date<=v_cutoff order by 1 loop
    perform public.finalize_app_product_analytics_day(v_day);
    if exists(select 1 from public.app_usage_sessions s where (s.started_at at time zone 'Asia/Seoul')::date=v_day) then perform public.finalize_veinvite_daily_funnel_day(v_day); end if;
    delete from public.app_product_events where usage_date=v_day; get diagnostics v_deleted=row_count; v_events:=v_events+v_deleted; v_days:=v_days+1;
  end loop;
  return query select v_days,v_events;
end;
$$;
revoke all on function public.compact_app_product_analytics(integer) from public,anon,authenticated;
grant execute on function public.compact_app_product_analytics(integer) to service_role;

create or replace view public.operator_long_term_data_health with (security_invoker=true) as
with retention as (
  select distinct on(p.dataset_key) p.dataset_key,p.hot_retention_days,p.archive_required,p.delete_requires_verified_archive,p.policy_version from public.veinvite_retention_policy_versions p where p.effective_from<=clock_timestamp() order by p.dataset_key,p.effective_from desc,p.created_at desc
), limits as (
  select coalesce((select hot_retention_days from retention where dataset_key='app_usage_sessions'),365) as usage_days,coalesce((select hot_retention_days from retention where dataset_key='app_product_events'),365) as product_days
), usage_dates as (
  select distinct (s.started_at at time zone 'Asia/Seoul')::date as usage_date from public.app_usage_sessions s
), product_dates as (
  select distinct e.usage_date from public.app_product_events e
)
select clock_timestamp() as generated_at,(clock_timestamp() at time zone 'Asia/Seoul')::date as seoul_date,(select min(usage_date) from usage_dates) as oldest_raw_usage_date,(select min(usage_date) from product_dates) as oldest_raw_product_date,
(select count(*) from public.app_usage_sessions s,limits l where (s.started_at at time zone 'Asia/Seoul')::date<=(clock_timestamp() at time zone 'Asia/Seoul')::date-l.usage_days)::bigint as raw_usage_rows_past_hot_retention,
(select count(*) from public.app_product_events e,limits l where e.usage_date<=(clock_timestamp() at time zone 'Asia/Seoul')::date-l.product_days)::bigint as raw_product_rows_past_hot_retention,
(select count(*) from usage_dates d,limits l where d.usage_date<=(clock_timestamp() at time zone 'Asia/Seoul')::date-l.usage_days and not public.is_analytics_date_verified_archived('app_usage_sessions',d.usage_date))::bigint as overdue_usage_days_without_verified_archive,
(select count(*) from product_dates d,limits l where d.usage_date<=(clock_timestamp() at time zone 'Asia/Seoul')::date-l.product_days and not public.is_analytics_date_verified_archived('app_product_events',d.usage_date))::bigint as overdue_product_days_without_verified_archive,
(select count(*) from public.referral_relationships r where r.network is null or r.entry_class_at_activation is null)::bigint as referral_relationship_quality_backlog,
(select max(r.usage_date) from public.app_usage_daily_rollups r) as latest_usage_rollup_date,(select max(r.usage_date) from public.app_product_event_daily_rollups r) as latest_product_rollup_date,(select max(r.usage_date) from public.veinvite_daily_funnel_rollups r) as latest_funnel_rollup_date,
(select count(*) from public.veinvite_archive_manifests m join lateral(select e.status from public.veinvite_archive_manifest_events e where e.manifest_id=m.id order by e.occurred_at desc,e.id desc limit 1) latest on true where latest.status='FAILED')::bigint as failed_archive_manifests;

revoke all on table public.operator_long_term_data_health from public,anon,authenticated;
grant select on table public.operator_long_term_data_health to service_role;

commit;
