-- Compare the fast projection against source-of-truth tables and let the same
-- read contract fall back to finalized identifier-free usage rollups for old
-- dates after raw analytics retention has elapsed.

begin;

create or replace function public.read_operator_fast_status(
  p_usage_date date default ((now() at time zone 'Asia/Seoul')::date)
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with x as (
  select wallet_address from public.analytics_excluded_wallets where active
), vi as (
  select p.*
  from public.operator_fast_invitations p
  where not exists (
    select 1 from x
    where wallet_address = p.inviter_wallet
       or wallet_address = p.invitee_wallet
  )
), im as (
  select
    count(*)::bigint total,
    count(*) filter (where funnel_bucket='PENDING_ACCEPTANCE')::bigint pending,
    count(*) filter (where funnel_bucket in ('INELIGIBLE_LIVE','INELIGIBLE_LEGACY'))::bigint ineligible,
    count(*) filter (where funnel_bucket='CANCELLED_BY_INVITER')::bigint cancelled,
    count(*) filter (where funnel_bucket='LEGACY_UNCLASSIFIED')::bigint legacy,
    count(*) filter (where is_valid_participant)::bigint valid,
    count(*) filter (where is_valid_participant and entry_class='NEW')::bigint new_count,
    count(*) filter (where is_valid_participant and entry_class='RETURNING')::bigint returning_count,
    count(*) filter (where apps_3_plus)::bigint apps,
    count(*) filter (where rewards_3_plus)::bigint rewards,
    count(*) filter (where vot3_complete)::bigint vot3,
    count(*) filter (where vote_complete)::bigint vote,
    count(*) filter (where all_missions_complete)::bigint complete
  from vi
), live_u as (
  select
    count(*)::bigint uv,
    count(*) filter (where not returning_visitor)::bigint nv,
    count(*) filter (where returning_visitor)::bigint rv,
    coalesce(sum(session_count),0)::bigint sessions,
    count(*) filter (where wallet_connected)::bigint connected,
    coalesce(sum(engaged_sessions),0)::bigint engaged,
    coalesce(sum(view_count),0)::bigint views,
    coalesce(sum(total_active_seconds),0)::bigint seconds,
    case when coalesce(sum(session_count),0)=0 then 0::numeric
      else round(coalesce(sum(total_active_seconds),0)::numeric/sum(session_count)::numeric,1)
    end avg_seconds,
    max(last_seen_at) latest
  from public.operator_fast_usage_visitors
  where usage_date=p_usage_date and not excluded
), rolled_u as (
  select
    unique_visitors uv,
    new_visitors nv,
    returning_visitors rv,
    sessions,
    wallet_connected_visitors connected,
    engaged_sessions engaged,
    view_count views,
    total_active_seconds seconds,
    average_active_seconds avg_seconds,
    finalized_at latest
  from public.app_usage_daily_rollups
  where usage_date=p_usage_date
), u as (
  select * from rolled_u
  union all
  select * from live_u
  where not exists (
    select 1 from public.app_usage_daily_rollups where usage_date=p_usage_date
  )
), live_l as (
  select
    current_locale,
    count(*)::bigint n,
    coalesce(sum(session_count),0)::bigint s,
    coalesce(sum(total_active_seconds),0)::bigint a
  from public.operator_fast_usage_visitors
  where usage_date=p_usage_date and not excluded
  group by current_locale
), rolled_l as (
  select
    dimension_value current_locale,
    unique_visitors n,
    sessions s,
    total_active_seconds a
  from public.app_usage_daily_dimension_rollups
  where usage_date=p_usage_date and dimension_name='locale'
), lr as (
  select * from rolled_l
  union all
  select * from live_l
  where not exists (
    select 1 from public.app_usage_daily_rollups where usage_date=p_usage_date
  )
), l as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'locale',current_locale,
        'uniqueVisitors',n,
        'sessions',s,
        'totalActiveSeconds',a
      ) order by n desc,current_locale
    ),
    '[]'::jsonb
  ) value
  from lr
)
select jsonb_build_object(
  'metricRuleVersion','operator-fast-v1',
  'timezone','Asia/Seoul',
  'usageDate',p_usage_date,
  'generatedAt',now(),
  'users',jsonb_build_object(
    'authenticatedWalletsEver',(select count(*) from public.operator_fast_wallets w where not exists(select 1 from x where wallet_address=w.wallet_address)),
    'authenticatedWalletsToday',(select count(*) from public.operator_fast_wallet_days w where usage_date=p_usage_date and not exists(select 1 from x where wallet_address=w.wallet_address)),
    'invitationsTotal',im.total,
    'pendingAcceptance',im.pending,
    'ineligibleRejections',im.ineligible,
    'cancelledByInviter',im.cancelled,
    'legacyUnclassified',im.legacy,
    'validParticipants',im.valid,
    'new',im.new_count,
    'returning',im.returning_count,
    'apps3Plus',im.apps,
    'rewards3Plus',im.rewards,
    'vot3Complete',im.vot3,
    'voteComplete',im.vote,
    'allMissionsComplete',im.complete
  ),
  'visitors',jsonb_build_object(
    'uniqueVisitors',u.uv,
    'newVisitors',u.nv,
    'returningVisitors',u.rv,
    'sessions',u.sessions,
    'walletConnectedVisitors',u.connected,
    'engagedSessions',u.engaged,
    'viewCount',u.views,
    'totalActiveSeconds',u.seconds,
    'averageActiveSeconds',u.avg_seconds,
    'latestSeenAt',u.latest,
    'locales',l.value
  )
)
from im cross join u cross join l;
$$;

