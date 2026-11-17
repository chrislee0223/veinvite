begin;
-- Unique Network engagement by *daily anonymous browser* identity.
-- A visitor who moves several nodes and edits groups still counts once per
-- Seoul calendar day. This does not link identity across days or browsers.
-- The existing consent-gated event collection and autosave stay untouched.
create function public.read_app_network_daily_unique_visitors(
  p_from_date date,
  p_to_date date
)
returns table (
  usage_date date,
  unique_visitors bigint,
  node_movers bigint,
  group_editors bigint
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select
    e.usage_date,
    count(distinct e.visitor_key)::bigint as unique_visitors,
    count(distinct e.visitor_key) filter (
      where e.event_name = 'network_node_repositioned'
    )::bigint as node_movers,
    count(distinct e.visitor_key) filter (
      where e.event_name = 'network_group_modified'
    )::bigint as group_editors
  from public.app_product_events e
  where e.usage_date between p_from_date and p_to_date
    and e.event_name in (
      'network_node_repositioned',
      'network_group_modified'
    )
    and not exists (
      select 1
      from public.app_usage_excluded_visitors x
      where x.visitor_key = e.visitor_key
    )
  group by e.usage_date
  order by e.usage_date desc;
$fn$;

revoke all on function public.read_app_network_daily_unique_visitors(date, date)
  from public, anon, authenticated;
grant execute on function public.read_app_network_daily_unique_visitors(date, date)
  to service_role;
commit;
