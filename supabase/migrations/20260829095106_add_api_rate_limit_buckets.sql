create table if not exists public.api_rate_limit_buckets (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash),
  constraint api_rate_limit_scope_format check (
    scope ~ '^[a-z0-9:_-]{1,80}$'
  ),
  constraint api_rate_limit_subject_hash_format check (
    subject_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint api_rate_limit_request_count_nonnegative check (
    request_count >= 0
  )
);

alter table public.api_rate_limit_buckets enable row level security;

revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row public.api_rate_limit_buckets%rowtype;
  v_remaining bigint;
  v_retry numeric;
begin
  p_scope := lower(btrim(p_scope));
  p_subject_hash := lower(btrim(p_subject_hash));

  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,80}$' then
    raise exception 'invalid rate-limit scope';
  end if;

  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate-limit subject hash';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'rate-limit limit must be between 1 and 100000';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate-limit window must be between 1 and 86400 seconds';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.api_rate_limit_buckets (
    scope,
    subject_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_scope,
    p_subject_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, subject_hash) do update
  set
    window_started_at = case
      when public.api_rate_limit_buckets.window_started_at + v_window <= v_now
        then v_now
      else public.api_rate_limit_buckets.window_started_at
    end,
    request_count = case
      when public.api_rate_limit_buckets.window_started_at + v_window <= v_now
        then 1
      else public.api_rate_limit_buckets.request_count + 1
    end,
    updated_at = v_now
  returning * into v_row;

  v_remaining := greatest(p_limit::bigint - v_row.request_count, 0);
  v_retry := greatest(
    ceil(extract(epoch from ((v_row.window_started_at + v_window) - v_now))),
    0
  );

  return query
  select
    v_row.request_count <= p_limit,
    least(v_remaining, 2147483647)::integer,
    least(v_retry, 2147483647)::integer,
    v_row.window_started_at + v_window;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

comment on table public.api_rate_limit_buckets is
  'Fixed-window server-side abuse throttles. Only one-way subject hashes are stored; raw IP addresses are never persisted.';

comment on function public.consume_api_rate_limit(text, text, integer, integer) is
  'Atomically consumes one request from a fixed-window rate-limit bucket and returns allow/retry metadata.';
