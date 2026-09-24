begin;

alter table public.invite_notification_history
  drop constraint if exists invite_notification_history_kind_check;

alter table public.invite_notification_history
  add constraint invite_notification_history_kind_check
  check (kind in (
    'INVITE_ACCEPTED',
    'DAPP_PROGRESS',
    'VOT3_CONVERTED',
    'REWARD_READY',
    'REWARD_PAID',
    'INVITE_INELIGIBLE',
    'SECURITY_REVIEW_STARTED',
    'SECURITY_RESTRICTION_CONFIRMED',
    'SECURITY_INVITER_WATCH',
    'SECURITY_INVITER_HOLD',
    'SECURITY_INVITER_RESTRICTED',
    'SECURITY_INVITER_ACCESS_RESTORED'
  ));

create or replace function public.record_invite_security_notification(
  p_invite_code text,
  p_kind text,
  p_event_key text,
  p_event_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_kind text := upper(btrim(p_kind));
  v_event_key text := lower(btrim(p_event_key));
  v_invitation public.invitations%rowtype;
  v_dedupe_key text;
  v_id bigint;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;

  if v_kind not in (
    'SECURITY_REVIEW_STARTED',
    'SECURITY_RESTRICTION_CONFIRMED',
    'SECURITY_INVITER_WATCH',
    'SECURITY_INVITER_HOLD',
    'SECURITY_INVITER_RESTRICTED',
    'SECURITY_INVITER_ACCESS_RESTORED'
  ) then
    raise exception 'invalid security notification kind';
  end if;

  if v_event_key !~ '^[a-z0-9:_-]{1,100}$' then
    raise exception 'invalid security notification event key';
  end if;

  if p_event_at is null then
    raise exception 'security notification event time is required';
  end if;

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_code;

  if not found
     or v_invitation.inviter_wallet is null
     or lower(v_invitation.inviter_wallet) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'security notification invitation not found';
  end if;

  v_dedupe_key := concat_ws(
    ':',
    'security-v2',
    v_code,
    v_kind,
    v_event_key
  );

  insert into public.invite_notification_history(
    inviter_wallet,
    invite_code,
    kind,
    stage,
    event_at,
    reward_amount_wei,
    dapp_progress,
    collapsed_progress,
    friend_wallet,
    dedupe_key
  ) values (
    lower(v_invitation.inviter_wallet),
    v_code,
    v_kind,
    6,
    p_event_at,
    null,
    null,
    false,
    case
      when v_invitation.invitee_wallet is not null
       and lower(v_invitation.invitee_wallet) ~ '^0x[0-9a-f]{40}$'
      then lower(v_invitation.invitee_wallet)
      else null
    end,
    v_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select h.id
    into v_id
    from public.invite_notification_history h
    where h.dedupe_key = v_dedupe_key
      and h.invite_code = v_code
      and h.kind = v_kind;
  end if;

  if v_id is null then
    raise exception 'security notification dedupe collision';
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_invite_security_notification(
  text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_invite_security_notification(
  text,text,text,timestamptz
) to service_role;

create or replace function public.notify_sybil_v2_inviter_incident_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_posture record;
  v_new_strong boolean := false;
  v_previous_count bigint := 0;
  v_previous_strong bigint := 0;
  v_previous_hold boolean := false;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select *
  into v_posture
  from public.operator_sybil_v2_inviter_postures p
  where p.network = new.network
    and p.inviter_wallet = new.inviter_wallet;

  if not found then
    return new;
  end if;

  v_new_strong := jsonb_array_length(new.direct_link_families) >= 2;
  v_previous_count := greatest(v_posture.incident_count_90d - 1, 0);
  v_previous_strong := greatest(
    v_posture.strong_direct_link_incident_count_90d
      - case when v_new_strong then 1 else 0 end,
    0
  );
  v_previous_hold :=
    v_previous_count >= 3
    or v_previous_strong > 0;

  if v_posture.posture = 'HOLD'
     and not v_previous_hold then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_HOLD',
      'inviter-hold-' || new.id::text,
      new.recorded_at
    );
  elsif v_posture.posture = 'WATCH'
        and v_previous_count < 2 then
    perform public.record_invite_security_notification(
      new.invite_code,
      'SECURITY_INVITER_WATCH',
      'inviter-watch-' || new.id::text,
      new.recorded_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_inviter_incident_history()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_inviter_incident_security_notification
  on public.sybil_v2_inviter_incidents;
create trigger sybil_v2_inviter_incident_security_notification
after insert on public.sybil_v2_inviter_incidents
for each row execute function public.notify_sybil_v2_inviter_incident_history();

create or replace function public.notify_sybil_v2_inviter_decision_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  if new.decision = 'CLEAR' then
    perform public.record_invite_security_notification(
      new.latest_invite_code,
      'SECURITY_INVITER_ACCESS_RESTORED',
      'inviter-clear-' || new.id::text,
      new.decided_at
    );
  elsif new.decision = 'RESTRICT' then
    perform public.record_invite_security_notification(
      new.latest_invite_code,
      'SECURITY_INVITER_RESTRICTED',
      'inviter-restricted-' || new.id::text,
      new.decided_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_inviter_decision_history()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_inviter_decision_security_notification
  on public.sybil_v2_inviter_review_decisions;
create trigger sybil_v2_inviter_decision_security_notification
after insert on public.sybil_v2_inviter_review_decisions
for each row execute function public.notify_sybil_v2_inviter_decision_history();

create or replace function public.notify_sybil_v2_inviter_reinstatement_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.sybil_v2_enforcement_enabled()
     or new.related_invite_code is null then
    return new;
  end if;

  perform public.record_invite_security_notification(
    new.related_invite_code,
    'SECURITY_INVITER_ACCESS_RESTORED',
    'inviter-reinstated-' || new.id::text,
    new.reinstated_at
  );

  return new;
end;
$$;

revoke all on function public.notify_sybil_v2_inviter_reinstatement_history()
  from public, anon, authenticated, service_role;

drop trigger if exists sybil_v2_inviter_reinstatement_security_notification
  on public.sybil_v2_inviter_reinstatement_events;
create trigger sybil_v2_inviter_reinstatement_security_notification
after insert on public.sybil_v2_inviter_reinstatement_events
for each row execute function public.notify_sybil_v2_inviter_reinstatement_history();

create or replace function public.acknowledge_invite_notification_history(
  p_inviter_wallet text,
  p_ids bigint[] default null,
  p_through_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_row public.invite_notification_history%rowtype;
  v_count integer := 0;
  v_stage integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid inviter wallet';
  end if;

  if (p_ids is null and p_through_id is null)
     or (p_ids is not null and p_through_id is not null) then
    raise exception 'choose ids or through id';
  end if;

  if p_ids is not null then
    if cardinality(p_ids) < 1 or cardinality(p_ids) > 100 then
      raise exception 'invalid notification id count';
    end if;
  elsif p_through_id is null or p_through_id < 1 then
    raise exception 'invalid through id';
  end if;

  for v_row in
    select h.*
    from public.invite_notification_history h
    where h.inviter_wallet = v_wallet
      and (
        (p_ids is not null and h.id = any(p_ids))
        or (
          p_through_id is not null
          and h.id <= p_through_id
          and h.kind <> 'REWARD_PAID'
        )
      )
      and not exists (
        select 1
        from public.invite_notification_history_reads r
        where r.notification_id = h.id
      )
    order by h.id
  loop
    insert into public.invite_notification_history_reads(
      notification_id,
      inviter_wallet,
      read_at
    ) values (
      v_row.id,
      v_wallet,
      now()
    )
    on conflict (notification_id) do nothing;

    if found then
      if v_row.kind not like 'SECURITY_%' then
        v_stage := case
          when v_row.kind = 'DAPP_PROGRESS'
            and coalesce(v_row.dapp_progress, 0) < 3
          then null
          else v_row.stage
        end;

        perform public.acknowledge_invite_notification_v2(
          v_row.invite_code,
          v_wallet,
          v_stage,
          v_row.dapp_progress,
          v_row.kind = 'REWARD_READY'
        );
      end if;

      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('acknowledged', v_count);
end;
$$;

revoke all on function public.acknowledge_invite_notification_history(
  text,bigint[],bigint
) from public, anon, authenticated;
grant execute on function public.acknowledge_invite_notification_history(
  text,bigint[],bigint
) to service_role;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_inviter()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recorded bigint := 0;
  v_watch bigint := 0;
  v_open bigint := 0;
  v_over_24h bigint := 0;
  v_over_48h bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select count(*)::bigint into v_recorded
  from public.operator_sybil_v2_inviter_postures p
  where p.network = new.network
    and p.posture = 'RECORDED';

  select count(*)::bigint into v_watch
  from public.operator_sybil_v2_inviter_postures p
  where p.network = new.network
    and p.posture = 'WATCH';

  select count(*)::bigint
  into v_open
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network;

  select count(*)::bigint
  into v_over_24h
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network
    and c.latest_incident_at < clock_timestamp() - interval '24 hours';

  select count(*)::bigint
  into v_over_48h
  from public.operator_sybil_v2_inviter_review_candidates c
  where c.network = new.network
    and c.latest_incident_at < clock_timestamp() - interval '48 hours';

  new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
    jsonb_build_object(
      'sybilV2InviterReview',
      jsonb_build_object(
        'recordedInviters', v_recorded,
        'watchInviters', v_watch,
        'openReviews', v_open,
        'openReviewsOver24h', v_over_24h,
        'openReviewsOver48h', v_over_48h,
        'reviewWarningHours', 24,
        'reviewCriticalHours', 48
      )
    );

  if v_watch > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_WATCH',
        'severity', 'WARNING',
        'observed', v_watch,
        'message', 'One or more inviters have repeated confirmed blocked referrals within the rolling 90-day window. Participation is not blocked yet; monitor for escalation.'
      )
    );
  end if;

  if v_open > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_REQUIRED',
        'severity', 'WARNING',
        'observed', v_open,
        'message', 'One or more inviters reached the graduated Sybil escalation HOLD threshold and require operator review.'
      )
    );
  end if;

  if v_over_48h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_OVER_48H',
        'severity', 'CRITICAL',
        'observed', v_over_48h,
        'message', 'An inviter escalation HOLD has remained unresolved for over 48 hours.'
      )
    );
  elsif v_over_24h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_INVITER_REVIEW_OVER_24H',
        'severity', 'WARNING',
        'observed', v_over_24h,
        'message', 'An inviter escalation HOLD has remained unresolved for over 24 hours.'
      )
    );
  end if;

  new.alerts := coalesce(new.alerts,'[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_inviter()
  from public, anon, authenticated, service_role;

commit;
