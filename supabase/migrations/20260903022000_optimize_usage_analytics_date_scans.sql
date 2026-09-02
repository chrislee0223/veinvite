create index if not exists app_usage_sessions_seoul_date_idx
  on public.app_usage_sessions (((started_at at time zone 'Asia/Seoul')::date));

comment on index public.app_usage_sessions_seoul_date_idx is
  'Speeds Seoul-calendar daily usage analytics reads and 30-day privacy compaction without changing analytics data semantics.';