create or replace function public.compute_operator_raw_status(
  p_usage_date date default ((now() at time zone 'Asia/Seoul')::date)
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with x as (
  select wallet_address from public.analytics_excluded_wallets where active
), auth as (
  select lower(btrim(wallet_address)) wallet_address, created_at occurred_at
  from public.wallet_auth_sessions
  where lower(btrim(wallet_address)) ~ '^0x[0-9a-f]{40}$'
  union
  select lower(btrim(wallet_address)), occurred_at
  from public.veinvite_event_ledger
  where event_type='WALLET_AUTHENTICATED'
    and wallet_address is not null
    and lower(btrim(wallet_address)) ~ '^0x[0-9a-f]{40}$'
), legacy as (
  select distinct on (invitation_id)
    invitation_id, entry_class, outcome
  from public.legacy_entry_classification_backfill
  where classification_status='VERIFIED'
  order by invitation_id, recorded_at desc, id desc
), c as (
  select
    i.id,
    lower(btrim(i.inviter_wallet)) inviter_wallet,
    case when i.invitee_wallet is null then null else lower(btrim(i.invitee_wallet)) end invitee_wallet,
    coalesce(e.entry_class,l.entry_class) entry_class,
    i.apps_completed,
    i.rewards_received,
    i.vot3_converted,
    i.vote_completed,
    i.apps_completed_block,
    i.vot3_converted_block,
    i.vote_completed_block,
    i.eligibility_check_id,
    case
      when i.ineligibility_check_id is not null then 'INELIGIBLE_LIVE'
      when i.eligibility_check_id is null and l.outcome='EXISTING_VEBETTER_USER' and l.entry_class='ACTIVE_EXISTING' then 'INELIGIBLE_LEGACY'
      when i.eligibility_check_id is not null and e.outcome='ELIGIBLE' and e.entry_class in ('NEW','RETURNING') then 'ACCEPTED_MODERN'
      when i.eligibility_check_id is null and i.invitee_wallet is not null and l.outcome='ELIGIBLE' and l.entry_class in ('NEW','RETURNING') then 'ACCEPTED_LEGACY'
      when i.status='PENDING_ACCEPTANCE' then 'PENDING_ACCEPTANCE'
      when i.status='CANCELLED' then 'CANCELLED_BY_INVITER'
      when i.invitee_wallet is not null and i.eligibility_check_id is null then 'LEGACY_UNCLASSIFIED'
      else 'OTHER'
    end bucket
  from public.invitations i
  left join public.eligibility_check_events e on e.id=i.eligibility_check_id
  left join legacy l on l.invitation_id=i.id
  where not exists (
    select 1 from x
    where wallet_address=lower(btrim(i.inviter_wallet))
       or wallet_address=lower(btrim(i.invitee_wallet))
  )
), im as (
  select
    count(*)::bigint total,
    count(*) filter (where bucket='PENDING_ACCEPTANCE')::bigint pending,
    count(*) filter (where bucket in ('INELIGIBLE_LIVE','INELIGIBLE_LEGACY'))::bigint ineligible,
    count(*) filter (where bucket='CANCELLED_BY_INVITER')::bigint cancelled,
    count(*) filter (where bucket='LEGACY_UNCLASSIFIED')::bigint legacy,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY'))::bigint valid,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and entry_class='NEW')::bigint new_count,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and entry_class='RETURNING')::bigint returning_count,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(apps_completed,0)>=3 and (eligibility_check_id is null or apps_completed_block is not null))::bigint apps,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(rewards_received,0)>=3)::bigint rewards,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(vot3_converted,false) and (eligibility_check_id is null or vot3_converted_block is not null))::bigint vot3,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(vote_completed,false) and (eligibility_check_id is null or vote_completed_block is not null))::bigint vote,
    count(*) filter (where bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(apps_completed,0)>=3 and coalesce(rewards_received,0)>=3 and coalesce(vot3_converted,false) and coalesce(vote_completed,false) and (eligibility_check_id is null or (apps_completed_block is not null and vot3_converted_block is not null and vote_completed_block is not null)))::bigint complete
  from c
), s as (
  select a.*
  from public.app_usage_sessions a
  where (a.started_at at time zone 'Asia/Seoul')::date=p_usage_date
    and not exists (
      select 1 from public.app_usage_excluded_visitors e
      where e.visitor_key=a.visitor_key
    )
), v as (
  select
    visitor_key,
    count(*)::bigint sessions,
    bool_or(wallet_connected) connected,
    bool_or(returning_visitor) is_returning,
    count(*) filter (where active_seconds>=30)::bigint engaged,
    coalesce(sum(view_count),0)::bigint views,
    coalesce(sum(active_seconds),0)::bigint seconds,
    (array_agg(current_locale order by last_seen_at desc,updated_at desc,session_id desc))[1] locale,
    max(last_seen_at) latest
  from s
  group by visitor_key
), u as (
  select
    count(*)::bigint uv,
    count(*) filter (where not is_returning)::bigint nv,
    count(*) filter (where is_returning)::bigint rv,
    coalesce(sum(sessions),0)::bigint sessions,
    count(*) filter (where connected)::bigint connected,
    coalesce(sum(engaged),0)::bigint engaged,
    coalesce(sum(views),0)::bigint views,
    coalesce(sum(seconds),0)::bigint seconds,
    case when coalesce(sum(sessions),0)=0 then 0::numeric
      else round(coalesce(sum(seconds),0)::numeric/sum(sessions)::numeric,1)
    end avg_seconds,
    max(latest) latest
  from v
), l as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'locale',locale,
        'uniqueVisitors',n,
        'sessions',sessions,
        'totalActiveSeconds',seconds
      ) order by n desc,locale
    ),
    '[]'::jsonb
  ) value
  from (
    select
      locale,
      count(*)::bigint n,
      coalesce(sum(sessions),0)::bigint sessions,
      coalesce(sum(seconds),0)::bigint seconds
    from v
    group by locale
  ) q
)
select jsonb_build_object(
  'metricRuleVersion','operator-fast-v1',
  'timezone','Asia/Seoul',
  'usageDate',p_usage_date,
  'users',jsonb_build_object(
    'authenticatedWalletsEver',(select count(distinct wallet_address) from auth where not exists(select 1 from x where x.wallet_address=auth.wallet_address)),
    'authenticatedWalletsToday',(select count(distinct wallet_address) from auth where (occurred_at at time zone 'Asia/Seoul')::date=p_usage_date and not exists(select 1 from x where x.wallet_address=auth.wallet_address)),
    'invitationsTotal',im.total,
    'pendingAcceptance',im.pending,
    'ineligibleRejections',im.ineligible,
    'cancelledByInviter',im.cancelled,
    'legacyUnclassified',im.legacy,
    'validParticipants',im.valid,
    'new',im.new_count,
    'returning',im.returning_count,
    'apps3Plus',im.apps,
    'rewards3Plus',im.rewards,
    'vot3Complete',im.vot3,
    'voteComplete',im.vote,
    'allMissionsComplete',im.complete
  ),
  'visitors',jsonb_build_object(
    'uniqueVisitors',u.uv,
    'newVisitors',u.nv,
    'returningVisitors',u.rv,
    'sessions',u.sessions,
    'walletConnectedVisitors',u.connected,
    'engagedSessions',u.engaged,
    'viewCount',u.views,
    'totalActiveSeconds',u.seconds,
    'averageActiveSeconds',u.avg_seconds,
    'latestSeenAt',u.latest,
    'locales',l.value
  )
)
from im cross join u cross join l;
$$;

