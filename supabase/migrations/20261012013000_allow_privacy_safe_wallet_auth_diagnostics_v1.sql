-- Extend ONLY the anonymous product-event diagnostic allowlist.
-- No wallet identifiers or unbounded error text are stored; authentication,
-- referral, Sybil and reward authorities are unchanged.
-- Apply before deploying clients that emit the newly allowed categories.
begin;

alter table public.app_product_events
  drop constraint app_product_events_failure_code_check;

alter table public.app_product_events
  add constraint app_product_events_failure_code_check
  check (failure_code in (
    'none', 'invalid_link', 'slots_full', 'existing_user',
    'self_referral', 'already_referred', 'already_used', 'eligibility',
    'network', 'server', 'malformed_response', 'wallet_auth', 'unknown',
    'wallet_provider', 'wallet_signature', 'wallet_signature_timeout',
    'wallet_challenge', 'wallet_verification', 'wallet_session',
    'wallet_rate_limit', 'wallet_unknown'
  ));

create or replace function public.record_app_product_event(
  p_event_id uuid,
  p_visitor_key text,
  p_session_id uuid,
  p_event_sequence integer,
  p_event_name text,
  p_view_name text,
  p_locale text,
  p_device_bucket text,
  p_acquisition_source text,
  p_outcome text,
  p_failure_code text,
  p_mission_key text,
  p_flow_key text,
  p_entry_class text,
  p_build_id text,
  p_schema_version smallint default 1
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz;
  v_usage_date date;
begin
  if p_visitor_key !~ '^[0-9a-f]{64}$' then
    raise exception 'visitor key is malformed';
  end if;
  if p_event_sequence < 1 or p_event_sequence > 10000 then
    raise exception 'product event sequence is out of bounds';
  end if;
  if p_event_name not in (
    'wallet_connect_started', 'wallet_auth_succeeded', 'wallet_auth_failed',
    'invite_link_copied', 'invite_link_shared', 'invite_accept_started',
    'invite_accept_succeeded', 'invite_accept_review', 'invite_accept_failed',
    'mission_action_opened', 'reward_claim_started',
    'reward_claim_succeeded', 'reward_claim_failed'
  ) then
    raise exception 'product event name is unsupported';
  end if;
  if p_view_name not in (
    'home', 'guide', 'leaderboard', 'settings', 'invite_landing',
    'privacy', 'terms', 'other'
  ) then
    raise exception 'product event view is unsupported';
  end if;
  if p_locale !~ '^[a-z]{2,3}(-[a-z]{2})?$' then
    raise exception 'product event locale is malformed';
  end if;
  if p_device_bucket not in ('mobile', 'tablet', 'desktop') then
    raise exception 'product event device is unsupported';
  end if;
  if p_acquisition_source not in (
    'direct', 'x', 'telegram', 'search', 'vechain', 'other'
  ) then
    raise exception 'product event source is unsupported';
  end if;
  if p_outcome not in ('none', 'success', 'failure', 'review', 'cancelled') then
    raise exception 'product event outcome is unsupported';
  end if;
  if p_failure_code not in (
    'none', 'invalid_link', 'slots_full', 'existing_user',
    'self_referral', 'already_referred', 'already_used', 'eligibility',
    'network', 'server', 'malformed_response', 'wallet_auth', 'unknown',
    'wallet_provider', 'wallet_signature', 'wallet_signature_timeout',
    'wallet_challenge', 'wallet_verification', 'wallet_session',
    'wallet_rate_limit', 'wallet_unknown'
  ) then
    raise exception 'product event failure code is unsupported';
  end if;
  if p_mission_key not in ('none', 'vebetter_apps', 'governance_vote') then
    raise exception 'product event mission key is unsupported';
  end if;
  if p_flow_key not in ('none', 'home', 'permanent_referral', 'legacy_invite') then
    raise exception 'product event flow key is unsupported';
  end if;
  if p_entry_class not in ('none', 'new_user', 'returning_user') then
    raise exception 'product event entry class is unsupported';
  end if;
  if p_build_id <> 'unknown' and p_build_id !~ '^[0-9a-f]{7,64}$' then
    raise exception 'product event build id is malformed';
  end if;
  if p_schema_version <> 1 then
    raise exception 'product analytics schema version is unsupported';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_key, 0)
  );

  if exists (
    select 1
    from public.app_usage_excluded_visitors x
    where x.visitor_key = p_visitor_key
  ) then
    return;
  end if;

  v_now := clock_timestamp();
  v_usage_date := (v_now at time zone 'Asia/Seoul')::date;

  insert into public.app_product_events (
    event_id,
    visitor_key,
    session_id,
    event_sequence,
    usage_date,
    event_name,
    view_name,
    locale,
    device_bucket,
    acquisition_source,
    outcome,
    failure_code,
    mission_key,
    flow_key,
    entry_class,
    build_id,
    schema_version,
    received_at
  ) values (
    p_event_id,
    p_visitor_key,
    p_session_id,
    p_event_sequence,
    v_usage_date,
    p_event_name,
    p_view_name,
    p_locale,
    p_device_bucket,
    p_acquisition_source,
    p_outcome,
    p_failure_code,
    p_mission_key,
    p_flow_key,
    p_entry_class,
    p_build_id,
    p_schema_version,
    v_now
  )
  on conflict do nothing;
end;
$$;

-- CREATE OR REPLACE retains the existing service-role-only EXECUTE grants.
commit;