create or replace function public.reconcile_operator_fast_status(
  p_usage_date date default ((now() at time zone 'Asia/Seoul')::date),
  p_record boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb;
  s jsonb;
  fc jsonb;
  ok boolean;
  log_id bigint;
begin
  f := public.read_operator_fast_status(p_usage_date);
  s := public.compute_operator_raw_status(p_usage_date);
  fc := f - 'generatedAt';
  ok := fc = s;

  if p_record then
    insert into public.operator_fast_reconciliation_log (
      usage_date, metric_rule_version, matches,
      fast_snapshot, source_snapshot, details
    ) values (
      p_usage_date,
      'operator-fast-v1',
      ok,
      fc,
      s,
      jsonb_build_object(
        'walletRows',(select count(*) from public.operator_fast_wallets),
        'walletDayRows',(select count(*) from public.operator_fast_wallet_days),
        'invitationRows',(select count(*) from public.operator_fast_invitations),
        'usageVisitorRows',(select count(*) from public.operator_fast_usage_visitors where usage_date=p_usage_date)
      )
    ) returning id into log_id;
  end if;

  return jsonb_build_object(
    'matches',ok,
    'usageDate',p_usage_date,
    'logId',log_id,
    'fast',fc,
    'source',s
  );
end;
$$;

revoke all on function public.compute_operator_raw_status(date)
  from public, anon, authenticated;
revoke all on function public.reconcile_operator_fast_status(date, boolean)
  from public, anon, authenticated;
revoke all on function public.read_operator_fast_status(date)
  from public, anon, authenticated;
grant execute on function public.compute_operator_raw_status(date) to service_role;
grant execute on function public.reconcile_operator_fast_status(date, boolean) to service_role;
grant execute on function public.read_operator_fast_status(date) to service_role;

commit;
